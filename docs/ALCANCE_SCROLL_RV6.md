# Scroll propiedades · RV6 · v2.1.2 preview

Solicitud: corregir scroll del árbol de propiedades en el panel derecho de modelado y asignar ifc-ucsp.vercel.app, nombre ya aprobado. Main/prod v1.0 y protección siguen congelados.

## Scroll: causa reproducida y criterio

Con IFC ejemplo y 13 elementos seleccionados, al expandir sus ramas el contenedor derecho crecía por el mínimo automático del ítem flex/grid: body alto 16973px, scrollHeight==clientHeight y límite inferior fuera del viewport. El exterior del visor recortaba los campos.

Ajuste mínimo: `.layout-properties` conserva altura100% y recibe min-height:0 y overflow:hidden. La región `.layout-properties-body` existente (flex:1, min-height:0, overflow:auto) absorbe el desbordamiento. No se modifican modelos, SDK, fuentes de datos, selección, Psets, cámara, tabla o su exportación.

Prueba RED real antes del cambio: panel derecho no queda dentro de pantalla y carece de recorrido de scroll. GREEN después: rueda de navegador hasta el fondo, última fila completamente visible en pantalla, escritorio1366x768 y móvil390x844, plegar/reabrir conserva 13 filas y rueda no modifica cámara. Se expanden grupos con API pública del SDK para producir el árbol largo; la rueda de scroll sí es input real de Playwright. No se inventan filas de propiedades.

Puertas: build, npm test, seis smokes integrados, diffcheck, revisión independiente, commit/push solamente rama preview, deployment exactSHA, respaldo Drive RV6 y producciónref/assets intactos.

La brecha menor del revisor (RED no archivado) se cerró reejecutando la regresión contra el ZIP inmutable de RV5 v2.1.1: exit1, AssertionError False != True, clientHeight=scrollHeight=16973 y bottom17160.5 en viewport768. Log y JSON RED conservados en test-results; no se revirtió ni alteró el build GREEN de RV6.

## Alias: autorización no es acceso

Nombre ifc-ucsp.vercel.app ya aprobado. La auditoría inicial no encontró CLI/token guardado y el navegador automatizado seguía en vercel.com/login al abrir settings/domains. Browser Use y la solicitud de autenticación segura agotaron su tiempo de espera. Como alternativa se inició el OAuth oficial con Vercel CLI 62.1.0 y se abrió la autorización en Brave, pendiente de confirmación humana. No se inventan credenciales, no se copian perfiles bloqueados ni se cambia protección/producción para eludirlo. Requiere completar ese acceso para asignar y leer target real.

Al cambiar origen, IndexedDB no migra: exportar sesión JSON en dominio anterior e importar en el nuevo antes de abandonar el enlace antiguo. No declarar el alias implementado antes de verificar target y acceso.
