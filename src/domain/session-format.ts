// Formato portátil y validado de sesiones del Visor IFC UCSP v2.0.
// - validateSnapshot: valida y clona una instantánea en memoria (ArrayBuffers).
// - encodeSession: serializa a JSON con los bytes de modelo en base64.
// - parseSession: valida un JSON externo (base64) y reconstruye la instantánea.
// - getSessionMeta: resumen ligero para listados.
//
// Nota de seguridad: el códec NO verifica criptográficamente la huella SHA-256
// contra los bytes; solo valida su formato. La verificación real la hace quien
// restaura la sesión (comparación async SHA-256 antes de cargar el modelo).
import type { FilterSpec, QualityRule } from './catalog.ts';

export interface SessionModel {
  fingerprint: string;
  name: string;
  fileName: string;
  format: 'ifc' | 'frag';
  bytes: ArrayBuffer;
}

export interface ElementRef {
  fingerprint: string;
  guid: string;
  localId: number;
}

export interface CameraState {
  eye: number[];
  target: number[];
  projection: 'Perspective' | 'Orthographic';
}

export interface ColorGroup {
  color: string;
  items: ElementRef[];
}

export interface SavedView {
  name: string;
  camera: CameraState;
}

export interface SavedQuery {
  name: string;
  filter: FilterSpec;
}

export interface SessionState {
  camera: CameraState;
  filter: FilterSpec;
  rules: QualityRule[];
  selection: ElementRef[];
  hidden: ElementRef[];
  colors: ColorGroup[];
  views: SavedView[];
  queries: SavedQuery[];
}

export interface SessionSnapshot {
  schema: 'visor-ifc-session';
  schemaVersion: 2;
  appVersion: '2.0.0' | '2.1.0' | '2.1.1';
  id: string;
  name: string;
  savedAt: string;
  models: SessionModel[];
  state: SessionState;
}

export interface SessionMeta {
  id: string;
  name: string;
  savedAt: string;
  modelCount: number;
  bytes: number;
}

// Límites (en bytes cuando aplica).
const MIB = 1024 * 1024;
const MAX_MODEL_BYTES = 100 * MIB;
const MAX_TOTAL_MODEL_BYTES = 200 * MIB;
const MAX_MODELS = 10;
const MAX_JSON_CHARS = 300 * MIB;
const MAX_RULES = 100;
const MAX_REFS = 200000;
const MAX_COLORS = 200000;
const MAX_VIEWS = 100;
const MAX_QUERIES = 50;
const MAX_STRING = 1024;
const MAX_NAME = 200;
const MAX_FILENAME = 300;
const MAX_ID = 128;
const MAX_GUID = 512;
const MAX_KEY_STRING = 256;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
// Fecha de guardado: ISO 8601 con hora y zona obligatorias, en un rango razonable.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MIN_SAVED_AT_MS = Date.UTC(2000, 0, 1);
const MAX_SAVED_AT_MS = Date.UTC(2100, 0, 1);

function fail(message: string): never {
  throw new Error(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') fail(`El campo "${field}" de la sesión no es texto válido.`);
  const text = value as string;
  if (text.length === 0) fail(`El campo "${field}" de la sesión no puede estar vacío.`);
  if (text.length > max) fail(`El campo "${field}" de la sesión es demasiado largo.`);
  return text;
}

function requireTextField(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) {
    fail(`El campo "${field}" de la sesión no es válido.`);
  }
  return value as string;
}

function validateSavedAt(value: unknown): string {
  const text = requireString(value, 'savedAt', MAX_STRING);
  if (!ISO_DATETIME.test(text)) {
    fail('La fecha de guardado de la sesión no tiene un formato ISO 8601 válido.');
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) fail('La fecha de guardado de la sesión no es válida.');
  if (ms < MIN_SAVED_AT_MS || ms >= MAX_SAVED_AT_MS) {
    fail('La fecha de guardado de la sesión está fuera de un rango razonable.');
  }
  return text;
}

function validateFilter(input: unknown, label: string): FilterSpec {
  if (!isPlainObject(input)) fail(`El ${label} de la sesión no es válido.`);
  const f = input as Record<string, unknown>;
  return {
    category: requireTextField(f.category, `${label}.category`, MAX_KEY_STRING),
    level: requireTextField(f.level, `${label}.level`, MAX_KEY_STRING),
    text: requireTextField(f.text, `${label}.text`, MAX_KEY_STRING),
    propertyName: requireTextField(f.propertyName, `${label}.propertyName`, MAX_KEY_STRING),
    propertyValue: requireTextField(f.propertyValue, `${label}.propertyValue`, MAX_KEY_STRING),
  };
}

