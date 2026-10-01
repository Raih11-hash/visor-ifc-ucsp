/** view-operations.ts — prepara fuera de la lista y confirma al terminar; sin PNG. */
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import * as THREE from 'three';
import { withTimeout } from '../domain/runtime';

const keyOf=(map: OBC.ModelIdMap)=>JSON.stringify(Object.keys(map).sort().map(id=>[id,[...map[id]].sort((a,b)=>a-b)]));
const copyMap=(map: OBC.ModelIdMap | undefined): OBC.ModelIdMap=>Object.fromEntries(Object.entries(map??{}).map(([id,ids])=>[id,new Set(ids)]));

export async function saveCameraView(components: OBC.Components, world: OBC.World, title: string, existing?: OBC.Viewpoint, onProgress: (text:string)=>void=()=>{}, timeoutMs=10000): Promise<OBC.Viewpoint> {
  if(!(world.camera instanceof OBC.OrthoPerspectiveCamera))throw new Error('La cámara del visor no está disponible.');
  const manager=components.get(OBC.Viewpoints), fragments=components.get(OBC.FragmentsManager), highlighter=components.get(OBF.Highlighter);
  // El SDK notifica la lista al actualizar cámara. Las filas pendientes no son
  // visibles ni capturables; se retiran también si una promesa resuelve tarde.
  const staged=new OBC.Viewpoint(components);staged.world=world;staged.customData.pending=true;
  let expired=false;let committed=false;
  world.camera.controls.update(0);world.camera.three.updateMatrixWorld(true);
  const camera={eye:world.camera.three.position.toArray(),target:world.camera.controls.getTarget(new THREE.Vector3()).toArray(),projection:world.camera.projection.current};
  const selection=copyMap(highlighter.selection.select);
  const styles=[...highlighter.styles].filter(([name,def])=>name!=='select'&&def).map(([name,def])=>({color:def!.color.getHexString(),map:copyMap(highlighter.selection[name])}));
  try {
  const prepared=await withTimeout((async()=>{
    onProgress('Guardando cámara…');
    const updated=await staged.updateCamera(false);
    if(expired){manager.list.delete(staged.guid);throw new Error('Operación cancelada.');}
    if(!updated)throw new Error('No se pudo guardar la cámara.');
    const cache=new Map<string,Promise<string[]>>();
    const guids=(map:OBC.ModelIdMap)=>{
      if(OBC.ModelIdMapUtils.isEmpty(map))return Promise.resolve([] as string[]);
      const key=keyOf(map);let found=cache.get(key);
      if(!found){found=fragments.modelIdMapToGuids(map);cache.set(key,found);}return found;
    };
    onProgress('Preparando selección y colores…');
    const selected=await guids(selection);const colors=new Map<string,string[]>();
    for(const {color,map} of styles){const ids=await guids(map);if(ids.length)colors.set(color,[...new Set([...(colors.get(color)??[]),...ids])]);}
    return {selected,colors};
  })(),timeoutMs,'La vista tardó demasiado. No se cambió ningún encuadre; vuelve a intentarlo.');
  if(existing&&manager.list.get(existing.guid)!==existing)throw new Error('La vista ya no existe.');
  const view=existing??staged;
  view.world=world;view.title=title;view.camera=structuredClone(staged.camera);view.customData.sessionCamera=camera;
  delete view.customData.pending;
  view.selectionComponents.clear();if(prepared.selected.length)view.selectionComponents.add(...prepared.selected);
  view.componentColors.clear();for(const [color,ids] of prepared.colors)view.componentColors.set(color,ids);
  manager.list.set(view.guid,view);committed=true;
  return view;
  } finally {expired=true;if(existing||!committed)manager.list.delete(staged.guid);}
}
