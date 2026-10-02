/**
 * sections/elements-inspector.ts — Inspector BIM de propiedades del elemento.
 *
 * Sustituye la tabla técnica cruda del SDK por un árbol limpio por Property
 * Set: nombre a la izquierda, valor a la derecha, Psets plegables, buscador,
 * exportación TSV y vista técnica opcional. Los valores se normalizan con
 * `domain/properties.ts` (tipos IFC, booleanos, medidas, nulos, referencias,
 * propiedades compuestas) y las unidades con `domain/units.ts` (prefijo SI,
 * conversión, unidad propia del valor), así que dejan de verse vacíos los
 * atributos de texto/etiqueta.
 *
 * Diseño:
 * - Consulta por lotes POR MODELO (no reabre el STEP).
 * - Protección de carreras por revisión: una respuesta (o fallo) tardío de una
 *   selección antigua NUNCA repone ni borra el estado de la selección vigente.
 * - Errores visibles y reintentables: si `getItemsData` rechaza, se limpia el
 *   indicador, se muestra un mensaje útil y una nueva selección reintenta.
 * - Suscripción a la lista real del gestor (`onItemSet`/`onItemDeleted`/
 *   `onCleared`): al cerrar o cargar un modelo se invalida la caché y se
 *   refresca sin datos obsoletos ni carreras. `dispose()` retira las escuchas.
 * - Renderizado con DOM y `textContent`: nunca `innerHTML` con datos del IFC.
 */

import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../../globals";
import {
  buildElementProperties,
  countPropertyEntries,
  filterElementProperties,
  normalizePropertyValue,
  propertiesToTsv,
  resolveLogical,
} from "../../domain/properties";
import type {
  ElementProperties,
  NormalizedValue,
  PropertyGroup,
  TechnicalNode,
} from "../../domain/properties";
import { normalizeUnit, unitsMapFromAssignment } from "../../domain/units";
import "./elements-inspector.css";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

/** Espera breve para agrupar selecciones rápidas (probada, sin límites). */
const SELECTION_DEBOUNCE_MS = 120;
const BATCH_SIZE = 500;

const ITEM_DATA_CONFIG: Partial<import("@thatopen/fragments").ItemsDataConfig> = {
  attributesDefault: true,
  relationsDefault: { attributes: false, relations: false },
  relations: {
    IsDefinedBy: { attributes: true, relations: true },
    HasProperties: { attributes: true, relations: false },
    Quantities: { attributes: true, relations: false },
    HasAssociations: { attributes: true, relations: true },
    ContainedInStructure: { attributes: true, relations: false },
    DefinesOccurrence: { attributes: false, relations: false },
    DefinesOcurrence: { attributes: false, relations: false },
    Decomposes: { attributes: false, relations: false },
  },
};

const NULL_PLACEHOLDER = "—";

