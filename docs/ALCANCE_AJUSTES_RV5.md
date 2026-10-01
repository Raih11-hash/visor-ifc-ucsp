# Ajustes RV5 · Visor IFC UCSP 2.1.1 preview

## Alcance pedido y límites

Cambios solicitados por Luis: corregir bugs/retrasos observados, poder ocultar cuadrícula y marca That Open Company y abrir la ventana para configurar la URL. Mantener main/producción v1.0, rama feat/visor-v2-docencia y protección Vercel; sin merge/tag/release ni implementar las diez recomendaciones futuras.

1. Cuadrícula: controles directos reversibles, sincronizados con ajustes; no recrear cámara/canvas/modelos; móvil >=44px.
2. Marca: `renderer.showLogo=false` por defecto, control reversible. API pública documentada por el SDK; licencia MIT y avisos conservados. No ocultar por CSS un aviso obligatorio.
3. Propiedades: impedir que resultados de una selección antigua repongan filas tras limpiar/cambiar selección. Mantener el indicador de carga vigente, snapshot de Sets y funciones del SDK. Agrupar cambios rápidos con 120ms de espera, sin limitar número de seleccionados ni excluir Psets/cantidades/exportación.
4. Pruebas nuevas integradas en `npm run test:e2e`. Versionado paquete/lock/APP/HTML/manifiesto/códec coherente 2.1.1; lectura de sesiones 2.0.0/2.1.0/2.1.1 preservando versión. No cambia esquema ni persiste estas opciones visuales.
5. Ventana Vercel abierta en Brave en settings/domains. Alias `ifc-ucsp.vercel.app` aprobado pero pendiente asignación/autenticación; no declarar alias creado por abrir settings ni por HTTP200.

## Evidencia y cautelas

- Captura: input delay bim-table 8020.6ms, canvas 3415.8ms, panel de propiedades 3654ms. No incluye modelo ni trace completo. No se reprodujeron esos retrasos ni se confirmó su causa.
- Fuente SDK ui-obc: consulta getItemsData profunda por elemento seleccionado, awaits secuenciales. Es cuello potencial, no prueba de la causa de la captura.
- RED/GREEN real en Chromium, IFC ejemplo: consulta real retenida por una promesa de prueba; antes devolvía una fila después de limpiar, después mantiene cero. No se inventan datos IFC ni se presenta la latencia inducida como el retraso del usuario.
- Cambios rápidos: consultas reales intermedias 2→1 en esa prueba controlada. No es benchmark de selección masiva ni garantía en equipo de alumno.
- Modelo ejemplo completo: las 13 filas y propiedades REI30/NetVolume reales continúan disponibles. No se aplica el límite de 200 elementos propuesto por la auditoría.
- Permanecen pendientes prueba con IFC grande/trace original, revisión docente/laptop alumno y UI remota autenticada.

## Verificación reproducible

`npm run check`, `npm run build`, `npm test`, `npm run test:e2e`, `git diff --check`.
Los informes en test-results corresponden a ejecuciones reales; el cierre registrará resultados finales, revisiones, commit/deployment y respaldo por separado.
