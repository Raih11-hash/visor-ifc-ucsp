# Inspector de propiedades v2.2.0 · RV9

Base: v2.1.2 / `5477107faa0159af51e1e3db7d10bdda1077ba60`. Esta documentación describe la implementación local de v2.2.0; el estado de publicación debe comprobarse en README y en la constancia de deployment, no inferirse de este nombre.

## Causa reproducida antes de modificar

El archivo `EST_GT_C_R_v5.ifc` contiene los parámetros correctamente. SHA-256: `e496972a1f74199d9b3fb9e1cfce859606197bfd0ae67dd274011119bad23979`. La lectura cruda `FragmentsModel.getItemsData` conserva los valores, por lo que no se atribuye el fallo a Revit, web-ifc ni a la conversión FRAG.

La tabla `@thatopen/ui-obc` `tables.itemsData` aplica una transformación `Value` que, para tipos IFC, rellena su etiqueta solo si encuentra una unidad correspondiente. La prueba RED sobre un `bim-table` real confirma: IFCTEXT(H), IFCLABEL(Vigas) e IFCBOOLEAN(true) quedan visualmente vacíos; IFCLENGTHMEASURE(3.65) se muestra como `3.65 m`. El antiguo árbol además separaba Name y NominalValue en niveles técnicos.

Evidencia RED local: `test-results/rv9-props-red-raw.json` y `test-results/rv9-render-red.json`. Los valores de la prueba sintética del render están identificados como tales; no se presentan como parámetros de un modelo real.

## Arquitectura y responsabilidades

- `src/domain/properties.ts`: normalización visual tipada pura; nulos, textos, números, booleanos/lógicos, medidas, referencias y valores compuestos; extracción y fusión de Psets; búsqueda y TSV seguro; árbol técnico con guardas.
- `src/domain/units.ts`: unidades aportadas por el modelo, prefijos SI y nombres de conversión, sin reescalar valores ni adjudicar símbolos inexistentes.
- `src/ui-templates/sections/elements-inspector.ts`: carga por lotes de selección/modelo, caché de unidades, revisión asíncrona, errores/reintento, ciclo de vida del modelo y render DOM seguro.
- `src/ui-templates/sections/elements-inspector.css`: estilos aislados del inspector.
- `src/ui-templates/sections/elements-data.ts`: mantiene la entrada existente del panel, delegando en el inspector.

No cambia el parser ni las dependencias fijadas: components3.4.8, components-front3.4.4, fragments3.4.7, ui3.4.12, ui-obc3.4.2 y web-ifc0.0.77. No relee el STEP para construir la interfaz: funciona sobre datos del motor, incluidos FRAG restaurados.

## Interfaz BIM y técnica

La vista predeterminada muestra los conjuntos reales plegables y sus propiedades con nombre a la izquierda y valor a la derecha. Se conservan búsqueda, expansión/contracción, TSV, cantidades y selección múltiple sin límite silencioso. Las propiedades de ocurrencia tienen precedencia sobre las de tipo.

La vista técnica opcional añade categoría, GUID, atributos tipados, referencias y relaciones. Distingue Local ID y Express ID: no presupone que coincidan. Si el motor no aporta un mapeo, Express ID se muestra como no disponible. El árbol técnico marca ciclos/profundidad máxima6; esa protección no trunca la lista BIM de propiedades.

Las respuestas o errores de una selección anterior no reponen ni borran la vigente. Limpiar selección vacía inmediatamente el panel. Si falla una lectura, el indicador se apaga y se ofrece reintento; cerrar un modelo elimina sus datos del panel.

## Caso de aceptación real

Propietario: IFCBEAM, GlobalId `3zSxltga9Eo8qEtsMwBJvC`, Local ID254039. El STEP tiene Express ID254039, confirmado únicamente para este propietario; no se generaliza esa equivalencia.

| Conjunto | Propiedad | Valor confirmado |
|---|---|---|
| Construction | H/V | H |
| Construction | Nivel | N4 |
| Construction | Tipo de elemento | Vigas |

El Pset Construction procede de `#254075` en el IFC real. No se introduce lógica específica para estos nombres. El archivo original se conserva fuera de public y no se modifica ni publica como ejemplo.

## Reproducción y límites

```sh
npm run check
npm test
npm run sync:engine
npm run build
npm run test:e2e
npm run test:e2e:real
```

La prueba real utiliza `IFC_REAL` si está definido; si falta el archivo, falla explícitamente. Los casos adicionales sintéticos de unidades, booleanos y cotas están rotulados como tales. Evidencia y recuentos finales: `test-results/verification-v22-final.json`, logs Node/E2E y `rv9-props-green.json`.

El IFC de aceptación no incluye Unit propia en sus propiedades. Los overrides y referencias de unidades se comprueban mediante casos adicionales, no se atribuyen al archivo real. Una Unit explícita sin mapeo se muestra como referencia o «unidad no resuelta», sin sustituirla por la unidad global. No se certifica precisión de metrados, cumplimiento IDS ni rendimiento en equipos de alumnos con estas pruebas.
