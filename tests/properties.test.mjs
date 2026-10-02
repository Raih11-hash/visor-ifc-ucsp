/**
 * Pruebas del normalizador visual de propiedades IFC (RV9).
 *
 * Datos sintéticos claramente rotulados que imitan la forma real de
 * FragmentsModel.getItemsData. El caso real (IFCBEAM, Pset
 * 'Construction', H/V='H', Nivel='N4', Tipo de elemento='Vigas') se verifica
 * en el guion E2E real `scripts/smoke_properties_rv9.py` (npm run test:e2e:real),
 * que sirve `dist` y el IFC fuente local sin copiarlo a public ni a git.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeValue,
  normalizePropertyValue,
  buildTechnicalTree,
  unitTypeFor,
  buildElementProperties,
  filterElementProperties,
  countPropertyEntries,
  propertiesToTsv,
} from '../src/domain/properties.ts';

const attr = (value, type) => ({ value, type });

/** Fixture sintético con la MISMA forma que FragmentsModel.getItemsData. */
const syntheticBeam = () => ({
  _category: attr('IFCBEAM'),
  _localId: attr(254039),
  _guid: attr('3zSxltga9Eo8qEtsMwBJvC'),
  Name: attr('M_Concrete-Rectangular Beam:VD - 0.15x0.20:360813', 'IFCLABEL'),
  Tag: attr('360813', 'IFCIDENTIFIER'),
  PredefinedType: attr('BEAM', 'IFCLABEL'),
  IsDefinedBy: [
    {
      _category: attr('IFCBEAMTYPE'),
      _localId: attr(254030),
      _guid: attr('TYPE-GUID'),
      Name: attr('M_Concrete-Rectangular Beam:VD - 0.15x0.20', 'IFCLABEL'),
      HasPropertySets: [
        {
          _category: attr('IFCPROPERTYSET'),
          _localId: attr(254083),
          _guid: attr('PSET-TYPE-GUID'),
          Name: attr('Pset_BeamCommon', 'IFCLABEL'),
          HasProperties: [
            { _category: attr('IFCPROPERTYSINGLEVALUE'), _localId: attr(50), Name: attr('IsExternal', 'IFCIDENTIFIER'), NominalValue: attr(false, 'IFCBOOLEAN') },
          ],
        },
      ],
    },
    {
      _category: attr('IFCPROPERTYSET'),
      _localId: attr(254040),
      _guid: attr('PSET-DUP-GUID'),
      Name: attr('Pset_BeamCommon', 'IFCLABEL'),
      HasProperties: [
        { _category: attr('IFCPROPERTYSINGLEVALUE'), _localId: attr(99), Name: attr('LoadBearing', 'IFCIDENTIFIER'), NominalValue: attr(false, 'IFCBOOLEAN') },
      ],
    },
    {
      _category: attr('IFCPROPERTYSET'),
      _localId: attr(254075),
      _guid: attr('05YvLkmmws76MipZ12GMv5'),
      Name: attr('Construction', 'IFCLABEL'),
      HasProperties: [
        { _category: attr('IFCPROPERTYSINGLEVALUE'), _localId: attr(254063), Name: attr('H/V', 'IFCIDENTIFIER'), NominalValue: attr('H', 'IFCTEXT') },
        { _category: attr('IFCPROPERTYSINGLEVALUE'), _localId: attr(254064), Name: attr('Nivel', 'IFCIDENTIFIER'), NominalValue: attr('N4', 'IFCTEXT') },
        { _category: attr('IFCPROPERTYSINGLEVALUE'), _localId: attr(254065), Name: attr('Tipo de elemento', 'IFCIDENTIFIER'), NominalValue: attr('Vigas', 'IFCTEXT') },
      ],
    },
    {
      _category: attr('IFCELEMENTQUANTITY'),
      _localId: attr(254054),
      _guid: attr('QTO-GUID'),
      Name: attr('Qto_BeamBaseQuantities', 'IFCLABEL'),
      Quantities: [
        { _category: attr('IFCQUANTITYLENGTH'), _localId: attr(254047), Name: attr('Length', 'IFCLABEL'), Description: attr('', 'IFCTEXT'), LengthValue: attr(3.65, 'IFCLENGTHMEASURE') },
      ],
    },
  ],
  ContainedInStructure: [
    { _category: attr('IFCBUILDINGSTOREY'), _localId: attr(7), Name: attr('N4', 'IFCLABEL') },
  ],
  DefinesOccurrence: [{ _category: attr('IFCRELDEFINESBYTYPE'), _localId: attr(999) }],
});

