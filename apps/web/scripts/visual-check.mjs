#!/usr/bin/env node
/*
 * Revisión visual del frontend (Juandi).
 *
 * Recorre las pantallas con un navegador real y respuestas de la API
 * simuladas (no necesita base de datos ni GitHub). En cada pantalla
 * revisa que no haya desborde horizontal ni errores en la consola, prueba
 * los flujos de teclado principales y guarda capturas.
 *
 * Uso (con el frontend corriendo en otra terminal: npm run dev:web):
 *
 *   node apps/web/scripts/visual-check.mjs
 *   node apps/web/scripts/visual-check.mjs --url=http://127.0.0.1:5173 --out=/tmp/vmat-capturas
 *   node apps/web/scripts/visual-check.mjs --chrome=/usr/bin/google-chrome
 *
 * Necesita el Chromium de Playwright (npx playwright install chromium), el
 * mismo que usa el E2E, o la ruta a un Chrome con --chrome.
 * Si axe-core está disponible (npm i --no-save axe-core), también revisa
 * accesibilidad WCAG 2.2 AA. No agrega nada a package.json.
 *
 * Sale con código 1 si encuentra algún problema.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=') || 'true'];
  }),
);

const BASE_URL = args.url ?? 'http://127.0.0.1:5173';
const OUT = args.out ?? join(tmpdir(), 'vmat-visual-check');
mkdirSync(OUT, { recursive: true });

let axeSource = null;
try {
  const require = createRequire(import.meta.url);
  const { readFileSync } = await import('node:fs');
  axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  // axe-core es opcional.
}

/* ---------- Datos simulados ---------- */

const institution = (id, name, roles) => ({ id, name, slug: id, roles, academicIdentity: null });
const baseUser = {
  id: 'u1',
  github: { id: '1', login: 'ana-dev', avatarUrl: null },
  academicIdentity: null,
  institutions: [],
  accessRequest: null,
};
const request = (status, extra = {}) => ({
  id: 'r1',
  institution: { id: 'i1', name: 'Universidad de Ejemplo', slug: 'ejemplo' },
  status,
  assignedRole: null,
  ...extra,
});
const admin = { ...baseUser, institutions: [institution('i1', 'Universidad de Ejemplo', ['ADMIN'])] };

const SCENARIOS = [
  { name: 'login', me: { status: 401 }, expect: 'Tu aula, conectada con GitHub.' },
  { name: 'login-error-oauth', me: { status: 401 }, path: '/?auth_error=GITHUB_AUTHORIZATION_FAILED', expect: 'No se completó el permiso en GitHub' },
  { name: 'sin-conexion', me: 'abort', expect: 'No pudimos cargar tu sesión.' },
  { name: 'error-servidor', me: { status: 503 }, expect: 'WebClass tiene un problema en este momento' },
  { name: 'pendiente', me: { user: { ...baseUser, accessRequest: request('PENDING') } }, expect: 'Tu solicitud está en revisión' },
  { name: 'rechazada', me: { user: { ...baseUser, accessRequest: request('DENIED', { decisionReason: 'No apareces en la lista.' }) } }, expect: 'No apareces en la lista.' },
  { name: 'sin-institucion', me: { user: baseUser }, expect: 'Tu cuenta todavía no pertenece a una institución' },
  { name: 'estudiante', me: { user: { ...baseUser, institutions: [institution('i1', 'Universidad de Ejemplo', ['STUDENT'])] } }, expect: 'Tu espacio todavía no está listo' },
  { name: 'admin-inicio', me: { user: admin }, expect: 'Hola, ana-dev' },
];

const APP_SECTIONS = ['Usuarios', 'Profesores', 'Estudiantes', 'Institución', 'Mi perfil', 'Apariencia'];
const WIDTHS = [1280, 900, 390];
const APPEARANCES = [
  { theme: 'light', accent: 'green' },
  { theme: 'dark', accent: 'blue' },
  { theme: 'gray', accent: 'red' },
];

/* ---------- Utilidades ---------- */

const problems = [];
let checks = 0;

const browser = await chromium.launch(args.chrome ? { executablePath: args.chrome } : {});

async function openPage({ width, appearance, me, path = '/' }) {
  const context = await browser.newContext({ viewport: { width, height: 820 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });

  await page.addInitScript(value => {
    localStorage.setItem('vmat-appearance', value);
    localStorage.setItem('vmat-welcome-dismissed', '');
  }, JSON.stringify(appearance));

  await page.route('**/me', route => {
    if (me === 'abort') return route.abort();
    if (me.status) return route.fulfill({ status: me.status, body: '{}' });
    return route.fulfill({ json: { user: me.user } });
  });
  await page.route('**/admin/**', route => route.fulfill({ json: { requests: [], members: [] } }));

  await page.goto(new URL(path, BASE_URL).toString());
  await page.waitForTimeout(500);
  return { context, page, errors };
}

async function inspect(page, errors, label) {
  checks += 1;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) problems.push(`${label}: desborde horizontal de ${overflow}px`);
  if (errors.length) problems.push(`${label}: errores en consola: ${errors.join(' | ')}`);

  if (axeSource) {
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
      });
      return result.violations.map(v => `${v.id} (${v.nodes.length})`);
    });
    if (violations.length) problems.push(`${label}: axe ${violations.join(', ')}`);
  }

  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
}

async function goToSection(page, width, name) {
  if (width <= 760) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.waitForTimeout(260);
  }
  await page.locator('#menu-principal').getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(350);
}

/* ---------- Recorrido ---------- */

for (const appearance of APPEARANCES) {
  const tag = `${appearance.theme}-${appearance.accent}`;

  for (const width of WIDTHS) {
    for (const scenario of SCENARIOS) {
      const { context, page, errors } = await openPage({ width, appearance, me: scenario.me, path: scenario.path });
      const label = `${scenario.name}-${width}-${tag}`;
      const found = await page.getByText(scenario.expect, { exact: false }).first().isVisible().catch(() => false);
      if (!found) problems.push(`${label}: no aparece «${scenario.expect}»`);
      await inspect(page, errors, label);

      if (scenario.name === 'admin-inicio') {
        for (const section of APP_SECTIONS) {
          await goToSection(page, width, section);
          await inspect(page, errors, `${section.toLowerCase().replace(/\s+/g, '-')}-${width}-${tag}`);
        }
      }
      await context.close();
    }
  }
}

/* Flujos de teclado (una vez, en escritorio). */
{
  const { context, page } = await openPage({ width: 1280, appearance: APPEARANCES[0], me: { user: admin } });

  await page.keyboard.press('Tab');
  if (!(await page.locator('.skip-link:focus').count())) problems.push('teclado: el primer Tab no muestra «Saltar al contenido»');

  await page.locator('body').click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('/');
  await page.keyboard.type('tema');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  if ((await page.title()) !== 'Apariencia · WebClass') problems.push('teclado: «/» + «tema» + Enter no abre Apariencia');

  await page.locator('.profile-menu-button').click();
  await page.keyboard.press('Escape');
  const focusBack = await page.evaluate(() => document.activeElement?.classList.contains('profile-menu-button'));
  if (!focusBack) problems.push('teclado: Escape en el menú de perfil no devuelve el foco al avatar');

  checks += 3;
  await context.close();
}

await browser.close();

console.log(`Revisión visual: ${checks} revisiones${axeSource ? ' (con axe-core)' : ' (sin axe-core)'}.`);
console.log(`Capturas en ${OUT}`);
if (problems.length) {
  console.log(`\n${problems.length} problema(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Sin problemas.');
}
