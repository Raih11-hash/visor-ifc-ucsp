/**
 * domain/properties.ts — Normalizador visual tipado de propiedades IFC.
 *
 * Función PURA y reutilizable que convierte los valores crudos que entrega el
 * motor de Fragments (`{ value, type }` y nodos de referencia) en valores
 * tipados y aptos para mostrar, SIN perder el dato interno original:
 *
 * - IFCTEXT / IFCLABEL / IFCIDENTIFIER → texto.
 * - IFCINTEGER → entero; IFCREAL → real.
 * - IFCBOOLEAN / IFCLOGICAL → True/False (conservando el booleano).
 * - *MEASURE → número; la unidad SOLO se añade si el IFC la aporta.
 * - `$` (null) → se representa explícitamente como kind "null".
 * - Referencias a otras entidades → kind "reference" con categoría/localId/guid.
 *
 * No depende del navegador ni del motor: se puede probar en Node.
 */

import { normalizeUnit } from "./units.ts";

export interface RawAttribute {
  value?: unknown;
  type?: string;
}

export type PropertyValueKind =
  | "text"
  | "integer"
  | "real"
  | "boolean"
  | "measure"
  | "reference"
  | "null"
  | "unknown";

export interface PropertyReference {
  category: string | null;
  localId: number | null;
  guid: string | null;
  name: string | null;
  /** Express ID si el motor entregó un handle web-ifc `{ value, type: 5 }`. */
  expressId: number | null;
  /** true si proviene de un handle numérico sin entidad resuelta. */
  handle: boolean;
}

/** Parte de un valor compuesto (cota, elemento de lista, sub-propiedad). */
export interface NormalizedComponent {
  /** Etiqueta de la parte (LowerBound, UpperBound, SetPoint, nombre…) o null. */
  label: string | null;
  value: NormalizedValue;
}

export interface NormalizedValue {
  kind: PropertyValueKind;
  /** Valor interno preservado tal cual lo entrega el motor. */
  raw: string | number | boolean | null;
  /** Texto para mostrar en la interfaz; nunca inventa datos. */
  display: string;
  /** Tipo IFC original declarado por el motor, si existe. */
  ifcType: string | null;
  /** Unidad resuelta desde el IFC (solo si el modelo la declara). */
  unit: string | null;
  /** Entidad referenciada, si el valor apunta a otra entidad. */
  reference: PropertyReference | null;
  /** Resolución booleana/lógica: true/false, o null si es desconocido. */
  bool: boolean | null;
  /** Partes de un valor compuesto (bounded/list/enumerated/table/complex). */
  components: NormalizedComponent[];
}

