/**
 * services/model-workspace.ts — Adaptador de catálogo y sesiones del Visor IFC v2.0.
 *
 * Reúne en una sola pieza:
 * - Construcción del catálogo de elementos (solo con geometría) por lotes,
 *   aplanando atributos y Psets/cantidades con claves "Pset.Propiedad".
 * - Funciones PURAS (normalizeItem, extractLevel, toModelMap, sha256Hex,
 *   verifyModelFingerprints) sin dependencias de navegador, probadas en Node.
 * - Selección, aislamiento, visibilidad y coloreado de revisión.
 * - Captura y restauración de sesiones: exporta los FRAG reales del gestor
 *   (getBuffer(false)) con su SHA-256, verifica TODAS las huellas antes de
 *   tocar el estado y remapea referencias por GUID con respaldo por localId.
 *
 * Notas de diseño:
 * - Las librerías de navegador (@thatopen/*, three) se importan SOLO como tipo
 *   a nivel de módulo y de forma dinámica dentro de los métodos que las usan.
 *   Así las funciones puras se pueden cargar en Node sin ejecutar el motor.
 * - No se asume nada que los datos IFC no digan: la categoría sale de
 *   `_category`, el nivel del `IFCBUILDINGSTOREY` contenedor y el GUID de `_guid`.
 */

import type * as OBC from "@thatopen/components";
import type * as OBF from "@thatopen/components-front";
import type * as FRAGS from "@thatopen/fragments";
import type * as THREE from "three";

import { DEFAULT_FILTER } from "../domain/catalog.ts";
import type {
  ElementRecord,
  FilterSpec,
  QualityResult,
  QualityRule,
} from "../domain/catalog.ts";
import { validateSnapshot } from "../domain/session-format.ts";
import type {
  CameraState,
  ColorGroup,
  ElementRef,
  SavedView,
  SessionModel,
  SessionSnapshot,
  SessionState,
} from "../domain/session-format.ts";
import type { MundoPrincipal } from "../core/mundo.ts";

// ---------- Carga diferida del motor (nunca se ejecuta en las pruebas puras) ----------

type OBCModule = typeof import("@thatopen/components");
type OBFModule = typeof import("@thatopen/components-front");
type THREEModule = typeof import("three");

let obcPromise: Promise<OBCModule> | undefined;
let obfPromise: Promise<OBFModule> | undefined;
let threePromise: Promise<THREEModule> | undefined;

function loadOBC(): Promise<OBCModule> {
  obcPromise ??= import("@thatopen/components");
  return obcPromise;
}

function loadOBF(): Promise<OBFModule> {
  obfPromise ??= import("@thatopen/components-front");
  return obfPromise;
}

function loadTHREE(): Promise<THREEModule> {
  threePromise ??= import("three");
  return threePromise;
}

// ---------- Configuración de lectura por lotes ----------

/** Tamaño de lote para getItemsData: equilibra latencia y memoria. */
const BATCH_SIZE = 500;

/** Profundidad máxima al recorrer relaciones anidadas (evita ciclos). */
const MAX_WALK_DEPTH = 8;

/** Categorías IFC que aportan propiedades aplanables. */
const PROPERTY_SET_CATEGORY = "IFCPROPERTYSET";
const ELEMENT_QUANTITY_CATEGORY = "IFCELEMENTQUANTITY";
const BUILDING_STOREY_CATEGORY = "IFCBUILDINGSTOREY";

/** Nombres de las selecciones de color de revisión (persistentes). */
const REVIEW_PASS_STYLE = "revision-cumple";
const REVIEW_FAIL_STYLE = "revision-no-cumple";
const SELECT_STYLE = "select";

/**
 * Configuración de getItemsData: atributos del elemento, Psets y cantidades,
 * y la estructura espacial contenedora. Los enlaces profundos se cierran para
 * que el árbol devuelto sea finito (sin volver al elemento por la relación
 * inversa DefinesOccurrence, en cualquiera de sus dos grafías).
 */
