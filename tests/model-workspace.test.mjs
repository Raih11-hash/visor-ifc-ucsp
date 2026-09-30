// Pruebas puras del adaptador de catálogo y sesiones (sin navegador).
// Cubren las funciones exportadas puras: normalizeItem, extractLevel,
// toModelMap, sha256Hex y verifyModelFingerprints (preflight de restauración).
// Ejecutar: node --test tests/model-workspace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  normalizeItem,
  extractLevel,
  toModelMap,
  sha256Hex,
  verifyModelFingerprints,
} from '../src/services/model-workspace.ts';

// ---------- Utilidades de datos de ejemplo (forma real de Fragments ItemData) ----------

const attr = (value, type) => ({ value, type });
const node = (over = {}) => ({ ...over });

function wallData() {
  return node({
    _localId: attr(42),
    _guid: attr('0ABC'),
    _category: attr('IFCWALL'),
    Name: attr('Muro básico'),
    ObjectType: attr('Basic Wall'),
    Tag: attr('W-01'),
    Description: attr(null),
    IsDefinedBy: [
      node({
        _localId: attr(100),
        _category: attr('IFCPROPERTYSET'),
        Name: attr('Pset_WallCommon'),
        HasProperties: [
          node({
            _localId: attr(101),
            _category: attr('IFCPROPERTYSINGLEVALUE'),
            Name: attr('FireRating'),
            NominalValue: attr('REI 120', 'IFCLABEL'),
          }),
          node({
            _localId: attr(102),
            _category: attr('IFCPROPERTYSINGLEVALUE'),
            Name: attr('IsExternal'),
            NominalValue: attr(true, 'IFCBOOLEAN'),
          }),
        ],
      }),
      node({
        _localId: attr(110),
        _category: attr('IFCELEMENTQUANTITY'),
        Name: attr('Qto_WallBaseQuantities'),
        Quantities: [
          node({
            _localId: attr(111),
            _category: attr('IFCQUANTITYLENGTH'),
            Name: attr('Length'),
            LengthValue: attr(3.5, 'IFCLENGTHMEASURE'),
          }),
        ],
      }),
    ],
    ContainedInStructure: [
      node({
        _localId: attr(200),
        _category: attr('IFCBUILDINGSTOREY'),
        Name: attr('Nivel 1'),
      }),
    ],
  });
}

// ---------- normalizeItem ----------

test('normalizeItem mapea atributos base, guid, categoría y nombre', () => {
  const record = normalizeItem('m1', 42, wallData(), '');
  assert.equal(record.modelId, 'm1');
  assert.equal(record.localId, 42);
  assert.equal(record.guid, '0ABC');
  assert.equal(record.category, 'IFCWALL');
  assert.equal(record.name, 'Muro básico');
  assert.equal(record.type, 'Basic Wall');
});

test('normalizeItem aplana Psets y cantidades con claves Pset.Propiedad', () => {
  const record = normalizeItem('m1', 42, wallData(), '');
  assert.equal(record.properties['Pset_WallCommon.FireRating'], 'REI 120');
  assert.equal(record.properties['Pset_WallCommon.IsExternal'], true);
  assert.equal(record.properties['Qto_WallBaseQuantities.Length'], 3.5);
});

test('normalizeItem incluye los atributos del elemento sin prefijo', () => {
  const record = normalizeItem('m1', 42, wallData(), '');
  assert.equal(record.properties.Name, 'Muro básico');
  assert.equal(record.properties.ObjectType, 'Basic Wall');
  assert.equal(record.properties.Tag, 'W-01');
  assert.equal(record.properties.Description, null);
});

test('normalizeItem nunca filtra claves internas ni relaciones como propiedades', () => {
  const record = normalizeItem('m1', 42, wallData(), '');
  const keys = Object.keys(record.properties);
  assert.ok(!keys.includes('_localId'));
  assert.ok(!keys.includes('_guid'));
  assert.ok(!keys.includes('_category'));
  assert.ok(!keys.includes('IsDefinedBy'));
  assert.ok(!keys.includes('ContainedInStructure'));
  assert.ok(!keys.includes('HasProperties'));
});

test('normalizeItem usa el nivel pasado como autoritativo', () => {
  const record = normalizeItem('m1', 42, wallData(), 'Nivel 9');
  assert.equal(record.level, 'Nivel 9');
});

test('normalizeItem deriva el nivel del IFCBUILDINGSTOREY cuando no se le pasa', () => {
  const record = normalizeItem('m1', 42, wallData(), '');
  assert.equal(record.level, 'Nivel 1');
});