export interface NormalizeOptions {
  /** Mapa tipo-de-unidad IFC → etiqueta (p. ej. { LENGTHUNIT: "m" }). */
  unitMap?: Record<string, string>;
  /** Resuelve el símbolo de una unidad referenciada por `Unit` si llega como handle. */
  resolveUnit?: (node: unknown) => string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ¿El objeto es un nodo de entidad IFC (referencia) y no un atributo? */
function isEntityNode(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return Object.prototype.hasOwnProperty.call(value, "_category") ||
    Object.prototype.hasOwnProperty.call(value, "_localId");
}

/**
 * ¿El objeto es un handle web-ifc `{ value: <expressId>, type: 5 }`?
 * A diferencia de la entidad FRAG resuelta (nodos `_category`), un handle solo
 * apunta a un Express ID que NO podemos tratar como Local ID.
 */
function isHandleNode(value: unknown): value is { value: number; type: number } {
  if (!isRecord(value)) return false;
  return typeof value.value === "number" &&
    Number.isSafeInteger(value.value) &&
    typeof value.type === "number";
}

function readNodeText(node: Record<string, unknown>, key: string): string | null {
  const raw = node[key];
  if (!isRecord(raw)) return null;
  const value = raw.value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function readNodeNumber(node: Record<string, unknown>, key: string): number | null {
  const raw = node[key];
  if (!isRecord(raw)) return null;
  const value = raw.value;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Tipo de unidad IFC asociado a una medida, o null si no aplica. */
export function unitTypeFor(ifcType: string | null | undefined): string | null {
  if (!ifcType) return null;
  if (!ifcType.endsWith("MEASURE")) return null;
  const base = ifcType.slice(3, -"MEASURE".length).toUpperCase();
  if (base === "POSITIVELENGTH" || base === "LENGTH") return "LENGTHUNIT";
  if (base === "AREA") return "AREAUNIT";
  if (base === "VOLUME") return "VOLUMEUNIT";
  if (base === "PLANEANGLE") return "PLANEANGLEUNIT";
  if (base === "COUNT") return "COUNTUNIT";
  return `${base}UNIT`;
}

function referenceFrom(node: Record<string, unknown>): PropertyReference {
  return {
    category: readNodeText(node, "_category"),
    localId: readNodeNumber(node, "_localId"),
    guid: readNodeText(node, "_guid"),
    name: readNodeText(node, "Name"),
    expressId: null,
    handle: false,
  };
}

function handleReference(expressId: number): PropertyReference {
  return { category: null, localId: null, guid: null, name: null, expressId, handle: true };
}

const NULL_VALUE: NormalizedValue = {
  kind: "null",
  raw: null,
  display: "",
  ifcType: null,
  unit: null,
  reference: null,
  bool: null,
  components: [],
};

function classify(ifcType: string | null, raw: unknown): PropertyValueKind {
  if (ifcType) {
    if (ifcType.endsWith("MEASURE")) return "measure";
    if (ifcType === "IFCINTEGER") return "integer";
    if (ifcType === "IFCREAL" || ifcType === "IFCNUMBER" || ifcType === "IFCDOUBLE") {
      return "real";
    }
    if (ifcType === "IFCBOOLEAN" || ifcType === "IFCLOGICAL") return "boolean";
    if (
      ifcType.startsWith("IFCTEXT") ||
      ifcType.startsWith("IFCLABEL") ||
      ifcType.startsWith("IFCIDENTIFIER")
    ) {
      return "text";
    }
  }
  if (typeof raw === "string") return "text";
  if (typeof raw === "boolean") return "boolean";
  if (typeof raw === "number") return Number.isSafeInteger(raw) ? "integer" : "real";
  return "unknown";
}

/**
 * Resuelve un valor booleano/lógico IFC sin asumir por truthiness:
 * admite `.T.`/`.F.`/`.U.`, `true`/`false`, `1`/`0` y variantes en texto;
 * cualquier otra forma queda como desconocida (null), nunca True.
 */
export function resolveLogical(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const token = value.trim().toUpperCase();
    if (token === ".T." || token === "T" || token === "TRUE" || token === ".TRUE." || token === "1") return true;
    if (token === ".F." || token === "F" || token === "FALSE" || token === ".FALSE." || token === "0") return false;
  }
  return null;
}

function scalarValue(
  kind: PropertyValueKind,
  raw: string | number | boolean | null,
  display: string,
  ifcType: string | null,
  unit: string | null = null,
): NormalizedValue {
  return { kind, raw, display, ifcType, unit, reference: null, bool: null, components: [] };
}

function referenceValue(reference: PropertyReference): NormalizedValue {
  const display =
    reference.name ??
    reference.guid ??
    reference.category ??
    (reference.expressId !== null ? `#${reference.expressId}` : "");
  return {
    kind: "reference",
    raw: null,
    display,
    ifcType: reference.category,
    unit: null,
    reference,
    bool: null,
    components: [],
  };
}

/**
 * Normaliza un valor IFC. Acepta tanto un atributo `{ value, type }` como un
 * nodo de entidad (referencia) o un handle web-ifc `{ value, type: 5 }`.
 * Nunca lanza y nunca inventa datos.
 */
export function normalizeValue(
  attr: RawAttribute | Record<string, unknown> | undefined | null,
  options: NormalizeOptions = {},
): NormalizedValue {
  if (attr === undefined || attr === null) return { ...NULL_VALUE };

  if (isEntityNode(attr)) return referenceValue(referenceFrom(attr));
  if (isHandleNode(attr)) return referenceValue(handleReference(attr.value));

  const source = isRecord(attr) ? attr : {};
  const value = source.value;
  const ifcType = typeof source.type === "string" ? source.type : null;

  if (value === null || value === undefined) {
    return scalarValue("null", null, "", ifcType);
  }
  if (isEntityNode(value)) return referenceValue(referenceFrom(value));
  if (isHandleNode(value)) return referenceValue(handleReference(value.value));
  if (Array.isArray(value)) {
    const components: NormalizedComponent[] = [];
    for (const item of value) {
      const scalar = normalizeValue(
        isRecord(item) && !isEntityNode(item) && !isHandleNode(item)
          ? (item as RawAttribute)
          : { value: item, type: ifcType ?? undefined },
        options,
      );
      components.push({ label: null, value: scalar });
    }
    const display = components
      .map((c) => c.value.display)
      .filter((text) => text !== "")
      .join("; ");
    const result = scalarValue("text", display, display, ifcType);
    result.components = components;
    return result;
  }
  if (isRecord(value)) {
    // Valor estructurado sin forma de atributo: no se inventa, se marca unknown.
    return scalarValue("unknown", null, "", ifcType);
  }

  const kind = classify(ifcType, value);
  const raw = value as string | number | boolean;

  if (kind === "boolean") {
    const bool = resolveLogical(raw);
    return {
      ...scalarValue("boolean", raw, bool === null ? "Unknown" : bool ? "True" : "False", ifcType),
      bool,
    };
  }
  if (kind === "measure") {
    const unit = options.unitMap?.[unitTypeFor(ifcType) ?? ""] ?? null;
    return scalarValue(kind, raw as number, unit ? `${String(raw)} ${unit}` : String(raw), ifcType, unit);
  }
  return scalarValue(kind, raw, String(raw), ifcType);
}

// ---------- Árbol de propiedades por elemento ----------

export type PropertyGroupKind = "properties" | "quantities" | "attributes";

export interface PropertyEntry {
  /** Nombre de la propiedad (columna izquierda). */
  name: string;
  /** Valor normalizado (columna derecha). */
  value: NormalizedValue;
  /** Descripción opcional del IFC, si existe. */
  description: NormalizedValue | null;
}

export interface PropertyGroup {
  /** Identificador estable del grupo. */
  id: string;
  name: string;
  kind: PropertyGroupKind;
  /** La ocurrencia del elemento manda sobre su tipo IFC. */
  origin: "occurrence" | "type";
  entries: PropertyEntry[];
}

export interface ElementProperties {
  modelId: string;
  localId: number;
  /** Express ID solo si el motor lo aporta aparte; nunca se asume igual a localId. */
  expressId: number | null;
  guid: string;
  category: string;
  name: string;
  groups: PropertyGroup[];
  /** Vista técnica cruda opcional (jerarquía IFC real, sin reconstruir). */
  technical: TechnicalNode;
}

/** Nodo del árbol técnico: refleja el dato original, sin inventar relaciones. */
export interface TechnicalNode {
  category: string;
  localId: number | null;
  /** Express ID real si se conoce; null si no (nunca se asume = localId). */
  expressId: number | null;
  guid: string | null;
  /** Atributos escalares { nombre, tipo, valor visible }. */
  attributes: { name: string; type: string | null; display: string }[];
  /** Referencias a otras entidades (Local ID / GUID / Express ID del handle). */
  references: PropertyReference[];
  /** Relaciones hijas por nombre original (IsDefinedBy, HasAssociations…). */
  relationships: { name: string; nodes: TechnicalNode[] }[];
  /** true si el nodo se truncó por profundidad o ciclo. */
  truncated: boolean;
}

export interface BuildOptions extends NormalizeOptions {
  /** Express ID conocido por un mapeo externo, si lo hubiera. */
  expressId?: number | null;
}

const PSET_CATEGORY = "IFCPROPERTYSET";
const QUANTITY_CATEGORY = "IFCELEMENTQUANTITY";
const MAX_DEPTH = 8;

/** Relaciones inversas que devolverían al elemento o contaminarían Psets. */
const IGNORED_KEYS = new Set([
  "DefinesOccurrence",
  "DefinesOcurrence",
  "ObjectTypeOf",
  "Types",
  "Decomposes",
  "ContainsElements",
  "HasAssociations",
  "RepresentationMaps",
  "ContainedInStructure",
  "ReferencedInStructures",
  "IsDecomposedBy",
]);

function readCategory(node: Record<string, unknown>): string {
  const cat = readNodeText(node, "_category");
  return cat ?? "";
}

function readLocalId(node: Record<string, unknown>): number | null {
  return readNodeNumber(node, "_localId");
}

function readName(node: Record<string, unknown>): string {
  return readNodeText(node, "Name") ?? "";
}

function isAttribute(value: unknown): value is RawAttribute {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "value");
}

/** Extrae el valor de una propiedad IFC (NominalValue, *Value, *Values). */
function propertyValueAttr(node: Record<string, unknown>): RawAttribute | undefined {
  for (const key of Object.keys(node)) {
    if (key.startsWith("_") || key === "Name" || key === "Description" || key === "Unit") {
      continue;
    }
    if (!/Value|Values/.test(key)) continue;
    const attr = node[key];
    if (isAttribute(attr)) return attr;
  }
  return undefined;
}

/** Máximo de niveles de envoltura `{ value: … }` al desenvolver una unidad. */
const MAX_UNIT_UNWRAP = 4;

/**
 * Estado de la unidad propia de un valor:
 * - absent: no hay `Unit` o es nulo (`$`) → se permite la unidad global.
 * - resolved: se dedujo un símbolo real.
 * - unresolved: hay `Unit` presente pero sin símbolo → NUNCA se adjudica la
 *   global; se muestra una etiqueta verídica (referencia a la entidad/handle).
 */
type ExplicitUnit =
  | { state: "absent" }
  | { state: "resolved"; symbol: string }
  | { state: "unresolved"; label: string };

const UNIT_ABSENT: ExplicitUnit = { state: "absent" };

function isUnitWrapper(value: unknown): value is RawAttribute {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "value");
}

