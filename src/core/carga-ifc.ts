/**
 * core/carga-ifc.ts — Todo lo relacionado con cargar modelos IFC.
 *
 * - configurarMotorIfc: arranca el gestor de fragments (con el worker
 *   autoalojado, que sí funciona en producción) y el cargador IFC (con el
 *   WASM autoalojado, sin depender del CDN unpkg). Cada modelo que termina
 *   de cargar se agrega automáticamente a la escena del mundo.
 * - cargarIfcDesdeBytes: convierte bytes .ifc en un modelo 3D visible.
 * - cargarModeloEjemplo: descarga el IFC de ejemplo incluido en la app.
 * - activarArrastrarSoltar: permite soltar un .ifc sobre el visor para abrirlo.
 */

import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import { APP, RUTAS } from "../globals";
import type { MundoPrincipal } from "./mundo";

type MundoEscena = MundoPrincipal["world"];

export const configurarMotorIfc = async (
  components: OBC.Components,
  world: MundoEscena,
): Promise<void> => {
  const fragments = components.get(OBC.FragmentsManager);
  fragments.init(RUTAS.workerFragments);

  // Los materiales LOD se excluyen del pase aislado de postproducción para
  // que no parpadeen al mover la cámara.
  fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
    const esLod =
      "isLodMaterial" in material &&
      (material as { isLodMaterial: boolean }).isLodMaterial;
    if (esLod && world.renderer) {
      world.renderer.postproduction.basePass.isolatedMaterials.push(
        material as FRAGS.BIMMaterial,
      );
    }
  });

  world.camera.projection.onChanged.add(() => {
    for (const [, modelo] of fragments.list) {
      modelo.useCamera(world.camera.three);
    }
  });

  world.camera.controls.addEventListener("rest", () => {
    fragments.core.update(true);
  });

  // Cada modelo cargado (por botón, arrastre o ejemplo) aparece en escena.
  fragments.list.onItemSet.add(async ({ value: modelo }) => {
    modelo.useCamera(world.camera.three);
    modelo.getClippingPlanesEvent = () => {
      return Array.from(world.renderer?.three.clippingPlanes ?? []);
    };
    world.scene.three.add(modelo.object);
    await fragments.core.update(true);
  });

  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { absolute: true, path: RUTAS.carpetaWasm },
  });
};

export const cargarIfcDesdeBytes = async (
  components: OBC.Components,
  datos: Uint8Array,
  nombreArchivo: string,
): Promise<FRAGS.FragmentsModel> => {
  const ifcLoader = components.get(OBC.IfcLoader);
  const nombre = nombreArchivo.replace(/\.ifc$/i, "");
  return ifcLoader.load(datos, true, nombre);
};

export const cargarModeloEjemplo = async (
  components: OBC.Components,
): Promise<FRAGS.FragmentsModel> => {
  const respuesta = await fetch(RUTAS.modeloEjemplo);
  if (!respuesta.ok) {
    throw new Error(
      `No se pudo descargar el modelo de ejemplo (${respuesta.status}).`,
    );
  }
  const buffer = await respuesta.arrayBuffer();
  return cargarIfcDesdeBytes(
    components,
    new Uint8Array(buffer),
    APP.modeloEjemploNombre,
  );
};

export const activarArrastrarSoltar = (
  components: OBC.Components,
  elemento: HTMLElement,
  alTerminar?: (nombre: string) => void,
  alFallar?: (mensaje: string) => void,
): void => {
  elemento.addEventListener("dragover", (evento) => evento.preventDefault());
  elemento.addEventListener("drop", async (evento) => {
    evento.preventDefault();
    const archivo = Array.from(evento.dataTransfer?.files ?? []).find((f) =>
      /\.ifc$/i.test(f.name),
    );
    if (!archivo) {
      alFallar?.("Suelta un archivo con extensión .ifc");
      return;
    }
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      await cargarIfcDesdeBytes(components, bytes, archivo.name);
      alTerminar?.(archivo.name);
    } catch (error) {
      alFallar?.(
        error instanceof Error ? error.message : "No se pudo abrir el IFC.",
      );
    }
  });
};
