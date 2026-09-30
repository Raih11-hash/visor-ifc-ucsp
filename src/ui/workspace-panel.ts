/** workspace-panel.ts — tablero docente, reglas explícitas y sesiones locales. */
import { DEFAULT_FILTER, filterElements, summarizeElements, evaluateRules, recordsToCsv, qualityToCsv } from '../domain/catalog';
import type { ElementRecord, FilterSpec, QualityRule, QualityResult } from '../domain/catalog';
import { encodeSession, parseSession } from '../domain/session-format';
import type { SessionSnapshot } from '../domain/session-format';
import { saveSession, listSessions, loadSession, deleteSession } from '../services/session-store';
import { avisar, mensajeError } from './feedback';

export interface WorkspaceAPI {
  records: ElementRecord[]; filter: FilterSpec; rules: QualityRule[];
  queries: {name: string; filter: FilterSpec}[];
  refresh(onProgress?: (message:string)=>void): Promise<void>;
  select(rows: ElementRecord[]): Promise<void>; isolate(rows: ElementRecord[]): Promise<void>;
  showAll(): Promise<void>; colorResults(results: QualityResult[]): Promise<void>; clearReviewColors(): Promise<void>;
  capture(name: string): Promise<SessionSnapshot>; restore(snapshot:SessionSnapshot): Promise<void>;
}