/**
 * Desenvuelve `{ value: entidad|handle|… }` de forma genérica y segura.
 * Devuelve null si tras desenvolver el valor es nulo/`$` (unidad ausente) y
 * corta ciclos con una cota pequeña (nunca cuelga).
 */
function unwrapUnitNode(unit: unknown): unknown {
  let node = unit;
  for (let depth = 0; depth < MAX_UNIT_UNWRAP; depth += 1) {
    if (isEntityNode(node) || isHandleNode(node)) return node;
    if (!isUnitWrapper(node)) return node;
    const inner = (node as RawAttribute).value;
    if (inner === undefined || inner === null) return null;
    if (inner === node) return node;
    node = inner;
  }
  return node;
}

function unresolvedUnitLabel(unit: unknown): string {
  if (isHandleNode(unit)) return `unidad IFC #${unit.value} (sin resolver)`;
  if (isEntityNode(unit)) {
    const localId = readNodeNumber(unit, "_localId");
    if (localId !== null) return `unidad IFC #${localId} (sin resolver)`;
  }
  return "unidad no resuelta";
}

/** Símbolo de la unidad propia de la propiedad, o estado ausente/resuelto/no resuelto. */
function explicitUnitOf(node: Record<string, unknown>, options: BuildOptions): ExplicitUnit {
  const raw = node["Unit"] ?? node["unit"];
  if (raw === undefined || raw === null) return UNIT_ABSENT;
  const unit = unwrapUnitNode(raw);
  if (unit === undefined || unit === null) return UNIT_ABSENT;
  if (typeof unit === "string") {
    return unit !== "" ? { state: "resolved", symbol: unit } : UNIT_ABSENT;
  }
  if (options.resolveUnit) {
    const resolved = options.resolveUnit(unit);
    if (resolved) return { state: "resolved", symbol: resolved };
  }
  const symbol = normalizeUnit(unit).symbol;
  if (symbol) return { state: "resolved", symbol };
  return { state: "unresolved", label: unresolvedUnitLabel(unit) };
}

