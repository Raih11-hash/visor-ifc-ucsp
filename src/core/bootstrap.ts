/**
 * main.ts — Punto de entrada del Visor IFC · UCSP.
 *
 * Flujo de arranque (cada paso vive en su propio módulo documentado):
 * 1. Se crea el contenedor de componentes (core de ThatOpen).
 * 2. core/mundo.ts crea el mundo 3D (escena, cámara, viewport).
 * 3. Se inicializan los componentes y el raycaster (clic sobre el modelo).
 * 4. core/interaccion.ts configura resaltado, cortes y medición.
 * 5. core/carga-ifc.ts configura el motor IFC (WASM y worker autoalojados,
 *    sin CDN externos) y activa soltar-archivos sobre el visor.
 * 6. Se arma la interfaz: ajustes del viewport + rejilla del viewport +
 *    rejilla de contenido (barra lateral, visor 3D, datos de selección).
 *
 * Estructura del proyecto:
 * - core/: lógica 3D e IFC (mundo, carga-ifc, interaccion).
 * - ui-templates/: interfaz (grids, groups, sections, toolbars, buttons).
 * - globals.ts: constantes, rutas y textos en español.
 * - docs/ARQUITECTURA.md: descripción de cada parte.
 */

import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as OBF from "@thatopen/components-front";
import { ModelWorkspace } from "../services/model-workspace";
import { mountWorkspacePanel } from "../ui/workspace-panel";
import * as TEMPLATES from "../ui-templates";
import { APP, CONTENT_GRID_ID } from "../globals";
import { crearMundo } from "./mundo";
import { activarArrastrarSoltar, configurarMotorIfc } from "./carga-ifc";
import { configurarCorteYMedicion, configurarResaltado } from "./interaccion";
import { viewportSettingsTemplate } from "../ui-templates/buttons/viewport-settings";
import { verificarRecursosMotor } from "./recursos";
import { avisar } from "../ui/feedback";

export async function iniciarVisor() {
await verificarRecursosMotor();

BUI.Manager.init();

// 1. Contenedor principal de ThatOpen.
const components = new OBC.Components();

// 2. Mundo 3D + viewport.
const { world, viewport } = crearMundo(components);

// 3. Inicialización y raycaster (permite hacer clic en el modelo).
components.init();
components.get(OBC.Raycasters).get(world);

// 4. Selección, cortes y medición.
configurarResaltado(components, world);
configurarCorteYMedicion(components, world, viewport);

// 5. Motor IFC + arrastrar y soltar archivos .ifc sobre el visor.
await configurarMotorIfc(components, world);
activarArrastrarSoltar(components, viewport, (nombre) => avisar(`Modelo listo: ${nombre}`), (mensaje) => avisar(mensaje, true));

// 6. Interfaz: ajustes, rejilla del viewport y contenido principal.
const [viewportSettings] = BUI.Component.create(viewportSettingsTemplate, {
  components,
  world,
});
viewport.append(viewportSettings);

const [viewportGrid] = BUI.Component.create(TEMPLATES.viewportGridTemplate, {
  components,
  world,
});
viewport.append(viewportGrid);

const viewportCardTemplate = () => BUI.html`
  <div class="dashboard-card" style="padding: 0px;">
    ${viewport}
  </div>
`;

const [contentGrid] = BUI.Component.create<
  BUI.Grid<TEMPLATES.ContentGridLayouts, TEMPLATES.ContentGridElements>,
  TEMPLATES.ContentGridState
>(TEMPLATES.contentGridTemplate, {
  components,
  world,
  id: CONTENT_GRID_ID,
  viewportTemplate: viewportCardTemplate,
});

const setInitialLayout = () => {
  const layouts = Object.keys(contentGrid.layouts);
  if (window.location.hash) {
    const hash = window.location.hash.slice(1);
    if (layouts.includes(hash)) {
      contentGrid.layout = hash as TEMPLATES.ContentGridLayouts[number];
      return;
    }
  }
  contentGrid.layout = "Visor";
  window.location.hash = "Visor";
};
setInitialLayout();

contentGrid.addEventListener("layoutchange", () => {
  window.location.hash = contentGrid.layout as string;
});

const contentGridIcons: Record<TEMPLATES.ContentGridLayouts[number], string> =
  {
    Visor: "mage:box-3d-fill",
  };

// Rejilla de la app: barra de navegación + contenido.
type AppLayouts = ["App"];
type Sidebar = { name: "sidebar"; state: TEMPLATES.GridSidebarState };
type ContentGrid = { name: "contentGrid"; state: TEMPLATES.ContentGridState };
type AppGridElements = [Sidebar, ContentGrid];

const app = document.getElementById("app") as BUI.Grid<
  AppLayouts,
  AppGridElements
>;

app.elements = {
  sidebar: {
    template: TEMPLATES.gridSidebarTemplate,
    initialState: {
      grid: contentGrid,
      compact: true,
      layoutIcons: contentGridIcons,
    },
  },
  contentGrid,
};

contentGrid.addEventListener("layoutchange", () =>
  app.updateComponent.sidebar(),
);

app.layouts = {
  App: {
    template: `
      "sidebar contentGrid" 1fr
      /auto 1fr
    `,
  },
};
app.layout = "App";

document.title = `${APP.titulo} · UCSP`;
let host=document.getElementById('workspace-host');
for(let attempt=0;!host && attempt<100;attempt++) {await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));host=document.getElementById('workspace-host');}
if(!host)throw new Error('No se pudo abrir el panel de información. Reintenta la apertura.');
const workspace=new ModelWorkspace(components,world);
const panel=mountWorkspacePanel(host,workspace);
const fragments=components.get(OBC.FragmentsManager);
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleRefresh=()=>{
  if(refreshTimer)clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{
    if(host?.getAttribute('aria-busy')==='true'){scheduleRefresh();return;}
    void panel.refresh();
  },100);
};
fragments.list.onItemSet.add(scheduleRefresh);
fragments.list.onItemDeleted.add(scheduleRefresh);
if(new URLSearchParams(location.search).get('test')==='1') {
  Object.assign(window,{__IFC_TEST:{components,world,workspace,OBC,OBF}});
}
return { components, world, viewport, contentGrid, workspace };
}