export function downloadText(text: string, fileName: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([type.startsWith('text/csv') ? '\uFEFF' : '', text], {type}));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const HTML = `
<div class="section-heading"><span class="eyebrow">LABORATORIO BIM</span><h2>Información del modelo</h2></div>
<div class="workspace-tabs" role="tablist" aria-label="Herramientas de información">
  <button type="button" id="tab-catalog" role="tab" aria-controls="panel-catalog" aria-selected="true" data-tab="catalog">Tablero</button>
  <button type="button" id="tab-quality" role="tab" aria-controls="panel-quality" aria-selected="false" data-tab="quality">Revisión</button>
  <button type="button" id="tab-sessions" role="tab" aria-controls="panel-sessions" aria-selected="false" data-tab="sessions">Sesiones</button>
</div>
<p id="workspace-status" class="muted" role="status" aria-live="polite">Abre un modelo para consultar su información.</p>
<section id="panel-catalog" role="tabpanel" aria-labelledby="tab-catalog">
  <div class="metric-grid"><div><strong id="catalog-total">0</strong><span>Con geometría</span></div><div><strong id="filter-count">0</strong><span>Coincidencias</span></div></div>
  <p class="muted">Los conteos no incluyen objetos sin geometría. Filtrar no oculta nada hasta pulsar Aislar.</p>
  <div class="form-grid"><label>Categoría<select id="filter-category"><option value="">Todas</option></select></label><label>Nivel<select id="filter-level"><option value="">Todos</option></select></label></div>
  <label>Buscar nombre, GUID o dato<input id="filter-text" maxlength="256" placeholder="Ej.: losa, concreto…"></label>
  <div class="form-grid"><label>Propiedad<select id="filter-propertyName"><option value="">Cualquiera</option></select></label><label>Contiene<input id="filter-propertyValue" maxlength="256" placeholder="Valor"></label></div>
  <div class="button-row"><button id="filter-clear" type="button">Limpiar</button><button id="filter-select" type="button">Seleccionar</button><button id="filter-isolate" type="button">Aislar</button><button id="filter-show" type="button">Mostrar todo</button><button id="filter-export" type="button">CSV</button></div>
  <details><summary>Distribución por categoría y nivel</summary><div id="catalog-categories" class="distribution"></div><div id="catalog-levels" class="distribution"></div></details>
  <details><summary>Consultas guardadas</summary><label>Nombre<input id="query-name" maxlength="200" placeholder="Ej.: losas del nivel 1"></label><button id="query-save" type="button">Guardar consulta</button><label>Consulta<select id="query-list"><option value="">Elige una consulta</option></select></label><div class="button-row"><button id="query-load" type="button">Aplicar</button><button id="query-delete" type="button">Eliminar consulta</button></div><p class="muted">Se incluyen al guardar o exportar la sesión.</p></details>
  <details><summary>Elementos encontrados</summary><p class="muted">Vista previa de hasta 100 elementos. El CSV incluye todos.</p><div id="catalog-results" class="result-list"></div></details>
</section>
<section id="panel-quality" role="tabpanel" aria-labelledby="tab-quality" hidden>
  <p class="notice">Revisión básica de datos, no certificación IDS/EIR/LOD ni calificación automática.</p>
  <label>Nombre de la regla<input id="rule-name" maxlength="200" placeholder="Ej.: elementos con nombre"></label>
  <label>Ámbito de categoría<select id="rule-category"><option value="">Todas las categorías</option></select></label>
  <label>Atributo o propiedad<input id="rule-field" maxlength="256" list="rule-fields" value="Name" placeholder="Name o Pset.Property"><datalist id="rule-fields"></datalist></label>
  <div class="form-grid"><label>Condición<select id="rule-operator"><option value="required">Debe existir</option><option value="equals">Debe ser igual a</option></select></label><label>Valor esperado<input id="rule-expected" maxlength="1024" disabled></label></div>
  <p class="muted">La igualdad ignora mayúsculas y espacios extremos. Las propiedades usan Pset.Propiedad. Sin elementos en el ámbito, no hay veredicto.</p>
  <button id="rule-add" type="button">Añadir regla</button><div id="rule-list" class="result-list"></div>
  <div class="button-row"><button id="quality-run" type="button" class="primary">Revisar modelo</button><button id="quality-select" type="button">Seleccionar fallos</button><button id="quality-color" type="button">Colorear resultados</button><button id="quality-clear" type="button">Quitar colores</button><button id="quality-export" type="button">CSV revisión</button></div>
  <p id="quality-summary" role="status" aria-live="polite">Añade una regla y ejecuta la revisión.</p><div id="quality-results" class="result-list"></div>
</section>
<section id="panel-sessions" role="tabpanel" aria-labelledby="tab-sessions" hidden>
  <p class="notice">Guardado en este navegador. Borrar sus datos elimina las sesiones; exporta una copia de respaldo.</p>
  <label>Nombre de sesión<input id="session-name" maxlength="200" placeholder="Ej.: taller de revisión 01"></label>
  <div class="button-row"><button id="session-save" type="button" class="primary">Guardar sesión</button><button id="session-export" type="button">Exportar JSON</button></div>
  <label>Sesiones guardadas<select id="session-list"><option value="">Ninguna sesión</option></select></label>
  <div class="button-row"><button id="session-load" type="button">Abrir sesión</button><button id="session-delete" type="button">Eliminar sesión</button><button id="session-refresh" type="button">Actualizar lista</button></div>
  <label class="file-label">Importar sesión JSON<input id="session-import" type="file" accept=".json,application/json"></label>
  <p id="session-status" role="status" aria-live="polite" class="muted"></p>
  <p class="muted">Incluye modelos, cámara, filtros, consultas, reglas, selección, ocultos, colores y vistas de cámara. No incluye cortes, medidas ni modo fantasma. Máx. 100 MB por modelo / 200 MB por sesión.</p>
</section>`;

