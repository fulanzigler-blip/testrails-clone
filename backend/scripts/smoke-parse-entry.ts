// Smoke: fetch the real UIAutomator dump from the Mac Air emulator and run it
// through the ACTUAL parseNativeUiDump implementation (bundled by esbuild).
// Executed inside the backend container (NODE_PATH provides ssh2).
import { Client } from 'ssh2';
import * as fs from 'fs';
import { parseNativeUiDump, findNativeElement } from '../src/utils/native-android-driver';

const HOST = process.argv[2] || '100.114.57.93';
const USER = process.argv[3] || 'bankraya';
const KEY = process.env.SSH_KEY || '/home/nodejs/.ssh/id_ed25519';

function sshExec(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => reject(new Error('SSH timeout')), 60000);
    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', (d: Buffer) => { out += d.toString(); });
        stream.on('close', () => { clearTimeout(timer); client.end(); resolve(out); });
      });
    }).on('error', reject).connect({ host: HOST, username: USER, privateKey: fs.readFileSync(KEY), readyTimeout: 15000 });
  });
}

(async () => {
  const adb = 'export PATH=$PATH:/Users/bankraya/Library/Android/sdk/platform-tools:/opt/homebrew/bin; adb -s emulator-5554';
  await sshExec(`${adb} shell monkey -p com.android.settings -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 2`);
  const xml = await sshExec(`${adb} shell uiautomator dump /sdcard/ui_smoke.xml >/dev/null 2>&1; ${adb} shell cat /sdcard/ui_smoke.xml`);
  console.log(`dump bytes: ${xml.length}`);

  const els = parseNativeUiDump(xml, { screenW: 1080, screenH: 2424 });
  const inputs = els.filter(e => e.elementType === 'input');
  const buttons = els.filter(e => e.elementType === 'button');
  const texts = els.filter(e => e.elementType === 'text');
  console.log(`parsed: ${els.length} elements — ${inputs.length} inputs, ${buttons.length} buttons, ${texts.length} texts`);
  console.log('--- first 12 elements:');
  for (const e of els.slice(0, 12)) {
    console.log(`  [${e.elementType}] "${e.label}"  finder: ${e.finderStrategy}=${e.finderValue.slice(0, 50)}  fallbacks: ${e.fallbackFinders.map(f => f.strategy).join(',')}`);
  }

  const net = findNativeElement(els, { strategy: 'text', value: 'network' });
  console.log(`--- findNativeElement(text~"network"): ${net ? `FOUND "${net.label}" bounds=[${net.bounds.x1},${net.bounds.y1}][${net.bounds.x2},${net.bounds.y2}]` : 'NOT FOUND'}`);
  console.log(net ? 'SMOKE_PASS' : 'SMOKE_FAIL');
})().catch(e => { console.error('SMOKE_ERROR', e.message); process.exit(1); });
