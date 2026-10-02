"""Regresión de propiedades tardías: datos reales IFC con latencia controlada.

Adaptado al inspector propio (`window.__IFC_PROPS`, RV9): conserva las mismas
garantías (clear vacía, respuesta tardía no repone, selección rápida coalesce,
selección masiva sin límite silencioso, Psets/cantidades reales) con igual o
mayor fuerza que la versión sobre la tabla SDK.
"""
import pathlib,os,json,threading,http.server,functools,traceback,sys
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
report={'tests':[],'page_errors':[]};failed=False
def check(name,fn):
    fn();report['tests'].append({'name':name,'passed':True});print('PASS',name,flush=True)
def same(a,b):assert a==b,f'{a!r} != {b!r}'
try:
    with sync_playwright() as p:
        candidates=sorted((pathlib.Path.home()/'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
        with p.chromium.launch(headless=True,executable_path=os.getenv('CHROME_PATH') or (str(candidates[-1]) if candidates else None),args=['--enable-unsafe-swiftshader']) as browser:
            ctx=browser.new_context(viewport={'width':1366,'height':768});page=ctx.new_page();page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/?test=1');page.wait_for_function('document.documentElement.dataset.appState==="ready"',timeout=90000)
            page.locator('bim-button[label="Cargar ejemplo"]').click();page.wait_for_function('document.querySelector("#catalog-total").textContent==="13"&&document.querySelector("#workspace-v2").dataset.indexState==="ready"',timeout=90000)
            page.wait_for_function('document.querySelector(\'bim-button[label="Cargar ejemplo"]\')?.loading===false&&document.querySelector("[data-estado-modelos]").textContent.includes("Modelo de ejemplo listo")',timeout=90000)
            # Contar/bloquear solo consultas de elementos, no lecturas del mapa de unidades.
            page.evaluate("""()=>{const t=window.__IFC_TEST;window.__calls=0;window.__settled=0;window.__gate=new Promise(r=>window.__release=r);for(const model of t.components.get(t.OBC.FragmentsManager).list.values()){const original=model.getItemsData.bind(model);model.getItemsData=async(...args)=>{const isProps=Boolean(args[1]?.relations?.IsDefinedBy);if(isProps){window.__calls++;if(window.__calls===1)await window.__gate;}const result=await original(...args);if(isProps)window.__settled++;return result;};}}""")
            page.evaluate('void window.__IFC_TEST.workspace.select([window.__IFC_TEST.workspace.records[0]])')
            page.wait_for_function('window.__calls>=1')
            page.evaluate('window.__IFC_TEST.components.get(window.__IFC_TEST.OBF.Highlighter).clear("select")')
            page.wait_for_timeout(200)
            check('limpiar selección vacía el inspector',lambda:same(page.evaluate('window.__IFC_PROPS.elements.length'),0))
            page.evaluate('window.__release()');page.wait_for_function('window.__settled>=1');page.wait_for_timeout(300)
            check('respuesta tardía NO repone propiedades tras limpiar',lambda:same(page.evaluate('window.__IFC_PROPS.elements.length'),0))
            page.evaluate('window.__calls=0;window.__settled=0')
            page.evaluate("""async()=>{const w=window.__IFC_TEST.workspace;for(let i=0;i<3;i++){await w.select([w.records[i]]);await new Promise(r=>setTimeout(r,30));}}""")
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&!window.__IFC_PROPS.loading');page.wait_for_timeout(350)
            check('selección rápida evita consultas intermedias',lambda:same(page.evaluate('window.__calls'),1))
            check('propiedades corresponden a última selección',lambda:same(page.evaluate('window.__IFC_PROPS.elements[0].localId===window.__IFC_TEST.workspace.records[2].localId'),True))
            page.evaluate('window.__IFC_TEST.workspace.select(window.__IFC_TEST.workspace.records)')
            page.wait_for_function('window.__IFC_PROPS.elements.length===13&&!window.__IFC_PROPS.loading',timeout=90000)
            check('selección masiva conserva propiedades de los 13 elementos',lambda:same(page.evaluate('window.__IFC_PROPS.elements.length'),13))
            check('Psets y cantidades reales se conservan',lambda:same(page.evaluate('JSON.stringify(window.__IFC_PROPS.elements).includes("REI30")&&JSON.stringify(window.__IFC_PROPS.elements).includes("6.437500000000378")'),True))
            check('valores de texto ya no se muestran vacíos',lambda:same(page.evaluate("""(()=>{const els=window.__IFC_PROPS.elements;let empty=0;for(const el of els)for(const g of el.groups)for(const e of g.entries){if(e.value.kind!=='null'&&e.value.display==='')empty++;}return empty;})()"""),0))
            check('sin errores JS',lambda:same(report['page_errors'],[]))
except Exception as e:failed=True;report['failure']=str(e);traceback.print_exc()
finally:
    server.shutdown();server.server_close();(OUT/'smoke-properties-v21.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
sys.exit(1 if failed else 0)