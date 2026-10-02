"""RV9 probe: reproduce la falta de Name/NominalValue del panel con IFC real.

Sirve `dist` y el IFC fuente local (Downloads) desde un mismo servidor HTTP para
evitar CORS. No copia el IFC a public ni a git.
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results'; OUT.mkdir(exist_ok=True)
IFC_SRC = pathlib.Path(os.getenv('IFC_REAL', r'C:/Users/luis.zegarra/Downloads/EST_GT_C_R_v5.ifc'))
GUID = '3zSxltga9Eo8qEtsMwBJvC'


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def translate_path(self, path):
        if path.startswith('/real.ifc'):
            return str(IFC_SRC)
        return super().translate_path(path)


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'tests': [], 'page_errors': [], 'ifc': str(IFC_SRC)}
failed = False
try:
    with sync_playwright() as p:
        cands = sorted((pathlib.Path.home() / 'AppData/Local/ms-playwright').glob(
            'chromium-*/chrome-win64/chrome.exe'))
        with p.chromium.launch(headless=True,
                               executable_path=os.getenv('CHROME_PATH') or (str(cands[-1]) if cands else None),
                               args=['--enable-unsafe-swiftshader']) as browser:
            ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
            page = ctx.new_page()
            page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/?test=1')
            page.wait_for_function('document.documentElement.dataset.appState==="ready"', timeout=90000)
            # Cargar el IFC real por drop (leído desde el servidor local).
            page.evaluate("""async()=>{
                const bytes=await (await fetch('/real.ifc')).arrayBuffer();
                const dt=new DataTransfer();
                dt.items.add(new File([bytes],'EST_GT_C_R_v5.ifc'));
                document.querySelector('bim-viewport').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
            }""")
            page.wait_for_function(
                'Number(document.querySelector("#catalog-total").textContent)>0 && document.querySelector("#workspace-v2").dataset.indexState==="ready"',
                timeout=600000)
            report['catalog_total'] = int(page.locator('#catalog-total').inner_text())
            # Resolver el elemento propietario por GUID (no asumir Express ID == localId).
            info = page.evaluate("""async()=>{
                const t=window.__IFC_TEST;
                const fm=t.components.get(t.OBC.FragmentsManager);
                const model=[...fm.list.values()][0];
                const guids=['%s'];
                const localIds=await model.getLocalIdsByGuids(guids);
                const localId=localIds[0];
                const cfg={
                    attributesDefault:true,
                    relationsDefault:{attributes:false,relations:false},
                    relations:{
                        IsDefinedBy:{attributes:true,relations:true},
                        HasProperties:{attributes:true,relations:false},
                        Quantities:{attributes:true,relations:false},
                        ContainedInStructure:{attributes:true,relations:false},
                        DefinesOccurrence:{attributes:false,relations:false},
                        DefinesOcurrence:{attributes:false,relations:false},
                        Decomposes:{attributes:false,relations:false},
                    },
                };
                const [raw]=await model.getItemsData([localId],cfg);
                // Serializador seguro: corta ciclos y limita profundidad.
                const seen=new WeakSet();
                const safe=(node,depth)=>{
                    if(depth>10)return '«…»';
                    if(node===null)return null;
                    if(typeof node!=='object')return node;
                    if(seen.has(node))return '«ciclo»';
                    seen.add(node);
                    if(Array.isArray(node)){const out=node.map(x=>safe(x,depth+1));seen.delete(node);return out;}
                    const out={};
                    for(const k of Object.keys(node))out[k]=safe(node[k],depth+1);
                    seen.delete(node);
                    return out;
                };
                const [isDef]=[safe(raw.IsDefinedBy,0)];
                return {modelId:model.modelId,localId,keys:Object.keys(raw),isDefinedBy:isDef};
            }""" % GUID)
            report['owner'] = {'modelId': info['modelId'], 'localId': info['localId'], 'guid': GUID}
            (OUT / 'rv9-props-red-raw.json').write_text(
                json.dumps(info, ensure_ascii=False, indent=2, default=str), encoding='utf8')
            # Seleccionar y volcar la tabla SDK tal como la ve el usuario.
            page.evaluate("""async()=>{
                const t=window.__IFC_TEST;
                const rec=t.workspace.records.find(r=>r.guid==='%s');
                window.__rec=rec;
                await t.workspace.select([rec]);
            }""" % GUID)
            page.wait_for_timeout(1500)
            # Expandir todas las filas del árbol SDK para que renderice los hijos.
            page.evaluate("""()=>{
                const t=document.querySelector('#panel-propiedades-body bim-table');
                if(t)t.expanded=true;
            }""")
            page.wait_for_timeout(1200)
            try:
                page.locator('bim-button[tooltip-title="Expandir"]').click()
                page.wait_for_timeout(800)
            except Exception:
                pass
            # Experimento decisivo: invocar la MISMA transformación de valor del SDK.
            experiment = page.evaluate("""async()=>{
                const t=document.querySelector('#panel-propiedades-body bim-table');
                if(!t||!t.dataTransform||!t.dataTransform.Value)return {available:false};
                const modelId=[...window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager).list.keys()][0];
                const out={available:true,cases:[]};
                const run=async(label,value,dataType)=>{
                    const node=t.dataTransform.Value(value,{dataType,modelId});
                    const host=document.createElement('div');host.style.position='fixed';host.style.left='-9999px';
                    document.body.append(host);
                    if(node&&node.nodeType===1)host.append(node); else host.textContent=String(node);
                    await new Promise(r=>setTimeout(r,600));
                    const texts=[];
                    const walk=(root)=>{for(const el of root.querySelectorAll('*')){if(el.shadowRoot)walk(el.shadowRoot);if(el.tagName==='BIM-LABEL'&&(el.textContent||'').trim())texts.push(el.textContent.trim());}};
                    walk(host);
                    out.cases.push({label,dataType,renderedText:texts.join('|'),isElement:!!(node&&node.nodeType===1)});
                    host.remove();
                };
                await run('H','H','IFCTEXT');
                await run('Vigas','Vigas','IFCLABEL');
                await run('true',true,'IFCBOOLEAN');
                await run('3.65',3.65,'IFCLENGTHMEASURE');
                return out;
            }""")
            report['value_transform'] = experiment
            table = page.evaluate("""()=>{
                const t=document.querySelector('#panel-propiedades-body bim-table');
                if(!t)return null;
                const rows=[];
                const walk=(list,depth)=>{
                    for(const node of list||[]){
                        const d=node.data||{};
                        rows.push({depth,Name:d.Name,Value:d.Value,dataType:d.dataType,type:d.type,modelId:d.modelId,localId:d.localId});
                        if(node.children)walk(node.children,depth+1);
                    }
                };
                walk(t.data,0);
                return {loading:t.loading,queryString:t.queryString,rows};
            }""")
            report['sdk_table'] = table
            dom = page.evaluate("""()=>{
                const body=document.querySelector('#panel-propiedades-body');
                const texts=[];
                const walk=(root)=>{
                    for(const el of root.querySelectorAll('*')){
                        if(el.shadowRoot)walk(el.shadowRoot);
                        if(el.tagName==='BIM-LABEL'){
                            const t=(el.textContent||'').trim();
                            if(t)texts.push(t);
                        }
                    }
                };
                walk(body);
                return {innerText:(body.innerText||'').slice(0,6000),texts:texts.slice(0,400)};
            }""")
            report['dom'] = dom
            (OUT / 'rv9-props-red-dom.json').write_text(
                json.dumps(dom, ensure_ascii=False, indent=2), encoding='utf8')
            # Recorte del panel de propiedades para inspección visual.
            panel = page.locator('#panel-propiedades-body')
            try:
                panel.screenshot(path=str(OUT / 'rv9-props-red-panel-crop.png'))
            except Exception:
                pass
            (OUT / 'rv9-props-red-table.json').write_text(
                json.dumps(table, ensure_ascii=False, indent=2, default=str), encoding='utf8')
            page.screenshot(path=str(OUT / 'rv9-props-red-panel.png'), full_page=True)
            report['ok'] = True
except Exception as e:
    failed = True
    report['failure'] = str(e)
    traceback.print_exc()
finally:
    server.shutdown(); server.server_close()
    (OUT / 'rv9-props-red-probe.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('sdk_table',)}, ensure_ascii=False, indent=2))
sys.exit(1 if failed else 0)