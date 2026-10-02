# Arquitectura v2.0 · RV2

Rama `feat/visor-v2-docencia`. `main` y producción v1.0 congeladas hasta revisión y aprobación de sustitución.

## Capas

- `src/main.ts`: shell inmediato, import dinámico, estados loading/ready/error y recarga para reintentar; límite de arranque 90 s.
- `src/core/bootstrap.ts`: composición del motor/mundo/UI y eventos de carga/eliminación para reindexar catálogo. Gancho de pruebas solo con `?test=1`.
- `src/core/recursos.ts`: manifiesto de versiones y disponibilidad del Worker/WASM autoalojados.
- `src/core/carga-ifc.ts` y `src/domain/runtime.ts`: IFC/FRAG, validación temprana, límite 100 MiB, exclusión de cargas simultáneas y timeout visible. Timeout no cancela WASM: lector detenido exige recarga.
- `src/core/mundo.ts`, `interaccion.ts` y `ui-templates/`: selección, árbol, propiedades/TSV, cortes, medidas, visibilidad, cámara y vistas. Atajos excluyen campos de edición/shadow DOM.
- `src/domain/catalog.ts`: filtros AND, conteos, reglas required/equals y CSV seguro contra fórmulas.
- `src/services/model-workspace.ts`: solo elementos con geometría, lotes de 500, Psets/cantidades y nivel; vínculo con 3D y captura/restauración. Las propiedades de ocurrencia prevalecen sobre las del tipo; se evitan relaciones inversas. Cantidades leídas no son metrados contractuales.
- `src/ui/workspace-panel.ts`, `feedback.ts` y `v2.css`: pestañas Tablero/Revisión/Sesiones, mensajes seguros/accesibles y scroll lateral sin solapamientos.

## Motor fijado

components 3.4.8, front 3.4.4, fragments 3.4.7, ui 3.4.12, ui-obc 3.4.2, three 0.186.1, camera-controls 3.1.2, web-ifc **0.0.77**. `npm run sync:engine` copia recursos de las dependencias y registra versiones/tamaños/SHA-256. No actualizar JavaScript o binarios por separado.

## Sesiones

`session-format.ts`: estructura/límites/base64. `session-store.ts`: IndexedDB y lectura de confirmación. El adaptador convierte el Uint8Array real de `getBuffer(false)` a ArrayBuffer propio y verifica todas las huellas antes de alterar la escena. Staging protege los modelos previos si falla la carga; no promete una transacción atómica de todo el estado 3D.

Incluye modelos FRAG reales, cámara/proyección, filtros, consultas, reglas, selección, ocultos, colores y vistas **de cámara**. Máximo 10 modelos, 100 MiB/modelo y 200 MiB de modelos/sesión. No incluye cortes, medidas, fantasma ni selección/visibilidad particular de cada vista BCF.

IndexedDB pertenece al navegador y al origen. Borrar sus datos elimina las sesiones; otro dominio no accede a las anteriores. Exportar JSON permite trasladar o respaldar. No hay backend, cuentas ni colaboración. Revisión básica y trazable: no certifica IDS/EIR/LOD ni asigna notas.

## Verificación y entrega

Ejecutar en disco local, no Drive:

```sh
npm ci --include=dev --ignore-scripts --no-fund
npm run sync:engine
npm test
npm run check
npm run build
npm run test:e2e
npm audit --omit=dev
npm audit --include=dev
```

Node prueba IndexedDB mediante `fake-indexeddb` declarado como devDependency. Playwright ejerce IFC reales, contraste con IFC fuente, filtros, reglas/CSV, persistencia tras recarga, JSON/corrupción, cámara/vistas y fallos de Worker/WASM. Evidencia en `test-results/` excluida de Git.

El build aún advierte paquete 3D grande. Diferimiento no equivale a menor descarga ni rendimiento medido. Headless no sustituye revisión visual humana ni prueba en laptop de alumno.

Preview solo de rama, sin push a `main`. Respaldo v2 separado de v1: fuentes/documentos y ZIP de `dist` con archivos en la raíz; no `node_modules` ni `dist` suelto en Drive. Verificar marcador v2 y flujos reales en el preview antes de declarar la URL lista.
