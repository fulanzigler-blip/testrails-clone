import { describe, it, expect } from 'vitest';
import { parseNativeUiDump, findNativeElement } from './native-android-driver';

const node = (attrs: Record<string, string>) => {
  const defaults: Record<string, string> = {
    index: '0', text: '', 'resource-id': '', class: 'android.view.View', package: 'com.example.app',
    'content-desc': '', checkable: 'false', checked: 'false', clickable: 'false', enabled: 'true',
    focusable: 'false', focused: 'false', scrollable: 'false', 'long-clickable': 'false',
    password: 'false', selected: 'false', bounds: '[0,0][100,100]',
  };
  const merged = { ...defaults, ...attrs };
  return `<node ${Object.entries(merged).map(([k, v]) => `${k}="${v}"`).join(' ')} />`;
};

const FIXTURE = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
${node({ class: 'com.android.internal.policy.DecorView', bounds: '[0,0][1080,1920]' })}
${node({ class: 'android.widget.FrameLayout', bounds: '[0,0][1080,1920]', clickable: 'true', text: 'root' })}
${node({ class: 'android.widget.EditText', 'resource-id': 'com.example.app:id/username', text: 'user@mail.com', bounds: '[40,300][1040,400]', clickable: 'true', focusable: 'true' })}
${node({ class: 'android.widget.EditText', 'resource-id': 'com.example.app:id/password', password: 'true', bounds: '[40,420][1040,520]', clickable: 'true' })}
${node({ class: 'android.widget.Button', 'resource-id': 'com.example.app:id/btn_login', text: 'Masuk', bounds: '[40,560][1040,660]', clickable: 'true', focusable: 'true' })}
${node({ class: 'android.widget.ImageButton', 'content-desc': 'Notifications', bounds: '[900,40][1040,140]', clickable: 'true' })}
${node({ class: 'android.widget.LinearLayout', text: 'Budi Santoso&#10;Saldo: 500.000', bounds: '[0,700][1080,820]', clickable: 'true' })}
${node({ class: 'android.widget.TextView', text: 'Selamat datang kembali', bounds: '[40,200][600,260]' })}
${node({ class: 'android.widget.TextView', text: 'x', bounds: '[40,260][60,280]' })}
${node({ class: 'android.view.View', bounds: '[0,900][1080,1000]', clickable: 'true' })}
</hierarchy>`;

describe('parseNativeUiDump', () => {
  const els = parseNativeUiDump(FIXTURE, { screenW: 1080, screenH: 1920 });

  it('classifies EditText as input with resource-id finder', () => {
    const username = els.find(e => e.resourceId.endsWith('/username'));
    expect(username?.elementType).toBe('input');
    expect(username?.finderStrategy).toBe('resource-id');
    expect(username?.finderValue).toBe('com.example.app:id/username');
  });

  it('marks password fields', () => {
    const pwd = els.find(e => e.resourceId.endsWith('/password'));
    expect(pwd?.elementType).toBe('input');
    expect(pwd?.isPassword).toBe(true);
  });

  it('classifies clickable Button with resource-id-first finder and text fallback', () => {
    const login = els.find(e => e.resourceId.endsWith('/btn_login'));
    expect(login?.elementType).toBe('button');
    expect(login?.finderStrategy).toBe('resource-id');
    expect(login?.fallbackFinders.some(f => f.strategy === 'text' && f.value === 'Masuk')).toBe(true);
    expect(login?.fallbackFinders.some(f => f.strategy === 'bounds')).toBe(true);
  });

  it('classifies icon button via content-desc', () => {
    const notif = els.find(e => e.contentDesc === 'Notifications');
    expect(notif?.elementType).toBe('button');
    expect(notif?.finderStrategy).toBe('content-desc');
  });

  it('treats clickable list rows as buttons labeled by first line', () => {
    const row = els.find(e => e.label === 'Budi Santoso');
    expect(row?.elementType).toBe('button');
    expect(row?.finderStrategy).toBe('text');
    expect(row?.finderValue).toBe('Budi Santoso');
  });

  it('captures non-clickable TextView as text, skipping tiny fragments', () => {
    expect(els.some(e => e.elementType === 'text' && e.text === 'Selamat datang kembali')).toBe(true);
    expect(els.some(e => e.text === 'x')).toBe(false);
  });

  it('skips DecorView, fullscreen containers, and identityless clickables', () => {
    expect(els.some(e => e.className.includes('DecorView'))).toBe(false);
    expect(els.some(e => e.label === 'root')).toBe(false);
    // clickable android.view.View with no text/desc/id → decorative, skipped
    expect(els.some(e => e.className === 'android.view.View')).toBe(false);
  });

  it('produces stable ids across parses', () => {
    const again = parseNativeUiDump(FIXTURE, { screenW: 1080, screenH: 1920 });
    expect(again.map(e => e.id)).toEqual(els.map(e => e.id));
  });
});

describe('findNativeElement', () => {
  const els = parseNativeUiDump(FIXTURE, { screenW: 1080, screenH: 1920 });

  it('matches by exact resource-id', () => {
    const el = findNativeElement(els, { strategy: 'resource-id', value: 'com.example.app:id/btn_login' });
    expect(el?.label).toBe('Masuk');
  });

  it('matches text case-insensitively and by contains (dynamic data)', () => {
    expect(findNativeElement(els, { strategy: 'text', value: 'budi' })?.label).toBe('Budi Santoso');
    expect(findNativeElement(els, { strategy: 'text', value: 'MASUK' })?.label).toBe('Masuk');
  });

  it('returns null when nothing matches', () => {
    expect(findNativeElement(els, { strategy: 'text', value: 'tidak ada' })).toBeNull();
  });
});