function validateVec3(input: unknown, label: string): number[] {
  if (!Array.isArray(input) || input.length !== 3) {
    fail(`El vector ${label} debe tener exactamente 3 componentes.`);
  }
  const arr = input as unknown[];
  const out: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const num = arr[i];
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      fail(`El vector ${label} contiene valores no válidos.`);
    }
    out.push(num as number);
  }
  return out;
}

function validateCamera(input: unknown, label: string): CameraState {
  if (!isPlainObject(input)) fail(`La ${label} de la sesión no es válida.`);
  const cam = input as Record<string, unknown>;
  const eye = validateVec3(cam.eye, `${label}.eye`);
  const target = validateVec3(cam.target, `${label}.target`);
  if (eye[0] === target[0] && eye[1] === target[1] && eye[2] === target[2]) {
    fail(`La ${label} tiene la posición de cámara y el objetivo coincidentes.`);
  }
  const projection = cam.projection;
  if (projection !== 'Perspective' && projection !== 'Orthographic') {
    fail(`La proyección de la ${label} no es válida.`);
  }
  return { eye, target, projection };
}

function validateRefs(input: unknown, fingerprints: Set<string>, label: string): ElementRef[] {
  if (!Array.isArray(input)) fail(`La lista de ${label} de la sesión no es válida.`);
  const list = input as unknown[];
  if (list.length > MAX_REFS) fail(`La lista de ${label} de la sesión es demasiado grande.`);
  const out: ElementRef[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!isPlainObject(item)) fail(`Una referencia en ${label} no es válida.`);
    const r = item as Record<string, unknown>;
    const fingerprint = r.fingerprint;
    if (typeof fingerprint !== 'string' || !fingerprints.has(fingerprint)) {
      fail(`Una referencia en ${label} apunta a un modelo desconocido.`);
    }
    const guid = r.guid;
    if (typeof guid !== 'string' || guid.length > MAX_GUID) {
      fail(`Un GUID en ${label} no es válido.`);
    }
    const localId = r.localId;
    if (typeof localId !== 'number' || !Number.isSafeInteger(localId) || localId < 0) {
      fail(`Un identificador local en ${label} no es válido.`);
    }
    out.push({ fingerprint: fingerprint as string, guid: guid as string, localId: localId as number });
  }
  return out;
}

function validateState(input: unknown, fingerprints: Set<string>): SessionState {
  if (!isPlainObject(input)) fail('El estado de la sesión no es válido.');
  const state = input as Record<string, unknown>;

  const camera = validateCamera(state.camera, 'cámara');

  const filter = validateFilter(state.filter, 'filtro');

  const rulesRaw = state.rules;
  if (!Array.isArray(rulesRaw)) fail('Las reglas de la sesión no son válidas.');
  const rulesList = rulesRaw as unknown[];
  if (rulesList.length > MAX_RULES) fail('La sesión contiene demasiadas reglas.');
  const rules: QualityRule[] = [];
  const ruleIds = new Set<string>();
  for (let i = 0; i < rulesList.length; i += 1) {
    const rule = rulesList[i];
    if (!isPlainObject(rule)) fail('Una regla de la sesión no es válida.');
    const r = rule as Record<string, unknown>;
    const operator = r.operator;
    if (operator !== 'required' && operator !== 'equals') {
      fail('El operador de una regla de la sesión no es válido.');
    }
    const ruleId = requireString(r.id, 'id', MAX_ID);
    if (ruleIds.has(ruleId)) fail('La sesión contiene identificadores de regla duplicados.');
    ruleIds.add(ruleId);
    rules.push({
      id: ruleId,
      name: requireTextField(r.name, 'rule.name', MAX_NAME),
      category: requireTextField(r.category, 'rule.category', MAX_KEY_STRING),
      field: requireString(r.field, 'field', MAX_KEY_STRING),
      operator,
      expected: requireTextField(r.expected, 'rule.expected', MAX_STRING),
    });
  }

  const selection = validateRefs(state.selection, fingerprints, 'selección');
  const hidden = validateRefs(state.hidden, fingerprints, 'elementos ocultos');
  let totalRefs = selection.length + hidden.length;
  if (totalRefs > MAX_REFS) fail('La sesión contiene demasiadas referencias de elementos.');

  const colorsRaw = state.colors;
  if (!Array.isArray(colorsRaw)) fail('Los colores de la sesión no son válidos.');
  const colorsList = colorsRaw as unknown[];
  if (colorsList.length > MAX_COLORS) fail('La sesión contiene demasiados grupos de color.');
  const colors: ColorGroup[] = [];
  for (let i = 0; i < colorsList.length; i += 1) {
    const group = colorsList[i];
    if (!isPlainObject(group)) fail('Un grupo de color de la sesión no es válido.');
    const g = group as Record<string, unknown>;
    const color = g.color;
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      fail('Un color de la sesión no es válido (se espera #rrggbb).');
    }
    const items = validateRefs(g.items, fingerprints, 'colores');
    totalRefs += items.length;
    if (totalRefs > MAX_REFS) fail('La sesión contiene demasiadas referencias de elementos.');
    colors.push({ color: color as string, items });
  }

  const viewsRaw = state.views;
  if (!Array.isArray(viewsRaw)) fail('Las vistas de la sesión no son válidas.');
  const viewsList = viewsRaw as unknown[];
  if (viewsList.length > MAX_VIEWS) fail('La sesión contiene demasiadas vistas.');
  const views: SavedView[] = [];
  for (let i = 0; i < viewsList.length; i += 1) {
    const view = viewsList[i];
    if (!isPlainObject(view)) fail('Una vista de la sesión no es válida.');
    const v = view as Record<string, unknown>;
    const name = requireString(v.name, 'name', MAX_NAME);
    const viewCamera = validateCamera(v.camera, 'vista');
    views.push({ name, camera: viewCamera });
  }

  const queriesRaw = state.queries;
  let queries: SavedQuery[];
  if (queriesRaw === undefined) {
    queries = [];
  } else {
    if (!Array.isArray(queriesRaw)) fail('Las consultas guardadas de la sesión no son válidas.');
    const queriesList = queriesRaw as unknown[];
    if (queriesList.length > MAX_QUERIES) fail('La sesión contiene demasiadas consultas guardadas.');
    queries = [];
    for (let i = 0; i < queriesList.length; i += 1) {
      const query = queriesList[i];
      if (!isPlainObject(query)) fail('Una consulta guardada de la sesión no es válida.');
      const q = query as Record<string, unknown>;
      const name = requireString(q.name, 'query.name', MAX_NAME);
      const queryFilter = validateFilter(q.filter, 'filtro de consulta');
      queries.push({ name, filter: queryFilter });
    }
  }

  return { camera, filter, rules, selection, hidden, colors, views, queries };
}

