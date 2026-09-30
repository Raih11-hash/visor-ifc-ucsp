// Pruebas puras del códec de sesiones (sin IndexedDB).
// Ejecutar: node --test tests/sessions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  validateSnapshot,
  encodeSession,
  parseSession,
  getSessionMeta,
} from '../src/domain/session-format.ts';

import { saveSession, listSessions, loadSession, deleteSession } from '../src/services/session-store.ts';

// fake-indexeddb es opcional: si no está instalado, los tests de almacén se omiten
// (sin modificar package.json). El resto del archivo (códec puro) siempre se ejecuta.
let idbAvailable = true;
try {
  await import('fake-indexeddb/auto');
} catch {
  idbAvailable = false;
}
const realIndexedDB = globalThis.indexedDB;
const DB = 'visor-ifc-ucsp-v2';

async function resetDb() {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function rawPut(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(value);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    open.onerror = () => reject(open.error);
  });
}

// Fábrica de IndexedDB falso y guionizado para probar rutas de error que
// fake-indexeddb no puede provocar (cuota, apertura tardía, versionchange).
function installFakeIdb(plan = [], opts = {}) {
  const api = { opens: 0, closes: 0, tx: 0, lastDb: null, request: null };
  globalThis.indexedDB = {
    open() {
      api.opens += 1;
      const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      const db = {
        onversionchange: null,
        objectStoreNames: { contains: () => true },
        close() { api.closes += 1; },
        transaction() {
          const index = api.tx++;
          const step = plan[index] || { event: 'complete' };
          const request = { result: undefined, error: null, onsuccess: null };
          const tx = {
            error: null,
            oncomplete: null,
            onerror: null,
            onabort: null,
            abort() { api.aborted = true; },
            objectStore() {
              return {
                put: () => request,
                get: () => request,
                getAll: () => request,
                delete: () => request,
                getKey: () => request,
              };
            },
          };
          queueMicrotask(() => {
            if (step.result !== undefined) request.result = step.result;
            if (typeof request.onsuccess === 'function') request.onsuccess();
            if (step.event === 'error') {
              request.error = step.error ?? null;
              tx.error = step.error ?? null;
              if (typeof tx.onerror === 'function') tx.onerror();
            } else if (typeof tx.oncomplete === 'function') {
              tx.oncomplete();
            }
          });
          return tx;
        },
      };
      api.lastDb = db;
      api.request = req;
      req.result = db;
      queueMicrotask(() => {
        if (opts.openBlocked) {
          if (typeof req.onblocked === 'function') req.onblocked();
        } else if (typeof req.onsuccess === 'function') {
          req.onsuccess();
        }
      });
      return req;
    },
  };
  return api;
}

async function withFakeIdb(plan, opts, fn) {
  const api = installFakeIdb(plan, opts);
  try {
    await fn(api);
  } finally {
    globalThis.indexedDB = realIndexedDB;
  }
}

const MiB = 1024 * 1024;

function fp(label) {
  return createHash('sha256').update(String(label)).digest('hex');
}

function bytes(n) {
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) u8[i] = i % 251;
  return u8.buffer;
}

function ref(fingerprint, guid = 'GUID-1', localId = 0) {
  return { fingerprint, guid, localId };
}

function camera() {
  return { eye: [1, 2, 3], target: [0, 0, 0], projection: 'Perspective' };
}

function base(over = {}) {
  const f = fp('model-a');
  const snapshot = {
    schema: 'visor-ifc-session',
    schemaVersion: 2,
    appVersion: '2.0.0',
    id: 'sess-1',
    name: 'Sesión de prueba',
    savedAt: new Date('2026-01-02T03:04:05.000Z').toISOString(),
    models: [
      { fingerprint: f, name: 'Edificio', fileName: 'edificio.ifc', format: 'ifc', bytes: bytes(16) },
    ],
    state: {
      camera: camera(),
      filter: { category: 'IfcWall', level: '', text: '', propertyName: '', propertyValue: '' },
      rules: [{ id: 'r1', name: 'Nombre requerido', category: '', field: 'Name', operator: 'required', expected: '' }],
      selection: [ref(f, 'G1', 1)],
      hidden: [],
      colors: [{ color: '#1a2b3c', items: [ref(f, 'G2', 2)] }],
      views: [{ name: 'Vista 1', camera: camera() }],
    },
    ...over,
  };
  return snapshot;
}

