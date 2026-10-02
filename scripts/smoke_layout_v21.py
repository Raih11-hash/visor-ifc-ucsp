"""smoke_layout_v21.py — TDD de navegación directa y layout adaptable (v2.1).

Contrato de IDs que este smoke exige (y que el layout debe ofrecer):
  Lateral con tabs directos : #nav-models #nav-workspace #nav-tree #nav-views
  Paneles (siempre montados): #pane-models #pane-workspace #pane-tree #pane-views
  Contenido del padre       : #workspace-v2 (dentro de #pane-workspace)
  Plegado / ancho lateral   : #sidebar-toggle  #sidebar-resizer
  Panel propiedades plegable: #panel-propiedades  #toggle-properties
  Acceso en cabecera        : #header-nav-models #header-nav-workspace #header-nav-views
                              #toggle-presentation

Patrón: servidor efímero sobre dist/ + Playwright Chromium (igual que smoke_v2.py).
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys

from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = (os.getenv('IFC_TEST_URL') or f'http://127.0.0.1:{server.server_port}/') + '?test=1'

browsers = []
results = {'tests': [], 'page_errors': []}
failed = False


def check(name, fn):
    fn()
    results['tests'].append({'name': name, 'passed': True})
    print('PASS', name, flush=True)


def assert_equal(actual, expected):
    assert actual == expected, f'{actual!r} != {expected!r}'


def assert_true(actual, message):
    assert actual, message


def launch(p, viewport):
    candidates = list((pathlib.Path.home() / 'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
    executable = os.getenv('CHROME_PATH') or (str(sorted(candidates)[-1]) if candidates else None)
    args = ['--enable-unsafe-swiftshader']
    if executable:
        return p.chromium.launch(headless=True, args=args, executable_path=executable)
    return p.chromium.launch(headless=True, args=args)


try:
    with sync_playwright() as p:
        # ---------- Escritorio ----------
        browser = launch(p, None)
        browsers.append(browser)
        context = browser.new_context(viewport={'width': 1600, 'height': 1050})
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on('pageerror', lambda e: results['page_errors'].append(str(e)))
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_function('document.documentElement.dataset.appState === "ready"', timeout=90000)

        check('canvas único', lambda: expect(page.locator('canvas')).to_have_count(1))

        # Contrato de navegación directa presente.
        for nav in ['#nav-models', '#nav-workspace', '#nav-tree', '#nav-views']:
            check(f'tab directo {nav}', lambda nav=nav: expect(page.locator(nav)).to_be_visible())
        for hdr in ['#header-nav-models', '#header-nav-workspace', '#header-nav-views', '#toggle-presentation']:
            check(f'acceso cabecera {hdr}', lambda hdr=hdr: expect(page.locator(hdr)).to_be_visible())

        # v2.2: la cabecera de escritorio debe quedar en UNA sola fila, compacta
        # y sin desbordar (antes se apilaba en dos líneas).
        header_row = page.evaluate('''()=>{const sels=['.brand','#header-nav','#work-status','#quick-session-save','#release-version','#show-help'];const ys=sels.map(s=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();return (r.top+r.bottom)/2;});const h=document.querySelector('.app-header');return {spread:Math.max(...ys)-Math.min(...ys), height:h.getBoundingClientRect().height, overflow:h.scrollWidth-h.clientWidth};}''')
        results['header_row'] = header_row
        check('cabecera de escritorio en una sola fila', lambda: assert_true(header_row['spread'] <= 24, f"dispersión vertical {header_row['spread']:.1f}px"))
        check('cabecera de escritorio sin desbordamiento', lambda: assert_true(header_row['overflow'] <= 1, f"desborda {header_row['overflow']}px"))
        check('cabecera de escritorio compacta (<=72px)', lambda: assert_true(header_row['height'] <= 72, f"alto {header_row['height']:.1f}px"))

        # Tamaño mínimo de controles en escritorio (>=36px).
        box = page.locator('#nav-models').bounding_box()
        check('controles escritorio >=36px', lambda: assert_true(box and box['height'] >= 36, f'altura {box}'))

        # Sección inicial: Modelos. El panel del padre existe pero oculto.
        check('sección inicial Modelos', lambda: expect(page.locator('#pane-models')).to_be_visible())
        check('información oculta al inicio', lambda: expect(page.locator('#workspace-v2')).to_be_hidden())
        check('panel del padre montado aunque oculto', lambda: assert_equal(page.locator('#workspace-v2').count(), 1))

        # Identidad: NO se recrean instancias al cambiar de sección.
        page.evaluate('()=>{window.__wsRef=document.querySelector("#workspace-v2");window.__cvRef=document.querySelector("canvas");window.__lateralRef=document.querySelector("#lab-sidebar");}')
        page.locator('#nav-workspace').click()
        check('Información visible al pulsar tab', lambda: expect(page.locator('#workspace-v2')).to_be_visible())
        page.locator('#nav-tree').click()
        check('Árbol visible', lambda: expect(page.locator('#pane-tree')).to_be_visible())
        page.locator('#nav-views').click()
        check('Vistas visible', lambda: expect(page.locator('#pane-views')).to_be_visible())
        page.locator('#nav-models').click()
        check('Modelos de vuelta visible', lambda: expect(page.locator('#pane-models')).to_be_visible())
        check('mismo canvas tras cambiar secciones', lambda: assert_true(page.evaluate('window.__cvRef===document.querySelector("canvas")'), 'canvas recreado'))
        check('mismo panel del padre tras cambiar secciones', lambda: assert_true(page.evaluate('window.__wsRef===document.querySelector("#workspace-v2")'), 'panel recreado'))
        check('mismo lateral tras cambiar secciones', lambda: assert_true(page.evaluate('window.__lateralRef===document.querySelector("#lab-sidebar")'), 'lateral recreado'))

        # Plegado del lateral.
        page.locator('#sidebar-toggle').click()
        check('lateral plegado', lambda: assert_true(page.evaluate('document.querySelector("#lab-sidebar").classList.contains("is-collapsed")'), 'sin clase is-collapsed'))
        check('plegado anuncia estado', lambda: assert_equal(page.locator('#sidebar-toggle').get_attribute('aria-expanded'), 'false'))
        page.locator('#sidebar-toggle').click()
        check('lateral desplegado', lambda: assert_equal(page.locator('#sidebar-toggle').get_attribute('aria-expanded'), 'true'))

        # Ancho ajustable por teclado (resizer accesible).
        page.evaluate('()=>{window.__w0=parseFloat(getComputedStyle(document.querySelector("#lab-sidebar")).width);}')
        page.locator('#sidebar-resizer').focus()
        page.keyboard.press('ArrowRight')
        check('ancho lateral ajustable con teclado', lambda: assert_true(page.evaluate('parseFloat(getComputedStyle(document.querySelector("#lab-sidebar")).width)>window.__w0+4'), 'el ancho no aumentó'))
        check('resizer anuncia valor', lambda: assert_true(page.locator('#sidebar-resizer').get_attribute('aria-valuenow') not in (None, ''), 'sin aria-valuenow'))

        # Modo presentación reversible.
        page.locator('#toggle-presentation').click()
        check('presentación oculta el lateral', lambda: expect(page.locator('#lab-sidebar')).to_be_hidden())
        check('presentación anuncia estado', lambda: assert_equal(page.locator('#toggle-presentation').get_attribute('aria-pressed'), 'true'))
        page.wait_for_function('document.querySelector("canvas").getBoundingClientRect().width > 1200', timeout=10000)
        canvas_w = page.evaluate('document.querySelector("canvas").getBoundingClientRect().width')
        check('canvas amplio en presentación', lambda: assert_true(canvas_w > 1200, f'canvas {canvas_w}px'))
        page.locator('#toggle-presentation').click()
        check('regreso de presentación restaura lateral', lambda: expect(page.locator('#lab-sidebar')).to_be_visible())
        check('mismo canvas tras presentación', lambda: assert_true(page.evaluate('window.__cvRef===document.querySelector("canvas")'), 'canvas recreado en presentación'))

        # Propiedades plegables.
        page.wait_for_function('document.querySelector("canvas").getBoundingClientRect().width < 1200')
        before_properties=page.evaluate('document.querySelector("canvas").getBoundingClientRect().width')
        page.locator('#toggle-properties').click()
        page.wait_for_function('(before)=>document.querySelector("canvas").getBoundingClientRect().width>before+150',arg=before_properties)
        check('plegar propiedades libera espacio al 3D', lambda: assert_true(page.evaluate('document.querySelector("canvas").getBoundingClientRect().width')>before_properties+150,'plegar mantiene una columna vacía'))
        check('propiedades plegadas', lambda: assert_true(page.evaluate('document.querySelector("#panel-propiedades").classList.contains("is-collapsed")'), 'sin clase is-collapsed'))
        check('propiedades plegadas anuncian estado', lambda: assert_equal(page.locator('#toggle-properties').get_attribute('aria-expanded'), 'false'))
        page.locator('#toggle-properties').click()
        check('propiedades desplegadas', lambda: assert_equal(page.locator('#toggle-properties').get_attribute('aria-expanded'), 'true'))

        check('sin errores JS en escritorio', lambda: assert_equal(results['page_errors'], []))
        browser.close()

        # ---------- Móvil (<=800) ----------
        browser = launch(p, None)
        browsers.append(browser)
        mctx = browser.new_context(viewport={'width': 390, 'height': 800}, has_touch=True)
        mpage = mctx.new_page()
        mpage.set_default_timeout(20000)
        mpage.on('pageerror', lambda e: results['page_errors'].append(str(e)))
        mpage.goto(URL, wait_until='domcontentloaded')
        mpage.wait_for_function('document.documentElement.dataset.appState === "ready"', timeout=90000)

        mpage.wait_for_function('document.querySelector("canvas").getBoundingClientRect().width > 300', timeout=10000)
        check('móvil canvas ancho > 0 sin paneles', lambda: assert_true(mpage.evaluate('document.querySelector("canvas").getBoundingClientRect().width') > 300, 'canvas estrecho'))
        check('móvil ningún panel superpuesto al inicio', lambda: assert_true(mpage.evaluate('!document.body.classList.contains("mobile-panel-sidebar") && !document.body.classList.contains("mobile-panel-properties")'), 'panel abierto al inicio'))

        # Información es el tablero, no propiedades; ambos tienen acceso propio.
        mpage.locator('#header-nav-workspace').click()
        check('móvil Información abre el tablero', lambda: expect(mpage.locator('#workspace-v2')).to_be_visible())
        mpage.locator('#header-nav-properties').click()
        check('móvil propiedades superpuestas', lambda: expect(mpage.locator('#panel-propiedades')).to_be_visible())
        check('móvil lateral oculto con propiedades', lambda: expect(mpage.locator('#lab-sidebar')).to_be_hidden())
        # Abrir lateral → se cierra propiedades.
        mpage.locator('#header-nav-models').click()
        check('móvil lateral superpuesto', lambda: expect(mpage.locator('#lab-sidebar')).to_be_visible())
        check('móvil propiedades ocultas con lateral', lambda: expect(mpage.locator('#panel-propiedades')).to_be_hidden())
        mbox = mpage.locator('#nav-models').bounding_box()
        check('móvil controles >=44px', lambda: assert_true(mbox and mbox['height'] >= 44, f'altura {mbox}'))
        # Cerrar → canvas ancho.
        mpage.locator('#sidebar-toggle').click()
        mpage.wait_for_function('document.querySelector("canvas").getBoundingClientRect().width > 300', timeout=10000)
        check('móvil cerrar deja canvas ancho', lambda: assert_true(mpage.evaluate('document.querySelector("canvas").getBoundingClientRect().width') > 300, 'canvas estrecho al cerrar'))
        check('móvil sin panel tras cerrar', lambda: assert_true(mpage.evaluate('!document.body.classList.contains("mobile-panel-sidebar") && !document.body.classList.contains("mobile-panel-properties")'), 'panel abierto tras cerrar'))

        mpage.screenshot(path=str(OUT / 'layout-v21-movil.png'), full_page=True)
        check('sin errores JS en móvil', lambda: assert_equal(results['page_errors'], []))
        browser.close()
except Exception as e:
    failed = True
    results['failure'] = str(e)
    print(traceback.format_exc(), flush=True)
finally:
    for browser in browsers:
        try:
            browser.close()
        except Exception:
            pass
    server.shutdown()
    server.server_close()
    (OUT / 'smoke-layout-v21.json').write_text(json.dumps(results, indent=2), encoding='utf8')
    print(json.dumps(results, indent=2), flush=True)
if failed:
    sys.exit(1)