const beam = () => buildElementProperties('m1', 254039, syntheticBeam());

test('buildElementProperties conserva identidad y no confunde Local ID con Express ID', () => {
  const el = beam();
  assert.equal(el.modelId, 'm1');
  assert.equal(el.localId, 254039);
  assert.equal(el.expressId, null);
  assert.equal(el.category, 'IFCBEAM');
  assert.equal(el.guid, '3zSxltga9Eo8qEtsMwBJvC');
  assert.equal(el.name, 'M_Concrete-Rectangular Beam:VD - 0.15x0.20:360813');
});

test('buildElementProperties separa nombre y valor del Pset de ocurrencia', () => {
  const el = beam();
  const group = el.groups.find((g) => g.name === 'Construction');
  assert.ok(group, 'falta el Pset Construction');
  assert.equal(group.origin, 'occurrence');
  assert.equal(group.kind, 'properties');
  const byName = Object.fromEntries(group.entries.map((e) => [e.name, e.value.display]));
  assert.equal(byName['H/V'], 'H');
  assert.equal(byName['Nivel'], 'N4');
  assert.equal(byName['Tipo de elemento'], 'Vigas');
});

test('buildElementProperties agrupa cantidades con su tipo y unidad real', () => {
  const el = buildElementProperties('m1', 254039, syntheticBeam(), { unitMap: { LENGTHUNIT: 'm' } });
  const group = el.groups.find((g) => g.name === 'Qto_BeamBaseQuantities');
  assert.ok(group, 'falta el grupo de cantidades');
  assert.equal(group.kind, 'quantities');
  const entry = group.entries.find((e) => e.name === 'Length');
  assert.equal(entry.value.kind, 'measure');
  assert.equal(entry.value.display, '3.65 m');
});

test('buildElementProperties da precedencia a la ocurrencia sobre el tipo', () => {
  const el = beam();
  const groups = el.groups.filter((g) => g.name === 'Pset_BeamCommon');
  assert.equal(groups.length, 1, 'el grupo del tipo no debe duplicar el de ocurrencia');
  const entry = groups[0].entries.find((e) => e.name === 'LoadBearing');
  assert.equal(entry.value.display, 'False');
});

test('buildElementProperties incluye atributos de identidad del elemento', () => {
  const el = beam();
  const attrs = el.groups.find((g) => g.kind === 'attributes');
  assert.ok(attrs, 'falta el grupo de atributos');
  const byName = Object.fromEntries(attrs.entries.map((e) => [e.name, e.value.display]));
  assert.equal(byName['GlobalId'], '3zSxltga9Eo8qEtsMwBJvC');
  assert.equal(byName['Name'], 'M_Concrete-Rectangular Beam:VD - 0.15x0.20:360813');
});

test('buildElementProperties ignora relaciones inversas que contaminarían', () => {
  const el = beam();
  assert.equal(el.groups.some((g) => g.name === 'DefinesOccurrence'), false);
  assert.equal(el.groups.some((g) => g.name === 'ContainedInStructure'), false);
});

test('buildElementProperties protege contra ciclos en referencias', () => {
  const cyclic = {
    _category: attr('IFCBEAM'),
    _localId: attr(1),
    _guid: attr('CYC'),
    IsDefinedBy: [],
  };
  cyclic.IsDefinedBy.push(cyclic);
  const el = buildElementProperties('m1', 1, cyclic);
  assert.equal(el.groups.filter((g) => g.kind === 'attributes').length, 1);
});

test('filterElementProperties conserva grupos con coincidencias y recorta el resto', () => {
  const el = beam();
  const filtered = filterElementProperties(el, 'h/v');
  const names = filtered.groups.flatMap((g) => g.entries.map((e) => e.name));
  assert.ok(names.includes('H/V'));
  assert.equal(names.includes('Nivel'), false);
});

test('filterElementProperties busca también en el valor', () => {
  const el = beam();
  const filtered = filterElementProperties(el, 'vigas');
  const names = filtered.groups.flatMap((g) => g.entries.map((e) => e.name));
  assert.ok(names.includes('Tipo de elemento'));
});

