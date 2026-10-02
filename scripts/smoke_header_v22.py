"""smoke_header_v22.py — Cabecera compacta de una fila en escritorio (v2.2).

Contrato que exige (y que el layout debe ofrecer):
  Estructura   : .app-header > .brand + .header-actions
                 .header-actions contiene #header-nav (inyectado por
                 src/ui/layout-controls.ts) + #work-status +
                 #quick-session-save + .local-badge + #release-version +
                 #show-help.
  Escritorio   : UNA sola fila visual (marca | navegación | estado/guardar/
                 versión/guía), sin solapes ni desbordamiento horizontal, en
                 1920, 1366, 1280, 1200 y 1024 px. La insignia `.local-badge`
                 es decorativa: puede ocultarse en anchos estrechos, pero los
                 seis controles funcionales siempre están visibles.
  Móvil/estrecho (<=800): controles accesibles, sin solapes que intercepten
                 clics; paneles superpuestos no bloquean la cabecera.
  Estados      : mensaje de error, estado de carga y nombre de archivo largo
                 no rompen la fila ni desbordan la cabecera.

Patrón: servidor efímero sobre dist/ + Playwright Chromium (igual que el
resto de smokes). Deriva la versión esperada de package.json.

Uso:
  uv run --no-project --python 3.11 --with playwright python scripts/smoke_header_v22.py
Variables:
  IFC_TEST_URL         base URL (por defecto servidor efímero sobre dist/).
  IFC_SMOKE_OUT        archivo JSON de salida (por defecto smoke-header-v22.json).
  IFC_HEADER_BASELINE  JSON RED previo para medir el canvas ganado.
  CHROME_PATH          ejecutable de Chromium.
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys

from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf8'))['version']

# Controles que deben compartir la fila en escritorio. `required=True` salvo la
# insignia local (decorativa: puede ocultarse en anchos estrechos).
ROW_ELEMENTS = [
    ('.brand', 'marca', True),
    ('#header-nav', 'navegación', True),
    ('#work-status', 'estado', True),
    ('#quick-session-save', 'guardar', True),
    ('.local-badge', 'insignia local', False),
    ('#release-version', 'versión', True),
    ('#show-help', 'guía', True),
]
# Regiones de nivel superior que no deben solaparse horizontalmente.
GROUPS = [('.brand', 'marca'), ('.header-actions', 'acciones')]
ROW_TOLERANCE = 24  # px entre centros verticales para considerarse una fila


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist'))
)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = (os.getenv('IFC_TEST_URL') or f'http://127.0.0.1:{server.server_port}/') + '?test=1'

browsers = []
results = {'version': VERSION, 'tests': [], 'page_errors': [], 'geometry': {}}
failed = False


def check(name, fn):
    """Ejecuta una comprobación sin abortar: registra PASS/FAIL y continúa.

    Así la corrida RED mide la geometría de todas las ventanas aunque alguna
    aserción falle (base para medir el canvas ganado)."""
    global failed
    try:
        fn()
        results['tests'].append({'name': name, 'passed': True})
        print('PASS', name, flush=True)
    except Exception as e:
        failed = True
        results['tests'].append({'name': name, 'passed': False, 'error': str(e)})
        print('FAIL', name, '—', e, flush=True)


def assert_equal(actual, expected):
    assert actual == expected, f'{actual!r} != {expected!r}'


def assert_true(actual, message):
    assert actual, message


def launch(p):
    candidates = list((pathlib.Path.home() / 'AppData/Local/ms-playwright')
                      .glob('chromium-*/chrome-win64/chrome.exe'))
    executable = os.getenv('CHROME_PATH') or (str(sorted(candidates)[-1]) if candidates else None)
    args = ['--enable-unsafe-swiftshader']
    if executable:
        return p.chromium.launch(headless=True, args=args, executable_path=executable)
    return p.chromium.launch(headless=True, args=args)


HEADER_METRICS_JS = """
(elements) => {
  const header = document.querySelector('.app-header');
  const hb = header.getBoundingClientRect();
  const items = elements.map(([sel, label, required]) => {
    const el = document.querySelector(sel);
    if (!el) return {sel, label, required, missing: true};
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {sel, label, required, top: r.top, bottom: r.bottom, left: r.left, right: r.right,
            centerY: (r.top + r.bottom) / 2, width: r.width, height: r.height,
            visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'};
  });
  const groups = '%GROUPS%'.split('|').filter(Boolean).map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return {sel, missing: true};
    const r = el.getBoundingClientRect();
    return {sel, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width};
  });
  return {
    header: {height: hb.height, top: hb.top, bottom: hb.bottom, left: hb.left, right: hb.right,
             scrollWidth: header.scrollWidth, clientWidth: header.clientWidth,
             scrollHeight: header.scrollHeight, clientHeight: header.clientHeight},
    items, groups,
    docScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    canvas: (() => { const c = document.querySelector('canvas'); if (!c) return null;
                     const r = c.getBoundingClientRect();
                     return {width: r.width, height: r.height, top: r.top, bottom: r.bottom}; })(),
  };
}
""".replace('%GROUPS%', '|'.join(sel for sel, _ in GROUPS))


def metrics(page):
    return page.evaluate(HEADER_METRICS_JS, [[s, l, r] for s, l, r in ROW_ELEMENTS])


def hit_test(page, sel):
    return page.evaluate(
        '(sel)=>{const el=document.querySelector(sel);const r=el.getBoundingClientRect();'
        'const n=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'
        'return !!(n&&(n===el||el.contains(n)||n.contains(el)));}', sel)


def overlap(a, b):
    return not (a['right'] <= b['left'] or b['right'] <= a['left'])


def assert_row(page, tag, max_spread=ROW_TOLERANCE):
    m = metrics(page)
    results['geometry'][tag] = m
    missing = [it['label'] for it in m['items'] if it['required'] and not it.get('visible')]
    assert_true(not missing, f'{tag}: faltan controles obligatorios {missing}')
    vis = [it for it in m['items'] if it.get('visible')]
    centers = [it['centerY'] for it in vis]
    spread = (max(centers) - min(centers)) if centers else 999
    assert_true(spread <= max_spread,
                f'{tag}: controles en {spread:.1f}px de dispersión vertical (fila única exige <= {max_spread})')
    # Sin desbordamiento horizontal de la cabecera ni de la página.
    assert_true(m['header']['scrollWidth'] <= m['header']['clientWidth'] + 1,
                f"{tag}: cabecera desborda {m['header']['scrollWidth']}>{m['header']['clientWidth']}")
    assert_true(m['docScrollX'] <= 1, f"{tag}: página con scroll horizontal {m['docScrollX']}px")
    # Regiones de nivel superior sin solape horizontal.
    groups = [g for g in m['groups'] if not g.get('missing')]
    for i in range(len(groups)):
        for j in range(i + 1, len(groups)):
            assert_true(not overlap(groups[i], groups[j]),
                        f"{tag}: solape {groups[i]['sel']} / {groups[j]['sel']}")
    # Dentro de las acciones, la navegación no invade el estado si comparten fila.
    by_sel = {it['sel']: it for it in m['items'] if it.get('visible')}
    if '#header-nav' in by_sel and '#work-status' in by_sel:
        nav, status = by_sel['#header-nav'], by_sel['#work-status']
        if abs(nav['centerY'] - status['centerY']) <= max_spread:
            assert_true(nav['right'] <= status['left'] + 1,
                        f"{tag}: navegación invade el estado ({nav['right']}>{status['left']})")
    # Cada control responde al punto real (sin interferencia de clics).
    for it in vis:
        assert_true(hit_test(page, it['sel']),
                    f"{tag}: {it['label']} ({it['sel']}) no recibe el clic en su centro")
    return m


def assert_panel_does_not_cover_header(page, tag):
    r = page.evaluate(
        """()=>{const h=document.querySelector('.app-header').getBoundingClientRect();
        const p=document.querySelector('#lab-sidebar').getBoundingClientRect();
        return {headerBottom:h.bottom, panelTop:p.top, covered: !(p.top>=h.bottom-1)};}""")
    assert_true(not r['covered'], f'{tag}: el panel superpuesto tapa la cabecera {r}')
    for sel in ('#header-nav-models', '#quick-session-save', '#show-help'):
        assert_true(hit_test(page, sel), f'{tag}: {sel} interceptado con el panel abierto')


def load_ready(page):
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('document.documentElement.dataset.appState === "ready"', timeout=90000)


try:
    with sync_playwright() as p:
        # ---------- Escritorio: una fila en 1920 / 1366 / 1024 ----------
        browser = launch(p)
        browsers.append(browser)
        for w, h, tag in [(1920, 1080, 'desktop-1920'), (1366, 768, 'desktop-1366'),
                          (1280, 800, 'desktop-1280'), (1200, 800, 'desktop-1200'), (1024, 768, 'desktop-1024')]:
            context = browser.new_context(viewport={'width': w, 'height': h})
            page = context.new_page()
            page.set_default_timeout(20000)
            page.on('pageerror', lambda e: results['page_errors'].append(str(e)))
            load_ready(page)
            check(f'{tag}: cabecera en una sola fila', lambda page=page, tag=tag: assert_row(page, tag))
            check(f'{tag}: versión visible coherente con paquete',
                  lambda page=page: expect(page.locator('#release-version')).to_have_text('v' + VERSION, timeout=10000))
            check(f'{tag}: canvas ocupa el alto liberado',
                  lambda page=page, tag=tag: assert_true(
                      results['geometry'][tag]['canvas'] and results['geometry'][tag]['canvas']['height'] > 0,
                      f'{tag}: sin canvas'))
            if tag == 'desktop-1920':
                page.screenshot(path=str(OUT / 'header-v22-desktop-1920.png'))
            if tag == 'desktop-1024':
                page.screenshot(path=str(OUT / 'header-v22-desktop-1024.png'))
            context.close()

        # ---------- Estados: error / carga / nombre largo ----------
        context = browser.new_context(viewport={'width': 1366, 'height': 768})
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on('pageerror', lambda e: results['page_errors'].append(str(e)))

        # Nombre de archivo largo en el aviso (feedback) + sesión larga.
        load_ready(page)
        long_name = 'modelo_edificio_sede_central_revision_final_2026_' + ('x' * 90) + '.ifc'
        page.evaluate(
            '(name)=>{const f=document.getElementById("feedback");f.textContent="Modelo listo: "+name;f.hidden=false;f.dataset.kind="info";}',
            long_name)
        check('nombre largo: cabecera sigue en una fila',
              lambda page=page: assert_row(page, 'estado-nombre-largo'))
        check('nombre largo: aviso sin scroll horizontal de página',
              lambda page=page: assert_true(
                  page.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth') <= 1,
                  'la página desborda con nombre largo'))

        # Estado de error visible.
        page.evaluate(
            '()=>{const f=document.getElementById("feedback");f.textContent="Error: no se pudo abrir el archivo (integridad)";f.hidden=false;f.dataset.kind="error";document.documentElement.dataset.appState="error";}')
        check('estado error: cabecera sigue en una fila',
              lambda page=page: assert_row(page, 'estado-error'))
        page.screenshot(path=str(OUT / 'header-v22-estado-error.png'))

        # Estado de carga (antes de ready).
        page.evaluate('()=>{document.documentElement.dataset.appState="loading";}')
        check('estado carga: cabecera sigue en una fila',
              lambda page=page: assert_row(page, 'estado-carga'))
        context.close()

        # ---------- Móvil / estrecho: accesibles, sin solapes ----------
        for w, h, tag in [(390, 844, 'movil-390'), (800, 900, 'estrecho-800')]:
            context = browser.new_context(viewport={'width': w, 'height': h}, has_touch=True)
            page = context.new_page()
            page.set_default_timeout(20000)
            page.on('pageerror', lambda e: results['page_errors'].append(str(e)))
            load_ready(page)
            m = metrics(page)
            results['geometry'][tag] = m
            for sel, label in [('#header-nav-models', 'nav modelos'), ('#header-nav-workspace', 'nav información'),
                               ('#header-nav-views', 'nav vistas'), ('#quick-session-save', 'guardar'),
                               ('#show-help', 'guía'), ('#work-status', 'estado')]:
                check(f'{tag}: {label} visible', lambda sel=sel, page=page: expect(page.locator(sel)).to_be_visible())
            check(f'{tag}: cabecera sin desbordamiento horizontal',
                  lambda m=m, tag=tag: assert_true(m['header']['scrollWidth'] <= m['header']['clientWidth'] + 1,
                                                   f"{tag}: desborda {m['header']['scrollWidth']}>{m['header']['clientWidth']}"))
            check(f'{tag}: página sin scroll horizontal',
                  lambda m=m: assert_true(m['docScrollX'] <= 1, f"scroll horizontal {m['docScrollX']}px"))
            # Ningún control de cabecera interceptado por otro.
            for sel, label in [('#header-nav-models', 'nav modelos'), ('#quick-session-save', 'guardar'),
                               ('#show-help', 'guía')]:
                hit = page.evaluate(
                    '(sel)=>{const el=document.querySelector(sel);const r=el.getBoundingClientRect();'
                    'const n=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'
                    'return !!(n&&(n===el||el.contains(n)||n.contains(el)));}', sel)
                check(f'{tag}: {label} recibe el clic', lambda hit=hit, label=label: assert_true(hit, f'{label} interceptado'))
            # Guardar/guía accesibles y con área táctil >= 44px.
            for sel, label in [('#quick-session-save', 'guardar'), ('#show-help', 'guía')]:
                b = page.locator(sel).bounding_box()
                check(f'{tag}: {label} área táctil >= 44px',
                      lambda b=b, label=label: assert_true(b and b['height'] >= 44, f'{label} altura {b}'))
            # Panel superpuesto no bloquea la cabecera.
            page.locator('#header-nav-workspace').click()
            page.wait_for_timeout(150)
            check(f'{tag}: panel superpuesto no tapa la cabecera',
                  lambda page=page, tag=tag: assert_panel_does_not_cover_header(page, tag))
            page.screenshot(path=str(OUT / f'header-v22-{tag}.png'))
            context.close()

        check('sin errores JS', lambda: assert_equal(results['page_errors'], []))
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

    # Comparación contra la base RED: alto de canvas realmente ganado.
    baseline_path = os.getenv('IFC_HEADER_BASELINE')
    if baseline_path and pathlib.Path(baseline_path).exists():
        base = json.loads(pathlib.Path(baseline_path).read_text(encoding='utf8'))
        gains = {}
        for tag in ('desktop-1920', 'desktop-1366', 'desktop-1280', 'desktop-1200', 'desktop-1024'):
            b = base.get('geometry', {}).get(tag)
            g = results['geometry'].get(tag)
            if not b or not g or not b.get('canvas') or not g.get('canvas'):
                continue
            gains[tag] = {
                'header_height_base': round(b['header']['height'], 1),
                'header_height_green': round(g['header']['height'], 1),
                'header_saved': round(b['header']['height'] - g['header']['height'], 1),
                'canvas_height_base': round(b['canvas']['height'], 1),
                'canvas_height_green': round(g['canvas']['height'], 1),
                'canvas_gained': round(g['canvas']['height'] - b['canvas']['height'], 1),
            }
        results['canvas_gain_vs_red'] = gains
        for tag in ('desktop-1366', 'desktop-1024'):
            check(f'canvas gana alto contra la base RED en {tag}',
                  lambda tag=tag: assert_true(gains.get(tag, {}).get('canvas_gained', -1) > 0,
                                              f"sin ganancia: {gains.get(tag)}"))

    out_path = pathlib.Path(os.getenv('IFC_SMOKE_OUT') or (OUT / 'smoke-header-v22.json'))
    if not out_path.is_absolute():
        out_path = OUT / out_path
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
if failed:
    sys.exit(1)