// ---------- Camino feliz ----------

test('validateSnapshot acepta una sesión válida y devuelve copia validada', () => {
  const input = base();
  const out = validateSnapshot(input);
  assert.equal(out.schema, 'visor-ifc-session');
  assert.equal(out.schemaVersion, 2);
  assert.equal(out.appVersion, '2.0.0');
  assert.equal(out.models.length, 1);
  assert.ok(out.models[0].bytes instanceof ArrayBuffer);
  assert.equal(out.models[0].bytes.byteLength, 16);
});

test('validateSnapshot clona (no comparte referencias ni bytes con la entrada)', () => {
  const input = base();
  const out = validateSnapshot(input);
  assert.notEqual(out.state, input.state);
  assert.notEqual(out.state.selection, input.state.selection);
  assert.notEqual(out.state.selection[0], input.state.selection[0]);
  assert.notEqual(out.models[0].bytes, input.models[0].bytes);
  input.state.selection[0].localId = 999;
  assert.equal(out.state.selection[0].localId, 1);
});

test('getSessionMeta resume id/nombre/fecha/nº de modelos y bytes totales', () => {
  const meta = getSessionMeta(base());
  assert.deepEqual(Object.keys(meta).sort(), ['bytes', 'id', 'modelCount', 'name', 'savedAt'].sort());
  assert.equal(meta.id, 'sess-1');
  assert.equal(meta.name, 'Sesión de prueba');
  assert.equal(meta.modelCount, 1);
  assert.equal(meta.bytes, 16);
});

// ---------- Cabecera / forma ----------

test('rechaza objetos no planos (prototipo ajeno)', () => {
  assert.throws(() => validateSnapshot(Object.create({ schema: 'visor-ifc-session' })));
  assert.throws(() => validateSnapshot(null));
  assert.throws(() => validateSnapshot([]));
  assert.throws(() => validateSnapshot('texto'));
});

test('rechaza schema/schemaVersion/appVersion incorrectos', () => {
  assert.throws(() => validateSnapshot(base({ schema: 'otro' })));
  assert.throws(() => validateSnapshot(base({ schemaVersion: 1 })));
  assert.throws(() => validateSnapshot(base({ schemaVersion: '2' })));
  assert.throws(() => validateSnapshot(base({ appVersion: '1.0.0' })));
});

test('rechaza id/name/savedAt inválidos', () => {
  assert.throws(() => validateSnapshot(base({ id: '' })));
  assert.throws(() => validateSnapshot(base({ id: 5 })));
  assert.throws(() => validateSnapshot(base({ name: '' })));
  assert.throws(() => validateSnapshot(base({ name: 'x'.repeat(500) })));
  assert.throws(() => validateSnapshot(base({ savedAt: 'no-es-fecha' })));
  assert.throws(() => validateSnapshot(base({ savedAt: 123 })));
});

// ---------- Modelos ----------

test('rechaza sesión sin modelos', () => {
  assert.throws(() => validateSnapshot(base({ models: [] })));
});

test('rechaza más de 10 modelos', () => {
  const models = [];
  for (let i = 0; i < 11; i += 1) {
    models.push({ fingerprint: fp(`m${i}`), name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(4) });
  }
  assert.throws(() => validateSnapshot(base({ models })));
});

test('rechaza huellas SHA-256 no válidas (formato/case)', () => {
  const f = fp('x');
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: f.toUpperCase(), name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(4) }],
  })));
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: 'abc', name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(4) }],
  })));
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: `${f}00`, name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(4) }],
  })));
});

