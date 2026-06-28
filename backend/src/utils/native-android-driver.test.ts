import { describe, it, expect } from 'vitest';
import { parseNativeUiDump, findNativeElement, parseAdbDevices, pickDevice, detectPackage, countUnlabeledInteractive } from './native-android-driver';

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

  it('matches resource-id by short suffix (Flutter "key" finders / short ids)', () => {
    const el = findNativeElement(els, { strategy: 'resource-id', value: 'btn_login' });
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

// React Native pattern: touchables are clickable/focusable containers whose label
// is a child TextView; inputs are EditTexts with no own text, labelled by a
// nearby TextView. The naive parser produced a button AND a duplicate text per
// touchable, and labelled inputs by resource-id.
const RN_FIXTURE = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node class="android.view.ViewGroup" resource-id="com.app:id/button_login" clickable="true" focusable="true" bounds="[40,800][1040,920]">
    <node class="android.widget.TextView" text="Masuk" bounds="[460,840][620,880]" />
  </node>
  <node class="android.view.ViewGroup" resource-id="com.app:id/button_register_now" clickable="false" focusable="true" bounds="[40,1000][1040,1080]">
    <node class="android.widget.TextView" text="Daftar yuk!" bounds="[440,1020][640,1060]" />
  </node>
  <node class="android.view.ViewGroup" clickable="true" focusable="true" content-desc="Jelajahi Fitur" bounds="[40,100][1040,200]">
    <node class="android.widget.TextView" text="Jelajahi Fitur" bounds="[400,130][680,170]" />
  </node>
  <node class="android.widget.EditText" resource-id="com.app:id/input_email" clickable="true" focusable="true" bounds="[40,400][1040,520]" />
  <node class="android.widget.TextView" text="Email" bounds="[60,420][260,470]" />
</hierarchy>`;

describe('parseNativeUiDump — React Native touchables & inputs', () => {
  const els = parseNativeUiDump(RN_FIXTURE, { screenW: 1080, screenH: 2400 });
  const byType = (t: string) => els.filter(e => e.elementType === t);

  it('emits ONE button per touchable (no duplicate standalone text)', () => {
    const masuk = els.filter(e => e.label === 'Masuk');
    expect(masuk.length).toBe(1);
    expect(masuk[0].elementType).toBe('button');
    expect(masuk[0].finderStrategy).toBe('resource-id');
    // the child "Masuk" TextView must NOT also appear as a standalone text
    expect(byType('text').some(e => e.label === 'Masuk')).toBe(false);
  });

  it('treats a focusable-only touchable with a button-ish id as a button', () => {
    const reg = els.find(e => e.label === 'Daftar yuk!');
    expect(reg?.elementType).toBe('button');
    expect(reg?.finderValue).toBe('com.app:id/button_register_now');
  });

  it('does not duplicate a self-described touchable (content-desc + child text)', () => {
    expect(els.filter(e => e.label === 'Jelajahi Fitur').length).toBe(1);
  });

  it('labels an id-only input from its nearby label text', () => {
    const input = byType('input')[0];
    expect(input.label).toBe('Email');
    expect(input.finderStrategy).toBe('resource-id');
    expect(input.finderValue).toBe('com.app:id/input_email');
  });
});

describe('device auto-detection', () => {
  const DEVICES = `List of devices attached
emulator-5554\tdevice
RF8M30ABCDE\tdevice
0123offline\toffline
`;

  it('parses only devices in "device" state', () => {
    expect(parseAdbDevices(DEVICES)).toEqual(['emulator-5554', 'RF8M30ABCDE']);
  });

  it('prefers a real device over an emulator (even when emulator is configured)', () => {
    expect(pickDevice(['emulator-5554', 'RF8M30ABCDE'], 'emulator-5554')).toBe('RF8M30ABCDE');
  });

  it('autodetects the only connected device when config is stale', () => {
    expect(pickDevice(['RF8M30ABCDE'], 'emulator-5554')).toBe('RF8M30ABCDE');
  });

  it('respects an explicit real-device config when it is connected', () => {
    expect(pickDevice(['emulator-5554', 'RF8M30ABCDE', 'RF8M30FGHIJ'], 'RF8M30FGHIJ')).toBe('RF8M30FGHIJ');
  });

  it('falls back to the emulator when no real device is connected', () => {
    expect(pickDevice(['emulator-5554'], 'emulator-5554')).toBe('emulator-5554');
  });

  it('returns the configured id when nothing is connected', () => {
    expect(pickDevice([], 'emulator-5554')).toBe('emulator-5554');
  });
});

describe('countUnlabeledInteractive', () => {
  const XML = `<hierarchy>
    <node class="android.view.ViewGroup" clickable="true" bounds="[816,120][1032,240]" />
    <node class="android.widget.Button" resource-id="com.app:id/ok" clickable="true" bounds="[40,560][1040,660]" />
    <node class="android.widget.TextView" text="Hello" clickable="false" bounds="[40,200][600,260]" />
    <node class="android.widget.ImageButton" content-desc="Back" clickable="true" bounds="[0,0][120,120]" />
  </hierarchy>`;

  it('counts only interactive leaves with no id/label', () => {
    // only the first node (clickable, no text/desc/id) qualifies
    expect(countUnlabeledInteractive(XML, { screenW: 1080, screenH: 2340 })).toBe(1);
  });

  it('returns 0 when every control is labelled', () => {
    const ok = `<hierarchy><node class="android.widget.Button" resource-id="x" clickable="true" bounds="[0,0][100,100]" /></hierarchy>`;
    expect(countUnlabeledInteractive(ok)).toBe(0);
  });
});

describe('detectPackage', () => {
  it('returns the dominant app package, ignoring system UI', () => {
    const xml = `<hierarchy>
      <node package="com.android.systemui" text="" />
      <node package="com.one.ifg.uat" text="Masuk" />
      <node package="com.one.ifg.uat" text="Password" />
      <node package="com.one.ifg.uat" text="Login" />
    </hierarchy>`;
    expect(detectPackage(xml)).toBe('com.one.ifg.uat');
  });

  it('ignores launcher packages', () => {
    const xml = `<hierarchy>
      <node package="com.huawei.android.launcher" />
      <node package="com.huawei.android.launcher" />
    </hierarchy>`;
    expect(detectPackage(xml)).toBe('');
  });
});
