import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FILTER,
  evaluateRules,
  filterElements,
  qualityToCsv,
  recordsToCsv,
  summarizeElements,
} from '../src/domain/catalog.ts';

const row = (over = {}) => ({
  modelId: 'm1',
  localId: 1,
  guid: 'GUID-1',
  category: 'IFCWALL',
  name: 'Muro',
  type: 'Basic Wall',
  level: 'Nivel 1',
  properties: {},
  ...over,
});

test('DEFAULT_FILTER is a plain fresh empty filter spec', () => {
  assert.deepEqual(DEFAULT_FILTER, {
    category: '',
    level: '',
    text: '',
    propertyName: '',
    propertyValue: '',
  });
});

test('filterElements returns all rows when the spec has no constraints', () => {
  const rows = [row(), row({ localId: 2 })];
  assert.equal(filterElements(rows, DEFAULT_FILTER).length, 2);
});

test('filterElements matches category exactly', () => {
  const rows = [row(), row({ localId: 2, category: 'IFCDOOR' })];
  const out = filterElements(rows, { ...DEFAULT_FILTER, category: 'IFCDOOR' });
  assert.deepEqual(out.map((r) => r.localId), [2]);
});

test('filterElements text search is case and diacritic insensitive over name', () => {
  const rows = [
    row({ name: 'Muro' }),
    row({ localId: 2, name: 'Ventana' }),
    row({ localId: 3, name: 'MÚRO curvo' }),
  ];
  const out = filterElements(rows, { ...DEFAULT_FILTER, text: 'muro' });
  assert.deepEqual(out.map((r) => r.localId), [1, 3]);
});

test('filterElements matches level exactly', () => {
  const rows = [
    row({ level: 'Nivel 1' }),
    row({ localId: 2, level: 'Nivel 2' }),
    row({ localId: 3, level: 'Nivel 10' }),
  ];
  const out = filterElements(rows, { ...DEFAULT_FILTER, level: 'Nivel 1' });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements text search spans guid, type, category and level', () => {
  const rows = [
    row({ guid: 'ABC-42', type: 'Otro' }),
    row({ localId: 2, type: 'Basic Wall' }),
    row({ localId: 3, category: 'IFCDOOR', type: 'Otro' }),
    row({ localId: 4, level: 'Azotea', type: 'Otro' }),
    row({ localId: 5, name: 'Nada', type: 'Otro' }),
  ];
  assert.deepEqual(
    filterElements(rows, { ...DEFAULT_FILTER, text: 'abc-42' }).map((r) => r.localId),
    [1],
  );
  assert.deepEqual(
    filterElements(rows, { ...DEFAULT_FILTER, text: 'basic' }).map((r) => r.localId),
    [2],
  );
  assert.deepEqual(
    filterElements(rows, { ...DEFAULT_FILTER, text: 'ifcdoor' }).map((r) => r.localId),
    [3],
  );
  assert.deepEqual(
    filterElements(rows, { ...DEFAULT_FILTER, text: 'azotea' }).map((r) => r.localId),
    [4],
  );
});

test('filterElements combines multiple constraints with AND', () => {
  const rows = [
    row({ category: 'IFCWALL', level: 'Nivel 1', name: 'Muro A' }),
    row({ localId: 2, category: 'IFCWALL', level: 'Nivel 2', name: 'Muro B' }),
    row({ localId: 3, category: 'IFCDOOR', level: 'Nivel 1', name: 'Muro C' }),
  ];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    category: 'IFCWALL',
    level: 'Nivel 1',
    text: 'muro',
  });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements propertyName requires the key to be present', () => {
  const rows = [
    row({ properties: { FireRating: 'REI 120' } }),
    row({ localId: 2, properties: { Other: 'x' } }),
  ];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    propertyName: 'FireRating',
  });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements propertyValue is a case-insensitive contains', () => {
  const rows = [
    row({ properties: { FireRating: 'REI 120' } }),
    row({ localId: 2, properties: { FireRating: 'R 30' } }),
  ];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    propertyName: 'FireRating',
    propertyValue: 'rei',
  });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements absent property never matches even with blank propertyValue', () => {
  const rows = [row({ properties: {} }), row({ localId: 2, properties: { A: 'x' } })];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    propertyName: 'A',
    propertyValue: '',
  });
  assert.deepEqual(out.map((r) => r.localId), [2]);
});

test('filterElements propertyName matches pset-qualified flattened keys exactly', () => {
  const rows = [
    row({ properties: { 'Pset_WallCommon.FireRating': 'REI 120' } }),
    row({ localId: 2, properties: { FireRating: 'REI 120' } }),
  ];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    propertyName: 'Pset_WallCommon.FireRating',
  });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements text search also spans property values', () => {
  const rows = [
    row({ properties: { Material: 'Hormigón armado' } }),
    row({ localId: 2, properties: { Material: 'Acero' } }),
  ];
  const out = filterElements(rows, { ...DEFAULT_FILTER, text: 'hormigon' });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('filterElements does not traverse the prototype chain', () => {
  const rows = [row({ properties: {} })];
  const out = filterElements(rows, {
    ...DEFAULT_FILTER,
    propertyName: 'toString',
    propertyValue: '',
  });
  assert.deepEqual(out, []);
});