test('normalizeItem tolera datos vacíos o ajenos sin inventar valores', () => {
  const record = normalizeItem('m9', 7, {}, '');
  assert.deepEqual(record, {
    modelId: 'm9',
    localId: 7,
    guid: '',
    category: '',
    name: '',
    type: '',
    level: '',
    properties: {},
  });
  const weird = normalizeItem('m9', 8, { _localId: attr(8), _category: attr('IFCDOOR') }, '');
  assert.equal(weird.category, 'IFCDOOR');
  assert.equal(weird.name, '');
  assert.equal(weird.guid, '');
});

test('normalizeItem ignora atributos compuestos y relaciones anidadas', () => {
  const data = node({
    _localId: attr(1),
    _guid: attr('G'),
    _category: attr('IFCWALL'),
    Placement: attr({ nested: true }),
    Complex: node({ _localId: attr(2), _category: attr('IFCLOCALPLACEMENT') }),
    IsDefinedBy: 'no-es-array',
  });
  const record = normalizeItem('m', 1, data, '');
  assert.deepEqual(record.properties, {});
});

test('normalizeItem resuelve Psets anidados bajo nodos de relación (forma alternativa)', () => {
  const data = node({
    _localId: attr(5),
    _guid: attr('G5'),
    _category: attr('IFCBEAM'),
    IsDefinedBy: [
      node({
        _localId: attr(500),
        _category: attr('IFCRELDEFINESBYPROPERTIES'),
        RelatingPropertyDefinition: [
          node({
            _localId: attr(501),
            _category: attr('IFCPROPERTYSET'),
            Name: attr('Pset_BeamCommon'),
            HasProperties: [
              node({
                _localId: attr(502),
                _category: attr('IFCPROPERTYSINGLEVALUE'),
                Name: attr('LoadBearing'),
                NominalValue: attr(false, 'IFCBOOLEAN'),
              }),
            ],
          }),
        ],
      }),
    ],
  });
  const record = normalizeItem('m', 5, data, '');
  assert.equal(record.properties['Pset_BeamCommon.LoadBearing'], false);
});

test('normalizeItem resuelve colisiones de clave conservando el primer valor', () => {
  const data = node({
    _localId: attr(3),
    _guid: attr('G3'),
    _category: attr('IFCWALL'),
    IsDefinedBy: [
      node({
        _localId: attr(300),
        _category: attr('IFCPROPERTYSET'),
        Name: attr('Pset_X'),
        HasProperties: [
          node({ _localId: attr(301), _category: attr('IFCPROPERTYSINGLEVALUE'), Name: attr('A'), NominalValue: attr('primero') }),
        ],
      }),
      node({
        _localId: attr(310),
        _category: attr('IFCPROPERTYSET'),
        Name: attr('Pset_X'),
        HasProperties: [
          node({ _localId: attr(311), _category: attr('IFCPROPERTYSINGLEVALUE'), Name: attr('A'), NominalValue: attr('segundo') }),
        ],
      }),
    ],
  });
  const record = normalizeItem('m', 3, data, '');
  assert.equal(record.properties['Pset_X.A'], 'primero');
});

test('normalizeItem une valores de lista de propiedades en texto', () => {
  const data = node({
    _localId: attr(4),
    _guid: attr('G4'),
    _category: attr('IFCDOOR'),
    IsDefinedBy: [
      node({
        _localId: attr(400),
        _category: attr('IFCPROPERTYSET'),
        Name: attr('Pset_DoorCommon'),
        HasProperties: [
          node({
            _localId: attr(401),
            _category: attr('IFCPROPERTYENUMERATEDVALUE'),
            Name: attr('FireRating'),
            EnumerationValues: attr(['EI30', 'EI60'], 'IFCLABEL'),
          }),
        ],
      }),
    ],
  });
  const record = normalizeItem('m', 4, data, '');
  assert.equal(record.properties['Pset_DoorCommon.FireRating'], 'EI30; EI60');
});

// ---------- extractLevel ----------

test('extractLevel devuelve el nombre del IFCBUILDINGSTOREY contenedor', () => {
  assert.equal(extractLevel(wallData()), 'Nivel 1');
});

test('extractLevel devuelve cadena vacía sin nivel o sin datos válidos', () => {
  assert.equal(extractLevel({}), '');
  assert.equal(extractLevel(null), '');
  assert.equal(extractLevel({ ContainedInStructure: [] }), '');
  assert.equal(
    extractLevel({ ContainedInStructure: [node({ _category: attr('IFCSPACE'), Name: attr('Espacio') })] }),
    '',
  );
});

// ---------- toModelMap ----------

