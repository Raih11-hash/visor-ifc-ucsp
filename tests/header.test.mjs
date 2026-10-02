// tests/header.test.mjs — contrato estructural de la cabecera compacta (v2.2).
//
// Verifica sin navegador lo que el smoke scripts/smoke_header_v22.py mide en
// el DOM: la cabecera mantiene marca + acciones con sus controles, la versión
// visible deriva de package.json y la regla CSS de escritorio NO apila la
// navegación en una segunda fila (regresión de la cabecera de dos líneas).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'src', 'v2.css'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const header = () => html.match(/<header class="app-header">([\s\S]*?)<\/header>/)[1];

test('la cabecera conserva marca + acciones con sus controles en orden', () => {
  const h = header();
  assert.match(h, /class="brand"/);
  assert.match(h, /class="header-actions"/);
  let last = -1;
  for (const id of ['work-status', 'quick-session-save', 'release-version', 'show-help']) {
    const i = h.indexOf(`id="${id}"`);
    assert.ok(i > last, `#${id} ausente o fuera de orden`);
    last = i;
  }
});

test('la versión visible coincide con package.json', () => {
  const m = html.match(/id="release-version">([^<]+)</);
  assert.ok(m, 'no se encontró #release-version');
  assert.equal(m[1], 'v' + pkg.version);
});

test('la cabecera de escritorio no se apila en dos filas', () => {
  assert.match(css, /\.app-header\{[^}]*flex-wrap:nowrap/,
    'la cabecera base debe prohibir el envoltura a una segunda fila');
  assert.doesNotMatch(css, /\.header-nav\{[^}]*flex-basis:100%/,
    'la navegación no debe forzar su propia línea (regresión de dos filas)');
});

test('en móvil la cabecera sí puede crecer en alto y envolver', () => {
  assert.match(css, /@media\(max-width:800px\)\{[\s\S]*?\.app-header\{[^}]*height:auto/,
    'el breakpoint móvil debe restaurar height:auto');
});

test('los textos compactados conservan tooltip', () => {
  assert.match(html, /<strong title="Visor IFC/, 'falta tooltip del nombre');
  assert.match(html, /class="local-badge" title=/, 'falta tooltip de la insignia local');
});