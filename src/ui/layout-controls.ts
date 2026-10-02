/**
 * ui/layout-controls.ts — Navegación directa y layout adaptable del visor.
 *
 * Contrato de DOM que este módulo conecta (lo emiten barra-lateral.ts y
 * content.ts; el smoke scripts/smoke_layout_v21.py lo verifica):
 *   - Tabs laterales : [data-nav-tab="models|workspace|tree|views"]
 *                      ids #nav-models #nav-workspace #nav-tree #nav-views
 *   - Paneles        : [data-nav-pane="..."] ids #pane-models … (siempre
 *                      montados; solo se alterna el atributo `hidden`).
 *   - Lateral        : #lab-sidebar, #sidebar-toggle, #sidebar-resizer.
 *   - Propiedades    : #panel-propiedades, #toggle-properties.
 *   - Cabecera       : #header-nav-models #header-nav-workspace
 *                      #header-nav-tree #header-nav-views #toggle-presentation.
 *
 * Punto de integración: el módulo se auto-monta con un MutationObserver
 * controlado (espera a que existan el lateral y .header-actions) y es
 * idempotente. bootstrap.ts NO necesita llamarlo; si el padre prefiere
 * un ref explícito, puede invocar mountLayoutControls() una sola vez.
 *
 * Reglas: no se recrean instancias al cambiar de sección (solo `hidden`),
 * el canvas y el estado del workspace permanecen; el ancho del lateral se
 * ajusta escribiendo la primera pista de #app-content (BUI.Grid) sin tocar
 * sus layouts; presentación y móvil se resuelven con clases en <body> y CSS.
 */

import { CONTENT_GRID_ID } from "../globals";

export type LayoutSection = "models" | "workspace" | "tree" | "views";

const MOBILE_MAX = 800;
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 560;
const SIDEBAR_COLLAPSED = 56;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const px = (value: number) => `${Math.round(value)}px`;

const isMobile = () => window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches;

let mounted = false;