test('filterElements text search ignores non-string property values safely', () => {
  const rows = [
    row({ properties: { Count: 42, Flag: true, Empty: null } }),
    row({ localId: 2, properties: { Count: 7 } }),
  ];
  const out = filterElements(rows, { ...DEFAULT_FILTER, text: '42' });
  assert.deepEqual(out.map((r) => r.localId), [1]);
});

test('summarizeElements reports total and grouped counts sorted by count then label', () => {
  const rows = [
    row({ category: 'IFCWALL', level: 'Nivel 1' }),
    row({ localId: 2, category: 'IFCWALL', level: 'Nivel 2' }),
    row({ localId: 3, category: 'IFCDOOR', level: 'Nivel 1' }),
  ];
  const summary = summarizeElements(rows);
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.categories, [
    { label: 'IFCWALL', count: 2 },
    { label: 'IFCDOOR', count: 1 },
  ]);
  assert.deepEqual(summary.levels, [
    { label: 'Nivel 1', count: 2 },
    { label: 'Nivel 2', count: 1 },
  ]);
});

test('summarizeElements breaks count ties by label ascending', () => {
  const rows = [
    row({ category: 'IFCDOOR' }),
    row({ localId: 2, category: 'IFCWALL' }),
  ];
  const summary = summarizeElements(rows);
  assert.deepEqual(summary.categories, [
    { label: 'IFCDOOR', count: 1 },
    { label: 'IFCWALL', count: 1 },
  ]);
});

test('summarizeElements of an empty catalog is empty', () => {
  assert.deepEqual(summarizeElements([]), {
    total: 0,
    categories: [],
    levels: [],
  });
});

const rule = (over = {}) => ({
  id: 'r1',
  name: 'Regla',
  category: '',
  field: 'Name',
  operator: 'required',
  expected: '',
  ...over,
});

test('evaluateRules required treats blank and missing as failing', () => {
  const rows = [
    row({ name: 'Muro' }),
    row({ localId: 2, name: '' }),
    row({ localId: 3, name: '   ' }),
  ];
  const results = evaluateRules(rows, [rule({ field: 'Name' })]);
  assert.deepEqual(results.map((r) => [r.element.localId, r.pass]), [
    [1, true],
    [2, false],
    [3, false],
  ]);
});

test('evaluateRules required accepts falsy-but-present 0 and false', () => {
  const rows = [
    row({ properties: { Qty: 0, Flag: false } }),
    row({ localId: 2, properties: { Qty: null } }),
    row({ localId: 3, properties: {} }),
  ];
  const qty = evaluateRules(rows, [
    rule({ field: 'Qty', operator: 'required' }),
  ]);
  assert.deepEqual(qty.map((r) => [r.element.localId, r.pass]), [
    [1, true],
    [2, false],
    [3, false],
  ]);
  const flag = evaluateRules(rows, [
    rule({ field: 'Flag', operator: 'required' }),
  ]);
  assert.deepEqual(flag.map((r) => [r.element.localId, r.pass]), [
    [1, true],
    [2, false],
    [3, false],
  ]);
});

test('evaluateRules equals trims and compares case-insensitively', () => {
  const rows = [
    row({ level: 'Nivel 1' }),
    row({ localId: 2, level: '  nivel 1 ' }),
    row({ localId: 3, level: 'Nivel 2' }),
  ];
  const results = evaluateRules(rows, [
    rule({ field: 'Level', operator: 'equals', expected: 'NIVEL 1' }),
  ]);
  assert.deepEqual(results.map((r) => [r.element.localId, r.pass]), [
    [1, true],
    [2, true],
    [3, false],
  ]);
});

test('evaluateRules equals never lets a missing value pass', () => {
  const rows = [row({ properties: {} })];
  const results = evaluateRules(rows, [
    rule({ field: 'FireRating', operator: 'equals', expected: 'REI 120' }),
  ]);
  assert.equal(results[0].pass, false);
});

test('evaluateRules maps special fields to record columns', () => {
  const rows = [row({ guid: 'G-1', type: 'Muro', level: 'Nivel 1' })];
  const checks = evaluateRules(rows, [
    rule({ id: 'a', field: 'GlobalId', operator: 'equals', expected: 'g-1' }),
    rule({ id: 'b', field: 'ObjectType', operator: 'equals', expected: 'muro' }),
    rule({ id: 'c', field: 'Level', operator: 'equals', expected: 'Nivel 1' }),
  ]);
  assert.deepEqual(checks.map((r) => [r.ruleId, r.pass]), [
    ['a', true],
    ['b', true],
    ['c', true],
  ]);
});

