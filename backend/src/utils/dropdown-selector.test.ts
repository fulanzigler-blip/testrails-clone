import { describe, it, expect } from 'vitest';
import { parseOptionSelector, hashString, stableIdFactory } from './web-interaction-utils';

// Selectors come from the scraper as "<select selector> option[value=\"x\"]".
// parseOptionSelector is the single source of truth used by
// web-session-manager.clickAndNavigate and playwright-test-runner.

describe('parseOptionSelector', () => {
  it('parses select by id', () => {
    const p = parseOptionSelector('select#jenis_kredit option[value="KUR"]');
    expect(p?.selectSelector).toBe('select#jenis_kredit');
    expect(p?.optionValue).toBe('KUR');
  });

  it('parses select by name attribute', () => {
    const p = parseOptionSelector('select[name="jenis"] option[value="Konsumtif"]');
    expect(p?.selectSelector).toBe('select[name="jenis"]');
    expect(p?.optionValue).toBe('Konsumtif');
  });

  it('parses empty option value', () => {
    const p = parseOptionSelector('select#x option[value=""]');
    expect(p?.selectSelector).toBe('select#x');
    expect(p?.optionValue).toBe('');
  });

  it('does not match custom dropdown menu item selectors (those are clicked)', () => {
    expect(parseOptionSelector('#custom-menu-item-3')).toBeNull();
    expect(parseOptionSelector('li.dropdown-item')).toBeNull();
    expect(parseOptionSelector('.dropdown-menu a:has-text("Logout")')).toBeNull();
    expect(parseOptionSelector(undefined)).toBeNull();
    expect(parseOptionSelector('')).toBeNull();
  });
});

describe('stable element ids', () => {
  it('produces the same id for the same selector+text across factories (re-scans)', () => {
    const a = stableIdFactory()('btn_home', 'tr:has-text("Budi")', 'Budi | 500000');
    const b = stableIdFactory()('btn_home', 'tr:has-text("Budi")', 'Budi | 500000');
    expect(a).toBe(b);
  });

  it('disambiguates duplicate selector+text within one scan', () => {
    const make = stableIdFactory();
    const a = make('btn_home', 'button.save', 'Save');
    const b = make('btn_home', 'button.save', 'Save');
    expect(a).not.toBe(b);
    expect(b).toBe(`${a}_2`);
  });

  it('hash is deterministic and compact', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('x'.repeat(500)).length).toBeLessThanOrEqual(8);
  });
});
