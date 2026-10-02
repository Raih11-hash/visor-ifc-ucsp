/** save-state.ts — guardado visible y seguimiento conservador del trabajo de sesión. */
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import { workState } from '../domain/work-state';

export function mountSaveState(components: OBC.Components,world: OBC.World) {
  const status=document.getElementById('work-status');
  const quick=document.getElementById('quick-session-save') as HTMLButtonElement | null;
  const render=()=>{
    if(status){status.textContent=workState.dirty?'Cambios sin guardar':workState.revision?'Guardada en este navegador':'Sin cambios pendientes';status.dataset.dirty=String(workState.dirty);}
    if(quick)quick.disabled=document.querySelector('#workspace-v2')?.getAttribute('aria-busy')==='true'||document.querySelector('#views-panel')?.getAttribute('aria-busy')==='true';
  };
  workState.addEventListener('change',render);
  const fragments=components.get(OBC.FragmentsManager);
  fragments.list.onItemSet.add(()=>workState.changed());fragments.list.onItemDeleted.add(()=>workState.changed());
  const manager=components.get(OBC.Viewpoints);
  manager.list.onItemSet.add(({value})=>{if(!value.customData.pending)workState.changed();});
  manager.list.onItemUpdated.add(({value})=>{if(!value.customData.pending)workState.changed();});
  manager.list.onItemDeleted.add(()=>workState.changed());
  const highlighter=components.get(OBF.Highlighter);
  const hooked=new WeakSet<object>();
  const hook=()=>{
    for(const event of Object.values(highlighter.events)){
      if(hooked.has(event))continue;hooked.add(event);
      event.onHighlight.add(()=>workState.changed());event.onClear.add(()=>workState.changed());
    }
  };
  hook();highlighter.styles.onItemSet.add(hook);
  if(world.camera instanceof OBC.OrthoPerspectiveCamera){
    const camera=world.camera;
    const signature=()=>[...camera.controls.getPosition(camera.three.position.clone()).toArray(),...camera.controls.getTarget(camera.three.position.clone()).toArray(),camera.projection.current].map(n=>typeof n==='number'?n.toFixed(5):n).join('|');
    let last=signature();
    const changed=()=>{const next=signature();if(next!==last){last=next;workState.changed();}};
    camera.controls.addEventListener('update',changed);camera.projection.onChanged.add(changed);
  }
  document.addEventListener('click',event=>{
    // El SDK no expone evento de visibilidad de modelo; marcar estos comandos
    // antes de actuar es conservador incluso si no cambian elementos.
    if(event.composedPath().some(node=>node instanceof Element&&node.matches('bim-button')&&['Mostrar todo','Ocultar','Aislar','Colorear'].includes(node.getAttribute('label')??'')))workState.changed();
  });
  const busyObserver=new MutationObserver(render);
  for(const panel of document.querySelectorAll('#workspace-v2,#views-panel'))busyObserver.observe(panel,{attributes:true,attributeFilter:['aria-busy']});
  quick?.addEventListener('click',()=>{
    document.getElementById('nav-workspace')?.click();document.getElementById('tab-sessions')?.click();document.getElementById('session-save')?.click();
  });
  window.addEventListener('beforeunload',event=>{if(workState.dirty){event.preventDefault();event.returnValue='';}});
  render();
}
