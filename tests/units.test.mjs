/**
 * Pruebas del normalizador de unidades IFC (RV9, REQUEST_CHANGES).
 *
 * Nodos sintéticos claramente rotulados con la MISMA forma que entrega el
 * motor real (atributos en mayúsculas UnitType/Name/Prefix tal como se
 * comprobó con EST_GT_C_R_v5.ifc). Casos de unidades SI con prefijo,
 * conversión (degree/foot), derivadas y desconocidas: no se inventa símbolo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUnit, unitsMapFromAssignment } from '../src/domain/units.ts';

const si = (unitType, name, prefix) => ({
  _category: { value: 'IFCSIUNIT' },
  UnitType: { value: unitType, type: 'IFCLABEL' },
  ...(prefix ? { Prefix: { value: prefix, type: 'IFCLABEL' } } : {}),
  ...(name ? { Name: { value: name, type: 'IFCLABEL' } } : {}),
});

test('normalizeUnit: SI base METRE → m', () => {
  const u = normalizeUnit(si('LENGTHUNIT', 'METRE'));
  assert.equal(u.unitType, 'LENGTHUNIT');
  assert.equal(u.symbol, 'm');
  assert.equal(u.prefix, null);
  assert.equal(u.name, 'METRE');
});

test('normalizeUnit: prefijo MILLI + METRE → mm', () => {
  const u = normalizeUnit(si('LENGTHUNIT', 'METRE', 'MILLI'));
  assert.equal(u.symbol, 'mm');
  assert.equal(u.prefix, 'MILLI');
});

test('normalizeUnit: prefijo respeta exponente en área y volumen', () => {
  assert.equal(normalizeUnit(si('AREAUNIT', 'SQUARE_METRE', 'MILLI')).symbol, 'mm²');
  assert.equal(normalizeUnit(si('VOLUMEUNIT', 'CUBIC_METRE', 'CENTI')).symbol, 'cm³');
});

test('normalizeUnit: prefijo KILO + GRAM → kg', () => {
  assert.equal(normalizeUnit(si('MASSUNIT', 'GRAM', 'KILO')).symbol, 'kg');
});

test('normalizeUnit: acepta atributos en minúscula del motor', () => {
  const u = normalizeUnit({
    _category: { value: 'IFCSIUNIT' },
    type: { value: 'lengthunit' },
    prefix: { value: 'MILLI' },
    name: { value: 'METRE' },
  });
  assert.equal(u.unitType, 'LENGTHUNIT');
  assert.equal(u.symbol, 'mm');
});

test('normalizeUnit: unidad de conversión muestra su nombre real', () => {
  const degree = normalizeUnit({ _category: { value: 'IFCCONVERSIONBASEDUNIT' }, UnitType: { value: 'PLANEANGLEUNIT' }, Name: { value: 'DEGREE' } });
  assert.equal(degree.symbol, '°');
  const foot = normalizeUnit({ _category: { value: 'IFCCONVERSIONBASEDUNIT' }, UnitType: { value: 'LENGTHUNIT' }, Name: { value: 'FOOT' } });
  assert.equal(foot.symbol, 'ft');
});

test('normalizeUnit: nombre SI desconocido no inventa símbolo', () => {
  const u = normalizeUnit(si('LENGTHUNIT', 'FURLONGISH'));
  assert.equal(u.symbol, null);
  assert.equal(u.name, 'FURLONGISH');
});

test('normalizeUnit: unidad derivada sin nombre no inventa símbolo', () => {
  const u = normalizeUnit({ _category: { value: 'IFCDERIVEDUNIT' }, UnitType: { value: 'USERDEFINED' }, UserDefinedType: { value: 'Algo' } });
  assert.equal(u.unitType, 'USERDEFINED');
  assert.equal(u.symbol, null);
});

test('normalizeUnit: null/ausente no inventa nada', () => {
  const u = normalizeUnit(null);
  assert.equal(u.unitType, null);
  assert.equal(u.symbol, null);
  assert.equal(u.name, null);
});

test('unitsMapFromAssignment: mapa por tipo de unidad con prefijo', () => {
  const map = unitsMapFromAssignment([
    si('LENGTHUNIT', 'METRE', 'MILLI'),
    si('AREAUNIT', 'SQUARE_METRE'),
    si('VOLUMEUNIT', 'CUBIC_METRE'),
    { _category: { value: null }, _localId: { value: 78 } },
    { _category: { value: 'IFCDERIVEDUNIT' }, UnitType: { value: 'USERDEFINED' } },
  ]);
  assert.equal(map.LENGTHUNIT, 'mm');
  assert.equal(map.AREAUNIT, 'm²');
  assert.equal(map.VOLUMEUNIT, 'm³');
  assert.equal(map.USERDEFINED, undefined, 'no inventa la derivada');
});

test('unitsMapFromAssignment: array vacío/no-array → mapa vacío', () => {
  assert.deepEqual(unitsMapFromAssignment([]), {});
  assert.deepEqual(unitsMapFromAssignment(null), {});
});