test('toModelMap agrupa por modelo, deduplica y ordena los localId (Record<string, Set>)', () => {
  const rows = [
    { modelId: 'a', localId: 3 },
    { modelId: 'a', localId: 1 },
    { modelId: 'a', localId: 1 },
    { modelId: 'b', localId: 2 },
    { modelId: 'b', localId: 10 },
  ];
  const map = toModelMap(rows);
  assert.deepEqual(Object.keys(map).sort(), ['a', 'b']);
  assert.deepEqual([...map.a], [1, 3]);
  assert.deepEqual([...map.b], [2, 10]);
});

test('toModelMap de una lista vacía es un mapa vacío', () => {
  assert.deepEqual(toModelMap([]), {});
});

// ---------- sha256Hex / verifyModelFingerprints ----------

function bytesOf(text) {
  return new TextEncoder().encode(text).buffer;
}

test('sha256Hex calcula la huella conocida de "abc"', async () => {
  const fp = await sha256Hex(bytesOf('abc'));
  assert.equal(fp, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('sha256Hex acepta ArrayBuffer y Uint8Array con el mismo resultado', async () => {
  const a = await sha256Hex(bytesOf('hola'));
  const b = await sha256Hex(new Uint8Array(bytesOf('hola')));
  assert.equal(a, b);
});

test('verifyModelFingerprints acepta modelos con huella correcta', async () => {
  const bytes = bytesOf('modelo-ok');
  const fp = await sha256Hex(bytes);
  await assert.doesNotReject(
    verifyModelFingerprints([{ fingerprint: fp, name: 'Edificio', bytes }]),
  );
});

test('verifyModelFingerprints rechaza bytes manipulados (preflight antes de restaurar)', async () => {
  const original = bytesOf('modelo-ok');
  const fp = await sha256Hex(original);
  const tampered = bytesOf('modelo-manipulado');
  await assert.rejects(
    verifyModelFingerprints([{ fingerprint: fp, name: 'Edificio', bytes: tampered }]),
    /huella/i,
  );
});

test('verifyModelFingerprints verifica TODOS los modelos antes de seguir', async () => {
  const okBytes = bytesOf('modelo-a');
  const okFp = await sha256Hex(okBytes);
  const badBytes = bytesOf('modelo-b');
  const badFp = await sha256Hex(bytesOf('otro-contenido'));
  await assert.rejects(
    verifyModelFingerprints([
      { fingerprint: okFp, name: 'A', bytes: okBytes },
      { fingerprint: badFp, name: 'B', bytes: badBytes },
    ]),
    /B/,
  );
});

test('verifyModelFingerprints rechaza huellas con formato inválido', async () => {
  const bytes = bytesOf('x');
  await assert.rejects(
    verifyModelFingerprints([{ fingerprint: 'no-es-sha', name: 'X', bytes }]),
    /huella/i,
  );
});

test('Pset de ocurrencia prevalece sobre tipo sin recorrer relaciones inversas',()=>{
  const prop=(value)=>({_category:{value:'IFCPROPERTYSET'},Name:{value:'Pset_SlabCommon'},HasProperties:[{Name:{value:'FireRating'},NominalValue:{value}}]});
  const type={_category:{value:'IFCSLABTYPE'},HasPropertySets:[prop('REI60')],ObjectTypeOf:[{IsDefinedBy:[prop('VALOR_AJENO')]}]};
  const data={_category:{value:'IFCSLAB'},IsDefinedBy:[type,prop('REI30')]};
  assert.equal(normalizeItem('m',53,data,'').properties['Pset_SlabCommon.FireRating'],'REI30');
  const onlyType={IsDefinedBy:[type]};
  assert.equal(normalizeItem('m',54,onlyType,'').properties['Pset_SlabCommon.FireRating'],'REI60');
});

test('normaliza bytes FRAG Uint8Array con offset sin agregar basura', async()=>{
  const {toOwnedBuffer}=await import('../src/services/model-workspace.ts');
  const raw=new Uint8Array([99,1,2,3,88]);const owned=toOwnedBuffer(raw.subarray(1,4));
  assert.ok(owned instanceof ArrayBuffer);assert.deepEqual([...new Uint8Array(owned)],[1,2,3]);
  assert.notEqual(toOwnedBuffer(owned),owned);
});

test('los colores de revisión dan prioridad a cualquier fallo', async () => {
  const { partitionQuality } = await import('../src/services/model-workspace.ts');
  const a={modelId:'m',localId:1},b={modelId:'m',localId:2};
  const out=partitionQuality([{element:a,pass:true},{element:a,pass:false},{element:b,pass:true},{element:b,pass:true}]);
  assert.deepEqual(out.fail,[a]);assert.deepEqual(out.pass,[b]);
});

test('verifyModelFingerprints no depende del hash de node:crypto (coincide)', async () => {
  const bytes = bytesOf('comparacion');
  const nodeFp = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  const ourFp = await sha256Hex(bytes);
  assert.equal(ourFp, nodeFp);
});