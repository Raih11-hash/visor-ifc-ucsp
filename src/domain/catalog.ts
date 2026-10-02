export interface ElementRecord {
  modelId: string;
  localId: number;
  guid: string;
  category: string;
  name: string;
  type: string;
  level: string;
  properties: Record<string, string | number | boolean | null>;
}

export interface FilterSpec {
  category: string;
  level: string;
  text: string;
  propertyName: string;
  propertyValue: string;
}

export interface ElementSummary {
  total: number;
  categories: { label: string; count: number }[];
  levels: { label: string; count: number }[];
}

function countBy(
  rows: ElementRecord[],
  pick: (element: ElementRecord) => string,
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const element of rows) {
    const label = pick(element);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarizeElements(rows: ElementRecord[]): ElementSummary {
  return {
    total: rows.length,
    categories: countBy(rows, (element) => element.category),
    levels: countBy(rows, (element) => element.level),
  };
}

export interface QualityRule {
  id: string;
  name: string;
  category: string;
  field: string;
  operator: "required" | "equals";
  expected: string;
}

export interface QualityResult {
  element: ElementRecord;
  ruleId: string;
  ruleName: string;
  pass: boolean;
  actual: string;
  reason: string;
}

function hasOwn(target: object, key: PropertyKey): boolean {
  return (
    Object as unknown as {
      hasOwn: (t: object, k: PropertyKey) => boolean;
    }
  ).hasOwn(target, key);
}

function readField(
  element: ElementRecord,
  field: string,
): string | number | boolean | null | undefined {
  switch (field) {
    case "Name":
      return element.name;
    case "GlobalId":
      return element.guid;
    case "ObjectType":
      return element.type;
    case "Level":
      return element.level;
    default:
      if (hasOwn(element.properties, field)) {
        return element.properties[field];
      }
      return undefined;
  }
}

function isMissing(
  value: string | number | boolean | null | undefined,
): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  return false;
}

function stringify(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function evaluateRules(
  rows: ElementRecord[],
  rules: QualityRule[],
): QualityResult[] {
  const results: QualityResult[] = [];
  for (const rule of rules) {
    const scopeAll = rule.category === "" || rule.category === "*";
    const expected = rule.expected.trim().toLowerCase();
    for (const element of rows) {
      if (!scopeAll && element.category !== rule.category) {
        continue;
      }
      const raw = readField(element, rule.field);
      const missing = isMissing(raw);
      const actual = stringify(raw);
      let pass: boolean;
      let reason: string;
      if (rule.operator === "required") {
        pass = !missing;
        reason = pass ? "Valor presente" : "Valor requerido ausente";
      } else {
        pass = !missing && actual.trim().toLowerCase() === expected;
        if (pass) {
          reason = "Coincide con el valor esperado";
        } else if (missing) {
          reason = "Valor requerido ausente";
        } else {
          reason = "No coincide con el valor esperado";
        }
      }
      results.push({
        element,
        ruleId: rule.id,
        ruleName: rule.name,
        pass,
        actual,
        reason,
      });
    }
  }
  return results;
}

export const DEFAULT_FILTER: FilterSpec = {
  category: "",
  level: "",
  text: "",
  propertyName: "",
  propertyValue: "",
};

function csvField(value: string | number | boolean | null | undefined): string {
  let field = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(field) || /^[\t\r\n]/.test(field)) {
    field = `'${field}`;
  }
  if (/[",\n\r]/.test(field)) {
    field = `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function csvRows(
  header: string[],
  rows: (string | number | boolean | null)[][],
): string {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\n");
}

export function recordsToCsv(rows: ElementRecord[]): string {
  return csvRows(
    ["Name", "GlobalId", "Category", "Type", "Level"],
    rows.map((element) => [
      element.name,
      element.guid,
      element.category,
      element.type,
      element.level,
    ]),
  );
}

export function qualityToCsv(results: QualityResult[]): string {
  return csvRows(
    ["Name", "GlobalId", "RuleId", "RuleName", "Pass", "Actual", "Reason"],
    results.map((result) => [
      result.element.name,
      result.element.guid,
      result.ruleId,
      result.ruleName,
      result.pass,
      result.actual,
      result.reason,
    ]),
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function propertyStrings(element: ElementRecord): string[] {
  const values: string[] = [];
  for (const key of Object.keys(element.properties)) {
    if (!hasOwn(element.properties, key)) {
      continue;
    }
    const value = element.properties[key];
    if (value === null || value === undefined) {
      continue;
    }
    values.push(String(value));
  }
  return values;
}

export function filterElements(
  rows: ElementRecord[],
  spec: FilterSpec,
): ElementRecord[] {
  const needle = spec.text ? normalize(spec.text) : "";
  const valueNeedle = spec.propertyValue
    ? spec.propertyValue.toLowerCase()
    : "";
  return rows.filter((element) => {
    if (spec.category && element.category !== spec.category) {
      return false;
    }
    if (spec.level && element.level !== spec.level) {
      return false;
    }
    if (spec.propertyName) {
      if (!hasOwn(element.properties, spec.propertyName)) {
        return false;
      }
      if (valueNeedle) {
        const raw = element.properties[spec.propertyName];
        const actual = raw === null || raw === undefined ? "" : String(raw);
        if (!actual.toLowerCase().includes(valueNeedle)) {
          return false;
        }
      }
    }
    if (needle) {
      const haystack = [
        element.name,
        element.guid,
        element.type,
        element.category,
        element.level,
        ...propertyStrings(element),
      ];
      if (!haystack.some((value) => normalize(value).includes(needle))) {
        return false;
      }
    }
    return true;
  });
}