function componentValue(item: unknown, options: BuildOptions): NormalizedValue {
  return normalizeValue(
    isRecord(item) && !isEntityNode(item) && !isHandleNode(item)
      ? (item as RawAttribute)
      : { value: item },
    options,
  );
}

/**
 * Normaliza el valor de una propiedad IFC conservando TODAS sus partes
 * (bounded/list/enumerated/table/complex) y aplicando la unidad explícita del
 * valor por delante de la global. PURA y sin inventar datos.
 */
export function normalizePropertyValue(
  node: Record<string, unknown>,
  options: BuildOptions = {},
): NormalizedValue {
  if (!isRecord(node)) return { ...NULL_VALUE };
  const category = readCategory(node).toUpperCase();
  const explicitUnit = explicitUnitOf(node, options);

  const withComponents = (
    components: NormalizedComponent[],
    ifcType: string | null = null,
  ): NormalizedValue => {
    const display = components
      .map((c) => (c.label ? `${c.label}: ${c.value.display}` : c.value.display))
      .join("; ");
    const result = scalarValue("text", display, display, ifcType);
    result.components = components;
    return applyExplicitUnit(result, explicitUnit);
  };

  /** Aplica la unidad propia del valor a cada parte numérica antes de componer. */
  const applyUnitToParts = (components: NormalizedComponent[]): void => {
    if (explicitUnit.state === "absent") return;
    const unit = explicitUnit.state === "resolved" ? explicitUnit.symbol : explicitUnit.label;
    for (const component of components) {
      const part = component.value;
      if (part.kind !== "measure" && part.kind !== "real" && part.kind !== "integer") continue;
      if (part.raw === null || part.raw === undefined) continue;
      component.value = { ...part, unit, display: `${String(part.raw)} ${unit}` };
    }
  };

  if (category === "IFCPROPERTYCOMPLEX") {
    const children = node["HasProperties"];
    const components: NormalizedComponent[] = [];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (!isRecord(child)) continue;
        const label = readName(child) || null;
        components.push({ label, value: normalizePropertyValue(child, options) });
      }
    }
    if (components.length > 0) return withComponents(components);
  }

  if (category === "IFCPROPERTYBOUNDEDVALUE") {
    const bounds: [string, string][] = [
      ["LowerBoundValue", "LowerBound"],
      ["UpperBoundValue", "UpperBound"],
      ["SetPointValue", "SetPoint"],
    ];
    const components: NormalizedComponent[] = [];
    for (const [key, label] of bounds) {
      const attr = node[key];
      if (isAttribute(attr)) components.push({ label, value: normalizeValue(attr, options) });
    }
    if (components.length > 0) {
      applyUnitToParts(components);
      return withComponents(components);
    }
  }

  for (const key of ["EnumerationValues", "ListValues", "Values"]) {
    const list = node[key];
    if (Array.isArray(list)) {
      const components = list.map((item) => ({ label: null, value: componentValue(item, options) }));
      applyUnitToParts(components);
      return withComponents(components);
    }
  }

  if (Array.isArray(node["DefiningValues"]) || Array.isArray(node["DefinedValues"])) {
    const components: NormalizedComponent[] = [];
    const pushRows = (key: string, label: string): void => {
      const rows = node[key];
      if (!Array.isArray(rows)) return;
      rows.forEach((row, index) => {
        const cells = Array.isArray(row) ? row : [row];
        cells.forEach((cell) => {
          components.push({ label: `${label}[${index}]`, value: componentValue(cell, options) });
        });
      });
    };
    pushRows("DefiningValues", "Defining");
    pushRows("DefinedValues", "Defined");
    if (components.length > 0) return withComponents(components);
  }

  return applyExplicitUnit(normalizeValue(propertyValueAttr(node), options), explicitUnit);
}