test('countPropertyEntries cuenta todas las filas visibles', () => {
  const el = beam();
  const total = el.groups.reduce((n, g) => n + g.entries.length, 0);
  assert.equal(countPropertyEntries(el), total);
  assert.ok(total >= 5);
});

test('propertiesToTsv separa nombre y valor y neutraliza fórmulas', () => {
  const el = beam();
  el.groups[0].entries[0] = { name: '=1+1', value: normalizeValue(attr('=2+2', 'IFCTEXT')) };
  const tsv = propertiesToTsv([el]);
  const lines = tsv.split('\n');
  assert.equal(lines[0], 'Elemento\tGlobalId\tGrupo\tPropiedad\tValor\tTipo');
  assert.ok(lines.some((l) => l.includes("'=1+1") && l.includes("'=2+2")), 'celdas no neutralizadas');
});

test('buildElementProperties conserva la Description opcional del IFC', () => {
  const data = syntheticBeam();
  const construction = data.IsDefinedBy.find((n) => n.Name.value === 'Construction');
  construction.HasProperties.push({
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    _localId: attr(700),
    Name: attr('Comentario', 'IFCIDENTIFIER'),
    Description: attr('Nota del revisor', 'IFCTEXT'),
    NominalValue: attr('x', 'IFCTEXT'),
  });
  const group = buildElementProperties('m1', 254039, data).groups.find((g) => g.name === 'Construction');
  const entry = group.entries.find((e) => e.name === 'Comentario');
  assert.equal(entry.description.display, 'Nota del revisor');
});

test('buildElementProperties no expone claves internas como atributos', () => {
  const el = beam();
  const attrs = el.groups.find((g) => g.kind === 'attributes');
  assert.equal(attrs.entries.some((e) => e.name.startsWith('_')), false);
});

test('buildElementProperties representa un valor nulo como kind null, no vacío inventado', () => {
  const data = syntheticBeam();
  const construction = data.IsDefinedBy.find((n) => n.Name.value === 'Construction');
  construction.HasProperties.push({
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    _localId: attr(701),
    Name: attr('Observaciones', 'IFCIDENTIFIER'),
    NominalValue: attr(null, 'IFCTEXT'),
  });
  const group = buildElementProperties('m1', 254039, data).groups.find((g) => g.name === 'Construction');
  const entry = group.entries.find((e) => e.name === 'Observaciones');
  assert.equal(entry.value.kind, 'null');
  assert.equal(entry.value.display, '');
});

test('normalizeValue: IFCTEXT conserva el texto y su tipo', () => {
  const v = normalizeValue(attr('H', 'IFCTEXT'));
  assert.equal(v.kind, 'text');
  assert.equal(v.raw, 'H');
  assert.equal(v.display, 'H');
  assert.equal(v.ifcType, 'IFCTEXT');
  assert.equal(v.unit, null);
});

test('normalizeValue: IFCLABEL e IFCIDENTIFIER son texto', () => {
  assert.equal(normalizeValue(attr('Vigas', 'IFCLABEL')).kind, 'text');
  assert.equal(normalizeValue(attr('N4', 'IFCIDENTIFIER')).kind, 'text');
  assert.equal(normalizeValue(attr('N4', 'IFCIDENTIFIER')).display, 'N4');
});

test('normalizeValue: IFCBOOLEAN se muestra True/False conservando el booleano', () => {
  const t = normalizeValue(attr(true, 'IFCBOOLEAN'));
  assert.equal(t.kind, 'boolean');
  assert.equal(t.raw, true);
  assert.equal(t.display, 'True');
  const f = normalizeValue(attr(false, 'IFCBOOLEAN'));
  assert.equal(f.raw, false);
  assert.equal(f.display, 'False');
});

test('normalizeValue: IFCINTEGER e IFCREAL conservan el número', () => {
  const i = normalizeValue(attr(5, 'IFCINTEGER'));
  assert.equal(i.kind, 'integer');
  assert.equal(i.raw, 5);
  assert.equal(i.display, '5');
  const r = normalizeValue(attr(1.5, 'IFCREAL'));
  assert.equal(r.kind, 'real');
  assert.equal(r.display, '1.5');
});

test('normalizeValue: una medida no se redondea ni inventa unidad', () => {
  const v = normalizeValue(attr(3.6500000000000568, 'IFCLENGTHMEASURE'));
  assert.equal(v.kind, 'measure');
  assert.equal(v.raw, 3.6500000000000568);
  assert.equal(v.display, '3.6500000000000568');
  assert.equal(v.unit, null);
});

