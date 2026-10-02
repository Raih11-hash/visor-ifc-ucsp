# Historial de versiones — Visor IFC · UCSP

Convención: las versiones de la aplicación siguen SemVer (por ejemplo, v2.2 → `2.2.0` en el paquete); RV identifica revisiones de documentación y respaldos. Las publicaciones de prueba se registran por commit y deployment. **No crear tags, releases ni sustituir main sin aprobación explícita.** Las entradas históricas describen su estado al publicarse, no el destino actual de los alias.

Dirección principal de trabajo actual: **https://ifc-ucsp.vercel.app** (línea v2, pública). Dirección histórica: **https://visor-ifc-ucsp.vercel.app** (v1.0 congelada). Ver [README](../README.md) y [alcance v2.2 RV9](PLAN_V22_RV9.md).

## v2.2.0 (entrega RV9; rama preview, main/v1.0 intacta)

Base: v2.1.2 / `5477107faa0159af51e1e3db7d10bdda1077ba60`. La dirección principal de la línea v2 es `https://ifc-ucsp.vercel.app`; la publicación se activa solo después de pruebas y revisión, verificando el SHA y el destino del alias manual.

- Cabecera de escritorio en una fila, adaptable a móvil; altura99→60px y39px adicionales de canvas comprobados a1920/1366/1024.
- Inspector BIM por Psets originales, con nombre/valor separados, expandir/contraer, búsqueda y TSV. Vista técnica opcional para atributos, tipos, IDs, referencias y relaciones.
- Causa demostrada: transformación de Value en `ui-obc.tables.itemsData` dejaba textos/booleanos vacíos al no encontrarles unidad. Parser y datos FRAG conservaban los valores; no se modifica Revit ni el IFC.
- Normalización visual tipada reusable: textos, números, booleanos/lógicos, nulos, medidas, unidades SI/conversión/propias, referencias y valores compuestos. Unit explícita no resoluble muestra su referencia, nunca una unidad global falsa.
- Selección múltiple sin límite silencioso; cargas por lotes, protección de respuestas/errores tardíos, reintento y eliminación de datos al cerrar modelos.
- Sesiones mantienen esquema2, emiten2.2.0 y leen2.0.0/2.1.0/2.1.1/2.1.2. La v2.1.2 antigua no lee sesiones marcadas2.2.0.
- README/LEEME separan dirección principal, producción antigua y respaldos históricos; se conservan los documentos originales.
- Verificación local final: TypeScript/build OK,175 pruebas Node sin omisiones,264 comprobaciones Chromium (225 estándar+39 real-IFC). Auditorías npm producción/completa:0 vulnerabilidades. Las pruebas con baseline de cabecera suman2 comprobaciones de espacio ganado; sin esa evidencia la suite estándar contiene223.
- Archivo real: `EST_GT_C_R_v5.ifc`, SHA-256 `e496972a1f74199d9b3fb9e1cfce859606197bfd0ae67dd274011119bad23979`. IFCBEAM GUID `3zSxltga9Eo8qEtsMwBJvC`: Construction→H/V=H, Nivel=N4, Tipo de elemento=Vigas, también tras restaurar FRAG.

Detalle y límites: [PROPIEDADES_V22_RV9.md](PROPIEDADES_V22_RV9.md). No se certifican metrados, IDS ni rendimiento en equipos de alumnos. Sin cambio de dependencias, IFC original, main, tags ni releases.

## v2.1.2 (preview RV6; producción v1.0 intacta)

- Panel derecho acotado a la altura disponible (`min-height:0`, `overflow:hidden` en contenedor flex/grid); el árbol expandido ahora desborda hacia su región de scroll, no fuera de la pantalla.
- Regresión con IFC real: rueda al fondo y último campo visible, escritorio y móvil; plegar/reabrir mantiene datos y scroll no modifica cámara.
- Smoke nuevo integrado en suite E2E. Códec acepta sesiones 2.0.0/2.1.0/2.1.1/2.1.2, sin cambiar esquema.
- URL corta ya aprobada: asignación pendiente por acceso Vercel, no por autorización del nombre. Producción y protección no se modifican.

