# Historial de versiones — Visor IFC · UCSP

Convención: cada cambio visible y probado sube la versión (1.0 → 1.1 → 1.2 → …
→ 1.9 → 2.0). En git, cada versión publicada lleva su etiqueta (`git tag v1.1`).
Para volver a una versión anterior: `git checkout v1.0` (o desplegar su commit).

## v1.3 (2026-09-08)
- Auto-encuadre: cada modelo cargado (botón, arrastre, ejemplo, `?modelo=`)
  deja la cámara encuadrando todo (`fitToItems` en `carga-ifc.ts`).
- Botón "Revisar choques" (barra inferior): compara las cajas envolventes
  de los modelos cargados y lista los pares que se traslapan, con botón
  "Enfocar" por choque (`core/choques.ts` + diálogo propio). Revisión
  gruesa por volúmenes, no reemplaza un Clash Detective.
- `?modelo=` con id inexistente o que falla al descargar ahora muestra el
  motivo en la bienvenida (antes quedaba en silencio).
- Favicon propio (escudo UCSP) en vez del `vite.svg` del template.
- Build: motor 3D separado en chunk `vendor` (caché entre despliegues;
  la primera descarga sigue ~1 MB con gzip de Vercel).
- `npm run lint` agregado. Estado: la cadena eslint del template está rota
  de origen (el parser 7.2.0 se estrella en `scope-manager` por un
  `visitor-keys` 1.4.0 colado en `node_modules`); `tsc` sigue siendo la
  puerta de calidad que sí pasa.

## v1.2.1 (2026-09-08) — limpieza interna, sin cambios visibles
- `viewer-toolbar.ts`: cabecera al día (sección "Captura") y comentarios
  al español.
- `globals.ts`: eliminados `APP.modeloEjemploNombre` y
  `RUTAS.modeloEjemplo` (huérfanos; todo usa `EJEMPLOS` + `carpetaModelos`).
- `docs/ARQUITECTURA.md`: documenta bienvenida, `?modelo=`, `EJEMPLOS`,
  captura y versión visible.

## v1.2 (2026-09-08)
- Modelo propio de clase agregado: "Graderías (RV11)" (de `Docencia - 2026.1/
  Gestión de la construcción/Modelo Graderias _ RV11.ifc` → `public/models/
  graderias.ifc`). Aparece como primer botón de ejemplo y se abre directo con
  `https://visor-ifc-ucsp.vercel.app/?modelo=graderias`.
- Bienvenida más legible: título y pasos ahora usan el color claro del tema
  (antes heredaban negro del navegador sobre fondo oscuro), título más grande.

## v1.1 (2026-09-08)
- Pantalla de bienvenida con guía rápida y versión visible (botón "Comenzar").
- Insignia de versión en la cabecera del panel lateral.
- Botón "Captura": descarga la vista actual como PNG (renderer con
  `preserveDrawingBuffer` para que la captura nunca salga negra).
- Modelos de ejemplo múltiples: un botón por modelo en `public/models/`
  (lista `EJEMPLOS` en `src/globals.ts`). Agregar uno = copiar el .ifc y
  añadir una línea.
- Links directos `?modelo=<id>`: abren el visor con ese modelo ya cargado
  (ideal para mandar a alumnos, p. ej. `?modelo=ejemplo`).
- package.json versionado (1.1.0).

## v1.0 (2026-09-07) — base
- Fase 1 funcional: abrir/arrastrar IFC, árbol del modelo, propiedades con
  export TSV, cortes, mediciones, ocultar/aislar/fantasma/colorear, vistas
  guardadas. Todo en español, sobre ThatOpen Engine 3.2 (Vite + TS).
- Publicado en Vercel (https://visor-ifc-ucsp.vercel.app/).