test('normalizeValue: la unidad solo aparece si el IFC la aporta', () => {
  const v = normalizeValue(attr(3.65, 'IFCLENGTHMEASURE'), { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.display, '3.65 m');
  assert.equal(v.unit, 'm');
});

test('normalizeValue: null ($) se representa explícitamente, no como texto vacío', () => {
  const v = normalizeValue(attr(null, 'IFCLABEL'));
  assert.equal(v.kind, 'null');
  assert.equal(v.raw, null);
  assert.equal(v.display, '');
});

test('normalizeValue: atributo ausente es null, no unknown inventado', () => {
  const v = normalizeValue(undefined);
  assert.equal(v.kind, 'null');
  assert.equal(v.raw, null);
});

test('normalizeValue: una referencia conserva categoría, localId y guid', () => {
  const ref = { _category: { value: 'IFCBEAMTYPE' }, _localId: { value: 254030 }, _guid: { value: 'G-1' }, Name: { value: 'Tipo Viga' } };
  const v = normalizeValue(ref);
  assert.equal(v.kind, 'reference');
  assert.equal(v.reference.category, 'IFCBEAMTYPE');
  assert.equal(v.reference.localId, 254030);
  assert.equal(v.reference.guid, 'G-1');
  assert.equal(v.reference.name, 'Tipo Viga');
});

test('unitTypeFor mapea medidas a su unidad IFC sin inventar', () => {
  assert.equal(unitTypeFor('IFCLENGTHMEASURE'), 'LENGTHUNIT');
  assert.equal(unitTypeFor('IFCAREAMEASURE'), 'AREAUNIT');
  assert.equal(unitTypeFor('IFCVOLUMEMEASURE'), 'VOLUMEUNIT');
  assert.equal(unitTypeFor('IFCTEXT'), null);
});

// ---------- REQUEST_CHANGES: booleanos/lógicos ----------

test('normalizeValue: .F. y sus variantes son False, no True', () => {
  for (const value of ['.F.', 'F', 'false', 'FALSE', 'False', '0', 0, false]) {
    const v = normalizeValue(attr(value, 'IFCBOOLEAN'));
    assert.equal(v.kind, 'boolean', `kind de ${JSON.stringify(value)}`);
    assert.equal(v.display, 'False', `display de ${JSON.stringify(value)}`);
  }
});

test('normalizeValue: .T. y sus variantes son True', () => {
  for (const value of ['.T.', 'T', 'true', 'TRUE', 'True', '1', 1, true]) {
    const v = normalizeValue(attr(value, 'IFCBOOLEAN'));
    assert.equal(v.display, 'True', `display de ${JSON.stringify(value)}`);
  }
});

test('normalizeValue: IFCLOGICAL .U. es desconocido, nunca True', () => {
  const v = normalizeValue(attr('.U.', 'IFCLOGICAL'));
  assert.equal(v.kind, 'boolean');
  assert.equal(v.bool, null);
  assert.notEqual(v.display, 'True');
  assert.equal(v.display, 'Unknown');
  assert.equal(v.raw, '.U.', 'el valor original se conserva tal cual');
});

test('normalizeValue: string booleano malformado no se asume True', () => {
  const v = normalizeValue(attr('quizá', 'IFCBOOLEAN'));
  assert.equal(v.bool, null);
  assert.notEqual(v.display, 'True');
  assert.equal(v.display, 'Unknown');
  assert.equal(v.raw, 'quizá');
});

test('normalizeValue: conserva raw y tipo originales en booleanos', () => {
  const v = normalizeValue(attr('.F.', 'IFCBOOLEAN'));
  assert.equal(v.raw, '.F.');
  assert.equal(v.ifcType, 'IFCBOOLEAN');
  assert.equal(v.bool, false);
});

// ---------- REQUEST_CHANGES: referencias handle web-ifc ----------

test('normalizeValue: handle web-ifc {value,type:5} es referencia verídica', () => {
  const v = normalizeValue({ value: 254030, type: 5 });
  assert.equal(v.kind, 'reference');
  assert.equal(v.reference.expressId, 254030);
  assert.equal(v.reference.localId, null);
  assert.equal(v.reference.category, null);
  assert.ok(v.display.includes('254030'));
});

test('normalizeValue: {value:number} sin type sigue siendo número, no referencia', () => {
  const v = normalizeValue(attr(8, 'IFCINTEGER'));
  assert.equal(v.kind, 'integer');
  assert.equal(v.raw, 8);
});

// ---------- REQUEST_CHANGES: propiedades compuestas ----------

test('normalizePropertyValue: bounded conserva LowerBound, UpperBound y SetPoint', () => {
  const prop = {
    _category: attr('IFCPROPERTYBOUNDEDVALUE'),
    Name: attr('Limites', 'IFCIDENTIFIER'),
    LowerBoundValue: attr(1, 'IFCLENGTHMEASURE'),
    UpperBoundValue: attr(5, 'IFCLENGTHMEASURE'),
    SetPointValue: attr(3, 'IFCLENGTHMEASURE'),
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.components.length, 3, 'no debe perder ninguna cota');
  const labels = v.components.map((c) => c.label);
  assert.deepEqual(labels, ['LowerBound', 'UpperBound', 'SetPoint']);
  const values = v.components.map((c) => c.value.display);
  assert.deepEqual(values, ['1 m', '5 m', '3 m']);
  assert.ok(v.display.includes('LowerBound') && v.display.includes('SetPoint'));
});

test('normalizePropertyValue: enumerated conserva todos los valores', () => {
  const prop = {
    _category: attr('IFCPROPERTYENUMERATEDVALUE'),
    Name: attr('Color', 'IFCIDENTIFIER'),
    EnumerationValues: [attr('Rojo', 'IFCLABEL'), attr('Verde', 'IFCLABEL')],
  };
  const v = normalizePropertyValue(prop);
  assert.equal(v.components.length, 2);
  assert.equal(v.display, 'Rojo; Verde');
});

test('normalizePropertyValue: list conserva todos los valores', () => {
  const prop = {
    _category: attr('IFCPROPERTYLISTVALUE'),
    Name: attr('Lados', 'IFCIDENTIFIER'),
    ListValues: [attr(1, 'IFCINTEGER'), attr(2, 'IFCINTEGER')],
  };
  const v = normalizePropertyValue(prop);
  assert.equal(v.components.length, 2);
  assert.equal(v.display, '1; 2');
});

test('normalizePropertyValue: complex conserva sus sub-propiedades', () => {
  const prop = {
    _category: attr('IFCPROPERTYCOMPLEX'),
    Name: attr('Compleja', 'IFCIDENTIFIER'),
    HasProperties: [
      { _category: attr('IFCPROPERTYSINGLEVALUE'), Name: attr('A', 'IFCIDENTIFIER'), NominalValue: attr('x', 'IFCTEXT') },
      { _category: attr('IFCPROPERTYSINGLEVALUE'), Name: attr('B', 'IFCIDENTIFIER'), NominalValue: attr(2, 'IFCINTEGER') },
    ],
  };
  const v = normalizePropertyValue(prop);
  assert.equal(v.components.length, 2);
  assert.deepEqual(v.components.map((c) => c.label), ['A', 'B']);
  assert.ok(v.display.includes('A: x') && v.display.includes('B: 2'));
});

test('normalizePropertyValue: la Unit explícita manda sobre la global', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: { _category: attr('IFCSIUNIT'), UnitType: attr('LENGTHUNIT', 'IFCLABEL'), Prefix: attr('MILLI', 'IFCLABEL'), Name: attr('METRE', 'IFCLABEL') },
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.unit, 'mm', 'la unidad propia del valor prevalece');
  assert.equal(v.display, '0.15 mm');
});