## v2.1.1 (preview RV5; producción v1.0 intacta)

- Controles directos y reversibles de cuadrícula y marca; marca oculta por API oficial, sin borrar avisos de licencia.
- Propiedades protegidas contra respuestas tardías tras limpiar/cambiar selección; agrupación de cambios rápidos de 120ms, sin limitar selección o Psets/cantidades.
- Nuevas regresiones integradas en la suite E2E; paquete/manifiesto/título/códec coherentes, lectura de sesiones 2.0.0/2.1.0/2.1.1.
- Alcance y límites en `ALCANCE_AJUSTES_RV5.md`. No se reprodujeron los 8.02s de la captura ni se certifica rendimiento con IFC grandes. Sin merge/tag/release o cambios de producción.

## v2.1 (preview RV4; producción v1.0 intacta)

- Encuadres sin PNG obligatorio, cámara actualizada coherente con sesión, nombres/acciones en español y errores/timeouts sin filas incompletas.
- Navegación directa, paneles montados, lateral ajustable, propiedades plegables liberando ancho, presentación y móvil con un solo panel superpuesto.
- Estado de cambios sin guardar y guardado visible/verificado; exportar JSON no equivale a guardar localmente. Lee sesiones 2.0 y 2.1; esquema 2 sin cambios.
- Verificación local: 108 Node sin omisiones, 63 comprobaciones base, 28 vistas/guardado y 46 layout; build y auditorías npm correctos. Medición local comparable y límites en `CIERRE_UX_VISTAS_RV4.md`.
- Sin merge, tag o release; revisión/deployment se registran por separado. Falta validación humana y acceso al preview autenticado.

## v2.0 (rama/preview; todavía no sustituye v1.0)

- Motor compatible fijado y recursos Worker/WASM autoalojados verificables; inicio inmediato, error/reintento y validación temprana de IFC/FRAG.
- Tablero de elementos con geometría, filtros combinados, selección/aislamiento, consultas y CSV protegido contra fórmulas.
- Revisión explícita de presencia/igualdad, motivos, selección de fallos, colores (cualquier fallo prevalece) y CSV. No certifica IDS/EIR/LOD.
- Sesiones IndexedDB y JSON con modelos FRAG reales/SHA-256, cámara/proyección, filtros, consultas, reglas, selección, ocultos, colores y vistas de cámara. No guarda cortes/medidas/fantasma.
- Propiedades de ocurrencia prevalecen sobre las del tipo; contraste automatizado de nivel/Pset/cantidad con IFC fuente.
- Base verificada localmente (RV3): 106 pruebas Node sin omisiones, 62 comprobaciones Playwright, compilación TypeScript/Vite y ambas auditorías npm sin vulnerabilidades. Evidencia reproducible en `scripts/smoke_v2.py`; el paquete 3D sigue siendo grande y falta validación humana en equipo de alumno.
- RV3: se rechaza un FRAG idéntico a otro ya abierto antes de añadirlo; mensaje visible y sesión actual intacta. Dos cargas del mismo IFC se probaron como instancias distintas, con guardado, recarga y restauración completos. Detalle en `CIERRE_CALIDAD_V2_RV3.md`.
- Arquitectura actual en `ARQUITECTURA_V2_RV2.md`. La revisión independiente y la publicación de preview se registran por separado; estos resultados locales no prueban despliegue.

> Las v1.1–v1.3.1 siguientes fueron revertidas; sus funciones no describen la producción v1.0 congelada.

## v1.3.1 (2026-09-08)
- Cartel instantáneo: "Comenzar" cierra al toque (sin esperar animación) y
  con `?modelo=` el modelo carga en segundo plano; si falla, el cartel se
  reabre con el motivo.
- Nitidez: el renderizador usa la densidad real de píxeles (hasta 2x) para
  que el modelo no se vea pixelado; se reaplica en cada resize.
- Barra inferior solo con iconos (`labels-hidden`, los textos siguen en
  ayudas) para que no se corte en pantallas angostas; diálogo de choques
  con alto máximo y scroll.

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
