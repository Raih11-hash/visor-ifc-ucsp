"""RV9b probe: estructura REAL de unidades, Psets de tipo y referencias.

Sirve `dist` y el IFC real desde el mismo origen. Vuelca en
test-results/rv9b-units.json la forma exacta que entrega el motor para:
- IfcUnitAssignment y sus IfcSIUnit / IfcConversionBasedUnit (attrs arriba/abajo).
- IsDefinedBy completo (IFCBEAMTYPE con HasPropertySets anidados).
- Un nodo de referencia a otra entidad (handle web-ifc vs entidad FRAG).
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys
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


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'page_errors': [], 'ifc': str(IFC_SRC)}
failed = False
try:
    with sync_playwright() as p:
        cands = sorted((pathlib.Path.home() / 'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
        with p.chromium.launch(headless=True, executable_path=os.getenv('CHROME_PATH') or (str(cands[-1]) if cands else None),
                               args=['--enable-unsafe-swiftshader']) as browser:
            ctx = browser.new_context(viewport={'width': 1600, 'height': 1000})
            page = ctx.new_page()
            page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/?test=1')
            page.wait_for_function('document.documentElement.dataset.appState==="ready"', timeout=90000)
            page.evaluate("""async()=>{
                const bytes=await (await fetch('/real.ifc')).arrayBuffer();
                const dt=new DataTransfer();dt.items.add(new File([bytes],'EST_GT_C_R_v5.ifc'));
                document.querySelector('bim-viewport').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true}));
            }""")
            page.wait_for_function('Number(document.querySelector("#catalog-total").textContent)>0 && document.querySelector("#workspace-v2").dataset.indexState==="ready"', timeout=600000)
            data = page.evaluate("""async()=>{
                const t=window.__IFC_TEST;
                const fm=t.components.get(t.OBC.FragmentsManager);
                const model=[...fm.list.values()][0];
                const safe=(node,depth)=>{ if(depth>12)return '«…»'; if(node===null)return null; if(typeof node!=='object')return node;
                    if(Array.isArray(node))return node.map(x=>safe(x,depth+1));
                    const out={};for(const k of Object.keys(node))out[k]=safe(node[k],depth+1);return out; };
                // 1) Unidades
                const byCat=await model.getItemsOfCategories([/UNITASSIGNMENT/]);
                const assignId=Object.values(byCat).flat()[0];
                const [uraw]=await model.getItemsData([assignId],{relations:{Units:{relations:false,attributes:true}}});
                // también con relations:true para ver si Units trae nodos completos
                const [uraw2]=await model.getItemsData([assignId],{relations:{Units:{relations:true,attributes:true}}});
                const unitIds=[]; const unitsArr=(uraw&&uraw.Units)||[];
                for(const u of unitsArr){ if(u&&u._localId&&u._localId.value!=null)unitIds.push(u._localId.value); }
                const unitDataFull= unitIds.length? await model.getItemsData(unitIds,{attributesDefault:true,relationsDefault:{attributes:false,relations:false}}) : [];
                // 2) IsDefinedBy del elemento propietario
                const localIds=await model.getLocalIdsByGuids(['%s']);
                const cfg={attributesDefault:true,relationsDefault:{attributes:false,relations:false},relations:{IsDefinedBy:{attributes:true,relations:true},HasProperties:{attributes:true,relations:false},Quantities:{attributes:true,relations:false}}};
                const [raw]=await model.getItemsData([localIds[0]],cfg);
                // categorías presentes en IsDefinedBy (primer nivel y anidado)
                const cats=[]; const walk=(n,d)=>{if(d>6||!n)return;if(Array.isArray(n)){n.forEach(x=>walk(x,d+1));return;}if(typeof n!=='object')return;
                    if(n._category&&n._category.value)cats.push('  '.repeat(d)+n._category.value);
                    for(const k of Object.keys(n)){if(k==='_category'||k==='_localId'||k==='_guid')continue;const v=n[k];if(Array.isArray(v)||(v&&typeof v==='object'&&(v._category)))walk(v,d+1);}};
                walk(raw.IsDefinedBy,0);
                // 3) Buscar cualquier propiedad con Unit o valor referencia/handle
                let withUnit=null; let refSample=null; let bounded=null;
                const seen=new WeakSet();
                const scan=(n,d)=>{if(!n||typeof n!=='object'||d>10)return;if(seen.has(n))return;seen.add(n);if(Array.isArray(n)){n.forEach(x=>scan(x,d+1));return;}
                    if(n.Unit){withUnit=withUnit||safe(n.Unit,0);}
                    if(n._category&&/BOUNDED|ENUMERATED|LIST|TABLE/i.test(String(n._category.value))){bounded=bounded||safe(n,0);}
                    if(n.NominalValue&&n.NominalValue.value&&typeof n.NominalValue.value==='object'&&!Array.isArray(n.NominalValue.value)){refSample=refSample||safe(n.NominalValue,0);}
                    for(const k of Object.keys(n)){const v=n[k];if(v&&typeof v==='object')scan(v,d+1);}};
                scan(raw,0);
                // Material/relación de referencia: buscar asociaciones
                const [rawAssoc]=await model.getItemsData([localIds[0]],{attributesDefault:true,relationsDefault:{attributes:false,relations:false},relations:{HasAssociations:{attributes:true,relations:true}}});
                return {
                    modelId:model.modelId, localId:localIds[0],
                    unitAssignment_keys:Object.keys(uraw||{}),
                    units: safe(unitsArr,0),
                    units_full: safe(unitDataFull,0),
                    units_relations_true: safe((uraw2||{}).Units,null),
                    isDefinedBy_categories: cats,
                    isDefinedBy_safe: safe(raw.IsDefinedBy,0),
                    withUnit, refSample, bounded,
                    assoc_keys: Object.keys(rawAssoc||{}),
                    assoc_safe: safe(rawAssoc.HasAssociations,0),
                };
            }""" % GUID)
            report.update(data)
except Exception as e:
    failed = True
    report['failure'] = str(e)
    traceback.print_exc()
finally:
    server.shutdown(); server.server_close()
    (OUT / 'rv9b-units.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('isDefinedBy_safe',)}, ensure_ascii=False, indent=2, default=str)[:8000])
sys.exit(1 if failed else 0)
