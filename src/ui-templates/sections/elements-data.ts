/**
 * sections/elements-data.ts — Panel "Propiedades del elemento".
 *
 * Punto de entrada histórico del panel de datos. La implementación vive ahora
 * en `elements-inspector.ts` (árbol limpio por Property Set, normalización
 * visual tipada, buscador, expandir/contraer, vista técnica y TSV). Se
 * reexporta aquí para conservar el nombre y el tipo usados por la rejilla de
 * contenido, sin duplicar exports en `sections/index.ts`.
 */

export {
  PropertiesInspector,
  elementsDataPanelTemplate,
} from "./elements-inspector";
export type { ElementsDataPanelState } from "./elements-inspector";