export function mountWorkspacePanel(root: HTMLElement, workspace: WorkspaceAPI) {
  root.id = 'workspace-v2'; root.className = 'workspace-panel'; root.innerHTML = HTML;
  let busy = false; let results: QualityResult[] = []; let generation = 0;
  const el = <T extends HTMLElement = HTMLElement>(id:string) => {
    const node = root.querySelector<T>(`#${id}`); if (!node) throw new Error(`Falta el control ${id}`); return node;
  };
  const value = (id:string) => el<HTMLInputElement | HTMLSelectElement>(id).value;
  const setText = (id:string,text:string) => {el(id).textContent=text;};
  const bind = (id:string,action:()=>unknown) => el(id).addEventListener('click', () => {void action();});
  const run = async (action:()=>Promise<void>) => {
    if (busy) return; busy=true; root.setAttribute('aria-busy','true');
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('button:not([role="tab"]),input,select')].map(node=>({node,disabled:node.disabled}));
    controls.forEach(({node})=>node.disabled=true);
    try { await action(); } catch(error) { avisar(mensajeError(error),true);setText('session-status',mensajeError(error)); }
    finally {busy=false;root.setAttribute('aria-busy','false');controls.forEach(({node,disabled})=>node.disabled=disabled);}
  };
  const options = (id:string,items:{label:string;value:string}[],placeholder:string,selected='') => {
    const select=el<HTMLSelectElement>(id); select.replaceChildren(new Option(placeholder,''),...items.map(x=>new Option(x.label,x.value))); select.value=selected;
  };
  const rows = () => filterElements(workspace.records,workspace.filter);
  const readFilter = () => {
    for (const key of Object.keys(DEFAULT_FILTER) as (keyof FilterSpec)[]) workspace.filter[key] = value(`filter-${key}`);
    if (!workspace.filter.propertyName) {workspace.filter.propertyValue='';el<HTMLInputElement>('filter-propertyValue').value='';}
    el<HTMLInputElement>('filter-propertyValue').disabled=!workspace.filter.propertyName;
  };
  const syncFilters = () => {for(const key of Object.keys(DEFAULT_FILTER) as (keyof FilterSpec)[]) el<HTMLInputElement | HTMLSelectElement>(`filter-${key}`).value=workspace.filter[key];el<HTMLInputElement>('filter-propertyValue').disabled=!workspace.filter.propertyName;};
  const renderResults = () => {
    const found=rows();setText('filter-count',String(found.length));
    el('catalog-results').replaceChildren(...found.slice(0,100).map(row=>{
      const button=document.createElement('button');button.type='button';button.textContent=`${row.name || '(sin nombre)'} · ${row.category} · ${row.level || '(sin nivel)'}`;
      button.addEventListener('click',()=>{void run(()=>workspace.select([row]));});return button;
    }));
    if (!found.length) setText('catalog-results',workspace.records.length?'No hay coincidencias.':'Sin modelos cargados.');
  };
  const renderQueries=()=>options('query-list',workspace.queries.map((q,i)=>({label:q.name,value:String(i)})),'Elige una consulta');
  const renderRules=()=>{
    el('rule-list').replaceChildren(...workspace.rules.map(rule=>{
      const row=document.createElement('div');row.className='rule-row';const text=document.createElement('span');text.textContent=`${rule.name || rule.field}: ${rule.field} ${rule.operator==='required'?'presente':`= ${rule.expected}`} · ${rule.category || 'Todas'}`;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar';remove.setAttribute('aria-label',`Quitar regla ${rule.name}`);
      remove.addEventListener('click',()=>{workspace.rules=workspace.rules.filter(r=>r.id!==rule.id);results=[];renderRules();setText('quality-summary','Reglas cambiadas: vuelve a revisar.');el('quality-results').replaceChildren();});row.append(text,remove);return row;
    }));
  };
  const renderQuality=()=>{
    const pass=results.filter(x=>x.pass).length;
    const misses=workspace.rules.filter(rule=>!results.some(x=>x.ruleId===rule.id));
    setText('quality-summary',results.length?`${pass} cumple / ${results.length-pass} no cumple · ${results.length} comprobaciones${misses.length?` · ${misses.length} reglas sin elementos aplicables`:''}`:'No hay elementos aplicables: sin veredicto.');
    el('quality-results').replaceChildren(...[...results.filter(x=>!x.pass),...results.filter(x=>x.pass)].slice(0,100).map(result=>{
      const row=document.createElement('button');row.type='button';row.className=result.pass?'pass':'fail';row.textContent=`${result.pass?'Cumple':'No cumple'} · ${result.element.name || result.element.guid || result.element.localId} · ${result.ruleName}: ${result.reason} (actual: ${result.actual || 'ausente'})`;
      row.addEventListener('click',()=>{void run(()=>workspace.select([result.element]));});return row;
    }));
  };
  const redraw = () => {
    const summary=summarizeElements(workspace.records);setText('catalog-total',String(summary.total));
    const cats=summary.categories.map(x=>({label:`${x.label || '(sin categoría)'} (${x.count})`,value:x.label}));
    const levels=summary.levels.filter(x=>x.label).map(x=>({label:`${x.label} (${x.count})`,value:x.label}));
    options('filter-category',cats,'Todas',workspace.filter.category);options('rule-category',cats,'Todas las categorías',value('rule-category'));
    options('filter-level',levels,'Todos',workspace.filter.level);
    const keys=[...new Set(workspace.records.flatMap(row=>Object.keys(row.properties)))].sort();
    options('filter-propertyName',keys.map(key=>({label:key,value:key})),'Cualquiera',workspace.filter.propertyName);
    const fields=[...new Set(['Name','GlobalId','ObjectType','Level',...keys])];el('rule-fields').replaceChildren(...fields.map(key=>new Option(key,key)));
    for (const [id,groups,key] of [['catalog-categories',summary.categories,'category'],['catalog-levels',summary.levels,'level']] as const) {
      el(id).replaceChildren(...groups.map(group=>{const b=document.createElement('button');b.type='button';b.textContent=`${group.label || '(sin dato)'} · ${group.count}`;b.addEventListener('click',()=>{if (!group.label) return;workspace.filter[key]=group.label;syncFilters();renderResults();});return b;}));
    }
    syncFilters();renderResults();renderRules();renderQueries();results=[];el('quality-results').replaceChildren();setText('quality-summary','Añade una regla y ejecuta la revisión.');
    setText('workspace-status',summary.total?`${summary.total} elementos disponibles para revisar.`:'Abre un modelo para consultar su información.');
  };
  const refresh = async () => {
    const current=++generation;root.dataset.indexState='loading';setText('workspace-status','Leyendo información por lotes…');
    try {await workspace.refresh(message=>{if(current===generation)setText('workspace-status',message);});if(current===generation){redraw();root.dataset.indexState='ready';}}
    catch(error){if(current===generation){root.dataset.indexState='error';setText('workspace-status',mensajeError(error));avisar(mensajeError(error),true);}}
  };
  const sessions = async()=>{
    const selected=value('session-list');const list=await listSessions();options('session-list',list.map(s=>({label:`${s.name} · ${s.modelCount} modelo(s) · ${new Date(s.savedAt).toLocaleString('es-PE')}`,value:s.id})),list.length?'Elige una sesión':'Ninguna sesión',selected);
  };
  for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-tab]')) tab.addEventListener('click',()=>{
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-tab]')) button.setAttribute('aria-selected',String(button===tab));
    for(const panel of root.querySelectorAll<HTMLElement>('[role="tabpanel"]')) panel.hidden=panel.id!==`panel-${tab.dataset.tab}`;
  });
  for(const key of Object.keys(DEFAULT_FILTER)) el(`filter-${key}`).addEventListener(key==='text'||key==='propertyValue'?'input':'change',()=>{readFilter();renderResults();});
  bind('filter-clear',()=>{workspace.filter={...DEFAULT_FILTER};syncFilters();renderResults();});
  bind('filter-select',()=>run(()=>workspace.select(rows())));bind('filter-isolate',()=>run(async()=>{const found=rows();if(!found.length)throw new Error('No hay coincidencias para aislar.');await workspace.isolate(found);}));
  bind('filter-show',()=>run(()=>workspace.showAll()));bind('filter-export',()=>downloadText(recordsToCsv(rows()),'elementos-v2.csv'));
  bind('query-save',()=>{const name=value('query-name').trim();if(!name){avisar('Escribe un nombre para la consulta.',true);return;}if(workspace.queries.length>=50){avisar('Máximo 50 consultas por sesión.',true);return;}workspace.queries.push({name,filter:{...workspace.filter}});renderQueries();avisar('Consulta guardada en el trabajo actual. Guarda la sesión para conservarla.');});
  bind('query-load',()=>{const selected=value('query-list');if(selected==='')return;const q=workspace.queries[Number(selected)];if(q){workspace.filter={...q.filter};syncFilters();renderResults();}});
  bind('query-delete',()=>{const selected=value('query-list');if(selected==='')return;workspace.queries.splice(Number(selected),1);renderQueries();});
  el('rule-operator').addEventListener('change',()=>{el<HTMLInputElement>('rule-expected').disabled=value('rule-operator')!=='equals';});
  bind('rule-add',()=>{
    const field=value('rule-field').trim();const operator=value('rule-operator') as QualityRule['operator'];const expected=value('rule-expected');
    if(!field || operator==='equals'&&!expected.trim()){avisar('Indica el dato y, para igualdad, el valor esperado.',true);return;}
    if(workspace.rules.length>=100){avisar('Máximo 100 reglas por sesión.',true);return;}
    workspace.rules.push({id:crypto.randomUUID(),name:value('rule-name').trim()||field,category:value('rule-category'),field,operator,expected});results=[];renderRules();el('quality-results').replaceChildren();setText('quality-summary','Reglas cambiadas: vuelve a revisar.');
  });
  bind('quality-run',()=>{if(!workspace.rules.length){avisar('Añade al menos una regla.',true);return;}results=evaluateRules(workspace.records,workspace.rules);renderQuality();});
  bind('quality-select',()=>run(()=>workspace.select(results.filter(x=>!x.pass).map(x=>x.element))));
  bind('quality-color',()=>run(async()=>{if(!results.length)throw new Error('Ejecuta una revisión con elementos aplicables antes de colorear.');await workspace.colorResults(results);}));
  bind('quality-clear',()=>run(()=>workspace.clearReviewColors()));bind('quality-export',()=>downloadText(qualityToCsv(results),'revision-v2.csv'));
  const sessionName=()=>value('session-name').trim()||'Sesión IFC';
  bind('session-save',()=>run(async()=>{const snapshot=await workspace.capture(sessionName());await saveSession(snapshot);const stored=await loadSession(snapshot.id);if(stored.savedAt!==snapshot.savedAt)throw new Error('No se confirmó el guardado.');await sessions();el<HTMLSelectElement>('session-list').value=snapshot.id;setText('session-status',`Guardada y verificada: ${snapshot.name}`);avisar('Sesión guardada en este navegador.');}));
  bind('session-export',()=>run(async()=>{const snapshot=await workspace.capture(sessionName());downloadText(encodeSession(snapshot),'sesion-ifc-v2.json','application/json');setText('session-status','Copia JSON generada con los modelos incluidos.');}));
  bind('session-load',()=>run(async()=>{const id=value('session-list');if(!id)throw new Error('Elige una sesión guardada.');if(workspace.records.length&&!window.confirm('Abrir esta sesión sustituye el trabajo actual. ¿Continuar?'))return;const snapshot=await loadSession(id);await workspace.restore(snapshot);redraw();root.dataset.indexState='ready';el<HTMLInputElement>('session-name').value=snapshot.name;setText('session-status',`Recuperada: ${snapshot.name}`);avisar('Sesión recuperada; modelos y huellas comprobados.');}));
  bind('session-delete',()=>run(async()=>{const id=value('session-list');if(!id)throw new Error('Elige una sesión.');if(!window.confirm('¿Eliminar esta sesión guardada del navegador?'))return;await deleteSession(id);await sessions();setText('session-status','Sesión eliminada.');}));
  bind('session-refresh',()=>run(sessions));
  el<HTMLInputElement>('session-import').addEventListener('change',()=>{void run(async()=>{const input=el<HTMLInputElement>('session-import');const file=input.files?.[0];if(!file)return;try{if(file.size>300*1024*1024)throw new Error('El JSON supera el límite de 300 MB.');const snapshot=parseSession(await file.text());if(workspace.records.length&&!window.confirm('Importar sustituye el trabajo actual. ¿Continuar?'))return;await workspace.restore(snapshot);snapshot.id=crypto.randomUUID();snapshot.savedAt=new Date().toISOString();await saveSession(snapshot);await loadSession(snapshot.id);redraw();root.dataset.indexState='ready';await sessions();el<HTMLInputElement>('session-name').value=snapshot.name;setText('session-status',`Importada y guardada: ${snapshot.name}`);avisar('Sesión importada; huellas comprobadas.');}finally{input.value='';}});});
  redraw();root.dataset.indexState='ready';void sessions().catch(error=>setText('session-status',mensajeError(error)));
  return {redraw,refresh};
}