/** Sustituye la unidad por la propia del valor cuando corresponde. */
function applyExplicitUnit(value: NormalizedValue, explicit: ExplicitUnit): NormalizedValue {
  if (explicit.state === "absent") return value;
  if (value.kind !== "measure" && value.kind !== "real" && value.kind !== "integer") return value;
  if (value.raw === null || value.raw === undefined) return value;
  const unit = explicit.state === "resolved" ? explicit.symbol : explicit.label;
  return { ...value, unit, display: `${String(value.raw)} ${unit}` };
}

function buildEntry(node: Record<string, unknown>, options: BuildOptions): PropertyEntry | null {
  const name = readName(node);
  if (name === "") return null;
  const value = normalizePropertyValue(node, options);
  const descAttr = node["Description"];
  const description = isAttribute(descAttr) ? normalizeValue(descAttr, options) : null;
  return { name, value, description };
}

function entriesFrom(
  list: unknown,
  options: BuildOptions,
): PropertyEntry[] {
  if (!Array.isArray(list)) return [];
  const entries: PropertyEntry[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const entry = buildEntry(item, options);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Fusiona entradas por nombre, dando prioridad a las de ocurrencia. */
function mergeEntries(base: PropertyEntry[], extra: PropertyEntry[]): PropertyEntry[] {
  const seen = new Set(base.map((e) => e.name));
  const merged = [...base];
  for (const entry of extra) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    merged.push(entry);
  }
  return merged;
}

interface CollectedGroup {
  name: string;
  kind: PropertyGroupKind;
  origin: "occurrence" | "type";
  entries: PropertyEntry[];
}

function groupFromNode(
  node: Record<string, unknown>,
  origin: "occurrence" | "type",
  options: BuildOptions,
): CollectedGroup | null {
  const category = readCategory(node);
  const isQuantity = category === QUANTITY_CATEGORY;
  const name = readName(node) || (isQuantity ? "Cantidades" : "Propiedades");
  const listKey = isQuantity ? "Quantities" : "HasProperties";
  const entries = entriesFrom(node[listKey], options);
  if (entries.length === 0) return null;
  return { name, kind: isQuantity ? "quantities" : "properties", origin, entries };
}

function collectDefinedBy(
  node: unknown,
  out: CollectedGroup[],
  options: BuildOptions,
  seen: Set<number>,
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const child of node) collectDefinedBy(child, out, options, seen, depth + 1);
    return;
  }
  if (!isRecord(node)) return;

  const localId = readLocalId(node);
  if (localId !== null) {
    if (seen.has(localId)) return;
    seen.add(localId);
  }

  const category = readCategory(node);
  if (category === PSET_CATEGORY || category === QUANTITY_CATEGORY) {
    const group = groupFromNode(node, "occurrence", options);
    if (group) out.push(group);
    return;
  }
  if (category.endsWith("TYPE")) {
    // Los Psets del tipo IFC entran como origen "type" (nunca desplazan a la
    // ocurrencia; se fusionan después).
    const sets = node["HasPropertySets"];
    if (Array.isArray(sets)) {
      for (const set of sets) {
        if (!isRecord(set)) continue;
        const group = groupFromNode(set, "type", options);
        if (group) out.push(group);
      }
    }
    return;
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith("_") || IGNORED_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) collectDefinedBy(value, out, options, seen, depth + 1);
  }
}

