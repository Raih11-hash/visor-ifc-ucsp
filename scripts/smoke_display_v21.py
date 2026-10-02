"""Regresión real de controles de cuadrícula y marca del viewport."""
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
            check('control cuadrícula visible y nombrado',lambda:expect(page.locator('#viewport-grid-toggle')).to_have_text('Ocultar cuadrícula'))
            check('marca ocultada por API del renderer',lambda:same(page.evaluate('window.__IFC_TEST.world.renderer.showLogo'),False))
            check('marca DOM realmente oculta',lambda:expect(page.locator('[data-thatopen-logo]')).to_be_hidden())
            check('marca puede volver a mostrarse',lambda:expect(page.locator('#viewport-logo-toggle')).to_have_text('Mostrar marca'))
            page.locator('bim-button[label="Cargar ejemplo"]').click();page.wait_for_function('document.querySelector("#catalog-total").textContent==="13"&&document.querySelector("#workspace-v2").dataset.indexState==="ready"',timeout=90000)
            page.evaluate('window.__savedCanvas=document.querySelector("canvas");window.__savedCamera=window.__IFC_TEST.world.camera;')
            page.locator('#viewport-grid-toggle').click()
            check('cuadrícula 3D realmente oculta',lambda:same(page.evaluate('window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.Grids).list.get(window.__IFC_TEST.world.uuid).visible'),False))
            check('botón anuncia cuadrícula desactivada',lambda:expect(page.locator('#viewport-grid-toggle')).to_have_attribute('aria-pressed','false'))
            check('acción cambia a mostrar cuadrícula',lambda:expect(page.locator('#viewport-grid-toggle')).to_have_text('Mostrar cuadrícula'))
            check('menú de ajustes sincronizado con botón',lambda:same(page.evaluate('document.querySelector("#viewport-grid-checkbox").checked'),False))
            page.locator('#viewport-grid-toggle').click()
            check('cuadrícula se puede recuperar',lambda:same(page.evaluate('window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.Grids).list.get(window.__IFC_TEST.world.uuid).visible'),True))
            page.evaluate('(()=>{const c=document.querySelector("#viewport-grid-checkbox");c.checked=false;c.dispatchEvent(new Event("change"));})()')
            check('checkbox de ajustes también cambia cuadrícula real',lambda:same(page.evaluate('window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.Grids).list.get(window.__IFC_TEST.world.uuid).visible'),False))
            check('checkbox sincroniza botón directo',lambda:expect(page.locator('#viewport-grid-toggle')).to_have_text('Mostrar cuadrícula'))
            page.locator('#viewport-grid-toggle').click()
            page.locator('#viewport-logo-toggle').click()
            check('marca se puede activar',lambda:same(page.evaluate('window.__IFC_TEST.world.renderer.showLogo'),True))
            check('marca visible en DOM',lambda:expect(page.locator('[data-thatopen-logo]')).to_be_visible())
            page.locator('#viewport-logo-toggle').click()
            check('marca vuelve a ocultarse',lambda:expect(page.locator('[data-thatopen-logo]')).to_be_hidden())
            check('no se recrea canvas o cámara',lambda:same(page.evaluate('document.querySelector("canvas")===window.__savedCanvas&&window.__IFC_TEST.world.camera===window.__savedCamera'),True))
            check('modelo no cambia por opciones visuales',lambda:expect(page.locator('#catalog-total')).to_have_text('13'))
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
            check('controles móvil son accionables',lambda:same(page.locator('#viewport-grid-toggle').evaluate('(b)=>{const r=b.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth;}'),True))
            page.locator('#viewport-grid-toggle').click();page.locator('#viewport-logo-toggle').click();page.locator('#viewport-logo-toggle').click()
            check('sin errores JS en controles',lambda:same(report['page_errors'],[]))
            page.screenshot(path=str(OUT/'display-v21-mobile.png'),full_page=True)
except Exception as e:failed=True;report['failure']=str(e);traceback.print_exc()
finally:
    server.shutdown();server.server_close();(OUT/'smoke-display-v21.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
sys.exit(1 if failed else 0)
