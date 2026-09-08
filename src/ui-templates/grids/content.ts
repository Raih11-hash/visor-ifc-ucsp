/**
 * grids/content.ts — Rejilla del contenido principal.
 *
 * Divide la pantalla en tres columnas:
 * - "lateral": barra lateral (modelos, árbol, vistas guardadas).
 * - "visor": el viewport 3D.
 * - "datos": panel "Datos de la selección" (propiedades del elemento).
 */

import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as TEMPLATES from "..";
import { CONTENT_GRID_GAP, CONTENT_GRID_ID, SMALL_COLUMN_WIDTH } from "../../globals";

type Visor = "visor";

type Lateral = {
  name: "lateral";
  state: TEMPLATES.BarraLateralState;
};

type DatosElemento = {
  name: "datosElemento";
  state: TEMPLATES.ElementsDataPanelState;
};

export type ContentGridElements = [Visor, Lateral, DatosElemento];

export type ContentGridLayouts = ["Visor"];

export interface ContentGridState {
  components: OBC.Components;
  world?: OBC.World;
  id: string;
  viewportTemplate: BUI.StatelessComponent;
}

export const contentGridTemplate: BUI.StatefullComponent<ContentGridState> = (
  state,
) => {
  const { components, world } = state;

  const onCreated = (e?: Element) => {
    if (!e) return;
    const grid = e as BUI.Grid<ContentGridLayouts, ContentGridElements>;

    grid.elements = {
      lateral: {
        template: TEMPLATES.barraLateralTemplate,
        initialState: { components, world },
      },
      datosElemento: {
        template: TEMPLATES.elementsDataPanelTemplate,
        initialState: { components },
      },
      visor: state.viewportTemplate,
    };

    grid.layouts = {
      Visor: {
        template: `
          "lateral visor datosElemento" 1fr
          /${SMALL_COLUMN_WIDTH} 1fr ${SMALL_COLUMN_WIDTH}
        `,
      },
    };
  };

  return BUI.html`
    <bim-grid id=${state.id} style="padding: ${CONTENT_GRID_GAP}; gap: ${CONTENT_GRID_GAP}" ${BUI.ref(onCreated)}></bim-grid>`;
};

export const getContentGrid = () => {
  const contentGrid = document.getElementById(CONTENT_GRID_ID) as BUI.Grid<
    ContentGridLayouts,
    ContentGridElements
  > | null;

  return contentGrid;
};