test('evaluateRules category scopes which elements are checked', () => {
  const rows = [
    row({ category: 'IFCWALL', name: '' }),
    row({ localId: 2, category: 'IFCDOOR', name: '' }),
  ];
  const scoped = evaluateRules(rows, [
    rule({ category: 'IFCWALL', field: 'Name' }),
  ]);
  assert.deepEqual(scoped.map((r) => r.element.localId), [1]);
  assert.equal(scoped[0].pass, false);

  const all = evaluateRules(rows, [
    rule({ category: '*', field: 'Name' }),
  ]);
  assert.deepEqual(all.map((r) => r.element.localId), [1, 2]);

  const allBlank = evaluateRules(rows, [
    rule({ category: '', field: 'Name' }),
  ]);
  assert.deepEqual(allBlank.map((r) => r.element.localId), [1, 2]);
});

test('evaluateRules produces no rows when no element is applicable', () => {
  const rows = [row({ category: 'IFCDOOR' })];
  const results = evaluateRules(rows, [
    rule({ category: 'IFCWALL', field: 'Name' }),
  ]);
  assert.deepEqual(results, []);
});

test('evaluateRules result carries element, rule identity, actual and a Spanish reason', () => {
  const rows = [row({ name: '' })];
  const results = evaluateRules(rows, [rule({ id: 'x', name: 'Nombre obligatorio' })]);
  assert.equal(results.length, 1);
  const [res] = results;
  assert.equal(res.element.localId, 1);
  assert.equal(res.ruleId, 'x');
  assert.equal(res.ruleName, 'Nombre obligatorio');
  assert.equal(res.pass, false);
  assert.equal(typeof res.actual, 'string');
  assert.equal(typeof res.reason, 'string');
  assert.ok(res.reason.length > 0);
});

test('recordsToCsv writes a header and one line per element', () => {
  const csv = recordsToCsv([row(), row({ localId: 2, name: 'Ventana' })]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Name,GlobalId,Category,Type,Level');
  assert.equal(lines[1], 'Muro,GUID-1,IFCWALL,Basic Wall,Nivel 1');
  assert.equal(lines[2], 'Ventana,GUID-1,IFCWALL,Basic Wall,Nivel 1');
});

test('recordsToCsv of an empty catalog is just the header', () => {
  assert.equal(recordsToCsv([]), 'Name,GlobalId,Category,Type,Level');
});

test('recordsToCsv quotes fields containing delimiters, quotes or newlines', () => {
  const csv = recordsToCsv([
    row({ name: 'Muro, A', type: 'Wall "X"', level: 'Nivel\n1' }),
  ]);
  assert.equal(
    csv,
    'Name,GlobalId,Category,Type,Level\n' +
      '"Muro, A",GUID-1,IFCWALL,"Wall ""X""","Nivel\n1"',
  );
});

test('recordsToCsv neutralizes spreadsheet formula injection', () => {
  const csv = recordsToCsv([
    row({ name: '=1+1', guid: '+cmd', category: '@SUM', type: '-2', level: '\tX' }),
  ]);
  const line = csv.split('\n')[1];
  assert.equal(line, "'=1+1,'+cmd,'@SUM,'-2,'\tX");
});

test('recordsToCsv neutralizes a malicious label carrying both a formula and a comma', () => {
  const csv = recordsToCsv([row({ name: '=HYPERLINK("x","y")' })]);
  const line = csv.split('\n')[1];
  assert.ok(line.startsWith('"\'=HYPERLINK(""x"",""y"")"'));
});

test('qualityToCsv writes a header and one line per result', () => {
  const rows = [row({ name: '' })];
  const results = evaluateRules(rows, [
    rule({ id: 'x', name: 'Nombre obligatorio' }),
  ]);
  const csv = qualityToCsv(results);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Name,GlobalId,RuleId,RuleName,Pass,Actual,Reason');
  assert.equal(
    lines[1],
    ',GUID-1,x,Nombre obligatorio,false,,Valor requerido ausente',
  );
});

test('qualityToCsv protects the actual value against formula injection', () => {
  const rows = [row({ properties: { Qty: '=9' } })];
  const results = evaluateRules(rows, [
    rule({ field: 'Qty', operator: 'required' }),
  ]);
  const csv = qualityToCsv(results);
  const line = csv.split('\n')[1];
  assert.ok(line.includes(",'=9,"));
});

test('CSV neutraliza fórmulas precedidas de espacios o saltos', () => {
  for (const name of ['  =1+1','\n=1+1','\r=1+1','\t=1+1']) {
    const csv=recordsToCsv([row({name})]);
    assert.ok(csv.includes("'"+name.replaceAll('"','""')),name);
  }
});

test('qualityToCsv of no results is just the header', () => {
  assert.equal(
    qualityToCsv([]),
    'Name,GlobalId,RuleId,RuleName,Pass,Actual,Reason',
  );
});