test('rechaza huellas de modelo duplicadas', () => {
  const f = fp('dup');
  const models = [
    { fingerprint: f, name: 'a', fileName: 'a.ifc', format: 'ifc', bytes: bytes(4) },
    { fingerprint: f, name: 'b', fileName: 'b.ifc', format: 'frag', bytes: bytes(4) },
  ];
  assert.throws(() => validateSnapshot(base({ models })));
});

test('rechaza formato de modelo no soportado y bytes no-ArrayBuffer/vacíos', () => {
  const f = fp('m');
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: f, name: 'm', fileName: 'm.ifc', format: 'glb', bytes: bytes(4) }],
  })));
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: f, name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: new Uint8Array(4) }],
  })));
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: f, name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: new ArrayBuffer(0) }],
  })));
});

test('rechaza un modelo que supera 100 MiB', () => {
  const f = fp('big');
  assert.throws(() => validateSnapshot(base({
    models: [{ fingerprint: f, name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(100 * MiB + 1) }],
  })), /tamaño/i);
});

test('rechaza un total de bytes de modelos superior a 200 MiB', () => {
  const models = [];
  for (let i = 0; i < 3; i += 1) {
    models.push({ fingerprint: fp(`t${i}`), name: 'm', fileName: 'm.ifc', format: 'ifc', bytes: bytes(70 * MiB) });
  }
  assert.throws(() => validateSnapshot(base({ models })), /total/i);
});

// ---------- Cámara ----------

test('rechaza cámaras inválidas (3 componentes, finitos, proyección)', () => {
  const bad = (cam) => validateSnapshot(base({ state: { ...base().state, camera: cam } }));
  assert.throws(() => bad({ eye: [1, 2], target: [0, 0, 0], projection: 'Perspective' }));
  assert.throws(() => bad({ eye: [1, 2, 3, 4], target: [0, 0, 0], projection: 'Perspective' }));
  assert.throws(() => bad({ eye: [1, 2, NaN], target: [0, 0, 0], projection: 'Perspective' }));
  assert.throws(() => bad({ eye: [1, 2, '3'], target: [0, 0, 0], projection: 'Perspective' }));
  assert.throws(() => bad({ eye: [1, 2, 3], target: [0, 0, 0], projection: 'Perspectiva' }));
  assert.throws(() => bad({ eye: [1, 2, 3], target: [0, 0, 0] }));
});

test('rechaza vistas con nombre o cámara inválidos y más de 100 vistas', () => {
  const st = () => base().state;
  assert.throws(() => validateSnapshot(base({ state: { ...st(), views: [{ name: '', camera: camera() }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), views: [{ name: 'v', camera: { eye: [1], target: [0, 0, 0], projection: 'Perspective' } }] } })));
  const views = [];
  for (let i = 0; i < 101; i += 1) views.push({ name: `v${i}`, camera: camera() });
  assert.throws(() => validateSnapshot(base({ state: { ...st(), views } })));
});

// ---------- Filtros / reglas ----------

test('rechaza filtro con campos ausentes o no textuales (FilterSpec)', () => {
  const st = () => base().state;
  const f = { category: '', level: '', text: '', propertyName: '', propertyValue: '' };
  assert.throws(() => validateSnapshot(base({ state: { ...st(), filter: {} } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), filter: { ...f, category: 5 } } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), filter: { ...f, text: null } } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), filter: null } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), filter: { ...f, category: 'x'.repeat(300) } } })));
  assert.doesNotThrow(() => validateSnapshot(base({ state: { ...st(), filter: f } })));
});

test('rechaza reglas inválidas y más de 100 reglas', () => {
  const st = () => base().state;
  const valid = { id: 'r1', name: 'n', category: '', field: 'Name', operator: 'required', expected: '' };
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ field: 'Name', operator: 'required' }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ ...valid, operator: 'maybe' }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ ...valid, id: '' }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ ...valid, field: '' }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ ...valid, expected: 5 }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules: [{ ...valid, category: 3 }] } })));
  const rules = [];
  for (let i = 0; i < 101; i += 1) rules.push({ ...valid, id: `r${i}` });
  assert.throws(() => validateSnapshot(base({ state: { ...st(), rules } })));
  assert.doesNotThrow(() => validateSnapshot(base({ state: { ...st(), rules: [valid] } })));
});