export function validateSnapshot(input: unknown): SessionSnapshot {
  if (!isPlainObject(input)) fail('La sesión no tiene un formato válido.');
  const raw = input as Record<string, unknown>;

  if (raw.schema !== 'visor-ifc-session') fail('Formato de sesión no reconocido.');
  if (raw.schemaVersion !== 2) fail('Versión de esquema de sesión no soportada.');
  if (raw.appVersion !== '2.0.0' && raw.appVersion !== '2.1.0' && raw.appVersion !== '2.1.1') fail('Versión de aplicación de sesión no compatible.');

  const id = requireString(raw.id, 'id', MAX_ID);
  const name = requireString(raw.name, 'name', MAX_NAME);
  const savedAt = validateSavedAt(raw.savedAt);

  if (!Array.isArray(raw.models)) fail('La lista de modelos de la sesión no es válida.');
  const modelsRaw = raw.models as unknown[];
  if (modelsRaw.length === 0) fail('No se puede guardar una sesión sin modelos.');
  if (modelsRaw.length > MAX_MODELS) fail('La sesión contiene demasiados modelos.');

  const fingerprints = new Set<string>();
  const models: SessionModel[] = [];
  let totalBytes = 0;
  for (let i = 0; i < modelsRaw.length; i += 1) {
    const item = modelsRaw[i];
    if (!isPlainObject(item)) fail('Un modelo de la sesión no es válido.');
    const m = item as Record<string, unknown>;

    const fingerprint = requireString(m.fingerprint, 'fingerprint', 64);
    if (!HEX64.test(fingerprint)) fail('La huella SHA-256 de un modelo no es válida.');
    if (fingerprints.has(fingerprint)) fail('La sesión contiene huellas de modelo duplicadas.');
    fingerprints.add(fingerprint);

    const modelName = requireString(m.name, 'name', MAX_NAME);
    const fileName = requireString(m.fileName, 'fileName', MAX_FILENAME);
    const format = m.format;
    if (format !== 'ifc' && format !== 'frag') fail('Un modelo tiene un formato no soportado.');

    const rawBytes = m.bytes;
    if (!(rawBytes instanceof ArrayBuffer)) fail('Los bytes de un modelo no son válidos.');
    const buffer = rawBytes as ArrayBuffer;
    if (buffer.byteLength === 0) fail('Un modelo de la sesión no puede estar vacío.');
    if (buffer.byteLength > MAX_MODEL_BYTES) fail('Un modelo supera el tamaño máximo permitido.');
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_TOTAL_MODEL_BYTES) fail('La sesión supera el tamaño total permitido.');

    models.push({
      fingerprint,
      name: modelName,
      fileName,
      format: format as 'ifc' | 'frag',
      bytes: buffer.slice(0),
    });
  }

  const state = validateState(raw.state, fingerprints);

  return {
    schema: 'visor-ifc-session',
    schemaVersion: 2,
    appVersion: raw.appVersion,
    id,
    name,
    savedAt,
    models,
    state,
  };
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < view.length; i += chunkSize) {
    const chunk = view.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Longitud decodificada estimada a partir del texto base64, SIN decodificar.
// Se usa para aplicar los límites de tamaño antes de asignar memoria.
function base64DecodedLength(text: string): number {
  if (text.length === 0) fail('Los bytes de un modelo están vacíos.');
  if (text.length % 4 !== 0) fail('La longitud base64 de un modelo no es válida.');
  let padding = 0;
  if (text.endsWith('==')) padding = 2;
  else if (text.endsWith('=')) padding = 1;
  return (text.length / 4) * 3 - padding;
}

function base64ToBytes(text: string): ArrayBuffer {
  if (text.length === 0) fail('Los bytes de un modelo están vacíos.');
  if (text.length % 4 !== 0) fail('La longitud base64 de un modelo no es válida.');
  if (!BASE64.test(text)) fail('Los bytes base64 de un modelo no son válidos.');
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return fail('Los bytes base64 de un modelo no se pueden decodificar.');
  }
  const view = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i);
  if (bytesToBase64(view.buffer) !== text) {
    fail('Los bytes base64 de un modelo no son canónicos.');
  }
  return view.buffer;
}

