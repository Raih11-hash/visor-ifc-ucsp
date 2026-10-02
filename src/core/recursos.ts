/** recursos.ts — diagnóstico temprano de binarios autoalojados; evita una pantalla muda. */
import { RUTAS, APP } from '../globals';

export async function verificarRecursosMotor(): Promise<void> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), 25000);
  try {
    const manifest = await fetch(`${import.meta.env.BASE_URL}engine-version.json`, { signal: abort.signal, cache: 'no-cache' });
    if (!manifest.ok) throw new Error('Falta el manifiesto del motor. El despliegue está incompleto.');
    const data = await manifest.json() as { appVersion?: string; versions?: Record<string, string>; assets?: Record<string,{bytes?:number;sha256?:string}> };
    if (data.appVersion !== APP.version || data.versions?.['web-ifc'] !== '0.0.77' || data.versions?.['@thatopen/fragments'] !== '3.4.7') {
      throw new Error('Los recursos del motor no corresponden a esta versión. Recarga la página o revisa el despliegue.');
    }
    if(!crypto.subtle)throw new Error('La verificación de integridad requiere HTTPS o localhost.');
    await Promise.all(([
      ['worker de modelos', RUTAS.workerFragments,'fragments-worker.mjs'],
      ['lector IFC (WASM)', `${RUTAS.carpetaWasm}web-ifc.wasm`,'wasm/web-ifc.wasm'],
    ] as const).map(async([name,url,key])=>{
      const expected=data.assets?.[key];
      if(!expected || !Number.isSafeInteger(expected.bytes) || (expected.bytes ?? 0)<=0 || !/^[a-f0-9]{64}$/.test(expected.sha256 ?? ''))throw new Error(`Falta la integridad del ${name} en el manifiesto. Revisa el despliegue.`);
      const response=await fetch(url,{signal:abort.signal,cache:'no-cache'});
      if(!response.ok)throw new Error(`No se pudo abrir el ${name} (HTTP ${response.status}). Reintenta o revisa la conexión.`);
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==expected.bytes)throw new Error(`Error de integridad: el tamaño del ${name} no corresponde al manifiesto. Recarga o revisa el despliegue.`);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      if(hash!==expected.sha256)throw new Error(`Error de integridad: la huella SHA-256 del ${name} no corresponde al manifiesto. Recarga o revisa el despliegue.`);
    }));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('La conexión tardó demasiado al descargar el motor. Reintenta cuando mejore la red.');
    throw error;
  } finally { window.clearTimeout(timer); }
}
