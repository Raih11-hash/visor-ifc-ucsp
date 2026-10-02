# Cierre de ajustes RV5 · Visor IFC UCSP v2.1.1 preview

## Resultado

- Cuadrícula y marca: controles directos reversibles y sincronizados, marca oculta por defecto con API pública del SDK. Avisos de licencia conservados; opciones visuales no se guardan en sesiones.
- Propiedades: corregida carrera demostrada de filas antiguas tras limpiar/cambiar selección. Snapshot de Sets, revisión por petición, indicador vigente y restauración condicional del loader. Cambios rápidos agrupados por 120ms sin limitar selección ni propiedades.
- Ventana Brave de Vercel abierta en settings/domains. `ifc-ucsp.vercel.app` sigue pendiente asignación y comprobación del target; abrir la ventana no crea el alias.

## Verificación real final

`npm run build && npm test && npm run test:e2e && npm audit --omit=dev && npm audit --include=dev && git diff --check` terminó con exit 0.

- Node: 114/114, 0 fallos y 0 omisiones.
- Chromium: 162 comprobaciones: 63 base + 28 vistas + 46 layout + 18 controles visuales + 7 propiedades. Sin fallos ni page_errors en los cinco informes JSON.
- Auditorías npm: 0 vulnerabilidades de producción y 0 incluyendo tooling.
- Sesiones: escritura 2.1.1; acepta y preserva 2.0.0, 2.1.0 y 2.1.1; rechaza 2.2.0. Sin cambio de schemaVersion.
- RED/GREEN: antes una consulta IFC real retenida devolvía 1 fila después de limpiar; ahora queda 0. Selección rápida controlada: 2 consultas antes, 1 después. Selección completa de 13 elementos conserva Psets REI30 y NetVolume fuente.
- Regresión de restauración del loader: RED por función distinta; GREEN, más pruebas concurrentes, error tardío y estado de carga.

## Revisiones independientes

- Auditoría estática deleg_3e66bbe6: identifica consultas profundas secuenciales como cuello potencial. No reprodujo los retrasos de la captura.
- Especificación deleg_ce124e60: PASS sustantivo. Brechas atendidas: documento de alcance RV5 y pruebas integradas; loader temporal restaurado. Workflow local preexistente no publicado por permisos de GitHub.
- Calidad deleg_19ea8951: APPROVED; ejecutó check, 114 Node y diff --check con exit 0. Sin bloqueantes; evidencias viejas v22 excluidas del respaldo final.

## Límites y publicación

Los 8020.6ms/3415.8ms/3654ms de la captura no se reprodujeron ni se confirmó su causa. No se promete que desaparezcan con estos ajustes. Falta IFC grande/trace original, prueba docente/laptop alumno y UI preview autenticada.

Base/rollback: 864ae380c6f997a7ea233ad4ad286e93fd212d75. Rama: feat/visor-v2-docencia. Main/producción v1.0 congeladas en 152e61f471dc0c3942526cd5ac7684f944b28dbb. Sin merge/tag/release o cambios de protección. La publicación y el respaldo se registran después por SHA/deployment en ESTADO_PREVIEW_RV5.json; éxito de deployment no prueba UI autenticada.

Evidencias: test-results/verification-rv5.log y cinco informes smoke. Suite reproducible: npm run test:e2e. Alcance completo: ALCANCE_AJUSTES_RV5.md.