// ---------- Referencias / colores ----------

test('rechaza referencias a huellas desconocidas, localId inválido y guid no textual', () => {
  const st = () => base().state;
  assert.throws(() => validateSnapshot(base({ state: { ...st(), selection: [ref(fp('otro'), 'g', 0)] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), selection: [ref(fp('model-a'), 'g', -1)] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), selection: [ref(fp('model-a'), 'g', 1.5)] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), selection: [{ fingerprint: fp('model-a'), localId: 0 }] } })));
});

test('rechaza color con formato distinto de #rrggbb', () => {
  const st = () => base().state;
  const f = fp('model-a');
  assert.throws(() => validateSnapshot(base({ state: { ...st(), colors: [{ color: 'rojo', items: [] }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), colors: [{ color: '#12345', items: [] }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), colors: [{ color: '#12345g', items: [] }] } })));
  assert.doesNotThrow(() => validateSnapshot(base({ state: { ...st(), colors: [{ color: '#AABBCC', items: [ref(f, 'g', 0)] }] } })));
});

test('rechaza más de 200000 referencias en total', () => {
  const f = fp('model-a');
  const big = new Array(200001);
  for (let i = 0; i < big.length; i += 1) big[i] = ref(f, 'g', i);
  assert.throws(() => validateSnapshot(base({ state: { ...base().state, selection: big } })));
});

// ---------- Códec ----------

