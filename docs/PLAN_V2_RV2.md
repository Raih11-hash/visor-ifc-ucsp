# Visor IFC UCSP v2.0 — contrato de implementación · RV2

Rama: feat/visor-v2-docencia. La v1.0 de main y producción permanece congelada; entregar build, pruebas y preview de v2 antes de sustituirla.

## Criterios

1. Base robusta: interfaz de inicio inmediata, import diferido del motor, estados sin porcentajes inventados, timeout/error/reintento, recursos autoalojados versionados, errores de IFC/Fragments y arrastre visibles, exclusión de teclas de edición, proyección válida, muestras edificio y Graderías, compilador estricto.
2. Filtros/tablero: contar solo elementos con geometría; filtros combinados categoría/nivel/texto/propiedad, conteos por categoría/nivel, selección y aislamiento de resultados, limpiar filtros, guardar consultas, CSV seguro. Estados vacíos y lectura por lotes para no bloquear la interfaz.
3. Revisión: reglas explícitas de presencia/igualdad para atributos y propiedades, ámbito por categoría, lista con motivos, estados cumple/no cumple y coloreado, selección de fallos, CSV seguro. No afirmar validación completa de IDS/EIR/LOD ni calificar automáticamente.
4. Sesiones: guardar localmente con IndexedDB los bytes de modelos y su SHA-256 junto a cámara/proyección, filtros/reglas, selección/ocultos/colores y vistas. Lista, cargar y borrar, export/import JSON validado con límites y verificación de fingerprint antes de restaurar. No hay servidor, cuentas ni colaboración simultánea. Advertir almacenamiento local y no respaldado; exportar para llevar a otro equipo.
5. Pruebas: cada módulo nuevo con RED→GREEN; E2E de IFC válido/inválido, filtros, calidad controlada, cámara, guardar/cerrar/reabrir y export/import; fallos WASM/worker y revisión independiente de especificación y calidad.
6. Versionado: 2.0.0 en package/APP; changelog y arquitectura; favicon propio; rama y preview, nunca push a main. ZIP v2.0 y respaldo separado de v1.0 sin node_modules/dist sueltos en Drive.

## Fuera de alcance

Metrados contractuales, BCF, planos/DXF, choques, 4D, edición IFC, backend y cuentas. Las herramientas de v1.0 (árbol, propiedades, cortes, longitud/área, ocultar/aislar/colores/vistas) no deben romperse.
