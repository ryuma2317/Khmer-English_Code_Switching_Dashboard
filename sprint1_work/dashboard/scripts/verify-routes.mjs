import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
await fs.mkdir('../evidence', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const result = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  const routes = [{ path: '/', title: 'Dataset dashboard foundation', label: 'Overview' }, { path: '/import', title: 'Import', label: 'Import' }, { path: '/members', title: 'Members', label: 'Members' }, { path: '/recordings', title: 'Recordings', label: 'Recordings' }];
  for (const [size, width] of [['desktop', 1280], ['mobile', 390]]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(`${baseUrl}${route.path}`);
      assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: route.title, exact: true }).waitFor();
      const nav = page.getByRole('navigation', { name: 'Main navigation' });
      assert.equal(await nav.getByRole('link').count(), 4);
      assert.equal(await nav.getByRole('link', { name: route.label, exact: true }).getAttribute('aria-current'), 'page');
      assert.equal(await page.locator('input[type=file], table, [role=progressbar]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (route.path !== '/') await page.getByRole('heading', { name: 'This screen is reserved for a later sprint.' }).waitFor();
      await page.screenshot({ path: `../evidence/${size}-${route.label.toLowerCase()}.png`, fullPage: true });
      result.push({ route: route.path, viewport: size, status: response.status(), activeNavigation: route.label, foundationOnly: true, horizontalOverflow: false });
    }
  }
  await page.goto(baseUrl);
  for (const label of ['Import','Members','Recordings','Overview']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label, exact: true }).click();
    await page.getByRole('heading', { name: routes.find(route => route.label === label).title, exact: true }).waitFor();
  }
  assert.deepEqual(failures, []);
  await fs.writeFile('../evidence/route-verification.json', JSON.stringify({ result, pageErrors: failures, navigationClicksPassed: true }, null, 2));
  console.log(JSON.stringify({ routeViewportChecks: result.length, pageErrors: failures.length, navigationClicksPassed: true }));
} finally { await browser.close(); }
