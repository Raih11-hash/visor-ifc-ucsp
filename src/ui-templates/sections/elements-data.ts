/**
 * sections/elements-data.ts — Panel "Datos de la selección".
 *
 * Muestra las propiedades IFC del elemento seleccionado en el 3D o en el
 * árbol (tipo, material, dimensiones, etc.). Incluye buscador, botón para
 * expandir la tabla y botón para exportar los datos a TSV (se abre en Excel).
 */

import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { appIcons } from "../../globals";

export interface ElementsDataPanelState {
  components: OBC.Components;
}

export const elementsDataPanelTemplate: BUI.StatefullComponent<
  ElementsDataPanelState
> = (state) => {
  const { components } = state;

  const highlighter = components.get(OBF.Highlighter);

  const [propsTable, updatePropsTable] = CUI.tables.itemsData({
    components,
    modelIdMap: {},
  });

  propsTable.preserveStructureOnFilter = true;

  highlighter.events.select.onHighlight.add((modelIdMap) => {
    updatePropsTable({ modelIdMap });
  });

  highlighter.events.select.onClear.add(() => {
    updatePropsTable({ modelIdMap: {} });
  });

  const search = (e: Event) => {
    const input = e.target as BUI.TextInput;
    propsTable.queryString = input.value;
  };

  const toggleExpanded = () => {
    propsTable.expanded = !propsTable.expanded;
  };

  const sectionId = BUI.Manager.newRandomId();

  return BUI.html`
    <bim-panel-section fixed id=${sectionId} icon=${appIcons.TASK} label="Datos de la selección">
      <div style="display: flex; gap: 0.375rem;">
        <bim-text-input @input=${search} vertical placeholder="Buscar…" debounce="200"></bim-text-input>
        <bim-button style="flex: 0;" @click=${toggleExpanded} icon=${appIcons.EXPAND}
          tooltip-title="Expandir" tooltip-text="Expande o contrae todas las filas."></bim-button>
        <bim-button style="flex: 0;" @click=${() => propsTable.downloadData("DatosElemento", "tsv")} icon=${appIcons.EXPORT}
          tooltip-title="Exportar datos" tooltip-text="Exporta las propiedades visibles a TSV (se abre en Excel)."></bim-button>
      </div>
      ${propsTable}
    </bim-panel-section>
  `;
};