interface UnitData {
  byType: Record<string, string>;
  byLocalId: Record<number, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLocalId(node: Record<string, unknown>): number | null {
  const attr = node["_localId"];
  const value = isRecord(attr) ? attr.value : undefined;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Mensaje en español y útil para un fallo de lectura del motor. */
function describeError(error: unknown): string {
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return `No se pudieron leer las propiedades: ${detail}. Vuelve a seleccionar para reintentar.`;
}

export class PropertiesInspector {
  readonly panel: HTMLDivElement;

  /** Filas crudas por elemento (resultado actual, sin filtrar). */
  elements: ElementProperties[] = [];
  loading = false;
  /** Mensaje de error visible, o null. */
  error: string | null = null;
  query = "";
  expanded = true;
  technical = false;

  /** Número de consultas reales al motor (para pruebas de coalescencia). */
  calls = 0;

  private readonly highlighter: OBF.Highlighter;
  private readonly fragments: OBC.FragmentsManager;
  private revision = 0;
  private pending: ReturnType<typeof setTimeout> | undefined;
  private readonly unitCache = new Map<string, UnitData>();
  private lastSelection: OBC.ModelIdMap | null = null;
  private unavailable: string[] = [];
  private disposed = false;
  private readonly listEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly onItemSet: (data: { key: string }) => void;
  private readonly onItemDeleted: (modelId: string) => void;
  private readonly onCleared: () => void;
  private onHighlightHandler: ((modelIdMap: OBC.ModelIdMap) => void) | undefined;
  private onClearHandler: (() => void) | undefined;

  constructor(components: OBC.Components) {
    this.highlighter = components.get(OBF.Highlighter);
    this.fragments = components.get(OBC.FragmentsManager);

    this.panel = document.createElement("div");
    this.panel.className = "ifc-props";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "ifc-props-status";
    this.listEl = document.createElement("div");
    this.listEl.className = "ifc-props-list";
    this.panel.append(this.statusEl, this.listEl);

    this.onHighlightHandler = (modelIdMap) => {
      this.invalidate();
      this.elements = [];
      this.error = null;
      this.loading = true;
      this.render();
      const snapshot: OBC.ModelIdMap = Object.fromEntries(
        Object.entries(modelIdMap).map(([model, ids]) => [model, new Set(ids)]),
      );
      this.scheduleLoad(snapshot);
    };
    this.onClearHandler = () => {
      clearTimeout(this.pending);
      this.pending = undefined;
      this.invalidate();
      this.lastSelection = null;
      this.elements = [];
      this.loading = false;
      this.error = null;
      this.unavailable = [];
      this.render();
    };
    this.highlighter.events.select.onHighlight.add(this.onHighlightHandler);
    this.highlighter.events.select.onClear.add(this.onClearHandler);

    // Escuchas reales de la lista del gestor: modelo cargado, eliminado o
    // lista vaciada. Sin esto el panel mostraría datos de modelos ya cerrados.
    this.onItemSet = ({ key }) => {
      if (this.disposed) return;
      this.unitCache.delete(key);
      if (this.lastSelection) this.refreshSelection();
    };
    this.onItemDeleted = (modelId) => {
      if (this.disposed) return;
      this.unitCache.delete(modelId);
      if (this.lastSelection && Object.prototype.hasOwnProperty.call(this.lastSelection, modelId)) {
        this.refreshSelection();
      }
    };
    this.onCleared = () => {
      if (this.disposed) return;
      this.invalidate();
      this.lastSelection = null;
      this.elements = [];
      this.loading = false;
      this.error = null;
      this.unavailable = [];
      this.render();
    };
    this.fragments.list.onItemSet.add(this.onItemSet);
    this.fragments.list.onItemDeleted.add(this.onItemDeleted);
    this.fragments.list.onCleared.add(this.onCleared);

    if (new URLSearchParams(location.search).get("test") === "1") {
      const w = window as unknown as Record<string, unknown>;
      w.__IFC_PROPS = this;
      // Hook de solo prueba: normalizadores puros para casos sintéticos E2E.
      w.__IFC_PROPS_PURE = { normalizePropertyValue, normalizeUnit, resolveLogical };
    }
  }

  /** Retira todas las escuchas (llamar al desmontar). Idempotente. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.pending);
    this.pending = undefined;
    if (this.onHighlightHandler) this.highlighter.events.select.onHighlight.remove(this.onHighlightHandler);
    if (this.onClearHandler) this.highlighter.events.select.onClear.remove(this.onClearHandler);
    this.fragments.list.onItemSet.remove(this.onItemSet);
    this.fragments.list.onItemDeleted.remove(this.onItemDeleted);
    this.fragments.list.onCleared.remove(this.onCleared);
  }

  private invalidate(): void {
    this.revision += 1;
  }

  private scheduleLoad(map: OBC.ModelIdMap): void {
    this.lastSelection = map;
    clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.load(this.lastSelection ?? map);
    }, SELECTION_DEBOUNCE_MS);
  }

  /** Refresca la selección vigente tras un cambio en la lista de modelos. */
  private refreshSelection(): void {
    const map = this.lastSelection;
    if (!map) return;
    this.invalidate();
    this.loading = true;
    this.render();
    this.scheduleLoad(map);
  }

  /** Consulta por lotes los datos de los elementos seleccionados. */
  private async load(modelIdMap: OBC.ModelIdMap): Promise<void> {
    const myRevision = this.revision;
    const collected: ElementProperties[] = [];
    const missing: string[] = [];
    try {
      for (const [modelId, idSet] of Object.entries(modelIdMap)) {
        const localIds = [...(idSet instanceof Set ? idSet : new Set<number>())];
        if (localIds.length === 0) continue;
        const model = this.fragments.list.get(modelId);
        if (!model) {
          missing.push(modelId);
          continue;
        }
        const units = await this.unitDataFor(modelId);
        if (myRevision !== this.revision) return;
        const options = {
          unitMap: units.byType,
          resolveUnit: (node: unknown) => this.resolveUnit(node, units),
        };
        for (let start = 0; start < localIds.length; start += BATCH_SIZE) {
          const batch = localIds.slice(start, start + BATCH_SIZE);
          this.calls += 1;
          const data = await model.getItemsData(batch, ITEM_DATA_CONFIG);
          if (myRevision !== this.revision) return;
          for (let i = 0; i < batch.length; i += 1) {
            const item = data[i];
            if (item === undefined) continue;
            collected.push(buildElementProperties(modelId, batch[i], item, options));
          }
        }
      }
      if (myRevision !== this.revision) return;
      this.elements = collected;
      this.unavailable = missing;
    } catch (error) {
      // Fallo tardío de una selección antigua: NO debe borrar la vigente.
      if (myRevision !== this.revision) return;
      this.elements = [];
      this.unavailable = missing;
      this.error = describeError(error);
    } finally {
      if (myRevision === this.revision) {
        this.loading = false;
        this.render();
      }
    }
  }

  /** Unidades declaradas por el modelo (una sola lectura por modelo). */
  private async unitDataFor(modelId: string): Promise<UnitData> {
    const cached = this.unitCache.get(modelId);
    if (cached) return cached;
    const data: UnitData = { byType: {}, byLocalId: {} };
    try {
      const model = this.fragments.list.get(modelId);
      if (model) {
        const byCategory = await model.getItemsOfCategories([/UNITASSIGNMENT/]);
        const assignment = Object.values(byCategory).flat()[0];
        if (assignment !== undefined) {
          const [item] = await model.getItemsData([assignment], {
            relations: { Units: { relations: false, attributes: true } },
          });
          const units = isRecord(item) ? item.Units : undefined;
          data.byType = unitsMapFromAssignment(units);
          if (Array.isArray(units)) {
            for (const unit of units) {
              if (!isRecord(unit)) continue;
              const localId = readLocalId(unit);
              const symbol = normalizeUnit(unit).symbol;
              if (localId !== null && symbol) data.byLocalId[localId] = symbol;
            }
          }
        }
      }
    } catch {
      /* sin unidades: se muestran los números tal cual, sin inventar. */
    }
    this.unitCache.set(modelId, data);
    return data;
  }

  /** Símbolo de una unidad referenciada por `Unit` (entidad o handle). */
  private resolveUnit(node: unknown, units: UnitData): string | null {
    if (!isRecord(node)) return null;
    const localId = readLocalId(node);
    if (localId !== null && units.byLocalId[localId]) return units.byLocalId[localId];
    return normalizeUnit(node).symbol;
  }

  setQuery(query: string): void {
    this.query = query;
    this.render();
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.render();
  }

  toggleTechnical(): void {
    this.technical = !this.technical;
    this.render();
  }

  /** Reintenta la última selección si el motor falló. */
  retry(): void {
    if (this.lastSelection) this.refreshSelection();
  }

  /** Elementos visibles tras aplicar el buscador. */
  visibleElements(): ElementProperties[] {
    if (this.query.trim() === "") return this.elements;
    return this.elements.map((element) => filterElementProperties(element, this.query));
  }

  exportTsv(): void {
    const tsv = propertiesToTsv(this.visibleElements());
    const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "PropiedadesElemento.tsv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Render ----------

  private render(): void {
    this.panel.dataset.loading = this.loading ? "true" : "false";
    this.renderStatus();
    this.listEl.replaceChildren();
    const visible = this.visibleElements();
    if (visible.length === 0) return;
    for (const element of visible) {
      this.listEl.append(this.renderElement(element));
    }
  }

  private renderStatus(): void {
    let text: string;
    if (this.error !== null) {
      text = this.error;
    } else if (this.loading) {
      text = "Consultando propiedades…";
    } else if (this.elements.length === 0) {
      text = this.unavailable.length > 0
        ? `El modelo seleccionado ya no está cargado (${this.unavailable.join(", ")}).`
        : "Selecciona un elemento para ver sus propiedades.";
    } else {
      const total = this.elements.reduce((n, el) => n + countPropertyEntries(el), 0);
      text = `${this.elements.length} elemento(s) · ${total} propiedad(es)`;
    }
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle("is-error", this.error !== null);
  }

  private renderElement(element: ElementProperties): HTMLElement {
    const section = document.createElement("section");
    section.className = "ifc-props-element";
    section.dataset.localId = String(element.localId);

    const head = document.createElement("div");
    head.className = "ifc-props-element-head";
    const title = document.createElement("span");
    title.className = "ifc-props-element-name";
    title.textContent = element.name !== "" ? element.name : element.category || "(sin nombre)";
    const meta = document.createElement("span");
    meta.className = "ifc-props-element-meta";
    meta.textContent = element.category;
    head.append(title, meta);
    section.append(head);

    if (this.technical) {
      section.append(this.renderTechnicalMeta(element));
      section.append(this.renderTechnicalTree(element.technical));
    }

    for (const group of element.groups) {
      section.append(this.renderGroup(group));
    }
    return section;
  }

  private renderTechnicalMeta(element: ElementProperties): HTMLElement {
    const meta = document.createElement("dl");
    meta.className = "ifc-props-technical";
    const rows: [string, string][] = [
      ["Categoría", element.category || "—"],
      ["GlobalId", element.guid || "—"],
      ["Local ID", String(element.localId)],
      [
        "Express ID",
        element.expressId === null ? "no disponible" : String(element.expressId),
      ],
    ];
    for (const [key, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = value;
      meta.append(dt, dd);
    }
    return meta;
  }

  /** Árbol técnico crudo: tipos, atributos, referencias y relaciones reales. */
  private renderTechnicalTree(node: TechnicalNode): HTMLElement {
    const details = document.createElement("details");
    details.className = "ifc-props-tech-tree";
    const summary = document.createElement("summary");
    summary.textContent = node.localId === null
      ? node.category || "(nodo)"
      : `${node.category || "(nodo)"} · LocalId ${node.localId}`;
    details.append(summary);

    const body = document.createElement("div");
    body.className = "ifc-props-tech-body";

    for (const attr of node.attributes) {
      const row = document.createElement("div");
      row.className = "ifc-props-tech-attr";
      const name = document.createElement("span");
      name.className = "ifc-props-name";
      name.textContent = attr.name;
      const value = document.createElement("span");
      value.className = "ifc-props-value";
      value.textContent = attr.display;
      row.append(name, value);
      if (attr.type) {
        const type = document.createElement("span");
        type.className = "ifc-props-type";
        type.textContent = attr.type;
        row.append(type);
      }
      body.append(row);
    }

    for (const ref of node.references) {
      const chip = document.createElement("code");
      chip.className = "ifc-props-tech-ref";
      const id = ref.localId !== null
        ? `LocalId ${ref.localId}`
        : ref.expressId !== null
          ? `Express ${ref.expressId}`
          : "";
      chip.textContent = [ref.category, id, ref.guid].filter((part) => part).join(" · ") || "(referencia)";
      body.append(chip);
    }

    for (const relationship of node.relationships) {
      const block = document.createElement("details");
      block.className = "ifc-props-tech-rel";
      const relSummary = document.createElement("summary");
      relSummary.textContent = `${relationship.name} (${relationship.nodes.length})`;
      block.append(relSummary);
      for (const child of relationship.nodes) {
        block.append(this.renderTechnicalTree(child));
      }
      body.append(block);
    }

    if (node.truncated) {
      const note = document.createElement("span");
      note.className = "ifc-props-tech-truncated";
      note.textContent = "… (truncado por ciclo/profundidad)";
      body.append(note);
    }

    details.append(body);
    return details;
  }

  private renderGroup(group: PropertyGroup): HTMLElement {
    const details = document.createElement("details");
    details.className = `ifc-props-group is-${group.kind}`;
    details.open = this.expanded;
    details.dataset.group = group.name;

    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "ifc-props-group-name";
    name.textContent = group.name;
    const count = document.createElement("span");
    count.className = "ifc-props-group-count";
    count.textContent = String(group.entries.length);
    if (group.origin === "type") {
      const tag = document.createElement("span");
      tag.className = "ifc-props-origin";
      tag.textContent = "tipo IFC";
      summary.append(name, tag, count);
    } else {
      summary.append(name, count);
    }
    details.append(summary);

    const rows = document.createElement("div");
    rows.className = "ifc-props-rows";
    for (const entry of group.entries) {
      rows.append(this.renderEntry(entry.name, entry.value, entry.description));
    }
    details.append(rows);
    return details;
  }

  private renderEntry(
    entryName: string,
    value: NormalizedValue,
    description: NormalizedValue | null,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "ifc-props-row";
    const prop = document.createElement("span");
    prop.className = "ifc-props-name";
    prop.textContent = entryName;
    prop.title = entryName;
    const val = document.createElement("span");
    val.className = "ifc-props-value";
    if (value.kind === "null") {
      val.classList.add("is-null");
      val.textContent = NULL_PLACEHOLDER;
    } else {
      val.textContent = value.display;
    }
    val.title = value.ifcType ?? value.display;
    if (this.technical && value.ifcType) {
      const type = document.createElement("span");
      type.className = "ifc-props-type";
      type.textContent = value.ifcType;
      row.append(prop, val, type);
    } else {
      row.append(prop, val);
    }
    if (value.components.length > 0) {
      const parts = document.createElement("div");
      parts.className = "ifc-props-parts";
      for (const component of value.components) {
        const part = document.createElement("span");
        part.className = "ifc-props-part";
        part.textContent = component.label
          ? `${component.label}: ${component.value.display}`
          : component.value.display;
        parts.append(part);
      }
      row.append(parts);
    }
    if (description && description.display !== "") {
      const desc = document.createElement("span");
      desc.className = "ifc-props-description";
      desc.textContent = description.display;
      row.append(desc);
    }
    return row;
  }
}

/** Un inspector por estado de panel: no recrea escuchas en cada render. */
const INSPECTORS = new WeakMap<object, PropertiesInspector>();

/**
 * Plantilla del panel. Mantiene el `bim-panel-section` y los controles de
 * buscar/expandir/exportar; el árbol lo dibuja el inspector propio.
 */
export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state) => {
  const { components } = state;
  let inspector = INSPECTORS.get(state);
  if (!inspector) {
    inspector = new PropertiesInspector(components);
    INSPECTORS.set(state, inspector);
  }
  const sectionId = BUI.Manager.newRandomId();

  return BUI.html`
    <bim-panel-section fixed id=${sectionId} icon=${appIcons.TASK} label="Propiedades del elemento">
      <div style="display: flex; gap: 0.375rem;">
        <bim-text-input @input=${(e: Event) => inspector!.setQuery((e.target as BUI.TextInput).value)} vertical placeholder="Buscar…" debounce="200"></bim-text-input>
        <bim-button style="flex: 0;" @click=${() => inspector!.toggleExpanded()} icon=${appIcons.EXPAND}
          tooltip-title="Expandir" tooltip-text="Expande o contrae todos los grupos."></bim-button>
        <bim-button style="flex: 0;" @click=${() => inspector!.toggleTechnical()} icon=${appIcons.TASK}
          tooltip-title="Vista técnica" tooltip-text="Muestra categoría, GlobalId, Local/Express ID y el árbol IFC real."></bim-button>
        <bim-button style="flex: 0;" @click=${() => inspector!.exportTsv()} icon=${appIcons.EXPORT}
          tooltip-title="Exportar datos" tooltip-text="Exporta las propiedades visibles a TSV (se abre en Excel)."></bim-button>
      </div>
      ${inspector.panel}
    </bim-panel-section>
  `;
};