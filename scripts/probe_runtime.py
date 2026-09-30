import pathlib,threading,http.server,functools,json
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(R/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  candidates=list((pathlib.Path.home()/'AppData/Local/ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'))
  browser=p.chromium.launch(executable_path=str(sorted(candidates)[-1]) if candidates else None,headless=True,args=['--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1600,'height':1050});page.goto(f'http://127.0.0.1:{server.server_port}/?test=1')
  page.wait_for_function('document.documentElement.dataset.appState==="ready"',timeout=90000);page.locator('bim-button[label="Cargar ejemplo"]').click();page.wait_for_function('Number(document.querySelector("#catalog-total").textContent)>0',timeout=90000)
  result=page.evaluate('''async()=>{const t=window.__IFC_TEST;const m=[...t.components.get(t.OBC.FragmentsManager).list.values()][0];const buf=await m.getBuffer(false);const ids=await m.getItemsIdsWithGeometry();const floor=t.workspace.records.find(r=>r.guid==='3zR0BOEcLADRKln4HYporH');const raw=await m.getItemsData([floor.localId],{attributesDefault:true,relationsDefault:{attributes:false,relations:false},relations:{IsDefinedBy:{attributes:true,relations:true},HasProperties:{attributes:true,relations:false},Quantities:{attributes:true,relations:false},ContainedInStructure:{attributes:true,relations:false}}});return {buffer:{constructor:buf.constructor.name,isArrayBuffer:buf instanceof ArrayBuffer,isUint8Array:buf instanceof Uint8Array,byteLength:buf.byteLength},sample:t.workspace.records[0],levels:[...new Set(t.workspace.records.map(r=>r.level))],raw:JSON.parse(JSON.stringify(raw,(()=>{const seen=new WeakSet();return (k,v)=>{if(v&&typeof v==='object'){if(seen.has(v))return '[cycle]';seen.add(v);}return v;};})()))};}''')
  print(json.dumps(result,ensure_ascii=True,indent=2));(R/'test-results/probe-runtime.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');page.screenshot(path=str(R/'test-results/probe-runtime.png'),full_page=True);browser.close()
finally:server.shutdown();server.server_close()
