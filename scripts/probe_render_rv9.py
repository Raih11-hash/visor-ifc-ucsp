"""Prueba diagnóstica (foreground) del render de valores del panel SDK.

Carga el modelo de ejemplo (rápido), reemplaza el árbol de la tabla por filas
conocidas con tipos IFCTEXT / IFCLABEL / IFCBOOLEAN / IFCLENGTHMEASURE y lee el
texto realmente renderizado en el shadow DOM. Evidencia:
test-results/rv9-render-red.json
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results'; OUT.mkdir(exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'page_errors': []}
failed = False
try:
    with sync_playwright() as p:
        cands = sorted((pathlib.Path.home() / 'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
        with p.chromium.launch(headless=True, executable_path=os.getenv('CHROME_PATH') or (str(cands[-1]) if cands else None),
                               args=['--enable-unsafe-swiftshader']) as browser:
            ctx = browser.new_context(viewport={'width': 1366, 'height': 768})
            page = ctx.new_page()
            page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/?test=1')
            page.wait_for_function('document.documentElement.dataset.appState==="ready"', timeout=90000)
            page.locator('bim-button[label="Cargar ejemplo"]').click()
            page.wait_for_function('document.querySelector("#catalog-total").textContent==="13"&&document.querySelector("#workspace-v2").dataset.indexState==="ready"', timeout=90000)
            page.evaluate('void window.__IFC_TEST.workspace.select([window.__IFC_TEST.workspace.records[0]])')
            page.wait_for_timeout(600)
            result = page.evaluate("""async()=>{
                const t=document.querySelector('#panel-propiedades-body bim-table');
                if(!t)return {found:false};
                const modelId=[...window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager).list.keys()][0];
                const localId=1;
                const attr=(Name,Value,dataType)=>({data:{type:'attribute',modelId,localId,Name,Value,dataType}});
                t.data=[{data:{type:'item',modelId,localId,Name:'ROOT'},children:[
                    attr('PropTexto','H','IFCTEXT'),
                    attr('PropLabel','Vigas','IFCLABEL'),
                    attr('PropBool',true,'IFCBOOLEAN'),
                    attr('PropMedida',3.65,'IFCLENGTHMEASURE'),
                    attr('PropSinTipo','Plano',undefined),
                ]}];
                await new Promise(r=>setTimeout(r,400));
                // Forzar expansión de todas las filas.
                const expand=()=>{
                    if(!t.shadowRoot)return;
                    const walk=(root)=>{for(const el of root.querySelectorAll('*')){
                        if(el.tagName==='BIM-TABLE-ROW'){try{el.expanded=true;}catch(e){}}
                        if(el.tagName==='BIM-TABLE-GROUP'&&typeof el.toggleChildren==='function'){try{el.toggleChildren(true);}catch(e){}}
                        if(el.shadowRoot)walk(el.shadowRoot);
                    }};
                    walk(t.shadowRoot);
                };
                expand();
                await new Promise(r=>setTimeout(r,600));
                expand();
                await new Promise(r=>setTimeout(r,400));
                const all=[];
                const recurse=(root)=>{for(const el of root.querySelectorAll('*')){all.push(el);if(el.shadowRoot)recurse(el.shadowRoot);}};
                recurse(t.shadowRoot);
                const tags={};for(const el of all)tags[el.tagName]=(tags[el.tagName]||0)+1;
                const rows=[];
                for(const el of all){
                    if(el.tagName!=='BIM-TABLE-ROW')continue;
                    const d=el.data||{};
                    const cells=[];
                    const collect=(root)=>{for(const x of root.querySelectorAll('*')){if(x.shadowRoot)collect(x.shadowRoot);if(x.tagName==='BIM-LABEL')cells.push((x.textContent||'').trim());}};
                    collect(el.shadowRoot||el);
                    rows.push({name:d.Name,value:d.Value,dataType:d.dataType,cells});
                }
                return {found:true,rowCount:rows.length,rows,tags,text:(t.shadowRoot.textContent||'').replace(/\s+/g,' ').slice(0,1500)};
            }""")
            report['result'] = result
            page.screenshot(path=str(OUT / 'rv9-render-red.png'))
except Exception as e:
    failed = True
    report['failure'] = str(e)
    traceback.print_exc()
finally:
    server.shutdown(); server.server_close()
    (OUT / 'rv9-render-red.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf8')
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
sys.exit(1 if failed else 0)