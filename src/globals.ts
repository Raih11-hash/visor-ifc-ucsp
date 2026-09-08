/**
 * globals.ts — Constantes globales de la aplicación.
 *
 * Qué contiene:
 * - APP: nombre y textos generales del visor (se muestran en la interfaz).
 * - RUTAS: dónde están los archivos que el visor necesita en tiempo de
 *   ejecución (worker de fragments, WASM de web-ifc y modelo IFC de ejemplo).
 *   Se calculan respecto a la página actual para que funcionen igual en
 *   desarrollo (localhost) y en producción (Vercel u otro hosting estático).
 * - appIcons / tooltips: iconos y ayudas de los botones, en español.
 */

const base = import.meta.env.BASE_URL;

/** Convierte una ruta relativa (p. ej. "./wasm/") en URL absoluta. */
const urlAbsoluta = (relativa: string) =>
  new URL(relativa, document.baseURI).href;

export const APP = {
  titulo: "Visor IFC",
  subtitulo: "UCSP · Ingeniería Civil",
  version: "1.1",
  modeloEjemploNombre: "Edificio ejemplo (IFC4)",
} as const;

/** Modelos de ejemplo incluidos en public/models/. Para agregar uno propio
 * de clase (p. ej. graderías): suelta el .ifc en public/models/ y añade una
 * línea aquí con su id, nombre y archivo. El link ?modelo=<id> lo abre directo. */
export const EJEMPLOS = [
  { id: "ejemplo", nombre: "Edificio ejemplo (IFC4)", archivo: "ejemplo.ifc" },
] as const;

export const RUTAS = {
  /** Worker de @thatopen/fragments, copiado en public/. Imprescindible en
   * producción: la ruta /node_modules/... del template solo existe en dev. */
  workerFragments: `${base}fragments-worker.mjs`,
  /** Carpeta con web-ifc.wasm (public/wasm/). web-ifc exige la URL absoluta
   * terminada en "/" y él agrega el nombre del archivo .wasm. */
  carpetaWasm: urlAbsoluta(`${base}wasm/`),
  /** Modelo IFC de ejemplo (buildingSMART, IFC4) para probar sin archivos. */
  modeloEjemplo: `${base}models/ejemplo.ifc`,
  /** Carpeta de modelos de ejemplo (para ?modelo= y botones múltiples). */
  carpetaModelos: `${base}models/`,
} as const;

export const CONTENT_GRID_ID = "app-content";

export const CONTENT_GRID_GAP = "1rem";

export const SMALL_COLUMN_WIDTH = "22rem";

export const appIcons = {
  ADD: "mdi:plus",
  SELECT: "solar:cursor-bold",
  CLIPPING: "fluent:cut-16-filled",
  SHOW: "mdi:eye",
  HIDE: "mdi:eye-off",
  LEFT: "tabler:chevron-compact-left",
  RIGHT: "tabler:chevron-compact-right",
  SETTINGS: "solar:settings-bold",
  COLORIZE: "famicons:color-fill",
  EXPAND: "eva:expand-fill",
  EXPORT: "ph:export-fill",
  TASK: "material-symbols:task",
  CAMERA: "solar:camera-bold",
  FOCUS: "ri:focus-mode",
  TRANSPARENT: "mdi:ghost",
  ISOLATE: "mdi:selection-ellipse",
  RULER: "solar:ruler-bold",
  MODEL: "mage:box-3d-fill",
  LAYOUT: "tabler:layout-filled",
  TREE: "mdi:file-tree",
  EXAMPLE: "mdi:home-city",
  HELP: "mdi:help-circle",
};

export const tooltips = {
  FOCUS: {
    TITLE: "Enfocar",
    TEXT: "Mueve la cámara a los elementos seleccionados. Sin selección, encuadra todos los modelos.",
  },
  HIDE: {
    TITLE: "Ocultar selección",
    TEXT: "Oculta los elementos seleccionados.",
  },
  ISOLATE: {
    TITLE: "Aislar selección",
    TEXT: "Oculta todo menos los elementos seleccionados.",
  },
  GHOST: {
    TITLE: "Modo fantasma",
    TEXT: "Vuelve los modelos transparentes para ver mejor selecciones y colores.",
  },
  SHOW_ALL: {
    TITLE: "Mostrar todo",
    TEXT: "Restaura la visibilidad de todos los elementos ocultos.",
  },
};
