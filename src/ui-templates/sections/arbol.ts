/**
 * sections/arbol.ts — Panel "Árbol del modelo".
 *
 * Muestra la jerarquía espacial del IFC (proyecto → sitio → edificio →
 * niveles → elementos). Clic en una fila = selecciona el elemento en el 3D
 * (usa el resaltador "select", el mismo del viewport). La tabla se actualiza
 * sola cada vez que se carga un modelo nuevo.
 */

import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import { appIcons } from "../../globals";

export interface ArbolPanelState {
  components: OBC.Components;
}

export const arbolPanelTemplate: BUI.StatefullComponent<ArbolPanelState> = (
  state,
) => {
  const { components } = state;
  const fragments = components.get(OBC.FragmentsManager);

  const modelosActuales = () => [...fragments.list.values()];

  const [arbol, actualizarArbol] = CUI.tables.spatialTree({
    components,
    models: modelosActuales(),
    selectHighlighterName: "select",
  });

  fragments.list.onItemSet.add(() => {
    actualizarArbol({ models: modelosActuales() });
  });
  fragments.list.onItemUpdated.add(() => {
    actualizarArbol({ models: modelosActuales() });
  });

  const alBuscar = (evento: Event) => {
    const input = evento.target as BUI.TextInput;
    arbol.queryString = input.value;
  };

  return BUI.html`
    <bim-panel-section fixed icon=${appIcons.TREE} label="Árbol del modelo">
      <bim-text-input @input=${alBuscar} vertical placeholder="Buscar…" debounce="200"></bim-text-input>
      ${arbol}
    </bim-panel-section>
  `;
};
