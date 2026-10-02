/**
 * domain/units.ts — Normalizador de unidades IFC (RV9).
 *
 * Función PURA y reutilizable que traduce los nodos de unidad que entrega el
 * motor (IfcSIUnit / IfcConversionBasedUnit / IfcDerivedUnit) a un símbolo
 * apto para mostrar, respetando el prefijo SI y SIN convertir el valor.
 *
 * Reglas (contrastadas con el IFC real EST_GT_C_R_v5.ifc):
 * - Los atributos llegan en mayúsculas (`UnitType`, `Name`, `Prefix`); también
 *   se acepta la forma en minúsculas por robustez.
 * - METRE + MILLI → mm; SQUARE_METRE respeta el exponente → mm²; CUBIC_METRE
 *   → cm³; GRAM + KILO → kg. Nunca se reescala el número.
 * - Unidad de conversión: se muestra su nombre real (DEGREE → °, FOOT → ft) o
 *   el propio nombre IFC tal cual; no se inventa.
 * - Nombre SI desconocido o unidad derivada sin nombre → sin símbolo.
 */

export interface UnitAttributeNode {
  value?: unknown;
  type?: unknown;
}

export interface UnitInfo {
  /** UnitType IFC normalizado a mayúsculas (LENGTHUNIT…), o null. */
  unitType: string | null;
  /** Símbolo real para mostrar, o null si no se puede deducir sin inventar. */
  symbol: string | null;
  /** Prefijo SI declarado (MILLI, KILO…), o null. */
  prefix: string | null;
  /** Nombre IFC de la unidad (METRE, GRAM, DEGREE…), o null. */
  name: string | null;
}

const EMPTY_UNIT: UnitInfo = { unitType: null, symbol: null, prefix: null, name: null };

/** Símbolos de prefijos SI. */
const SI_PREFIX_SYMBOL: Record<string, string> = {
  EXA: "E", PETA: "P", TERA: "T", GIGA: "G", MEGA: "M", KILO: "k", HECTO: "h",
  DECA: "da", DECI: "d", CENTI: "c", MILLI: "m", MICRO: "µ", NANO: "n",
  PICO: "p", FEMTO: "f", ATTO: "a",
};

/** Símbolos de las unidades base SI (nombre IFC → símbolo). */
const SI_BASE_SYMBOL: Record<string, string> = {
  METRE: "m", SQUARE_METRE: "m²", CUBIC_METRE: "m³", GRAM: "g", SECOND: "s",
  RADIAN: "rad", STERADIAN: "sr", HERTZ: "Hz", NEWTON: "N", PASCAL: "Pa",
  JOULE: "J", WATT: "W", COULOMB: "C", VOLT: "V", FARAD: "F", OHM: "Ω",
  SIEMENS: "S", WEBER: "Wb", TESLA: "T", HENRY: "H", DEGREE_CELSIUS: "°C",
  LUMEN: "lm", LUX: "lx", BECQUEREL: "Bq", GRAY: "Gy", SIEVERT: "Sv",
  KELVIN: "K", MOLE: "mol", CANDELA: "cd",
};

/** Símbolos de unidades de conversión frecuentes (nombre IFC → símbolo). */
const CONVERSION_SYMBOL: Record<string, string> = {
  DEGREE: "°", FOOT: "ft", INCH: "in", YARD: "yd", MILE: "mi",
  POUND: "lb", OUNCE: "oz", GALLON: "gal", LITRE: "L", MINUTE: "min",
  HOUR: "h", SECOND: "s", DAY: "d",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lee el texto de un atributo escalar `{ value }` o del propio valor. */
function scalarText(node: unknown): string | null {
  if (typeof node === "string") return node;
  if (isRecord(node)) {
    const value = node.value;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return null;
  }
  return null;
}

/** Lee `Name`/`name`, `UnitType`/`type`, `Prefix`/`prefix` admitiendo ambas grafías. */
function readAny(node: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const text = scalarText(node[key]);
      if (text !== null) return text;
    }
  }
  return null;
}

function readCategory(node: Record<string, unknown>): string {
  const attr = node["_category"];
  const text = isRecord(attr) ? scalarText(attr.value) : null;
  return (text ?? "").toUpperCase();
}

/**
 * Normaliza un nodo de unidad IFC. Nunca lanza y nunca inventa un símbolo.
 */
export function normalizeUnit(node: unknown): UnitInfo {
  if (!isRecord(node)) return { ...EMPTY_UNIT };

  const category = readCategory(node);
  const unitType = readAny(node, ["UnitType", "unitType", "type"]);
  const name = readAny(node, ["Name", "name"]);
  const prefix = readAny(node, ["Prefix", "prefix"]);

  const unitTypeNorm = unitType ? unitType.toUpperCase() : null;
  const nameNorm = name ? name.toUpperCase() : null;
  const prefixNorm = prefix ? prefix.toUpperCase() : null;

  let symbol: string | null = null;

  if (category.includes("CONVERSIONBASED")) {
    // La unidad de conversión aporta su propio nombre real.
    if (nameNorm) symbol = CONVERSION_SYMBOL[nameNorm] ?? name;
  } else if (nameNorm) {
    const base = SI_BASE_SYMBOL[nameNorm] ?? null;
    if (base) {
      const prefixSymbol = prefixNorm ? SI_PREFIX_SYMBOL[prefixNorm] ?? "" : "";
      symbol = `${prefixSymbol}${base}`;
    }
  }

  return { unitType: unitTypeNorm, symbol, prefix: prefixNorm, name };
}

/** Símbolo de un nodo de unidad, o null. Atajo de `normalizeUnit`. */
export function unitSymbol(node: unknown): string | null {
  return normalizeUnit(node).symbol;
}

/**
 * Construye un mapa `UnitType → símbolo` a partir del array `Units` de un
 * IfcUnitAssignment. Conserva el primer símbolo no nulo por tipo y omite
 * unidades sin símbolo (derivadas/desconocidas) sin inventar.
 */
export function unitsMapFromAssignment(units: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(units)) return map;
  for (const node of units) {
    const info = normalizeUnit(node);
    if (!info.unitType || !info.symbol) continue;
    if (!Object.prototype.hasOwnProperty.call(map, info.unitType)) {
      map[info.unitType] = info.symbol;
    }
  }
  return map;
}
