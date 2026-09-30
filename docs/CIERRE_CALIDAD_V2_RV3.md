# Cierre de calidad v2.0 · RV3

## Hallazgo y reproducción real

La revisión `deleg_a93606ef` detectó que dos modelos con los mismos bytes FRAG no son representables con identidad por huella en el esquema v2. No se relajó el codec ni se permitieron referencias ambiguas.

La hipótesis de que dos conversiones del mismo IFC producirían necesariamente FRAG byte-idénticos no se confirmó con el fixture `ejemplo.ifc`: ambas instancias obtuvieron huellas diferentes. En cambio, exportar el FRAG de un modelo abierto y volver a soltar esos mismos bytes sí reprodujo el problema: tres modelos abiertos, solo dos huellas únicas. La prueba falló con `2 != 3` antes de corregir la carga.

## Corrección mínima

En `carga-ifc.ts`, antes de invocar el motor para un FRAG, se comparan los bytes de entrada con `getBuffer(false)` de los modelos abiertos. Si existe contenido idéntico se rechaza la nueva carga con un mensaje que identifica el modelo abierto y explica que no se añadió otra copia para proteger las sesiones. La operación no agrega ni elimina modelos. La guarda de carga se libera en `finally`.

`modelBytesEqual` respeta byteOffset/byteLength de Uint8Array y no altera datos. La exportación usada para comparar tiene timeout de 30 segundos por modelo; si no puede comprobarse, no se incorpora el archivo. No se cambió el formato de sesión ni la integridad SHA-256.

La v2 no ofrece múltiples instancias del mismo FRAG byte-idéntico. Una federación o copia transformada de FRAG con identidad independiente requeriría ampliar el esquema y sus referencias: fuera de esta corrección.

## Verificación local

- 106 pruebas Node: todas aprobadas, ninguna omitida. La nueva prueba de comparación pasó de RED (función ausente) a GREEN.
- 62 comprobaciones Chromium reales: todas aprobadas, sin errores JS.
- Dos cargas del mismo IFC permanecen como dos instancias y completan filtros, revisión, guardado IndexedDB, exportación JSON, recarga, restauración de cámara/selección/ocultos/colores/vistas e importación.
- FRAG idéntico rechazado antes y después de recuperar una sesión. El guardado sigue disponible tras el rechazo.
- FRAG distinto sigue cargando: exportar Graderías, retirar ese IFC y reabrirlo como FRAG conserva la geometría federada.
- TypeScript/Vite aprobados. Auditorías npm producción y desarrollo: cero vulnerabilidades. Persisten advertencias de tamaño del paquete 3D.

La revisión independiente de cierre está solicitada y pendiente al registrar esta revisión. Headless no sustituye validación docente ni prueba de rendimiento en equipo de alumno.

## Entrega y límites

Solo rama `feat/visor-v2-docencia`, PR borrador #2. `main` y producción v1.0 congeladas. No release ni sustitución de producción autorizada.

El preview RV2 fue desplegado por Vercel, pero exige autenticación: no se verificaron esos flujos en la URL remota. La revisión RV3 y su respaldo deben distinguirse del primer despliegue. CI GitHub preparada, no activada (permiso workflow pendiente).

Observaciones menores diferidas: contexto de mensajes de error del panel, opciones de filtros ausentes y generación concurrente de reindexación. No se declaran resueltas en esta corrección.
