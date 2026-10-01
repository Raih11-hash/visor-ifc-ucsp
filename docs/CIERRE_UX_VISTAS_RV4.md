# Ajustes UX y vistas · v2.1 preview RV4

Producción v1.0 y main se mantienen congeladas. Trabajo en feat/visor-v2-docencia; sin merge, tag ni release. El despliegue y las revisiones independientes se registran aparte, no se infieren de las pruebas locales.

## Cambios aplicados

- Las vistas se guardan como encuadres de cámara, sin generar PNG obligatorio. Crear y actualizar mantienen juntas cámara BCF y cámara de sesión; nombres Vista 1, Vista 2…, renombrado, actualización, apertura y borrado con confirmación, en español.
- Abrir un encuadre es inmediato y conserva la visibilidad actual. No se amplía a escenas completas; cortes, medidas y modo fantasma no se guardan en la sesión.
- Captura selección/colores para el manager de vistas actual, no duplica el estilo de selección y reutiliza la conversión de mapas iguales. El formato de sesiones continúa persistiendo cámara/nombre por vista y selección/colores del trabajo global, no escenas de selección/color independientes por cada vista.
- Operaciones de vista con exclusión de doble clic y captura incompleta, tiempo límite 10 s, reversión al fallar y descarte de una resolución tardía. Error visible en el panel; guardar sesión no captura una vista pendiente.
- Acceso directo a Modelos, Información, Árbol y Vistas sin desmontar paneles ni recrear canvas. Lateral plegable y con ancho ajustable por arrastre/teclado; propiedades plegables que liberan ancho real; modo presentación reversible.
- Móvil: un solo panel superpuesto y forma de cerrarlo para recuperar el canvas; Información abre el tablero, no las propiedades. Controles de 44 px en los accesos evaluados.
- Estado conservador de cambios sin guardar y botón Guardar sesión visible. Una descarga JSON no declara el guardado local; el guardado solo confirma la revisión realmente capturada. Fallos del almacén mantienen aviso y mensaje contextual.
- Versión 2.1.0 en aplicación/paquete/manifiesto. El códec acepta sesiones 2.0.0 y 2.1.0 conservando su versión; esquema 2 intacto. Una sesión nueva 2.1 debe abrirse en el visor 2.1, no se promete que el visor antiguo 2.0 la acepte.

## Verificación local real

- TypeScript y build Vite correctos. 108 pruebas Node, 108 pasadas y cero omisiones.
- Playwright/Chromium sobre dist y servidores HTTP efímeros: 63 comprobaciones base, 28 de vistas/guardado, 46 de layout. Cero errores JS inesperados.
- Vistas: cámara actualizada→captura/guardado→recarga, nombre→exportación/recarga, aislamiento conservado al abrir, selección/colores/GUID, cancelación del borrado, error de almacenamiento, fallo de actualización/creación, doble clic, fila pendiente, timeout y finalización tardía.
- Layout: mismos nodos tras navegación, pliegues, presentación, tamaño canvas y controles, móvil 390 px. El canvas gana más de 150 px al plegar propiedades.
- Recursos Worker/WASM: integridad GET+bytes+SHA-256; faltantes y corrupción de igual tamaño rechazados. Sesiones/FRAG reales, precedencia Psets y rechazo de duplicados conservados por suite base.
- npm audit --omit=dev y --include=dev: cero vulnerabilidades en ambas ejecuciones.
- TDD: RED inicial de vistas/selección/dirty/layout, seguido de implementación y GREEN. Regresiones de compatibilidad 2.1 y manifiesto de versión reprodujeron errores concretos antes de corregirlos. Ajuste de prueba de layout espera el ResizeObserver en vez de medir un canvas aún del modo presentación.

## Medición comparable de creación de encuadres

Script scripts/benchmark_views_v21.py; baseline ZIP RV3 frente al dist RV4, Chromium local, canvas 653 × 672 idéntico, tres creaciones por caso y versión. Muestras pequeñas (ejemplo 13 elementos y federación ejemplo+Graderías 33); no extrapolar a IFC grandes ni equipo de alumno. Tiempo: clic real→botón disponible, sin incluir espera de actionability Playwright.

| Caso | Mediana RV3 | Mediana RV4 |
|---|---:|---:|
| Ejemplo sin selección | 185,3 ms | 6,8 ms |
| Ejemplo con selección/color | 125,9 ms | 20,6 ms |
| Dos modelos con selección/color | 248,2 ms | 19,4 ms |

RV3 hizo un PNG por creación; RV4 ninguno. Con selección/color, conversiones GUID pasan de tres a una por creación. Evidencia completa en test-results/benchmark-views-v21.json (incluye GPU, fases, medidas individuales y SHA-256 del ZIP base). Son mediciones de esta ejecución, no garantías universales.

## Revisión independiente

- Especificación: PASS sustantivo; un bloqueo transitorio de versionado fue cotejado y corregido con pruebas RED→GREEN.
- Re-cotejo de versión y calidad/integración: APPROVED. Revisor ejecutó npm check, 108 pruebas y build; no ejecutó smokes de navegador, realizados por el padre.
- Único detalle menor: título de pestaña antiguo. Corregido para derivar APP.version en shell y bootstrap; prueba navegador reprodujo el fallo y pasó después. La suite base final tiene 63 comprobaciones.
- La suite completa final npm test + npm run test:e2e y git diff --check terminó exit 0. Se corrigió una espera de la prueba FRAG para no reabrir antes de la confirmación de carga anterior; no se debilitó el criterio de geometría.

## Límites y pendientes

- Preview Vercel con acceso protegido: verificar deployment/SHA exactos es distinto de validar la interfaz autenticada. No se cambia la protección ni se cierra el navegador personal para superar el login.
- Falta ensayo humano/docente y en laptop de alumno/IFC grande. El smoke de layout sin modelo no prueba por sí solo todo el reflow de la tabla Árbol con un IFC grande.
- Vite sigue avisando del tamaño del paquete 3D y de imports dinámicos que también se usan estáticamente. No se silenciaron avisos ni se atribuyen al aviso concreto de Vercel, cuyo texto/captura aún falta.
- GitHub Actions preparado localmente, no publicado por permiso workflow ausente. No se ampliaron scopes.
