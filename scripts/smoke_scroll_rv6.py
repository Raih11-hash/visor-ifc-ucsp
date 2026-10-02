"""Regresión de scroll en propiedades expandidas, IFC real.

Adaptado al inspector propio (RV9): el árbol vive en `#panel-propiedades-body`
como `.ifc-props-*`; conserva las mismas garantías de scroll desktop/móvil,
último campo visible y cámara intacta.
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
            page.evaluate('window.__IFC_TEST.workspace.select(window.__IFC_TEST.workspace.records)')
            page.wait_for_function('window.__IFC_PROPS.elements.length===13&&!window.__IFC_PROPS.loading',timeout=90000)
            page.evaluate("document.querySelectorAll('#panel-propiedades-body .ifc-props-group').forEach(d=>d.open=true)")
            page.wait_for_timeout(1000)
            print('GROUPS',page.locator('#panel-propiedades-body .ifc-props-group').count(),flush=True)
            check('el árbol renderiza los 13 elementos',lambda:same(page.locator('#panel-propiedades-body .ifc-props-element').count(),13))
            selector='#panel-propiedades-body'
            body=page.locator(selector)
            check('panel derecho queda dentro de pantalla y tiene recorrido de scroll',lambda:same(body.evaluate('(b)=>b.getBoundingClientRect().bottom<=innerHeight+1&&b.scrollHeight>b.clientHeight+1'),True))
            report['desktop_geometry']=body.evaluate('(b)=>({clientHeight:b.clientHeight,scrollHeight:b.scrollHeight,top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom})')
            page.evaluate('window.__cameraBeforeScroll=JSON.stringify(window.__IFC_TEST.world.camera.three.position.toArray())')
            def wheel_to_end():
                rect=body.bounding_box();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2);page.mouse.wheel(0,50000)
                page.wait_for_function('(()=>{const b=document.querySelector("#panel-propiedades-body");return b.scrollTop+b.clientHeight>=b.scrollHeight-2;})()')
            wheel_to_end()
            check('rueda llega al fondo real de propiedades',lambda:same(body.evaluate('(b)=>b.scrollTop>0&&b.scrollTop+b.clientHeight>=b.scrollHeight-2'),True))
            last=page.locator('#panel-propiedades-body .ifc-props-row').last
            check('último campo del árbol visible dentro del panel',lambda:same(last.evaluate('(r)=>{const b=document.querySelector("#panel-propiedades-body").getBoundingClientRect(),q=r.getBoundingClientRect();return q.top>=b.top-1&&q.bottom<=b.bottom+1;}'),True))
            check('scroll en propiedades no cambia cámara 3D',lambda:same(page.evaluate('JSON.stringify(window.__IFC_TEST.world.camera.three.position.toArray())===window.__cameraBeforeScroll'),True))
            page.screenshot(path=str(OUT/'scroll-properties-rv6-desktop.png'),full_page=True)
            page.locator('#toggle-properties').click();page.locator('#toggle-properties').click();page.wait_for_timeout(200)
            check('plegar y abrir conserva selección y datos',lambda:same(page.evaluate('window.__IFC_PROPS.elements.length'),13))
            page.set_viewport_size({'width':390,'height':844});page.locator('#header-nav-properties').click();page.wait_for_timeout(200)
            body.evaluate('(b)=>b.scrollTop=0');wheel_to_end()
            check('scroll móvil llega al fondo',lambda:same(body.evaluate('(b)=>b.scrollTop+b.clientHeight>=b.scrollHeight-2'),True))
            check('último campo visible en móvil',lambda:same(last.evaluate('(r)=>{const b=document.querySelector("#panel-propiedades-body").getBoundingClientRect(),q=r.getBoundingClientRect();return q.top>=b.top-1&&q.bottom<=b.bottom+1&&b.bottom<=innerHeight+1;}'),True))
            check('sin errores JS',lambda:same(report['page_errors'],[]))
            page.screenshot(path=str(OUT/'scroll-properties-rv6-mobile.png'),full_page=True)
except Exception as e:failed=True;report['failure']=str(e);traceback.print_exc()
finally:
    server.shutdown();server.server_close();(OUT/'smoke-scroll-rv6.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
sys.exit(1 if failed else 0)