/** Conecta todos los controles de layout. Idempotente: solo actúa la 1ª vez. */
export function mountLayoutControls(): () => void {
  if (mounted) return () => {};
  const sidebar = document.getElementById("lab-sidebar");
  const headerActions = document.querySelector(".header-actions");
  if (!sidebar || !headerActions) return () => {};
  mounted = true;

  // ---- Accesos rápidos en la cabecera (Modelos · Información · Árbol ·
  // Vistas) + modo presentación. Se inyectan una sola vez.
  const headerNav = document.createElement("div");
  headerNav.id = "header-nav";
  headerNav.className = "header-nav";
  headerNav.setAttribute("role", "group");
  headerNav.setAttribute("aria-label", "Accesos rápidos de sección");
  headerNav.innerHTML = `
    <button type="button" id="header-nav-models" class="layout-btn" data-header-section="models" aria-current="true" aria-label="Ir a Modelos">Modelos</button>
    <button type="button" id="header-nav-workspace" class="layout-btn" data-header-section="workspace" aria-current="false" aria-label="Ir a Información">Información</button>
    <button type="button" id="header-nav-tree" class="layout-btn" data-header-section="tree" aria-current="false" aria-label="Ir a Árbol">Árbol</button>
    <button type="button" id="header-nav-views" class="layout-btn" data-header-section="views" aria-current="false" aria-label="Ir a Vistas">Vistas</button>
    <button type="button" id="header-nav-properties" class="layout-btn" aria-label="Mostrar propiedades del elemento">Datos</button>
    <button type="button" id="toggle-presentation" class="layout-btn" aria-pressed="false" aria-label="Activar modo presentación">Presentación</button>`;
  headerActions.insertBefore(headerNav, headerActions.firstChild);

  const grid = document.getElementById(CONTENT_GRID_ID);
  const properties = document.getElementById("panel-propiedades");

  const widthOf = (el: Element | null) =>
    el ? parseFloat(getComputedStyle(el).width) || 0 : 0;

  let leftWidth = 340;
  const rightWidth = 280;
  let propertiesCollapsed = false;
  let collapsed = false;
  let presentation = false;
  let section: LayoutSection = "models";

  // ---- Ancho del lateral: escribe la 1ª pista de la rejilla de contenido.
  const applyColumns = () => {
    if (!grid || presentation || isMobile()) return;
    const left = collapsed ? SIDEBAR_COLLAPSED : clamp(leftWidth, SIDEBAR_MIN, SIDEBAR_MAX);
    grid.style.gridTemplateColumns = `${px(Math.min(left,Math.max(SIDEBAR_MIN,window.innerWidth-600)))} minmax(0,1fr) ${px(propertiesCollapsed ? 48 : rightWidth)}`;
  };

  const resizer = document.getElementById("sidebar-resizer");
  const updateResizerAria = () => {
    if (!resizer) return;
    resizer.setAttribute("aria-valuenow", String(Math.round(widthOf(sidebar))));
  };

  // ---- Sección activa (tabs directos).
  const openMobilePanel = (kind: "sidebar" | "properties") => {
    document.body.classList.toggle("mobile-panel-sidebar", kind === "sidebar");
    document.body.classList.toggle("mobile-panel-properties", kind === "properties");
  };
  const closeMobilePanels = () => {
    document.body.classList.remove("mobile-panel-sidebar", "mobile-panel-properties");
  };

  const setSection = (name: LayoutSection, openOnMobile = true) => {
    if(presentation)setPresentation(false);
    if(collapsed)setCollapsed(false);
    section = name;
    document
      .querySelectorAll<HTMLElement>("[data-nav-tab]")
      .forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.navTab === name)));
    document
      .querySelectorAll<HTMLElement>("[data-nav-pane]")
      .forEach((pane) => { pane.hidden = pane.dataset.navPane !== name; });
    document
      .querySelectorAll<HTMLElement>("[data-header-section]")
      .forEach((button) =>
        button.setAttribute("aria-current", button.dataset.headerSection === name ? "true" : "false"),
      );
    if (isMobile() && openOnMobile) openMobilePanel("sidebar");
  };

  // ---- Plegado del lateral.
  const setCollapsed = (value: boolean) => {
    collapsed = value;
    sidebar.classList.toggle("is-collapsed", value);
    document.getElementById("sidebar-toggle")?.setAttribute("aria-expanded", String(!value));
    applyColumns();
  };

  // ---- Modo presentación reversible.
  const setPresentation = (value: boolean) => {
    presentation = value;
    document.body.classList.toggle("layout-presentation", value);
    document.getElementById("toggle-presentation")?.setAttribute("aria-pressed", String(value));
    if (value) closeMobilePanels();else applyColumns();
  };

  // ---- Propiedades plegables.
  const setPropertiesCollapsed = (value: boolean) => {
    if (!properties) return;
    propertiesCollapsed=value;
    properties.classList.toggle("is-collapsed", value);
    applyColumns();
    document.getElementById("toggle-properties")?.setAttribute("aria-expanded", String(!value));
  };

  // ---- Listeners.
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(
    el: EventTarget | null,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => {
    if (!el) return;
    el.addEventListener(type, handler as EventListener);
    cleanups.push(() => el.removeEventListener(type, handler as EventListener));
  };

  document.querySelectorAll<HTMLElement>("[data-nav-tab]").forEach((tab) =>
    on(tab, "click", () => setSection(tab.dataset.navTab as LayoutSection)),
  );
  document.querySelectorAll<HTMLElement>("[data-header-section]").forEach((button) =>
    on(button, "click", () => setSection(button.dataset.headerSection as LayoutSection)),
  );

  on(document.getElementById("sidebar-toggle"), "click", () => {
    if (isMobile()) {
      if (document.body.classList.contains("mobile-panel-sidebar")) closeMobilePanels();
      else openMobilePanel("sidebar");
      return;
    }
    setCollapsed(!collapsed);
  });
  on(document.getElementById("toggle-properties"), "click", () => {
    if (isMobile()) {
      if (document.body.classList.contains("mobile-panel-properties")) closeMobilePanels();
      else openMobilePanel("properties");
      return;
    }
    setPropertiesCollapsed(!(properties?.classList.contains("is-collapsed") ?? false));
  });
  on(document.getElementById("header-nav-properties"), "click", () => {setPresentation(false);if(isMobile())openMobilePanel("properties");else setPropertiesCollapsed(false);});
  on(document.getElementById("toggle-presentation"), "click", () => setPresentation(!presentation));

  // Resizer accesible: arrastre + teclado (flechas, Home/End).
  if (resizer) {
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    on(resizer, "pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startLeft = widthOf(sidebar);
      (resizer as HTMLElement).setPointerCapture((event as PointerEvent).pointerId);
      event.preventDefault();
    });
    on(resizer, "pointermove", (event) => {
      if (!dragging) return;
      leftWidth = clamp(startLeft + (event.clientX - startX), SIDEBAR_MIN, SIDEBAR_MAX);
      applyColumns();
      updateResizerAria();
    });
    on(resizer, "pointerup", () => { dragging = false; });
    on(resizer, "keydown", (event) => {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === "ArrowRight") leftWidth = clamp(widthOf(sidebar) + step, SIDEBAR_MIN, SIDEBAR_MAX);
      else if (event.key === "ArrowLeft") leftWidth = clamp(widthOf(sidebar) - step, SIDEBAR_MIN, SIDEBAR_MAX);
      else return;
      event.preventDefault();
      setCollapsed(false);
      applyColumns();
      updateResizerAria();
    });
  }

  on(document, "keydown", (event) => {
    if (event.key !== "Escape") return;
    if (presentation) setPresentation(false);
    else if (isMobile()) closeMobilePanels();
  });

  const responsive=()=>{closeMobilePanels();applyColumns();};
  on(window,"resize",responsive);
  grid?.addEventListener('layoutchange',applyColumns);
  cleanups.push(()=>grid?.removeEventListener('layoutchange',applyColumns));

  // ---- Estado inicial (en móvil, sin panel superpuesto).
  setSection("models", false);
  closeMobilePanels();
  setCollapsed(false);
  setPropertiesCollapsed(false);
  setPresentation(false);
  applyColumns();
  updateResizerAria();

  // API mínima para el smoke / el padre.
  (window as unknown as Record<string, unknown>).__IFC_LAYOUT = {
    setSection,
    setPresentation,
    setCollapsed,
    isPresentation: () => presentation,
    closeMobilePanels,
    get section() { return section; },
  };

  return () => {
    cleanups.forEach((fn) => fn());
    mounted = false;
  };
}

/** Auto-montaje controlado: espera a que existan lateral y cabecera. */
function autoInit() {
  if (mounted) return;
  if (document.getElementById("nav-models") && document.querySelector(".header-actions")) {
    mountLayoutControls();
    return;
  }
  const observer = new MutationObserver(() => {
    if (mounted) { observer.disconnect(); return; }
    if (document.getElementById("nav-models") && document.querySelector(".header-actions")) {
      observer.disconnect();
      mountLayoutControls();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

autoInit();