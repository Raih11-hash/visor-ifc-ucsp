import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = new URL('../src/domain/runtime.ts', import.meta.url);

test('el módulo de robustez valida cabeceras IFC antes de invocar WASM', async () => {
  assert.ok(fs.existsSync(url), 'Falta la validación robusta de archivos');
  const { validateModelBytes } = await import(url.href);
  const bytes = new Uint8Array(fs.readFileSync(new URL('../public/models/ejemplo.ifc', import.meta.url)));
  assert.doesNotThrow(() => validateModelBytes(bytes, 'modelo.ifc'));
  assert.throws(() => validateModelBytes(new TextEncoder().encode('not an IFC'), 'roto.ifc'), /IFC|cabecera/);
  assert.throws(() => validateModelBytes(new Uint8Array(), 'vacio.ifc'), /vacío/);
});

test('las teclas de edición no ejecutan herramientas del visor', async () => {
  const { isEditingPath } = await import(url.href);
  assert.equal(isEditingPath([{tagName:'INPUT'}]), true);
  assert.equal(isEditingPath([{tagName:'BIM-TEXT-INPUT'}]), true);
  assert.equal(isEditingPath([{tagName:'DIV',isContentEditable:true}]), true);
  assert.equal(isEditingPath([{tagName:'CANVAS'}]), false);
});

test('el tiempo límite hace visible una operación atascada', async () => {
  const { withTimeout } = await import(url.href);
  await assert.rejects(withTimeout(new Promise(()=>{}), 5, 'Operación detenida'), /Operación detenida/);
  assert.equal(await withTimeout(Promise.resolve('ok'),100,'error'), 'ok');
});

test('los binarios publicados coinciden con las dependencias instaladas', async () => {
  const manifest = new URL('../public/engine-version.json', import.meta.url);
  assert.ok(fs.existsSync(manifest), 'Falta el manifiesto versionado del motor');
  const { createHash } = await import('node:crypto');
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  for (const [file, source] of [['fragments-worker.mjs', '@thatopen/fragments/dist/Worker/worker.mjs'], ['wasm/web-ifc.wasm', 'web-ifc/web-ifc.wasm']]) {
    const actual = fs.readFileSync(new URL('../public/' + file, import.meta.url));
    const installed = fs.readFileSync(new URL('../node_modules/' + source, import.meta.url));
    assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(installed).digest('hex'));
    assert.equal(data.assets[file].sha256, createHash('sha256').update(actual).digest('hex'));
  }
});
