/** runtime.ts — límites y validación previa; no sustituye un validador completo IFC. */
export const MAX_MODEL_BYTES = 100 * 1024 * 1024;

/** Compara bytes reales, incluyendo el offset de las vistas Uint8Array. */
export function modelBytesEqual(left: Uint8Array, right: ArrayBuffer | Uint8Array): boolean {
  const bytes=right instanceof Uint8Array ? right : new Uint8Array(right);
  if(left.byteLength!==bytes.byteLength)return false;
  for(let i=0;i<left.byteLength;i++)if(left[i]!==bytes[i])return false;
  return true;
}

export function isEditingPath(path: readonly { tagName?: string; isContentEditable?: boolean }[]): boolean {
  return path.some(node => node.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BIM-TEXT-INPUT|BIM-DROPDOWN|BIM-NUMBER-INPUT)$/i.test(node.tagName ?? ''));
}

export async function withTimeout<T>(operation: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer=setTimeout(()=>reject(new Error(message)),ms);
    })]);
  } finally { if(timer!==undefined) clearTimeout(timer); }
}

export function validateModelBytes(bytes: Uint8Array, fileName: string): void {
  if (!bytes.byteLength) throw new Error('El archivo está vacío. Elige otro modelo.');
  if (bytes.byteLength > MAX_MODEL_BYTES) throw new Error('El archivo supera el límite de 100 MB por modelo.');
  if (!/\.(ifc|frag)$/i.test(fileName)) throw new Error('Solo se admiten archivos .ifc o .frag.');
  if (/\.ifc$/i.test(fileName)) {
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    if (!/ISO-10303-21\s*;/i.test(header) || !/FILE_SCHEMA\s*\(/i.test(header)) {
      throw new Error('La cabecera no corresponde a un archivo IFC STEP válido. Vuelve a exportarlo desde tu programa BIM.');
    }
  }
}
