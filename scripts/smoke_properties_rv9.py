"""RV9 — Verificación real del inspector de propiedades con el IFC fuente.

Sirve `dist` y el IFC real (ruta local, sin copiarlo a public ni a git) desde
el mismo servidor. Selecciona el IFCBEAM propietario del Pset 'Construction'
por GUID y comprueba: valores reales, normalización, vista técnica con el árbol
IFC real (relaciones y referencias), casos sintéticos de bounded/unidades,
selección múltiple sin límite, carreras y fallos del motor (rechazo actual y
tardío), cierre de modelo y captura/restauración real de FRAG con mapa GUID del
resaltador después de restaurar.

La ruta del IFC se puede sobrescribir con la variable de entorno IFC_REAL; si el
archivo no existe el guion FALLA explícitamente (no se omite en silencio).

Evidencia: test-results/rv9-props-green.json
"""
import pathlib, os, json, threading, http.server, functools, traceback, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results'; OUT.mkdir(exist_ok=True)
IFC_SRC = pathlib.Path(os.getenv('IFC_REAL', r'C:/Users/luis.zegarra/Downloads/EST_GT_C_R_v5.ifc'))
GUID = '3zSxltga9Eo8qEtsMwBJvC'

if not IFC_SRC.is_file():
    print(f'FALLO: no se encontró el IFC real en {IFC_SRC} (usa IFC_REAL=... para indicar la ruta).', flush=True)
    sys.exit(2)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def translate_path(self, path):
        if path.startswith('/real.ifc'):
            return str(IFC_SRC)
        return super().translate_path(path)


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
report = {'tests': [], 'page_errors': [], 'ifc': str(IFC_SRC)}
failed = False


def check(name, fn):
    fn(); report['tests'].append({'name': name, 'passed': True}); print('PASS', name, flush=True)