test('encodeSession produce JSON con bytes en base64', () => {
  const json = encodeSession(base());
  assert.equal(typeof json, 'string');
  const obj = JSON.parse(json);
  assert.equal(obj.schema, 'visor-ifc-session');
  assert.equal(typeof obj.models[0].bytes, 'string');
  assert.match(obj.models[0].bytes, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('encodeSession valida antes de codificar (propaga error)', () => {
  assert.throws(() => encodeSession(base({ models: [] })));
});

test('parseSession reconstruye bytes idénticos (round-trip)', () => {
  const original = base();
  const restored = parseSession(encodeSession(original));
  assert.equal(restored.id, original.id);
  const a = new Uint8Array(restored.models[0].bytes);
  const b = new Uint8Array(original.models[0].bytes);
  assert.deepEqual([...a], [...b]);
  assert.equal(restored.state.selection[0].guid, 'G1');
});

test('parseSession rechaza JSON malformado o no textual', () => {
  assert.throws(() => parseSession('{ no-json'));
  assert.throws(() => parseSession(''));
  assert.throws(() => parseSession(123));
  assert.throws(() => parseSession('null'));
  assert.throws(() => parseSession('[]'));
});

test('parseSession rechaza base64 no canónico / longitud inválida / caracteres raros', () => {
  const obj = JSON.parse(encodeSession(base()));
  const withBytes = (b64) => JSON.stringify({ ...obj, models: [{ ...obj.models[0], bytes: b64 }] });
  // 1 byte real => "QQ=="; "QQ" tiene longitud no múltiplo de 4
  assert.throws(() => parseSession(withBytes('QQ')));
  assert.throws(() => parseSession(withBytes('Q===')));
  // decodifica a 1 byte pero no es canónico (re-codifica a "QQ==")
  assert.throws(() => parseSession(withBytes('QR==')));
  assert.throws(() => parseSession(withBytes('Q$==')));
  // vacío no permitido
  assert.throws(() => parseSession(withBytes('')));
});

test('parseSession aplica todas las validaciones estructurales', () => {
  const obj = JSON.parse(encodeSession(base()));
  obj.state.colors[0].color = 'azul';
  assert.throws(() => parseSession(JSON.stringify(obj)));
});

// ---------- Endurecimiento de formato (v2.0) ----------

test('rechaza total de referencias selection+hidden > 200000 aunque no haya colores', () => {
  const f = fp('model-a');
  const make = (n) => {
    const out = new Array(n);
    for (let i = 0; i < n; i += 1) out[i] = ref(f, 'g', i);
    return out;
  };
  assert.throws(
    () => validateSnapshot(base({ state: { ...base().state, selection: make(100001), hidden: make(100001), colors: [] } })),
    /referencias/i,
  );
});

test('rechaza cámara con eye y target coincidentes', () => {
  const st = () => base().state;
  assert.throws(
    () => validateSnapshot(base({ state: { ...st(), camera: { eye: [1, 2, 3], target: [1, 2, 3], projection: 'Perspective' } } })),
  );
});

test('rechaza identificadores de regla duplicados', () => {
  const st = () => base().state;
  const r = { id: 'dup', name: 'n', category: '', field: 'Name', operator: 'required', expected: '' };
  assert.throws(
    () => validateSnapshot(base({ state: { ...st(), rules: [r, { ...r }] } })),
    /duplicad/i,
  );
});

test('fecha savedAt estricta (ISO con hora y zona) y en rango razonable', () => {
  assert.throws(() => validateSnapshot(base({ savedAt: '2026-01-02' })));
  assert.throws(() => validateSnapshot(base({ savedAt: '2026-01-02T03:04:05' })));
  assert.throws(() => validateSnapshot(base({ savedAt: '02/01/2026' })));
  assert.throws(() => validateSnapshot(base({ savedAt: '1999-12-31T23:59:59.000Z' })), /razonable/i);
  assert.throws(() => validateSnapshot(base({ savedAt: '2500-01-01T00:00:00.000Z' })), /razonable/i);
  assert.doesNotThrow(() => validateSnapshot(base({ savedAt: '2026-01-02T03:04:05.000Z' })));
  assert.doesNotThrow(() => validateSnapshot(base({ savedAt: '2026-01-02T03:04:05Z' })));
});

test('queries opcional: por defecto [], valida, limita a 50 y hace round-trip', () => {
  const st = () => base().state;
  const filter = { category: 'IfcWall', level: '', text: '', propertyName: '', propertyValue: '' };
  const query = { name: 'Muros', filter };

  const def = validateSnapshot(base());
  assert.deepEqual(def.state.queries, []);

  const withQuery = validateSnapshot(base({ state: { ...st(), queries: [query] } }));
  assert.equal(withQuery.state.queries.length, 1);
  assert.equal(withQuery.state.queries[0].name, 'Muros');
  assert.equal(withQuery.state.queries[0].filter.category, 'IfcWall');

  const round = parseSession(encodeSession(base({ state: { ...st(), queries: [query] } })));
  assert.equal(round.state.queries[0].filter.category, 'IfcWall');

  assert.throws(() => validateSnapshot(base({ state: { ...st(), queries: {} } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), queries: [{ name: 'x', filter: {} }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), queries: [{ name: '', filter }] } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st(), queries: [{ name: 5, filter }] } })));

  const many = [];
  for (let i = 0; i < 51; i += 1) many.push({ name: `q${i}`, filter });
  assert.throws(() => validateSnapshot(base({ state: { ...st(), queries: many } })), /consultas/i);
});

test('parseSession rechaza >10 modelos ANTES de decodificar base64', () => {
  const obj = JSON.parse(encodeSession(base()));
  const extra = [];
  for (let i = 0; i < 10; i += 1) {
    extra.push({ ...obj.models[0], fingerprint: fp(`extra${i}`), bytes: 'QQ' }); // base64 inválido a propósito
  }
  const json = JSON.stringify({ ...obj, models: [obj.models[0], ...extra] });
  assert.throws(() => parseSession(json), /demasiados modelos/i);
});