const ITEM_DATA_CONFIG: Partial<FRAGS.ItemsDataConfig> = {
  attributesDefault: true,
  relationsDefault: { attributes: false, relations: false },
  relations: {
    IsDefinedBy: { attributes: true, relations: true },
    HasProperties: { attributes: true, relations: false },
    Quantities: { attributes: true, relations: false },
    ContainedInStructure: { attributes: true, relations: false },
    DefinesOccurrence: { attributes: false, relations: false },
    DefinesOcurrence: { attributes: false, relations: false },
    Decomposes: { attributes: false, relations: false },
  },
};

// ---------- Tipos internos de datos de Fragments ----------

type RawAttribute = { value?: unknown; type?: string };
type RawNode = Record<string, unknown>;

function isRecord(value: unknown): value is RawNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Devuelve el atributo `{ value, type }` de una clave, o undefined si no lo es. */
function readAttribute(node: RawNode, key: string): RawAttribute | undefined {
  if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined;
  const raw = node[key];
  if (!isRecord(raw) || !Object.prototype.hasOwnProperty.call(raw, "value")) {
    return undefined;
  }
  return raw as RawAttribute;
}

/** Texto de un atributo (categoría, nombre, guid), o cadena vacía. */
function readText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Categoría IFC de un nodo (`_category`), o cadena vacía. */
function readCategory(node: RawNode): string {
  const attr = readAttribute(node, "_category");
  return attr ? readText(attr.value) : "";
}

/** LocalId de un nodo (`_localId`) como número, o null. */
function readLocalId(node: RawNode): number | null {
  const attr = readAttribute(node, "_localId");
  const value = attr?.value;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Convierte un valor de atributo a un escalar seguro para el catálogo. */
function toScalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const scalar = toScalar(item);
      if (scalar !== undefined && scalar !== null) parts.push(String(scalar));
    }
    return parts.length > 0 ? parts.join("; ") : undefined;
  }
  return undefined;
}

