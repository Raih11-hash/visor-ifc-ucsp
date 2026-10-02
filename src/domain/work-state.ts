/** work-state.ts — revisión conservadora; un guardado viejo no limpia cambios nuevos. */
export class WorkState extends EventTarget {
  revision=0;
  private savedRevision=0;
  get dirty(){return this.revision!==this.savedRevision;}
  changed(){this.revision++;this.dispatchEvent(new Event('change'));}
  saved(revision:number){this.savedRevision=revision;this.dispatchEvent(new Event('change'));}
}
export const workState=new WorkState();
