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
import "../../ui/layout-controls";

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
      <div id="lab-sidebar" class="lab-sidebar">
        <div class="lab-sidebar-head">
          <div>
            <bim-label style="font-size: 1.1rem; font-weight: bold;">${APP.titulo}</bim-label>
            <bim-label style="font-size: 0.8rem;">${APP.subtitulo}</bim-label>
          </div>
          <button id="sidebar-toggle" type="button" class="layout-btn" aria-expanded="true"
            aria-controls="lab-sidebar" aria-label="Contraer barra lateral">⟨</button>
        </div>

        <nav class="lab-nav" role="tablist" aria-label="Secciones del visor">
          <button id="nav-models" type="button" role="tab" aria-selected="true"
            aria-controls="pane-models" data-nav-tab="models">Modelos</button>
          <button id="nav-workspace" type="button" role="tab" aria-selected="false"
            aria-controls="pane-workspace" data-nav-tab="workspace">Información</button>
          <button id="nav-tree" type="button" role="tab" aria-selected="false"
            aria-controls="pane-tree" data-nav-tab="tree">Árbol</button>
          <button id="nav-views" type="button" role="tab" aria-selected="false"
            aria-controls="pane-views" data-nav-tab="views">Vistas</button>
        </nav>

        <div class="lab-panes">
          <section id="pane-models" class="lab-pane" role="tabpanel" aria-labelledby="nav-models" data-nav-pane="models">
            ${modelsPanelTemplate(estadoModelos, estatico(estadoModelos))}
          </section>
          <section id="pane-workspace" class="lab-pane" role="tabpanel" aria-labelledby="nav-workspace" data-nav-pane="workspace" hidden>
            <div id="workspace-host"></div>
          </section>
          <section id="pane-tree" class="lab-pane" role="tabpanel" aria-labelledby="nav-tree" data-nav-pane="tree" hidden>
            ${arbolPanelTemplate(estadoArbol, estatico(estadoArbol))}
          </section>
          <section id="pane-views" class="lab-pane" role="tabpanel" aria-labelledby="nav-views" data-nav-pane="views" hidden>
            ${viewpointsPanelTemplate(estadoVistas, estatico(estadoVistas))}
          </section>
        </div>

        <div id="sidebar-resizer" class="lab-resizer" role="separator" aria-orientation="vertical"
          tabindex="0" aria-label="Ajustar ancho de la barra lateral" aria-valuemin="220" aria-valuemax="560" aria-valuenow="352"></div>
      </div>
    `;
  };