/** Combina grupos de ocurrencia y de tipo por (kind, name) con precedencia de ocurrencia. */
function combineGroups(collected: CollectedGroup[]): PropertyGroup[] {
  const byKey = new Map<string, PropertyGroup>();
  const order: string[] = [];
  for (const group of collected) {
    const key = `${group.kind}::${group.name}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        id: key,
        name: group.name,
        kind: group.kind,
        origin: group.origin,
        entries: [...group.entries],
      });
      order.push(key);
      continue;
    }
    if (group.origin === "occurrence") {
      // La ocurrencia manda: fusiona primero sus entradas.
      existing.entries = mergeEntries(group.entries, existing.entries);
      existing.origin = "occurrence";
    } else if (existing.origin !== "occurrence") {
      existing.entries = mergeEntries(existing.entries, group.entries);
    } else {
      existing.entries = mergeEntries(existing.entries, group.entries);
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function buildAttributeGroup(data: Record<string, unknown>, options: BuildOptions): PropertyGroup {
  const entries: PropertyEntry[] = [];
  const guid = readNodeText(data, "_guid");
  entries.push({
    name: "GlobalId",
    value: normalizeValue({ value: guid, type: "IFCIDENTIFIER" }),
    description: null,
  });
  for (const key of Object.keys(data)) {
    if (key.startsWith("_")) continue;
    const value = data[key];
    if (Array.isArray(value)) continue;
    if (!isAttribute(value)) continue;
    entries.push({ name: key, value: normalizeValue(value, options), description: null });
  }
  return { id: "attributes", name: "Atributos", kind: "attributes", origin: "occurrence", entries };
}

/** Profundidad máxima del árbol técnico crudo. */
const TECH_MAX_DEPTH = 6;

function walkTechnical(
  node: Record<string, unknown>,
  seen: Set<number>,
  depth: number,
): TechnicalNode {
  const localId = readLocalId(node);
  const truncated = depth > TECH_MAX_DEPTH || (localId !== null && seen.has(localId));
  const result: TechnicalNode = {
    category: readCategory(node),
    localId,
    expressId: null,
    guid: readNodeText(node, "_guid"),
    attributes: [],
    references: [],
    relationships: [],
    truncated,
  };
  if (truncated) return result;
  if (localId !== null) seen.add(localId);

  for (const key of Object.keys(node)) {
    if (key.startsWith("_") || key === "GlobalId") continue;
    const value = node[key];

    if (isEntityNode(value)) {
      result.references.push(referenceFrom(value));
      continue;
    }
    if (isHandleNode(value)) {
      result.references.push(handleReference(value.value));
      continue;
    }
    if (isAttribute(value)) {
      const inner = value.value;
      if (isEntityNode(inner)) {
        result.references.push(referenceFrom(inner));
      } else if (isHandleNode(inner)) {
        result.references.push(handleReference(inner.value));
      } else {
        const normalized = normalizeValue(value);
        result.attributes.push({
          name: key,
          type: normalized.ifcType,
          display: normalized.display,
        });
      }
      continue;
    }
    if (Array.isArray(value)) {
      const nodes: TechnicalNode[] = [];
      for (const item of value) {
        if (isEntityNode(item)) nodes.push(walkTechnical(item, seen, depth + 1));
        else if (isHandleNode(item)) {
          result.references.push(handleReference(item.value));
        }
      }
      if (nodes.length > 0) result.relationships.push({ name: key, nodes });
      continue;
    }
    if (isRecord(value)) {
      const child = walkTechnical(value, seen, depth + 1);
      if (child.category !== "") result.relationships.push({ name: key, nodes: [child] });
    }
  }

  if (localId !== null) seen.delete(localId);
  return result;
}

/**
 * Construye el árbol técnico crudo de la jerarquía IFC del elemento. Refleja
 * tipos, atributos, referencias y relaciones tal como los entrega el motor,
 * con guardas de ciclo/profundidad y sin reconstruir relaciones inventadas.
 */
export function buildTechnicalTree(data: unknown): TechnicalNode {
  if (!isRecord(data)) {
    return {
      category: "",
      localId: null,
      expressId: null,
      guid: null,
      attributes: [],
      references: [],
      relationships: [],
      truncated: false,
    };
  }
  return walkTechnical(data, new Set<number>(), 0);
}

/**
 * Construye las propiedades de un elemento a partir de los datos crudos del
 * motor. PURA: no toca el motor ni el navegador.
 */
export function buildElementProperties(
  modelId: string,
  localId: number,
  data: unknown,
  options: BuildOptions = {},
): ElementProperties {
  if (!isRecord(data)) {
    return {
      modelId,
      localId,
      expressId: options.expressId ?? null,
      guid: "",
      category: "",
      name: "",
      groups: [],
      technical: buildTechnicalTree(undefined),
    };
  }
  const collected: CollectedGroup[] = [];
  collectDefinedBy(data["IsDefinedBy"], collected, options, new Set<number>(), 1);

  const groups: PropertyGroup[] = [];
  const attributes = buildAttributeGroup(data, options);
  if (attributes.entries.length > 0) groups.push(attributes);
  groups.push(...combineGroups(collected));

  return {
    modelId,
    localId,
    expressId: options.expressId ?? null,
    guid: readNodeText(data, "_guid") ?? "",
    category: readCategory(data),
    name: readName(data),
    groups,
    technical: buildTechnicalTree(data),
  };
}

function normalizeQuery(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Filtra entradas por nombre o valor; descarta los grupos sin coincidencias. */
export function filterElementProperties(element: ElementProperties, query: string): ElementProperties {
  const needle = normalizeQuery(query);
  if (needle === "") return element;
  const groups: PropertyGroup[] = [];
  for (const group of element.groups) {
    const entries = group.entries.filter((entry) => {
      const haystack = `${entry.name} ${entry.value.display} ${entry.value.ifcType ?? ""}`;
      return normalizeQuery(haystack).includes(needle);
    });
    if (entries.length > 0) groups.push({ ...group, entries });
  }
  return { ...element, groups };
}

/** Cuenta todas las filas de propiedades de un elemento. */
export function countPropertyEntries(element: ElementProperties): number {
  let total = 0;
  for (const group of element.groups) total += group.entries.length;
  return total;
}

/** Celda TSV segura (neutraliza fórmulas y escapa tabuladores/saltos). */
function tsvField(value: string | null | undefined): string {
  let field = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@]/.test(field) || /^-/.test(field) || /^[\t\r\n]/.test(field)) {
    field = `'${field}`;
  }
  return field.replace(/[\t\r\n]+/g, " ");
}

/** Exporta a TSV (Excel) con nombre y valor en columnas separadas. */
export function propertiesToTsv(elements: ElementProperties[]): string {
  const lines = ["Elemento\tGlobalId\tGrupo\tPropiedad\tValor\tTipo"];
  for (const element of elements) {
    for (const group of element.groups) {
      for (const entry of group.entries) {
        lines.push(
          [
            tsvField(element.name),
            tsvField(element.guid),
            tsvField(group.name),
            tsvField(entry.name),
            tsvField(entry.value.display),
            tsvField(entry.value.ifcType),
          ].join("\t"),
        );
      }
    }
  }
  return lines.join("\n");
}