export function encodeSession(snapshot: SessionSnapshot): string {
  const validated = validateSnapshot(snapshot);
  const models = validated.models.map((model) => ({
    fingerprint: model.fingerprint,
    name: model.name,
    fileName: model.fileName,
    format: model.format,
    bytes: bytesToBase64(model.bytes),
  }));
  const encoded = {
    schema: validated.schema,
    schemaVersion: validated.schemaVersion,
    appVersion: validated.appVersion,
    id: validated.id,
    name: validated.name,
    savedAt: validated.savedAt,
    models,
    state: validated.state,
  };
  const json = JSON.stringify(encoded);
  if (json.length > MAX_JSON_CHARS) fail('La sesión exportada supera el tamaño máximo permitido.');
  return json;
}

export function parseSession(json: string): SessionSnapshot {
  if (typeof json !== 'string') fail('El contenido de la sesión no es texto válido.');
  if (json.length === 0) fail('El contenido de la sesión está vacío.');
  if (json.length > MAX_JSON_CHARS) fail('La sesión importada supera el tamaño máximo permitido.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('El archivo de sesión no es un JSON válido.');
  }
  if (!isPlainObject(parsed)) fail('El archivo de sesión no tiene el formato esperado.');
  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.models)) fail('La lista de modelos de la sesión no es válida.');

  const modelsRaw = raw.models as unknown[];
  if (modelsRaw.length === 0) fail('No se puede importar una sesión sin modelos.');
  if (modelsRaw.length > MAX_MODELS) fail('La sesión contiene demasiados modelos.');
  const models: unknown[] = [];
  let totalBytes = 0;
  for (let i = 0; i < modelsRaw.length; i += 1) {
    const item = modelsRaw[i];
    if (!isPlainObject(item)) fail('Un modelo de la sesión no es válido.');
    const m = item as Record<string, unknown>;
    const encodedBytes = m.bytes;
    if (typeof encodedBytes !== 'string') fail('Los bytes de un modelo no están en base64.');
    // Límites ANTES de decodificar base64, para no asignar memoria masiva sin control.
    const decodedLength = base64DecodedLength(encodedBytes as string);
    if (decodedLength > MAX_MODEL_BYTES) {
      fail('Los bytes base64 de un modelo superan el tamaño máximo permitido.');
    }
    totalBytes += decodedLength;
    if (totalBytes > MAX_TOTAL_MODEL_BYTES) {
      fail('La sesión supera el tamaño total de modelos permitido.');
    }
    models.push({
      fingerprint: m.fingerprint,
      name: m.name,
      fileName: m.fileName,
      format: m.format,
      bytes: base64ToBytes(encodedBytes as string),
    });
  }

  return validateSnapshot({
    schema: raw.schema,
    schemaVersion: raw.schemaVersion,
    appVersion: raw.appVersion,
    id: raw.id,
    name: raw.name,
    savedAt: raw.savedAt,
    models,
    state: raw.state,
  });
}

export function getSessionMeta(snapshot: SessionSnapshot): SessionMeta {
  const validated = validateSnapshot(snapshot);
  let totalBytes = 0;
  for (let i = 0; i < validated.models.length; i += 1) {
    totalBytes += validated.models[i].bytes.byteLength;
  }
  return {
    id: validated.id,
    name: validated.name,
    savedAt: validated.savedAt,
    modelCount: validated.models.length,
    bytes: totalBytes,
  };
}