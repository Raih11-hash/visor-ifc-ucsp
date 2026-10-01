/** viewpoints.ts — encuadres rápidos; apertura no cambia visibilidad ni cortes. */
import * as BUI from '@thatopen/ui';
import * as OBC from '@thatopen/components';
import { avisar, mensajeError } from '../../ui/feedback';
import { saveCameraView } from '../../services/view-operations';

export interface ViewpointsPanelState { components: OBC.Components; world?: OBC.World; }

export const viewpointsPanelTemplate: BUI.StatefullComponent<ViewpointsPanelState> = (state) => {
  const {components,world}=state;
  const manager=components.get(OBC.Viewpoints);
  const root=document.createElement('section');root.id='views-panel';root.className='workspace-panel';
  root.innerHTML=`<span class="eyebrow">ENCUADRES DEL MODELO</span><h2>Vistas guardadas</h2>
    <p class="muted">Guarda un encuadre sin generar una imagen. Abrirlo conserva la visibilidad y los cortes actuales. Para conservarlo después de cerrar el visor, guarda la sesión.</p>
    <button id="view-create" type="button" class="primary">Guardar encuadre</button>
    <p id="views-status" role="status" aria-live="polite" class="muted"></p><div id="view-list" class="result-list"></div>`;
  const list=root.querySelector<HTMLElement>('#view-list')!;
  const status=root.querySelector<HTMLElement>('#views-status')!;
  let busy=false;
  const run=async(action:()=>Promise<void>)=>{
    if(busy)return;
    if(document.querySelector('#workspace-v2')?.getAttribute('aria-busy')==='true'){status.textContent='Espera a que termine la operación de sesión.';return;}
    busy=true;root.setAttribute('aria-busy','true');draw();
    try{await action();}catch(error){status.textContent=mensajeError(error);avisar(mensajeError(error),true);}
    finally{busy=false;root.setAttribute('aria-busy','false');draw();}
  };
  const draw=()=>{
    list.replaceChildren();
    for(const view of manager.list.values()) {
      if(view.customData.pending)continue;
      const row=document.createElement('div');row.className='saved-view-row';row.dataset.viewId=view.guid;
      const name=document.createElement('strong');name.textContent=view.title||'Vista sin nombre';row.append(name);
      const actions=document.createElement('div');actions.className='button-row';
      const button=(label:string,action:string,fn:()=>Promise<void>)=>{
        const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.disabled=busy;
        b.setAttribute('aria-label',`${label}: ${name.textContent}`);b.addEventListener('click',()=>{void run(fn);});actions.append(b);
      };
      button('Abrir','open',async()=>{
        if(!world||!(world.camera instanceof OBC.OrthoPerspectiveCamera))throw new Error('La cámara no está disponible.');
        const camera=view.customData.sessionCamera;
        if(!camera)throw new Error('Esta vista no tiene un encuadre compatible con la sesión.');
        await world.camera.projection.set(camera.projection);
        await world.camera.controls.setLookAt(...camera.eye as [number,number,number],...camera.target as [number,number,number],false);
        world.camera.controls.update(0);world.camera.three.updateMatrixWorld(true);
        status.textContent=`Abierta: ${name.textContent}. Se conserva la visibilidad actual.`;
      });
      button('Actualizar','update',async()=>{if(!world)throw new Error('La cámara no está disponible.');await saveCameraView(components,world,view.title||'Vista sin nombre',view,text=>{status.textContent=text;});status.textContent=`Encuadre actualizado: ${name.textContent}. Guarda la sesión para conservarlo.`;});
      button('Renombrar','rename',async()=>{const next=window.prompt('Nombre de la vista',view.title||'');if(next===null)return;const title=next.trim().slice(0,200);if(!title)throw new Error('Escribe un nombre para la vista.');view.title=title;manager.list.set(view.guid,view);status.textContent=`Vista renombrada: ${title}.`;});
      button('Eliminar','delete',async()=>{if(!window.confirm(`¿Eliminar la vista «${name.textContent}» del trabajo actual?`))return;manager.list.delete(view.guid);manager.snapshots.delete(view.guid);status.textContent='Vista eliminada del trabajo actual.';});
      row.append(actions);list.append(row);
    }
    if(!manager.list.size)list.textContent='Todavía no hay vistas. Guarda un encuadre para retomarlo en clase.';
    root.querySelector<HTMLButtonElement>('#view-create')!.disabled=busy;
  };
  root.querySelector<HTMLButtonElement>('#view-create')!.addEventListener('click',()=>{void run(async()=>{
    if(!world)throw new Error('La cámara no está disponible.');
    const titles=new Set([...manager.list.values()].map(v=>v.title));let n=1;while(titles.has(`Vista ${n}`))n++;
    const view=await saveCameraView(components,world,`Vista ${n}`,undefined,text=>{status.textContent=text;});
    status.textContent=`Encuadre guardado: ${view.title}. Guarda la sesión para conservarlo.`;
  });});
  manager.list.onItemSet.add(draw);manager.list.onItemUpdated.add(draw);manager.list.onItemDeleted.add(draw);manager.list.onCleared.add(draw);
  draw();return BUI.html`${root}`;
};
