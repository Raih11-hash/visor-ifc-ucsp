# Plan y alcance v2.2.0 · RV9

## Identidad del proyecto

- Base de trabajo: v2.1.2 / commit `5477107faa0159af51e1e3db7d10bdda1077ba60`.
- Rama autorizada: `feat/visor-v2-docencia`.
- Nueva versión solicitada: **v2.2**, versión SemVer **2.2.0**.
- Dirección principal de trabajo: **https://ifc-ucsp.vercel.app**, acceso público sin login.
- Producción histórica: **https://visor-ifc-ucsp.vercel.app**, v1.0 congelada. No es la dirección para probar v2.
- Publicación autorizada de la nueva preview y reasignación del alias principal; no merge a main, tags ni releases.
- RV9 identifica esta entrega de documentos/evidencias, no una versión del motor.

## Entregables

1. Cabecera compacta de una fila en escritorio; conservar navegación, guardado, estado, versión y ayuda. Adaptación móvil sin solapamiento ni botones inutilizables.
2. Reproducir la falta de Name/NominalValue del panel con el IFC real y localizar parser/transformación/render responsable.
3. Inspector BIM por Property Set, con nombres/valores separados, expandir/contraer, búsqueda y TSV; parámetros Revit y convencionales tratados genéricamente.
4. Normalizador visual reusable que preserve tipos internos, contemple nulos, booleanos, medidas, unidades y referencias; vista técnica opcional sin confundir Local ID y Express ID.
5. Selección rápida/múltiple, clear, scroll, FRAG y sesiones sin regresiones; códec esquema2 compatible con sesiones2.0/2.1/2.1.1/2.1.2 y2.2.
6. Build, Node, suites Chromium y revisión independiente antes de publicación. Verificar SHA/destino del alias y producción antigua intacta.
7. Respaldo de fuentes/evidencias y ZIP dist versionado en Drive, con hashes.

## Fuente real de aceptación (no publicar ni modificar)

`C:/Users/luis.zegarra/Downloads/EST_GT_C_R_v5.ifc`

SHA-256: `e496972a1f74199d9b3fb9e1cfce859606197bfd0ae67dd274011119bad23979`

Fragmentos fuente confirmados:

```ifc
#254063=IFCPROPERTYSINGLEVALUE('H/V',$,IFCTEXT('H'),$);
#254064=IFCPROPERTYSINGLEVALUE('Nivel',$,IFCTEXT('N4'),$);
#254065=IFCPROPERTYSINGLEVALUE('Tipo de elemento',$,IFCTEXT('Vigas'),$);
```

Valores esperados: `H`, `N4`, `Vigas`. Resolver elemento propietario y su identidad desde el archivo, no suponer que Express ID coincide con el ID interno del motor.

## Límites y seguridad

- No alterar IFC, motor/dependencias, datos originales, modelos de ejemplo ni otras aplicaciones de Vercel.
- No introducir backend, colaboración o calificación BIM automática.
- Datos de modelos tratados como no confiables al renderizar/exportar.
- La versión nueva puede leer las sesiones anteriores; la antigua v2.1.2 no acepta sesiones marcadas2.2.0.
- No mover/eliminar respaldos históricos. Documentar lo vigente mediante un punto de entrada y rótulos claros.
- IndexedDB por origen; conservar enlaces anteriores para export/import JSON.

Estado: implementación y revisiones SPEC/CALIDAD aprobadas;175 pruebas Node y264 comprobaciones Chromium locales verdes. La constancia de publicación y el destino real del alias se registran tras leerlos de vuelta; no se deducen del nombre de esta entrega.
