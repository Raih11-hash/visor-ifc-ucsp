/**
 * groups/barra-lateral.ts — Columna lateral izquierda del visor.
 *
 * Apila, con desplazamiento vertical, las tres secciones de trabajo:
 * 1. Cabecera con el nombre de la app ("Visor IFC · UCSP").
 * 2. Panel "Modelos" (abrir IFC / ejemplo).
 * 3. Panel "Árbol del modelo" (jerarquía del edificio).
 * 4. Panel "Vistas guardadas" (cámaras para retomar en clase).
 */

import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import { APP } from "../../globals";
import { ModelsPanelState, modelsPanelTemplate } from "../sections/models";
import { ArbolPanelState, arbolPanelTemplate } from "../sections/arbol";
import {
  ViewpointsPanelState,
  viewpointsPanelTemplate,
} from "../sections/viewpoints";

export interface BarraLateralState {
  components: OBC.Components;
  world?: OBC.World;
}

export const barraLateralTemplate: BUI.StatefullComponent<BarraLateralState> = (
  state,
) => {
  const { components, world } = state;

  // Las secciones son estáticas dentro de la barra: su "update" solo
  // devuelve el estado combinado, sin re-renderizar nada.
  const estatico = <E extends Record<string, any>>(
    base: E,
  ): BUI.UpdateFunction<E> => {
    return (parcial) => ({ ...base, ...parcial });
  };

  const estadoModelos: ModelsPanelState = { components };
  const estadoArbol: ArbolPanelState = { components };
  const estadoVistas: ViewpointsPanelState = { components, world };

  return BUI.html`
    <div style="display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; height: 100%; padding: 0 0.25rem;">
      <div>
        <bim-label style="font-size: 1.1rem; font-weight: bold;">${APP.titulo}</bim-label>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <bim-label style="font-size: 0.8rem;">${APP.subtitulo}</bim-label>
          <bim-label style="font-size: 0.68rem; color: var(--bim-ui_accent-base); border: 1px solid var(--bim-ui_bg-contrast-40); border-radius: 0.75rem; padding: 0.05rem 0.45rem;">v${APP.version}</bim-label>
        </div>
      </div>
      ${modelsPanelTemplate(estadoModelos, estatico(estadoModelos))}
      ${arbolPanelTemplate(estadoArbol, estatico(estadoArbol))}
      ${viewpointsPanelTemplate(estadoVistas, estatico(estadoVistas))}
    </div>
  `;
};
