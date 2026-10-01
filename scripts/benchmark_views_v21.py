"""Compare RV3 ZIP with current dist in the same Chromium/canvas; no source edits."""
import argparse,pathlib,tempfile,os,zipfile,json,threading,http.server,functools,statistics,hashlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
args=argparse.ArgumentParser();args.add_argument('--baseline-zip',required=True);params=args.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
servers=[]
def serve(folder):
    s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(folder)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s);return f'http://127.0.0.1:{s.server_port}/?test=1'
results={'scope':'Chromium local, dos modelos pequeños, misma resolución de canvas. No representa equipo de alumno ni rendimiento remoto.','baseline_zip_sha256':hashlib.sha256(pathlib.Path(params.baseline_zip).read_bytes()).hexdigest(),'runs':[]}
try:
    with tempfile.TemporaryDirectory(dir=os.getenv('TMPDIR'),prefix='ifc_benchmark_') as tmp, sync_playwright() as p:
        with zipfile.ZipFile(params.baseline_zip) as z:z.extractall(tmp)
        browser=p.chromium.launch(headless=True,executable_path=str(sorted((pathlib.Path.home()/'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))[-1]),args=['--enable-unsafe-swiftshader'])
        for label,folder in [('RV3_v2.0',pathlib.Path(tmp)),('RV4_v2.1',ROOT/'dist')]:
            ctx=browser.new_context(viewport={'width':1366,'height':900});page=ctx.new_page();page.set_default_timeout(30000)
            run={'build':label,'trials':[],'page_errors':[]};page.on('pageerror',lambda e:run['page_errors'].append(str(e)))
            page.goto(serve(folder));page.wait_for_function('document.documentElement.dataset.appState==="ready"',timeout=90000)
            def nav(section):
                if page.locator('#nav-'+section).count():page.locator('#nav-'+section).click()
            nav('models');page.locator('bim-button[label="Cargar ejemplo"]').click();page.wait_for_function('Number(document.querySelector("#catalog-total").textContent)===13&&document.querySelector("#workspace-v2").dataset.indexState==="ready"',timeout=90000)
            page.evaluate('()=>{const card=document.querySelector(".dashboard-card");card.style.width="653px";card.style.height="672px";}')
            page.wait_for_function('document.querySelector("canvas").width===653&&document.querySelector("canvas").height===672')
            run['environment']=page.evaluate('()=>{const t=window.__IFC_TEST,r=t.world.renderer.three,g=r.getContext(),ext=g.getExtension("WEBGL_debug_renderer_info");return {canvas:[r.domElement.width,r.domElement.height],gpu:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};}')
            page.evaluate('()=>{const t=window.__IFC_TEST,p=t.OBC.Viewpoint.prototype,old=p.updateCamera;p.updateCamera=async function(...args){const at=performance.now();try{return await old.apply(this,args);}finally{window.__bench?.phases.push({name:"updateCamera",ms:performance.now()-at,args});}};const f=t.components.get(t.OBC.FragmentsManager),convert=f.modelIdMapToGuids.bind(f);f.modelIdMapToGuids=async(...args)=>{const at=performance.now();try{return await convert(...args);}finally{window.__bench?.phases.push({name:"GUID",ms:performance.now()-at});}};const c=t.world.renderer.three.domElement,blob=c.toBlob.bind(c);c.toBlob=(cb,...args)=>{const at=performance.now();return blob(b=>{window.__bench?.phases.push({name:"PNG",ms:performance.now()-at});cb(b);},...args);};}')
            def trial(case):
                nav('views');button=page.locator('#view-create' if label=='RV4_v2.1' else 'bim-button[label="Agregar"]');button.scroll_into_view_if_needed()
                button.evaluate('(b)=>{window.__bench={phases:[]};b.addEventListener("click",()=>{const r=window.__bench;r.click=performance.now();function done(){if(!b.loading&&!b.disabled){r.end=performance.now();return;}requestAnimationFrame(done);}requestAnimationFrame(done);},{once:true,capture:true});}')
                button.click();page.wait_for_function('window.__bench.end!==undefined')
                data=page.evaluate('()=>{const r=window.__bench;window.__bench=null;return {...r,click_ms:r.end-r.click};}')
                data['case']=case;run['trials'].append(data)
            for i in range(3):trial('ejemplo_sin_seleccion')
            page.evaluate('async()=>{const t=window.__IFC_TEST;await t.workspace.select(t.workspace.records);await t.workspace.colorResults(t.workspace.records.map(element=>({element,pass:false})));}')
            for i in range(3):trial('ejemplo_seleccion_color')
            nav('models');page.locator('bim-button[label="Cargar Graderías"]').click();page.wait_for_function('Number(document.querySelector("#catalog-total").textContent)===33&&document.querySelector("#workspace-v2").dataset.indexState==="ready"',timeout=90000)
            page.evaluate('async()=>{const t=window.__IFC_TEST;await t.workspace.select(t.workspace.records);await t.workspace.colorResults(t.workspace.records.map(element=>({element,pass:false})));}')
            for i in range(3):trial('federado_seleccion_color')
            run['summary']={case:{'n':len(rows),'median_ms':statistics.median(row['click_ms'] for row in rows),'png_calls':sum(sum(ph['name']=='PNG' for ph in row['phases']) for row in rows),'guid_calls':[sum(ph['name']=='GUID' for ph in row['phases']) for row in rows]} for case in sorted({row['case'] for row in run['trials']}) if (rows:=[row for row in run['trials'] if row['case']==case])}
            results['runs'].append(run);print(label,json.dumps(run['summary']),flush=True);ctx.close()
        browser.close()
finally:
    for s in servers:s.shutdown();s.server_close()
    (OUT/'benchmark-views-v21.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf8')