/** Busca recursivamente el primer nodo con la categoría indicada. */
function findCategory(node: unknown, category: string, depth: number): RawNode | null {
  if (depth > MAX_WALK_DEPTH) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findCategory(child, category, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (readCategory(node) === category) return node;
  for (const key of Object.keys(node)) {
    if (key.startsWith("_")) continue;
    const found = findCategory(node[key], category, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Nivel del elemento: nombre del IFCBUILDINGSTOREY que lo contiene.
 * Función pura y exportada para pruebas; no inventa nivel si no existe.
 */
export function extractLevel(data: unknown): string {
  if (!isRecord(data)) return "";
  const storey = findCategory(data["ContainedInStructure"], BUILDING_STOREY_CATEGORY, 1);
  if (!storey) return "";
  const name = readAttribute(storey, "Name");
  return name ? readText(name.value) : "";
}

/** Extrae el valor de una propiedad IFC (NominalValue, EnumerationValues, etc.). */
function readPropertyValue(prop: RawNode): string | number | boolean | null | undefined {
  for (const key of Object.keys(prop)) {
    if (key.startsWith("_")) continue;
    if (!/Value|Values/.test(key)) continue;
    const attr = readAttribute(prop, key);
    if (!attr) continue;
    const scalar = toScalar(attr.value);
    if (scalar !== undefined) return scalar;
  }
  return undefined;
}

/** Recorre el árbol y aterriza Psets/cantidades aplanados en `properties`. */
function collectPropertySets(
  node: unknown,
  properties: Record<string, string | number | boolean | null>,
  seen: Set<number>,
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) return;
  if (Array.isArray(node)) {
    // IFC: propiedades de ocurrencia tienen prioridad sobre las del tipo.
    const children=[...node].sort((a,b)=>Number(isRecord(a)&&readCategory(a).endsWith('TYPE'))-Number(isRecord(b)&&readCategory(b).endsWith('TYPE')));
    for (const child of children) collectPropertySets(child, properties, seen, depth + 1);
    return;
  }
  if (!isRecord(node)) return;

  const category = readCategory(node);
  if (category === PROPERTY_SET_CATEGORY || category === ELEMENT_QUANTITY_CATEGORY) {
    const localId = readLocalId(node);
    if (localId !== null) {
      if (seen.has(localId)) return;
      seen.add(localId);
    }
    const setNameAttr = readAttribute(node, "Name");
    const setName = setNameAttr ? readText(setNameAttr.value) : "";
    const listKey = category === PROPERTY_SET_CATEGORY ? "HasProperties" : "Quantities";
    const props = node[listKey];
    if (Array.isArray(props)) {
      for (const prop of props) {
        if (!isRecord(prop)) continue;
        const propNameAttr = readAttribute(prop, "Name");
        const propName = propNameAttr ? readText(propNameAttr.value) : "";
        if (propName === "") continue;
        const value = readPropertyValue(prop);
        if (value === undefined) continue;
        const key = setName !== "" ? `${setName}.${propName}` : propName;
        // Sin colisiones: se conserva el primer valor encontrado.
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          properties[key] = value;
        }
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith("_")) continue;
    if(['DefinesOccurrence','DefinesOcurrence','ObjectTypeOf','Types','Decomposes','ContainsElements'].includes(key))continue;
    const value = node[key];
    if (Array.isArray(value)) collectPropertySets(value, properties, seen, depth + 1);
  }
}

/**
 * Función PURA: convierte los datos de un elemento (Fragments ItemData) en un
 * ElementRecord del catálogo. `level` manda si viene con texto; si no, se
 * deriva del IFCBUILDINGSTOREY contenedor.
 */
export function normalizeItem(
  modelId: string,
  localId: number,
  data: unknown,
  level: string,
): ElementRecord {
  if (!isRecord(data)) {
    return {
      modelId,
      localId,
      guid: "",
      category: "",
      name: "",
      type: "",
      level,
      properties: {},
    };
  }

  const guidAttr = readAttribute(data, "_guid");
  const guid = guidAttr ? readText(guidAttr.value) : "";
  const category = readCategory(data);

  const nameAttr = readAttribute(data, "Name");
  const name = nameAttr ? readText(nameAttr.value) : "";
  const typeAttr = readAttribute(data, "ObjectType");
  const type = typeAttr ? readText(typeAttr.value) : "";

  const properties: Record<string, string | number | boolean | null> = {};

  // Atributos simples del propio elemento (sin claves internas ni relaciones).
  for (const key of Object.keys(data)) {
    if (key.startsWith("_")) continue;
    const value = data[key];
    if (Array.isArray(value)) continue;
    const attr = readAttribute(data, key);
    if (!attr) continue;
    const scalar = toScalar(attr.value);
    if (scalar === undefined) continue;
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      properties[key] = scalar;
    }
  }

  // Psets y cantidades aplanados como "Pset.Propiedad".
  collectPropertySets(data["IsDefinedBy"], properties, new Set<number>(), 1);

  return {
    modelId,
    localId,
    guid,
    category,
    name,
    type,
    level: level !== "" ? level : extractLevel(data),
    properties,
  };
}

/** Función PURA: agrupa filas por modelo en un ModelIdMap (Record<string, Set<number>>). */
export function toModelMap(rows: ElementRecord[]): OBC.ModelIdMap {
  const grouped = new Map<string, Set<number>>();
  for (const row of rows) {
    let ids = grouped.get(row.modelId);
    if (!ids) {
      ids = new Set<number>();
      grouped.set(row.modelId, ids);
    }
    ids.add(row.localId);
  }
  const map: OBC.ModelIdMap = {};
  for (const [modelId, ids] of grouped) {
    map[modelId] = new Set<number>([...ids].sort((a, b) => a - b));
  }
  return map;
}

// ---------- Huellas SHA-256 ----------

export function toOwnedBuffer(bytes: unknown): ArrayBuffer {
  if(bytes instanceof ArrayBuffer)return bytes.slice(0);
  if(bytes instanceof Uint8Array){const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer;}
  throw new Error('El motor no devolvió bytes de modelo reconocibles.');
}

function bytesToView(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function toHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < view.length; i += 1) {
    out += view[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** Función PURA: SHA-256 en hexadecimal minúsculas de unos bytes. */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytesToView(bytes);
  const digest = await crypto.subtle.digest("SHA-256", view as unknown as ArrayBuffer);
  return toHex(digest);
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Función PURA: verifica la huella SHA-256 de TODOS los modelos de una sesión
 * antes de restaurar. Lanza error en el primer modelo cuyo formato o bytes no
 * coincidan; no muta nada (preflight).
 */
export async function verifyModelFingerprints(models: SessionModel[]): Promise<void> {
  for (const model of models) {
    if (typeof model.fingerprint !== "string" || !HEX64.test(model.fingerprint)) {
      throw new Error(
        `La huella SHA-256 del modelo "${model.name}" no tiene un formato válido.`,
      );
    }
    const actual = await sha256Hex(model.bytes);
    if (actual !== model.fingerprint) {
      throw new Error(
        `La huella SHA-256 del modelo "${model.name}" no coincide con sus bytes. ` +
          "El archivo de sesión está dañado o fue manipulado.",
      );
    }
  }
}

// ---------- Utilidades de estado ----------

export function partitionQuality(results: Pick<QualityResult,'element'|'pass'>[]): {pass:ElementRecord[];fail:ElementRecord[]} {
  const pass=new Map<string,ElementRecord>();const fail=new Map<string,ElementRecord>();
  for(const result of results){const key=JSON.stringify([result.element.modelId,result.element.localId]);(result.pass?pass:fail).set(key,result.element);}
  for(const key of fail.keys())pass.delete(key);
  return {pass:[...pass.values()],fail:[...fail.values()]};
}

function cloneFilter(filter: FilterSpec): FilterSpec {
  return {
    category: filter.category,
    level: filter.level,
    text: filter.text,
    propertyName: filter.propertyName,
    propertyValue: filter.propertyValue,
  };
}

function cloneCamera(camera: CameraState): CameraState {
  return {
    eye: [camera.eye[0], camera.eye[1], camera.eye[2]],
    target: [camera.target[0], camera.target[1], camera.target[2]],
    projection: camera.projection,
  };
}

function colorToHex(color: THREE.Color): string {
  return `#${color.getHexString().toLowerCase()}`;
}

function newSessionId(): string {
  const random = crypto as unknown as { randomUUID?: () => string };
  if (typeof random.randomUUID === "function") return random.randomUUID();
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Clase principal ----------

/**
 * Espacio de trabajo del modelo: catálogo, filtros/reglas, selección y
 * captura/restauración de sesiones. La UI llama a `refresh` tras agregar o
 * borrar modelos y usa `capture`/`restore` para exportar e importar sesiones.
 */
export class ModelWorkspace {
  readonly components: OBC.Components;
  readonly world: MundoPrincipal["world"];

  /** Catálogo de elementos con geometría del conjunto de modelos cargados. */
  records: ElementRecord[] = [];

  /** Filtro activo (copia de DEFAULT_FILTER por defecto). */
  filter: FilterSpec = cloneFilter(DEFAULT_FILTER);

  /** Reglas de revisión de calidad activas. */
  rules: QualityRule[] = [];

  /** Consultas guardadas por el usuario. */
  queries: { name: string; filter: FilterSpec }[] = [];

  /** Vistas guardadas (cámara con nombre). */
  views: SavedView[] = [];

  constructor(components: OBC.Components, world: MundoPrincipal["world"]) {
    this.components = components;
    this.world = world;
  }

  private async fragmentsManager(): Promise<OBC.FragmentsManager> {
    const OBC = await loadOBC();
    return this.components.get(OBC.FragmentsManager);
  }

  private async highlighter(): Promise<OBF.Highlighter> {
    const OBF = await loadOBF();
    return this.components.get(OBF.Highlighter);
  }

  // ---------- Catálogo ----------

  /**
   * Reconstruye `records` SOLO con elementos que tienen geometría, leyendo por
   * lotes para no bloquear la interfaz. `onProgress` recibe mensajes en español.
   */
  async refresh(onProgress?: (message: string) => void): Promise<void> {
    const fragments = await this.fragmentsManager();
    const models = [...fragments.list.values()];

    if (models.length === 0) {
      this.records = [];
      onProgress?.("No hay modelos cargados.");
      return;
    }

    const records: ElementRecord[] = [];
    for (const model of models) {
      const modelId = model.modelId;
      onProgress?.(`Analizando geometría de ${modelId}…`);
      const ids = await model.getItemsIdsWithGeometry();
      if (ids.length === 0) continue;

      for (let start = 0; start < ids.length; start += BATCH_SIZE) {
        const batch = ids.slice(start, start + BATCH_SIZE);
        const data = await model.getItemsData(batch, ITEM_DATA_CONFIG);
        for (let i = 0; i < batch.length; i += 1) {
          const item = data[i];
          if (item === undefined) continue;
          const localId = batch[i];
          records.push(normalizeItem(modelId, localId, item, extractLevel(item)));
        }
        const done = Math.min(start + BATCH_SIZE, ids.length);
        onProgress?.(`Leídos ${done}/${ids.length} elementos de ${modelId}…`);
      }
    }

    this.records = records;
    onProgress?.(`Catálogo listo: ${records.length} elementos.`);
  }

  // ---------- Selección / visibilidad / colores ----------

  /** Resalta las filas dadas con el estilo de selección del visor. */
  async select(rows: ElementRecord[]): Promise<void> {
    const highlighter = await this.highlighter();
    await highlighter.highlightByID(SELECT_STYLE, toModelMap(rows), true, false);
  }

  /** Aísla las filas dadas: oculta el resto y garantiza que estén visibles. */
  async isolate(rows: ElementRecord[]): Promise<void> {
    const fragments = await this.fragmentsManager();
    const selected = toModelMap(rows);
    for (const model of fragments.list.values()) {
      const keep = selected[model.modelId] ?? new Set<number>();
      const all = await model.getItemsIdsWithGeometry();
      const hide: number[] = [];
      for (const id of all) {
        if (!keep.has(id)) hide.push(id);
      }
      if (keep.size > 0) await model.setVisible([...keep], true);
      if (hide.length > 0) await model.setVisible(hide, false);
    }
  }

  /** Restaura la visibilidad de todos los elementos de todos los modelos. */
  async showAll(): Promise<void> {
    const fragments = await this.fragmentsManager();
    for (const model of fragments.list.values()) {
      await model.resetVisible();
    }
  }

  private async ensureStyle(
    highlighter: OBF.Highlighter,
    name: string,
    hex: string,
  ): Promise<void> {
    const THREE = await loadTHREE();
    const existing=highlighter.styles.get(name);
    if(existing){existing.color=new THREE.Color(hex);return;}
    highlighter.styles.set(name, {
      color: new THREE.Color(hex),
      renderedFaces: 1,
      opacity: 1,
      transparent: false,
    });
  }

  /** Colorea los resultados de revisión: cumple (verde) y no cumple (rojo). */
  async colorResults(results: QualityResult[]): Promise<void> {
    const highlighter = await this.highlighter();
    const {pass,fail}=partitionQuality(results);
    await this.clearReviewColors();
    await this.ensureStyle(highlighter, REVIEW_PASS_STYLE, "#2e7d32");
    await this.ensureStyle(highlighter, REVIEW_FAIL_STYLE, "#c62828");
    if (fail.length > 0) {
      await highlighter.highlightByID(REVIEW_FAIL_STYLE, toModelMap(fail), false, false);
    }
    if (pass.length > 0) {
      await highlighter.highlightByID(REVIEW_PASS_STYLE, toModelMap(pass), false, false);
    }
  }

  /** Quita colores de revisión; reutiliza estilos sin carreras de eventos. */
  async clearReviewColors(): Promise<void> {
    const highlighter = await this.highlighter();
    await highlighter.clear(REVIEW_PASS_STYLE);
    await highlighter.clear(REVIEW_FAIL_STYLE);

  }

  // ---------- Cámara ----------

  /** Estado actual de la cámara (ojo, objetivo y proyección). */
  async getCameraState(): Promise<CameraState> {
    const camera = this.world.camera;
    const THREE = await loadTHREE();
    const eye = camera.three.position;
    const target = camera.controls.getTarget(new THREE.Vector3());
    return {
      eye: [eye.x, eye.y, eye.z],
      target: [target.x, target.y, target.z],
      projection: camera.projection.current,
    };
  }

  /** Aplica un estado de cámara (proyección + posición + objetivo). */
  async setCameraState(state: CameraState): Promise<void> {
    const camera = this.world.camera;
    await camera.projection.set(state.projection);
    await camera.controls.setPosition(state.eye[0], state.eye[1], state.eye[2], false);
    await camera.controls.setTarget(state.target[0], state.target[1], state.target[2], false);
    camera.updateAspect();
  }

  // ---------- Refs (GUID + localId) ----------

  private async refsForModel(
    model: FRAGS.FragmentsModel,
    localIds: number[],
    fingerprint: string,
  ): Promise<ElementRef[]> {
    if (localIds.length === 0) return [];
    const guids = await model.getGuidsByLocalIds(localIds);
    const refs: ElementRef[] = [];
    for (let i = 0; i < localIds.length; i += 1) {
      const guid = guids[i];
      refs.push({
        fingerprint,
        guid: typeof guid === "string" ? guid : "",
        localId: localIds[i],
      });
    }
    return refs;
  }

  private async refsForMap(
    map: OBC.ModelIdMap,
    fingerprintByModel: Map<string, string>,
    fragments: OBC.FragmentsManager,
  ): Promise<ElementRef[]> {
    const refs: ElementRef[] = [];
    for (const [modelId, idSet] of Object.entries(map)) {
      const localIds = idSet instanceof Set ? [...idSet] : [];
      if (localIds.length === 0) continue;
      const fingerprint = fingerprintByModel.get(modelId);
      if (!fingerprint) continue;
      const model = fragments.list.get(modelId);
      if (!model) continue;
      refs.push(...(await this.refsForModel(model, localIds, fingerprint)));
    }
    return refs;
  }

  // ---------- Captura ----------

  /**
   * Captura una instantánea completa: FRAG reales del gestor con su SHA-256,
   * cámara/proyección, filtros/reglas, selección, ocultos, colores persistentes
   * (estilos del resaltador, excluyendo la selección) y vistas.
   */
  async capture(name: string): Promise<SessionSnapshot> {
    const fragments = await this.fragmentsManager();
    const highlighter = await this.highlighter();

    const models: SessionModel[] = [];
    const fingerprintByModel = new Map<string, string>();
    for (const model of fragments.list.values()) {
      const buffer = toOwnedBuffer(await model.getBuffer(false));
      const fingerprint = await sha256Hex(buffer);
      fingerprintByModel.set(model.modelId, fingerprint);
      models.push({
        fingerprint,
        name: model.modelId,
        fileName: `${model.modelId}.frag`,
        format: "frag",
        bytes: buffer.slice(0),
      });
    }

    const selection = await this.refsForMap(
      highlighter.selection[SELECT_STYLE] ?? {},
      fingerprintByModel,
      fragments,
    );

    const hidden: ElementRef[] = [];
    for (const model of fragments.list.values()) {
      const fingerprint = fingerprintByModel.get(model.modelId);
      if (!fingerprint) continue;
      const ids = await model.getItemsByVisibility(false);
      hidden.push(...(await this.refsForModel(model, ids, fingerprint)));
    }

    const colors: ColorGroup[] = [];
    for (const [styleName, style] of highlighter.styles) {
      if (styleName === SELECT_STYLE) continue;
      if (!style) continue;
      const map = highlighter.selection[styleName];
      if (!map) continue;
      const items = await this.refsForMap(map, fingerprintByModel, fragments);
      if (items.length === 0) continue;
      colors.push({ color: colorToHex(style.color), items });
    }

    const OBC=await loadOBC();
    const manager=this.components.get(OBC.Viewpoints);
    this.views=[];
    for(const view of manager.list.values()) {
      if(view.customData.pending)throw new Error('Espera a que termine el guardado del encuadre antes de guardar la sesión.');
      const state=view.customData.sessionCamera as CameraState | undefined;
      if(state)this.views.push({name:view.title || `Vista ${this.views.length+1}`,camera:cloneCamera(state)});
    }

    const state: SessionState = {
      camera: await this.getCameraState(),
      filter: cloneFilter(this.filter),
      rules: this.rules.map((rule) => ({ ...rule })),
      selection,
      hidden,
      colors,
      views: this.views.map((view) => ({ name: view.name, camera: cloneCamera(view.camera) })),
      queries: this.queries.map((query) => ({
        name: query.name,
        filter: cloneFilter(query.filter),
      })),
    };

    return {
      schema: "visor-ifc-session",
      schemaVersion: 2,
      appVersion: "2.1.2",
      id: newSessionId(),
      name,
      savedAt: new Date().toISOString(),
      models,
      state,
    };
  }

  // ---------- Restauración ----------

  private async localIdExists(
    model: FRAGS.FragmentsModel,
    localId: number,
  ): Promise<boolean> {
    const data = await model.getItemsData([localId], {
      attributesDefault: false,
      relationsDefault: { attributes: false, relations: false },
    });
    const item = data[0];
    return isRecord(item) && Object.keys(item).length > 0;
  }

  private async resolveRefs(
    refs: ElementRef[],
    fragments: OBC.FragmentsManager,
    modelIdByFingerprint: Map<string, string>,
  ): Promise<OBC.ModelIdMap> {
    const map: OBC.ModelIdMap = {};
    for (const ref of refs) {
      const modelId = modelIdByFingerprint.get(ref.fingerprint);
      if (!modelId) continue;
      const model = fragments.list.get(modelId);
      if (!model) continue;

      let localId: number | null = null;
      if (ref.guid !== "") {
        localId = await this.guidToLocalId(model, ref.guid);
      }
      if (localId === null) {
        // Respaldo: el localId original, solo si el elemento sigue existiendo.
        if (await this.localIdExists(model, ref.localId)) {
          localId = ref.localId;
        }
      }
      if (localId === null) continue;

      const list = map[modelId] ?? new Set<number>();
      list.add(localId);
      map[modelId] = list;
    }
    return map;
  }

  private async guidToLocalId(
    model: FRAGS.FragmentsModel,
    guid: string,
  ): Promise<number | null> {
    const ids = await model.getLocalIdsByGuids([guid]);
    const id = ids[0];
    return typeof id === "number" && Number.isSafeInteger(id) ? id : null;
  }

  /**
   * Restaura una sesión. Preflight: verifica TODAS las huellas SHA-256 antes de
   * tocar el estado. Carga los FRAG con modelId único; solo si el staging es
   * correcto elimina los modelos viejos (rollback al fallar). Después remapea
   * GUID→localId (con respaldo por localId verificado) y aplica cámara,
   * filtros/reglas, ocultos, colores, selección y vistas.
   */
  async restore(snapshot: SessionSnapshot): Promise<void> {
    const validated = validateSnapshot(snapshot);

    // 1) Preflight: ninguna mutación hasta validar todos los bytes.
    await verifyModelFingerprints(validated.models);

    const fragments = await this.fragmentsManager();
    const oldModelIds = [...fragments.list.keys()];
    const modelIdByFingerprint = new Map<string, string>();
    const staged: string[] = [];

    // 2) Staging: cargar cada FRAG con un modelId único.
    try {
      for (const model of validated.models) {
        let modelId = `sess-${model.fingerprint.slice(0, 16)}`;
        if (fragments.list.has(modelId)) {
          modelId = `${modelId}-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
        }
        await fragments.core.load(model.bytes.slice(0), { modelId });
        modelIdByFingerprint.set(model.fingerprint, modelId);
        staged.push(modelId);
      }
    } catch (error) {
      // Rollback: liberar lo que alcanzó a cargar; los modelos viejos intactos.
      for (const modelId of staged) {
        try {
          await fragments.core.disposeModel(modelId);
        } catch {
          /* mejor esfuerzo */
        }
      }
      throw error instanceof Error
        ? error
        : new Error("No se pudieron cargar los modelos de la sesión.");
    }

    // 3) Commit: eliminar los modelos viejos solo tras un staging correcto.
    for (const modelId of oldModelIds) {
      if (staged.includes(modelId)) continue;
      try {
        await fragments.core.disposeModel(modelId);
      } catch {
        /* mejor esfuerzo */
      }
    }

    // 4) Reconstruir el catálogo con los modelos restaurados.
    await this.refresh();

    // 5) Estado: cámara, filtros/reglas, visibilidad, colores, selección, vistas.
    this.filter = cloneFilter(validated.state.filter);
    this.rules = validated.state.rules.map((rule) => ({ ...rule }));
    this.views = validated.state.views.map((view) => ({
      name: view.name,
      camera: cloneCamera(view.camera),
    }));
    this.queries = validated.state.queries.map((query) => ({
      name: query.name,
      filter: cloneFilter(query.filter),
    }));

    const OBC=await loadOBC();
    const viewpoints=this.components.get(OBC.Viewpoints);
    viewpoints.list.clear();
    for(const saved of this.views) {
      await this.setCameraState(saved.camera);
      const view=viewpoints.create();view.world=this.world;view.title=saved.name;
      await view.updateCamera(false);
      view.customData.sessionCamera=cloneCamera(saved.camera);
    }
    await this.setCameraState(validated.state.camera);

    // Ocultos: primero todo visible, luego ocultar las referencias guardadas.
    for (const model of fragments.list.values()) {
      await model.resetVisible();
    }
    const hiddenMap = await this.resolveRefs(
      validated.state.hidden,
      fragments,
      modelIdByFingerprint,
    );
    for (const [modelId, idSet] of Object.entries(hiddenMap)) {
      const model = fragments.list.get(modelId);
      const localIds = idSet instanceof Set ? [...idSet] : [];
      if (model && localIds.length > 0) {
        await model.setVisible(localIds, false);
      }
    }

    // Colores persistentes.
    const highlighter = await this.highlighter();
    for (const styleName of [...highlighter.styles.keys()]) {
      if (styleName === SELECT_STYLE) continue;
      // DataMap.onBeforeDelete es asíncrono: borrar/recrear el mismo nombre
      // puede eliminar sus nuevos eventos. Limpiar y reutilizar el estilo.
      await highlighter.clear(styleName);
    }
    for (let i = 0; i < validated.state.colors.length; i += 1) {
      const group = validated.state.colors[i];
      const styleName = `color-${i}`;
      await this.ensureStyle(highlighter, styleName, group.color);
      const map = await this.resolveRefs(group.items, fragments, modelIdByFingerprint);
      if (Object.keys(map).length > 0) {
        await highlighter.highlightByID(styleName, map, false, false);
      }
    }

    // Selección al final (queda por encima).
    const selectionMap = await this.resolveRefs(
      validated.state.selection,
      fragments,
      modelIdByFingerprint,
    );
    await highlighter.clear(SELECT_STYLE);
    if (Object.keys(selectionMap).length > 0) {
      await highlighter.highlightByID(SELECT_STYLE, selectionMap, false, false);
    }
  }
}