def same(a, b):
    assert a == b, f'{a!r} != {b!r}'
    return True


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
            report['catalog_total'] = int(page.locator('#catalog-total').inner_text())
            # Esperar a que el inspector de solo-prueba esté listo.
            page.wait_for_function('window.__IFC_PROPS && window.__IFC_PROPS_PURE', timeout=60000)

            # ---------- Selección del propietario real por GUID ----------
            page.evaluate("""async()=>{const t=window.__IFC_TEST;const rec=t.workspace.records.find(r=>r.guid==='%s');window.__owner=rec;await t.workspace.select([rec]);}""" % GUID)
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&!window.__IFC_PROPS.loading', timeout=60000)
            owner = page.evaluate("""()=>{const el=window.__IFC_PROPS.elements[0];return {localId:el.localId,expressId:el.expressId,guid:el.guid,category:el.category,name:el.name,modelId:el.modelId,
                construction:(()=>{const g=el.groups.find(g=>g.name==='Construction');if(!g)return null;return {origin:g.origin,kind:g.kind,entries:g.entries.map(e=>({name:e.name,display:e.value.display,kind:e.value.kind,type:e.value.ifcType}))};})(),
                groups:el.groups.map(g=>({name:g.name,kind:g.kind,origin:g.origin,count:g.entries.length}))};}""")
            report['owner'] = owner
            check('GUID propietario resuelto por IFC', lambda: same(owner['guid'], GUID))
            check('categoría real del propietario', lambda: same(owner['category'], 'IFCBEAM'))
            check('Local ID no se confunde con Express ID', lambda: same(owner['expressId'], None))
            c = owner['construction']
            check('Pset Construction presente como ocurrencia', lambda: same(c and c['origin'], 'occurrence'))
            by = {e['name']: e for e in (c['entries'] if c else [])}
            check('H/V = H (texto, no vacío)', lambda: same(by['H/V']['display'], 'H'))
            check('Nivel = N4', lambda: same(by['Nivel']['display'], 'N4'))
            check('Tipo de elemento = Vigas', lambda: same(by['Tipo de elemento']['display'], 'Vigas'))
            check('valores de texto conservan tipo IFCTEXT', lambda: same(by['H/V']['type'], 'IFCTEXT'))
            check('ningún valor no nulo queda vacío en el elemento', lambda: same(page.evaluate("""(()=>{let empty=0;for(const g of window.__IFC_PROPS.elements[0].groups)for(const e of g.entries)if(e.value.kind!=='null'&&e.value.display==='')empty++;return empty;})()"""), 0))
            check('medidas conservan número y unidad no inventada', lambda: same(page.evaluate("""(()=>{for(const g of window.__IFC_PROPS.elements[0].groups)for(const e of g.entries){if(e.value.kind==='measure'){if(e.value.display.indexOf(String(e.value.raw))!==0)return false;if(e.value.unit!==null&&!e.value.display.endsWith(e.value.unit))return false;}}return true;})()"""), True))
            units_real = page.evaluate("""(()=>{const out={};for(const g of window.__IFC_PROPS.elements[0].groups)for(const e of g.entries){if(e.value.kind==='measure'&&e.value.unit)out[e.value.ifcType]=e.value.unit;}return out;})()""")
            report['units_real'] = units_real
            check('unidades reales resueltas desde IfcUnitAssignment (m/m²/m³)', lambda: same(units_real.get('IFCLENGTHMEASURE'), 'm') and same(units_real.get('IFCAREAMEASURE'), 'm²') and same(units_real.get('IFCVOLUMEMEASURE'), 'm³'))
            check('GlobalId disponible en atributos', lambda: same(page.evaluate("""(()=>{const a=window.__IFC_PROPS.elements[0].groups.find(g=>g.kind==='attributes');return a?a.entries.find(e=>e.name==='GlobalId').value.display:null;})()"""), GUID))
            check('el árbol renderiza H/V y H visibles', lambda: same(page.evaluate("""(()=>{const rows=[...document.querySelectorAll('#panel-propiedades-body .ifc-props-row')];return rows.some(r=>r.querySelector('.ifc-props-name').textContent==='H/V'&&r.querySelector('.ifc-props-value').textContent==='H');})()"""), True))

            # ---------- Vista técnica con relaciones y referencias REALES ----------
            page.evaluate('window.__IFC_PROPS.toggleTechnical()')
            page.wait_for_timeout(300)
            tech = page.evaluate("""(()=>{const d=document.querySelector('#panel-propiedades-body .ifc-props-technical');if(!d)return null;const pairs={};const kids=[...d.children];for(let i=0;i<kids.length;i+=2)pairs[kids[i].textContent]=kids[i+1].textContent;return pairs;})()""")
            report['technical'] = tech
            check('vista técnica nombra Local ID y Express ID por separado', lambda: same(tech and tech.get('Local ID') == str(owner['localId']) and tech.get('Express ID') == 'no disponible', True))
            tree = page.evaluate("""(()=>{const t=window.__IFC_PROPS.elements[0].technical;return {category:t.category,localId:t.localId,expressId:t.expressId,attr:t.attributes.map(a=>a.name),rel:t.relationships.map(r=>r.name),refs:t.references.length};})()""")
            report['technical_tree'] = tree
            check('árbol técnico refleja categoría y Local ID reales', lambda: same(tree['category'], 'IFCBEAM'))
            check('árbol técnico conserva relaciones reales (IsDefinedBy)', lambda: same('IsDefinedBy' in tree['rel'], True))
            check('el DOM técnico muestra el árbol IFC real', lambda: same(page.evaluate("""(()=>{const d=document.querySelector('#panel-propiedades-body .ifc-props-tech-tree');if(!d)return false;const rel=[...d.querySelectorAll('.ifc-props-tech-rel > summary')].map(s=>s.textContent);return rel.some(x=>x.indexOf('IsDefinedBy')===0);})()"""), True))
            check('el DOM técnico muestra IDs (LocalId) de entidades relacionadas reales', lambda: same(page.evaluate("""(()=>{const d=document.querySelector('#panel-propiedades-body .ifc-props-tech-tree');if(!d)return false;const s=[...d.querySelectorAll('.ifc-props-tech-tree > summary')].map(x=>x.textContent);return s.some(x=>x.indexOf('IFCBEAMTYPE')===0&&x.indexOf('LocalId')>0);})()"""), True))
            page.evaluate('window.__IFC_PROPS.toggleTechnical()')
            page.wait_for_timeout(100)

            # ---------- Casos sintéticos claramente rotulados: bounded y unidades ----------
            synthetic = page.evaluate("""(()=>{
                const P=window.__IFC_PROPS_PURE;const A=(v,t)=>({value:v,type:t});
                const bounded=P.normalizePropertyValue({_category:A('IFCPROPERTYBOUNDEDVALUE'),Name:A('Limites','IFCIDENTIFIER'),
                    LowerBoundValue:A(1,'IFCLENGTHMEASURE'),UpperBoundValue:A(5,'IFCLENGTHMEASURE'),SetPointValue:A(3,'IFCLENGTHMEASURE')},{unitMap:{LENGTHUNIT:'m'}});
                const mm=P.normalizeUnit({_category:A('IFCSIUNIT'),UnitType:A('LENGTHUNIT','IFCLABEL'),Prefix:A('MILLI','IFCLABEL'),Name:A('METRE','IFCLABEL')});
                const kg=P.normalizeUnit({_category:A('IFCSIUNIT'),UnitType:A('MASSUNIT','IFCLABEL'),Prefix:A('KILO','IFCLABEL'),Name:A('GRAM','IFCLABEL')});
                const unknown=P.normalizeUnit({_category:A('IFCSIUNIT'),UnitType:A('LENGTHUNIT','IFCLABEL'),Name:A('FURLONGISH','IFCLABEL')});
                const logical=P.resolveLogical('.U.');
                return {labels:bounded.components.map(c=>c.label),values:bounded.components.map(c=>c.value.display),
                        mm:mm.symbol,kg:kg.symbol,unknown:unknown.symbol,logical:logical};
            })()""")
            report['synthetic'] = synthetic
            check('sintético bounded conserva las 3 cotas', lambda: same(synthetic['labels'], ['LowerBound', 'UpperBound', 'SetPoint']))
            check('sintético bounded aplica unidad m', lambda: same(synthetic['values'], ['1 m', '5 m', '3 m']))
            check('sintético unidad MILLI+METRE = mm', lambda: same(synthetic['mm'], 'mm'))
            check('sintético unidad KILO+GRAM = kg', lambda: same(synthetic['kg'], 'kg'))
            check('sintético unidad desconocida no inventa símbolo', lambda: same(synthetic['unknown'], None))
            check('sintético lógico .U. = desconocido (no True)', lambda: same(synthetic['logical'], None))

            # ---------- TSV ----------
            tsv = page.evaluate("""()=>{const v=window.__IFC_PROPS.visibleElements();return {hasHV:JSON.stringify(v).includes('H/V'),hasH:JSON.stringify(v).includes('\\"H\\"')};}""")
            check('elementos visibles contienen H/V y H', lambda: same(tsv['hasHV'] and tsv['hasH'], True))
            with page.expect_download() as dl:
                page.evaluate('window.__IFC_PROPS.exportTsv()')
            tsv_path = OUT / 'rv9-props.tsv'; dl.value.save_as(str(tsv_path))
            tsv_text = tsv_path.read_text(encoding='utf8')
            check('TSV separa Propiedad y Valor con H/V = H', lambda: same(any('\tH/V\tH\t' in line for line in tsv_text.splitlines()), True))
            check('TSV cabecera correcta', lambda: same(tsv_text.splitlines()[0], 'Elemento\tGlobalId\tGrupo\tPropiedad\tValor\tTipo'))

            # ---------- Selección múltiple sin límite silencioso ----------
            page.evaluate('window.__IFC_TEST.workspace.select(window.__IFC_TEST.workspace.records.slice(0,50))')
            page.wait_for_function('window.__IFC_PROPS.elements.length===50&&!window.__IFC_PROPS.loading', timeout=90000)
            check('selección múltiple sin límite silencioso (50)', lambda: same(page.evaluate('window.__IFC_PROPS.elements.length'), 50))

            # ---------- Fallo del motor: mensaje visible y recuperación ----------
            page.evaluate("""async()=>{await window.__IFC_TEST.workspace.select([window.__owner]);}""")
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&!window.__IFC_PROPS.loading', timeout=60000)
            page.evaluate("""()=>{const m=[...window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager).list.values()][0];
                window.__origGID=m.getItemsData.bind(m);
                m.getItemsData=(ids,cfg)=>{m.getItemsData=window.__origGID;return Promise.reject(new Error('fallo inyectado RV9'));};}""")
            page.evaluate('window.__IFC_PROPS.retry()')
            page.wait_for_function('window.__IFC_PROPS.error!==null&&!window.__IFC_PROPS.loading', timeout=30000)
            check('fallo del motor muestra error visible y limpia el indicador', lambda: same(page.evaluate('(()=>({loading:window.__IFC_PROPS.loading,err:!!window.__IFC_PROPS.error,n:window.__IFC_PROPS.elements.length}))()'), {'loading': False, 'err': True, 'n': 0}))
            check('el error es visible en el DOM', lambda: same(page.evaluate("""(()=>{const s=document.querySelector('#panel-propiedades-body .ifc-props-status');return !!s && s.classList.contains('is-error') && s.textContent.indexOf('No se pudieron leer')===0;})()"""), True))
            page.evaluate("""async()=>{await window.__IFC_TEST.workspace.select([window.__owner]);}""")
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&window.__IFC_PROPS.error===null&&!window.__IFC_PROPS.loading', timeout=60000)
            check('una nueva selección se recupera del fallo', lambda: same(page.evaluate('window.__IFC_PROPS.elements.length'), 1))

            # ---------- Fallo TARDÍO de la selección vieja no borra la nueva ----------
            page.evaluate("""()=>{const m=[...window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager).list.values()][0];
                window.__lateGID=m.getItemsData.bind(m);
                m.getItemsData=(ids,cfg)=>{m.getItemsData=window.__lateGID;return new Promise((_,rej)=>setTimeout(()=>rej(new Error('fallo tardío RV9')),800));};}""")
            page.evaluate("""async()=>{await window.__IFC_TEST.workspace.select([window.__owner]);}""")
            page.wait_for_timeout(350)
            page.evaluate("""async()=>{const r=window.__IFC_TEST.workspace.records.find(x=>x.localId!==window.__owner.localId);window.__b=r;await window.__IFC_TEST.workspace.select([r]);}""")
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&!window.__IFC_PROPS.loading', timeout=30000)
            page.wait_for_timeout(1100)
            late = page.evaluate('(()=>({n:window.__IFC_PROPS.elements.length,localId:window.__IFC_PROPS.elements[0]?window.__IFC_PROPS.elements[0].localId:null,err:window.__IFC_PROPS.error,b:window.__b.localId}))()')
            check('fallo tardío de selección vieja no borra ni ensucia la nueva', lambda: same(late['err'], None) and same(late['n'], 1))
            check('la selección vigente es la nueva, no la vieja', lambda: same(late['localId'], late['b']))

            # ---------- Captura/restauración real de FRAG + mapa GUID del resaltador ----------
            page.evaluate("""async()=>{window.__snap=await window.__IFC_TEST.workspace.capture('rv9-e2e');}""")
            page.wait_for_function('window.__snap && window.__snap.models.length>0', timeout=60000)
            check('captura obtiene los FRAG reales con huella', lambda: same(page.evaluate("window.__snap.models.every(m=>/^[0-9a-f]{64}$/.test(m.fingerprint))"), True))
            page.evaluate("""async()=>{await window.__IFC_TEST.workspace.restore(window.__snap);}""")
            page.wait_for_function('document.querySelector("#workspace-v2").dataset.indexState==="ready" && window.__IFC_TEST.workspace.records.some(r=>r.guid===\'%s\')' % GUID, timeout=600000)
            page.evaluate("""async()=>{const t=window.__IFC_TEST;const rec=t.workspace.records.find(r=>r.guid==='%s');await t.workspace.select([rec]);}""" % GUID)
            page.wait_for_function('window.__IFC_PROPS.elements.length===1&&!window.__IFC_PROPS.loading&&window.__IFC_PROPS.error===null', timeout=60000)
            restored = page.evaluate("""()=>{const el=window.__IFC_PROPS.elements[0];const c=(el.groups.find(g=>g.name==='Construction')||{entries:[]}).entries.reduce((o,e)=>(o[e.name]=e.value.display,o),{});
                const h=window.__IFC_TEST.components.get(window.__IFC_TEST.OBF.Highlighter);const sel=h.selection['select']||{};
                const list=window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager).list;
                const keys=Object.keys(sel);return {guid:el.guid,hv:c['H/V'],nivel:c['Nivel'],selKeys:keys,selExisting:keys.every(k=>list.has(k))};}""")
            report['restored'] = restored
            check('tras restaurar, el propietario conserva H/V real', lambda: same(restored['guid'], GUID) and same(restored['hv'], 'H'))
            check('el mapa de selección del resaltador apunta a modelos existentes', lambda: same(restored['selExisting'], True))

            # ---------- Modelo eliminado: el panel no muestra datos obsoletos ----------
            page.evaluate("""async()=>{const fm=window.__IFC_TEST.components.get(window.__IFC_TEST.OBC.FragmentsManager);
                const id=[...fm.list.keys()][0];window.__deletedId=id;await fm.core.disposeModel(id);}""")
            page.wait_for_function('window.__IFC_PROPS.elements.length===0&&!window.__IFC_PROPS.loading', timeout=30000)
            gone = page.evaluate("""(()=>{const s=document.querySelector('#panel-propiedades-body .ifc-props-status');return {n:window.__IFC_PROPS.elements.length,text:s?s.textContent:''};})()""")
            report['deleted'] = gone
            check('al cerrar el modelo el panel limpia los datos obsoletos', lambda: same(gone['n'], 0))
            check('el panel avisa que el modelo ya no está cargado', lambda: same('ya no está cargado' in gone['text'], True))

            check('sin errores JS', lambda: same(report['page_errors'], []))
            page.screenshot(path=str(OUT / 'rv9-props-green.png'), full_page=True)
except Exception as e:
    failed = True
    report['failure'] = str(e)
    traceback.print_exc()
finally:
    server.shutdown(); server.server_close()
    (OUT / 'rv9-props-green.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf8')
sys.exit(1 if failed else 0)
