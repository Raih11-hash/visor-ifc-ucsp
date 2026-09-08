# Visor IFC · UCSP — Descripción de cada parte

Visor web de modelos IFC para docencia (Ingeniería Civil, UCSP).
Stack: Vite 7 + TypeScript estricto + ThatOpen Engine 3.2.0 (open-source).
Todo el procesamiento ocurre en el navegador del alumno: no hay servidor ni
base de datos. Cada archivo tiene un comentario de cabecera que explica su rol.

## Arranque (`src/main.ts`, `index.html`)

`index.html` solo crea el contenedor `<bim-grid id="app">`, el overlay de
bienvenida (`#bienvenida`: guía rápida + versión) y carga `main.ts`.
`main.ts` es la "raíz de composición": no tiene lógica de negocio, solo
ordena los pasos (crear componentes → mundo → interacción → motor IFC →
interfaz → bienvenida + autocarga `?modelo=`). Si algo falla al abrir la
página, se mira aquí primero.

## Núcleo 3D e IFC (`src/core/`)

- **`mundo.ts` → `crearMundo()`**: crea el mundo 3D (escena oscura + grilla,
  cámara perspectiva/ortográfica, renderizador con sombras y bordes).
  Devuelve `{ world, viewport }` que usa todo lo demás.
- **`carga-ifc.ts`**: el motor de archivos.
  - `configurarMotorIfc()` arranca fragments (worker autoalojado) y el
    lector IFC (WASM autoalojado, sin CDN). Cada modelo cargado entra
    solo a la escena y la cámara lo encuadra (`fitToItems`).
  - `cargarIfcDesdeBytes()` convierte bytes `.ifc` en modelo 3D.
  - `cargarModeloEjemplo()` descarga el IFC de ejemplo incluido en la app.
  - `activarArrastrarSoltar()` abre un `.ifc` soltado sobre el visor.
- **`choques.ts`**: revisión gruesa de choques entre modelos (cajas
  envolventes por pares + diálogo con "Enfocar" por choque).
- **`interaccion.ts`**:
  - `configurarResaltado()` pinta la selección en verde (alimenta el panel
    de propiedades).
  - `configurarCorteYMedicion()` planos de corte (doble clic / Supr) y
    medición de longitudes y áreas.

## Interfaz (`src/ui-templates/`)

- **`grids/content.ts`**: rejilla de 3 columnas — barra lateral | visor 3D |
  datos de la selección.
- **`grids/viewport.ts`**: barras flotantes sobre el 3D (medición, corte,
  visibilidad, selección).
- **`groups/barra-lateral.ts`**: columna izquierda: cabecera UCSP + Modelos
  + Árbol + Vistas guardadas.
- **`groups/grid-sidebar.ts`**: mini-barra de navegación (del template).
- **`sections/models.ts`**: lista de modelos + botones IFC / Fragments +
  un botón por modelo de ejemplo (lista `EJEMPLOS` en `globals.ts`) +
  buscador + mensajes de estado. El link `?modelo=<id>` autocarga un
  ejemplo al abrir (ver `main.ts`), ideal para mandar a alumnos.
- **`sections/arbol.ts`**: jerarquía del edificio (proyecto → niveles →
  elementos). Clic = selecciona en el 3D. *(Nuevo en esta versión.)*
- **`sections/elements-data.ts`**: propiedades del elemento seleccionado,
  con buscador y exportación a TSV (abre en Excel).
- **`sections/viewpoints.ts`**: guarda vistas de cámara para retomar en clase.
- **`toolbars/viewer-toolbar.ts`**: mostrar todo, fantasma, captura PNG,
  choques entre modelos, enfocar, ocultar, aislar, colorear.
- **`buttons/viewport-settings.ts`**: grilla sí/no y tipo de proyección.
- **`globals.ts`**: textos en español, iconos, rutas (`RUTAS`), versión
  (`APP.version`, visible en bienvenida e insignia lateral) y lista
  `EJEMPLOS` de modelos de ejemplo.

## Archivos servidos tal cual (`public/` → se copian a `dist/`)

- **`wasm/web-ifc.wasm`**: motor que lee IFC, autoalojado (antes: CDN unpkg).
- **`fragments-worker.mjs`**: worker que convierte IFC a geometría
  (antes: ruta `/node_modules/...` que se rompía en producción).
- **`models/`**: IFCs de ejemplo que sirven los botones y `?modelo=`:
  `ejemplo.ifc` (edificio IFC4 buildingSMART) y `graderias.ifc` (modelo
  propio de clase, RV11).

## Publicar en Vercel

1. Subir el proyecto a GitHub (sin `node_modules` ni `dist`).
2. En Vercel: importar el repo → framework **Vite** → build `npm run build`,
   salida `dist/` (autodetectado, no requiere `vercel.json`).
3. Cada `git push` redespliega solo. Plan gratuito suficiente: el IFC se
   procesa en el PC del alumno, Vercel solo sirve la página (~1 MB).

## Comandos (en la copia local `C:\Users\luis.zegarra\visor-ifc-ucsp`)

- `npm install` — solo la primera vez.
- `npm run dev` — prueba local en http://localhost:5173
- `npm run build` — genera `dist/` para publicar (verifica TypeScript).