test('no contamina prototipos: subobjetos con prototipo ajeno se rechazan', () => {
  const st = base().state;
  assert.throws(() => validateSnapshot(base({ state: { ...st, filter: Object.create({ category: '' }) } })));
  assert.throws(() => validateSnapshot(base({ state: { ...st, selection: [Object.create({ fingerprint: fp('model-a') })] } })));
});

// ---------- Almacén de sesiones (IndexedDB) ----------

const storeIt = idbAvailable ? test : test.skip;

if (!idbAvailable) {
  test.skip('almacén de sesiones omitido: fake-indexeddb no disponible', () => {});
}

storeIt('saveSession persiste y loadSession recupera bytes idénticos + queries por defecto', async () => {
  await resetDb();
  const snap = base();
  await saveSession(snap);
  const loaded = await loadSession('sess-1');
  assert.equal(loaded.id, 'sess-1');
  assert.deepEqual([...new Uint8Array(loaded.models[0].bytes)], [...new Uint8Array(snap.models[0].bytes)]);
  assert.deepEqual(loaded.state.queries, []);
});

storeIt('listSessions ordena por fecha desc, resume metadatos y omite registros dañados', async () => {
  await resetDb();
  await saveSession(base({ id: 'a', name: 'A', savedAt: '2026-01-01T00:00:00.000Z' }));
  await saveSession(base({ id: 'b', name: 'B', savedAt: '2026-03-01T00:00:00.000Z' }));
  await rawPut({ id: 'corrupt' }); // registro sin campos válidos
  const metas = await listSessions();
  assert.deepEqual(metas.map((m) => m.id), ['b', 'a']);
  assert.deepEqual(Object.keys(metas[0]).sort(), ['bytes', 'id', 'modelCount', 'name', 'savedAt'].sort());
  assert.equal(metas[0].modelCount, 1);
  assert.equal(metas[0].bytes, 16);
});

storeIt('deleteSession elimina y loadSession lanza si no existe', async () => {
  await resetDb();
  await saveSession(base());
  await deleteSession('sess-1');
  await assert.rejects(loadSession('sess-1'), /no encontrada/i);
});

storeIt('loadSession/deleteSession rechazan identificadores vacíos', async () => {
  await assert.rejects(loadSession(''), /identificador/i);
  await assert.rejects(deleteSession(''), /identificador/i);
});

storeIt('runTransaction rechaza si map() lanza (no cuelga)', { timeout: 3000 }, async () => {
  await resetDb();
  await saveSession(base()); // asegura que el almacén existe
  const mod = await import('../src/services/session-store.ts');
  await assert.rejects(
    mod.runTransaction('readonly', (store) => store.getAll(), () => { throw new Error('boom-map'); }),
    /boom-map/,
  );
});

storeIt('saveSession verifica el efecto: rechaza si la clave no quedó persistida', async () => {
  await withFakeIdb([{ event: 'complete' }, { event: 'complete' }], {}, async () => {
    await assert.rejects(saveSession(base()), /confirmar/i);
  });
});

storeIt('error de cuota produce un mensaje útil', async () => {
  const quota = new Error('quota');
  quota.name = 'QuotaExceededError';
  await withFakeIdb([{ event: 'error', error: quota }], {}, async () => {
    await assert.rejects(saveSession(base()), /espacio/i);
  });
});

storeIt('cierra la conexión que abre tarde tras un bloqueo', async () => {
  await withFakeIdb([], { openBlocked: true }, async (api) => {
    await assert.rejects(saveSession(base()), /bloquead/i);
    assert.equal(api.closes, 0);
    api.request.onsuccess(); // la apertura llega tarde
    assert.equal(api.closes, 1);
  });
});

storeIt('registra onversionchange para liberar la conexión', async () => {
  await withFakeIdb([{ event: 'complete' }, { event: 'complete', result: 'sess-1' }], {}, async (api) => {
    await saveSession(base());
    assert.equal(typeof api.lastDb.onversionchange, 'function');
    const before = api.closes;
    api.lastDb.onversionchange();
    assert.equal(api.closes, before + 1);
  });
});