test('normalizePropertyValue: sin Unit propia cae a la unidad global', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.unit, 'm');
});

// ---------- FIX: Unit explícita no resoluble y envoltura {value: …} ----------

test('normalizePropertyValue: Unit handle sin resolver NO adjudica la global y muestra #78', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: { value: 78, type: 5 },
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.raw, 0.15, 'el número original no se altera');
  assert.equal(v.ifcType, 'IFCLENGTHMEASURE', 'el tipo original no se altera');
  assert.notEqual(v.display, '0.15 m', 'no debe adjudicar la unidad global');
  assert.ok(!v.display.includes(' m'), 'ninguna unidad global filtrada');
  assert.ok(v.display.includes('#78'), 'muestra la referencia real al Express ID');
  assert.ok(v.unit !== null && v.unit.includes('#78'));
});

test('normalizePropertyValue: Unit envuelto {value: entidad SI} resuelve mm, no la global', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: {
      value: {
        _category: attr('IFCSIUNIT'),
        _localId: attr(78),
        Name: attr('METRE', 'IFCLABEL'),
        Prefix: attr('MILLI', 'IFCLABEL'),
        UnitType: attr('LENGTHUNIT', 'IFCLABEL'),
      },
    },
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.raw, 0.15);
  assert.equal(v.unit, 'mm');
  assert.equal(v.display, '0.15 mm');
});

