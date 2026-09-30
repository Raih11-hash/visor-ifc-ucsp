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
import { EJEMPLOS, RUTAS } from "../globals";
import { validateModelBytes, MAX_MODEL_BYTES, withTimeout, modelBytesEqual } from "../domain/runtime";
import { avisar } from "../ui/feedback";
import type { MundoPrincipal } from "./mundo";

type MundoEscena = MundoPrincipal["world"];
const loading = new WeakSet<OBC.Components>();
const unavailable = new WeakSet<OBC.Components>();

export async function cargarArchivoDesdeBytes(components: OBC.Components, datos: Uint8Array, nombreArchivo: string, etiqueta?: string): Promise<FRAGS.FragmentsModel> {
  validateModelBytes(datos,nombreArchivo);
  if(unavailable.has(components)) throw new Error('El lector quedó detenido. Recarga la página antes de reintentar.');
  if(loading.has(components)) throw new Error('Ya hay un modelo abriéndose. Espera a que termine.');
  loading.add(components);
  const fragments=components.get(OBC.FragmentsManager);
  const base=etiqueta || nombreArchivo.replace(/\.(ifc|frag)$/i,'');
  let name=base;let suffix=2;
  while(fragments.list.has(name)) name=`${base} (${suffix++})`;
  const before=new Set(fragments.list.keys());
  let finished=false;
  try {
    if(/\.frag$/i.test(nombreArchivo)) {
      for(const existing of fragments.list.values()) {
        if(modelBytesEqual(datos,await withTimeout(existing.getBuffer(false),30000,'No se pudo comprobar el modelo ya abierto. No se añadió el FRAG; vuelve a intentarlo.'))) {
          throw new Error(`Este FRAG ya está cargado como «${existing.modelId}». No se añadió otra copia para proteger las sesiones. Puedes seguir trabajando con el modelo abierto.`);
        }
      }
    }
    avisar(`Leyendo y convirtiendo ${nombreArchivo}…`);
    const operation=/\.ifc$/i.test(nombreArchivo)
      ? components.get(OBC.IfcLoader).load(datos,true,name)
      : fragments.core.load(datos,{modelId:name});
    void operation.then(async model=>{if(unavailable.has(components) && !finished) await fragments.core.disposeModel(model.modelId);}).catch(()=>{});
    const model=await withTimeout(operation,120000,'La conversión superó dos minutos. Recarga la página para reiniciar el lector; no se da el modelo por cargado.');
    finished=true;avisar(`Modelo listo: ${nombreArchivo}`);return model;
  } catch(error) {
    if(error instanceof Error && error.message.includes('superó dos minutos')) unavailable.add(components);
    for(const id of fragments.list.keys()) if(!before.has(id)) await fragments.core.disposeModel(id).catch(()=>{});
    throw error;
  } finally { loading.delete(components); }
}

export async function cargarArchivo(components:OBC.Components, file:File):Promise<FRAGS.FragmentsModel> {
  if(file.size>MAX_MODEL_BYTES)throw new Error('El archivo supera el límite de 100 MB por modelo.');
  return cargarArchivoDesdeBytes(components,new Uint8Array(await file.arrayBuffer()),file.name);
}

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
  return cargarArchivoDesdeBytes(components,datos,nombreArchivo);
};

export const cargarModeloEjemplo = async (
  components: OBC.Components,
  id = "ejemplo",
): Promise<FRAGS.FragmentsModel> => {
  const ejemplo=EJEMPLOS.find(item=>item.id===id);
  if(!ejemplo)throw new Error('Modelo de ejemplo desconocido.');
  const already=components.get(OBC.FragmentsManager).list.get(ejemplo.nombre);
  if(already)return already;
  const respuesta = await fetch(new URL(`models/${ejemplo.archivo}`, new URL(import.meta.env.BASE_URL,document.baseURI)),{signal:AbortSignal.timeout(30000)});
  if (!respuesta.ok) {
    throw new Error(
      `No se pudo descargar el modelo de ejemplo (${respuesta.status}).`,
    );
  }
  const buffer = await respuesta.arrayBuffer();
  return cargarArchivoDesdeBytes(
    components,
    new Uint8Array(buffer),
    ejemplo.archivo,
    ejemplo.nombre,
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
      /\.(ifc|frag)$/i.test(f.name),
    );
    if (!archivo) {
      alFallar?.("Suelta un archivo con extensión .ifc o .frag");
      return;
    }
    try {
      await cargarArchivo(components, archivo);
      alTerminar?.(archivo.name);
    } catch (error) {
      alFallar?.(
        error instanceof Error ? error.message : "No se pudo abrir el IFC.",
      );
    }
  });
};
