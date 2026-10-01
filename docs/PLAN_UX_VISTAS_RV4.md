# Ajustes UX y vistas · v2.1 preview RV4

Autorización: Luis pidió «aplica los ajustes» tras la auditoría RV1. Trabajar sobre `feat/visor-v2-docencia`, base `9ec2489`; main y producción v1.0 congeladas. Sin tag/release ni merge.

## Alcance
1. Vistas rápidas sin PNG obligatorio; crear/actualizar comparten captura de cámara correcta, selección y colores sin duplicar select. Conversión GUID reutilizada por mapas idénticos. Timeout y rollback sin fila incompleta, exclusión de acciones concurrentes. Nombres legibles, renombrar, actualizar, abrir sin animación larga, eliminar con confirmación, estados de progreso en español. La apertura mantiene visibilidad actual (encuadre, no escena); aplicar selección/colores son acciones separadas explícitas si se conservan.
2. Navegación lateral directa Modelos / Información / Árbol / Vistas. Paneles plegables, tamaño de lateral ajustable y modo presentación reversible. Móvil un panel superpuesto con cierre y canvas siempre útil; controles accesibles por teclado y objetivos de clic cómodos.
3. Estado conservador de cambios sin guardar, guardado visible y mensajes en contexto. Solo marcar guardado tras IndexedDB confirmado; exportar JSON es copia, no guardado local. Confirmación existente al sustituir sesión. Indicar límites: sesiones manuales/locales; cortes/medidas/fantasma no persistidos.
4. Versión visible 2.1 para distinguir interfaz; preview RV4, sin cambio de dependencias. Documentar y respaldar con SHA/ZIP.

## Fuera de alcance
Escenas completas por vista, miniaturas PNG, cortes/medidas/fantasma persistidos, nube, Navisworks, auditorías IDS/EIR/LOD completas, cambios de Vercel/auth, publicación a producción.

## Verificación
TDD de cada comportamiento; smoke actual conservado adaptando navegación necesaria, pruebas nuevas de cámara actualizar→exportar→recargar, títulos, cancelar borrado, rollback/error/timeout/doble clic, ausencia de PNG, recuperación de nombres y apertura que no cambia visibilidad. Pruebas layout1280/1366/390, plegar/reabrir/presentación y resize sin destruir canvas/estado. Estado de guardado limpio/sucio ante crear vista/filtros/reglas/modelos/cámara/selección/colores; no declarar guardada una operación fallida ni cambios posteriores durante guardado.

Build/tsc, todas las pruebas sin skips, auditoría npm prod/dev. Revisión independiente de especificación y luego calidad; corregir importantes antes del commit/push a preview. Verificar SHA remoto y deployment exacto; si login impide navegador remoto, declarar prueba local y deployment aparte.