test('normalizePropertyValue: Unit presente pero nulo hereda la unidad global', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: { value: null, type: 'IFCLABEL' },
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.equal(v.unit, 'm');
  assert.equal(v.display, '0.15 m');
});

test('normalizePropertyValue: Unit desconocida no muestra la global ni inventa símbolo', () => {
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: { _category: attr('IFCDERIVEDUNIT'), _localId: attr(90) },
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.notEqual(v.unit, 'm');
  assert.notEqual(v.display, '0.15 m');
  assert.ok(v.display.includes('#90'), 'referencia verídica Local ID de la unidad');
  assert.equal(v.raw, 0.15);
  assert.equal(v.ifcType, 'IFCLENGTHMEASURE');
});

test('normalizePropertyValue: bounded aplica la unidad propia a sus cotas antes de componer', () => {
  const prop = {
    _category: attr('IFCPROPERTYBOUNDEDVALUE'),
    Name: attr('Limites', 'IFCIDENTIFIER'),
    Unit: {
      _category: attr('IFCSIUNIT'),
      UnitType: attr('LENGTHUNIT', 'IFCLABEL'),
      Prefix: attr('MILLI', 'IFCLABEL'),
      Name: attr('METRE', 'IFCLABEL'),
    },
    LowerBoundValue: attr(1, 'IFCLENGTHMEASURE'),
    UpperBoundValue: attr(5, 'IFCLENGTHMEASURE'),
    SetPointValue: attr(3, 'IFCLENGTHMEASURE'),
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.deepEqual(v.components.map((c) => c.value.display), ['1 mm', '5 mm', '3 mm']);
  assert.deepEqual(v.components.map((c) => c.value.unit), ['mm', 'mm', 'mm']);
});

test('normalizePropertyValue: Unit envuelto en ciclo no cuelga y no adjudica la global', () => {
  const cyclicUnit = { value: null };
  cyclicUnit.value = cyclicUnit;
  const prop = {
    _category: attr('IFCPROPERTYSINGLEVALUE'),
    Name: attr('Ancho', 'IFCIDENTIFIER'),
    NominalValue: attr(0.15, 'IFCLENGTHMEASURE'),
    Unit: cyclicUnit,
  };
  const v = normalizePropertyValue(prop, { unitMap: { LENGTHUNIT: 'm' } });
  assert.notEqual(v.display, '0.15 m');
  assert.ok(v.unit === null || v.unit.includes('unidad'));
});

// ---------- REQUEST_CHANGES: árbol técnico ----------

test('buildTechnicalTree expone categoría, IDs, atributos, referencias y relaciones', () => {
  const tree = buildTechnicalTree(syntheticBeam());
  assert.equal(tree.category, 'IFCBEAM');
  assert.equal(tree.localId, 254039);
  assert.equal(tree.expressId, null, 'no confunde Local ID con Express ID');
  assert.equal(tree.guid, '3zSxltga9Eo8qEtsMwBJvC');
  const attrNames = tree.attributes.map((a) => a.name);
  assert.ok(attrNames.includes('Name') && attrNames.includes('Tag'));
  const relNames = tree.relationships.map((r) => r.name);
  assert.ok(relNames.includes('IsDefinedBy'), 'conserva las relaciones');
  const isDefined = tree.relationships.find((r) => r.name === 'IsDefinedBy');
  assert.ok(isDefined.nodes.some((n) => n.category === 'IFCBEAMTYPE'));
});

test('buildTechnicalTree no entra en ciclos', () => {
  const cyclic = { _category: attr('IFCBEAM'), _localId: attr(1), _guid: attr('CYC'), IsDefinedBy: [] };
  cyclic.IsDefinedBy.push(cyclic);
  const tree = buildTechnicalTree(cyclic);
  assert.equal(tree.category, 'IFCBEAM');
  assert.ok(tree.relationships.length >= 1);
});