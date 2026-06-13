import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { extractElementsFromPage } from './web-element-scraper';

// Fixture exercising the extraction heuristics that have bitten us before:
// selects with id / name-only / neither, tables with thead offsets, clickable
// list items, and header icon classification (signin vs logout).
const FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<body>
  <header>
    <button class="signin-btn"><svg width="16" height="16"></svg></button>
    <button class="logout-btn"><svg width="16" height="16"></svg></button>
  </header>

  <main>
    <label for="jenis">Jenis Kredit</label>
    <select id="jenis">
      <option value="">Pilih Jenis</option>
      <option value="KUR">Kredit Usaha Rakyat</option>
      <option value="KMK">Kredit Modal Kerja</option>
    </select>

    <select name="statusPengajuan">
      <option value="">Pilih Status</option>
      <option value="1">Verifikasi Dokumen</option>
      <option value="2">Review Prakarsa</option>
    </select>

    <select>
      <option value="x">Orphan Option</option>
    </select>

    <table id="loans">
      <thead><tr><th>Nama</th><th>Plafon</th></tr></thead>
      <tbody>
        <tr data-id="101"><td>Budi Santoso</td><td>500000</td></tr>
        <tr data-id="102"><td>Siti Aminah</td><td>750000</td></tr>
      </tbody>
    </table>

    <ul id="cards">
      <li class="clickable">Pengajuan Baru dari Cabang A</li>
      <li class="clickable">Pengajuan Lama dari Cabang B</li>
    </ul>
  </main>
</body>
</html>`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(FIXTURE_HTML);
}, 60000);

afterAll(async () => {
  await browser?.close();
});

describe('extractElementsFromPage', () => {
  it('emits valid selectors for selects with id and with name-only', async () => {
    const els = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const options = els.buttons.filter(b => b.type === 'dropdown-item');

    expect(options.some(o => o.selector === 'select#jenis option[value="KUR"]')).toBe(true);
    expect(options.some(o => o.selector === 'select[name="statusPengajuan"] option[value="1"]')).toBe(true);

    // No id-syntax selector built from a name attribute, and no selector for
    // the select that has neither id nor name
    expect(options.some(o => o.selector.startsWith('select#statusPengajuan'))).toBe(false);
    expect(options.some(o => o.selector.startsWith('select# '))).toBe(false);
    expect(options.some(o => o.text.includes('Orphan Option'))).toBe(false);
  });

  it('skips placeholder options (Pilih...)', async () => {
    const els = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const options = els.buttons.filter(b => b.type === 'dropdown-item');
    expect(options.some(o => o.text.includes('Pilih Jenis'))).toBe(false);
  });

  it('anchors clickable table rows on text, with correct positional fallback despite thead', async () => {
    const els = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const rows = els.buttons.filter(b => b.type === 'table-row');
    expect(rows.length).toBe(2);

    const budi = rows.find(r => r.text.includes('Budi'));
    expect(budi).toBeDefined();
    // data-id is the most stable primary selector
    expect(budi!.selector).toBe('[data-id="101"]');
    // text anchor and position come as fallbacks; the first data row is
    // nth-of-type(1) within tbody (thead row must not shift the index)
    expect(budi!.fallbackSelectors).toContain('table#loans tbody tr:has-text("Budi Santoso")');
    expect(budi!.fallbackSelectors).toContain('table#loans tbody tr:nth-of-type(1)');
  });

  it('extracts clickable list items anchored on text', async () => {
    const els = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const items = els.buttons.filter(b => b.type === 'list-item' && b.text.includes('Pengajuan'));
    expect(items.length).toBeGreaterThanOrEqual(2);
    const first = items.find(i => i.text.includes('Cabang A'));
    expect(first).toBeDefined();
    expect(first!.selector).toContain(':has-text("Pengajuan Baru dari Cabang A")');
  });

  it('classifies signin icon as Login, not Logout', async () => {
    const els = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const icons = els.buttons.filter(b => b.type === 'icon');
    expect(icons.some(i => i.text === 'Login')).toBe(true);
    expect(icons.some(i => i.text === 'Logout')).toBe(true);
    // Exactly one Logout — the signin button must not be misclassified
    expect(icons.filter(i => i.text === 'Logout').length).toBe(1);
  });

  it('produces stable element ids across re-scans', async () => {
    const a = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const b = await extractElementsFromPage(page, 'Fixture', 'http://localhost/fixture');
    const idsA = a.buttons.map(x => `${x.id}:${x.selector}`).sort();
    const idsB = b.buttons.map(x => `${x.id}:${x.selector}`).sort();
    expect(idsA).toEqual(idsB);
  });
});
