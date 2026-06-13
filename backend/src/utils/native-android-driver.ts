import logger from './logger';
import { execSSHWithConfig, execSSHBinary } from './ssh-client';
import { hashString } from './web-interaction-utils';
import {
  MobileDriver,
  MobileRunnerConfig,
  NativeElement,
  NativeFinder,
  NativeStep,
  NativeRunResult,
  ScreenSnapshot,
} from './mobile-driver';

// ─── ADB helpers ───────────────────────────────────────────────────────────────

const ADB_ENV =
  'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
  'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ';

function deviceArg(runner: MobileRunnerConfig): string {
  return runner.deviceId ? `-s ${runner.deviceId}` : '';
}

function adb(runner: MobileRunnerConfig, cmd: string): string {
  return `${ADB_ENV}adb ${deviceArg(runner)} ${cmd}`;
}

// ─── UIAutomator dump parser (pure — unit tested) ──────────────────────────────
//
// Native Android views ARE the accessibility tree, so every visible View shows
// up in the dump with class/text/bounds. Classification:
//   input  — EditText-family (or password fields)
//   button — clickable/checkable nodes (Button, ImageButton, clickable rows...)
//   text   — TextView-family with text, not clickable
//
// Finder priority (most → least stable): resource-id → content-desc → text →
// bounds center (last resort; recorded so replay can always act).

const BOUNDS_RE = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseNativeUiDump(xml: string, opts: { screenW?: number; screenH?: number } = {}): NativeElement[] {
  const screenW = opts.screenW ?? 1080;
  const screenH = opts.screenH ?? 1920;
  const elements: NativeElement[] = [];
  const seenBounds = new Set<string>();

  const nodeRe = /<node\s+([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(xml)) !== null) {
    const attrs = m[1];
    const get = (k: string) => {
      const r = new RegExp(`\\b${k}="([^"]*)"`).exec(attrs);
      return r ? decodeXmlEntities(r[1]) : '';
    };

    const className = get('class');
    if (!className || className.includes('DecorView')) continue;

    const bounds = get('bounds');
    const bm = BOUNDS_RE.exec(bounds);
    if (!bm) continue;
    const x1 = parseInt(bm[1]), y1 = parseInt(bm[2]), x2 = parseInt(bm[3]), y2 = parseInt(bm[4]);
    if (x2 <= x1 || y2 <= y1) continue;
    // Skip near-fullscreen containers (layout roots, scrim overlays)
    if ((x2 - x1) >= screenW * 0.97 && (y2 - y1) >= screenH * 0.92) continue;

    const text = get('text');
    const contentDesc = get('content-desc');
    const resourceId = get('resource-id');
    const clickable = get('clickable') === 'true';
    const checkable = get('checkable') === 'true';
    const isPassword = get('password') === 'true';
    const isEditText = /EditText|AutoCompleteTextView|SearchView/.test(className);
    const isTextView = /TextView|CheckedTextView/.test(className) && !isEditText;

    let elementType: NativeElement['elementType'] | null = null;
    if (isEditText || isPassword) elementType = 'input';
    else if (clickable || checkable) elementType = 'button';
    else if (isTextView && text.trim()) elementType = 'text';
    if (!elementType) continue;

    // Label: prefer human-readable text, then content-desc, then short resource-id
    const idShort = resourceId.split('/').pop() || '';
    const firstLine = (text || contentDesc).split('\n')[0].trim();
    const label = firstLine || idShort || className.split('.').pop() || 'element';
    // Buttons without any identity (no text/desc/id) are usually decorative — skip
    if (elementType === 'button' && !firstLine && !resourceId) continue;
    if (elementType === 'text' && firstLine.length < 2) continue;

    // Dedup identical bounds (parent + child often share the clickable area)
    const key = `${elementType}:${bounds}`;
    if (seenBounds.has(key)) continue;
    seenBounds.add(key);

    // Finder chain
    const finders: NativeFinder[] = [];
    if (resourceId) finders.push({ strategy: 'resource-id', value: resourceId });
    if (contentDesc) finders.push({ strategy: 'content-desc', value: contentDesc.split('\n')[0].trim() });
    if (text.trim()) finders.push({ strategy: 'text', value: text.split('\n')[0].trim() });
    finders.push({ strategy: 'bounds', value: `${Math.round((x1 + x2) / 2)},${Math.round((y1 + y2) / 2)}` });
    const primary = finders[0];

    elements.push({
      id: `na_${hashString(`${resourceId}|${contentDesc}|${text}|${className}|${elementType}`)}`,
      elementType,
      label: label.slice(0, 80),
      text: text.slice(0, 200),
      contentDesc,
      resourceId,
      className,
      bounds: { x1, y1, x2, y2 },
      clickable,
      checkable,
      isPassword,
      finderStrategy: primary.strategy,
      finderValue: primary.value,
      fallbackFinders: finders.slice(1),
    });
  }

  // Reading order: top → bottom, left → right
  elements.sort((a, b) => (a.bounds.y1 - b.bounds.y1) || (a.bounds.x1 - b.bounds.x1));
  return elements;
}

/** Find an element in a fresh dump by finder, trying fallbacks. Text matching is
 *  contains-insensitive — native lists hold dynamic DB data, exact match breaks. */
export function findNativeElement(elements: NativeElement[], finder: NativeFinder): NativeElement | null {
  const norm = (s: string) => s.toLowerCase().trim();
  switch (finder.strategy) {
    case 'resource-id':
      return elements.find(e => e.resourceId === finder.value) || null;
    case 'content-desc':
      return elements.find(e => norm(e.contentDesc).includes(norm(finder.value))) || null;
    case 'text':
      return elements.find(e => norm(e.text).includes(norm(finder.value)) || norm(e.label).includes(norm(finder.value))) || null;
    case 'bounds':
      return null; // bounds is a coordinate, not a search — handled by caller
    default:
      return null;
  }
}

// ─── Device interaction ────────────────────────────────────────────────────────

async function dumpHierarchy(runner: MobileRunnerConfig): Promise<string> {
  const cmd = adb(runner, 'shell uiautomator dump /sdcard/ui.xml 2>/dev/null') +
    ` && ${ADB_ENV}adb ${deviceArg(runner)} shell cat /sdcard/ui.xml 2>/dev/null`;
  const result = await execSSHWithConfig(cmd, runner, 20000);
  return result.output;
}

async function screenshot(runner: MobileRunnerConfig): Promise<string> {
  const buf = await execSSHBinary(adb(runner, 'exec-out screencap -p'), runner, 25000);
  return buf.toString('base64');
}

async function getScreenSize(runner: MobileRunnerConfig): Promise<{ w: number; h: number }> {
  const result = await execSSHWithConfig(adb(runner, 'shell wm size'), runner, 10000).catch(() => ({ output: '' }));
  const m = result.output.match(/(\d+)x(\d+)/);
  return m ? { w: parseInt(m[1]), h: parseInt(m[2]) } : { w: 1080, h: 1920 };
}

/** ADB `input text` cannot handle spaces or most specials directly. */
function escapeAdbText(value: string): string {
  return value
    .replace(/[\\'"`$&|;<>(){}\[\]]/g, '')
    .replace(/\s/g, '%s');
}

const KEYCODES: Record<string, number> = {
  Enter: 66, Back: 4, Tab: 61, Delete: 67, Home: 3, Menu: 82,
  ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
};

// ─── Driver ────────────────────────────────────────────────────────────────────

export class AndroidNativeDriver implements MobileDriver {
  readonly platform = 'android' as const;

  /** List 3rd-party packages installed on the device (for the app picker). */
  async listApps(runner: MobileRunnerConfig): Promise<string[]> {
    const result = await execSSHWithConfig(adb(runner, 'shell pm list packages -3'), runner, 15000);
    return result.output
      .split('\n')
      .map(l => l.replace(/^package:/, '').trim())
      .filter(Boolean)
      .sort();
  }

  async launchApp(runner: MobileRunnerConfig, appId: string): Promise<void> {
    await execSSHWithConfig(
      adb(runner, `shell monkey -p ${appId} -c android.intent.category.LAUNCHER 1`),
      runner, 15000,
    );
    await new Promise(r => setTimeout(r, 2500));
  }

  async captureScreen(runner: MobileRunnerConfig): Promise<ScreenSnapshot> {
    const size = await getScreenSize(runner);
    const [xml, shot] = await Promise.all([dumpHierarchy(runner), screenshot(runner)]);
    const elements = parseNativeUiDump(xml, { screenW: size.w, screenH: size.h });
    logger.info(`[NativeDriver] Screen captured: ${elements.length} elements (${elements.filter(e => e.elementType === 'input').length} inputs, ${elements.filter(e => e.elementType === 'button').length} buttons)`);
    return { screenshot: shot, elements, screenW: size.w, screenH: size.h };
  }

  /** Locate an element NOW (fresh dump) and return its tap point. */
  private async locate(runner: MobileRunnerConfig, finder: NativeFinder, fallbacks: NativeFinder[] = [], screen?: { w: number; h: number }): Promise<{ x: number; y: number; via: string } | null> {
    const size = screen || await getScreenSize(runner);
    const xml = await dumpHierarchy(runner);
    const elements = parseNativeUiDump(xml, { screenW: size.w, screenH: size.h });

    for (const f of [finder, ...fallbacks]) {
      if (f.strategy === 'bounds') {
        const [x, y] = f.value.split(',').map(Number);
        if (!isNaN(x) && !isNaN(y)) return { x, y, via: `bounds(${f.value})` };
        continue;
      }
      const el = findNativeElement(elements, f);
      if (el) {
        return {
          x: Math.round((el.bounds.x1 + el.bounds.x2) / 2),
          y: Math.round((el.bounds.y1 + el.bounds.y2) / 2),
          via: `${f.strategy}="${f.value}" → "${el.label}"`,
        };
      }
    }
    return null;
  }

  async runSteps(runner: MobileRunnerConfig, steps: NativeStep[], opts: { appId?: string } = {}): Promise<NativeRunResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const screenshots: string[] = [];
    const size = await getScreenSize(runner);

    if (opts.appId) {
      logs.push(`Launching app: ${opts.appId}`);
      await this.launchApp(runner, opts.appId);
    }

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const finder: NativeFinder = { strategy: step.finderStrategy || 'text', value: step.finderValue || step.text || '' };
        const fallbacks = step.fallbackFinders || [];
        const label = step.finderValue || step.text || step.value || '';

        switch (step.type) {
          case 'tap': {
            logs.push(`[${i + 1}] Tap: ${label}`);
            const pos = await this.locate(runner, finder, fallbacks, size);
            if (!pos) throw new Error(`Element not found: ${finder.strategy}="${finder.value}"`);
            logs.push(`    → Found via ${pos.via}, tapping (${pos.x}, ${pos.y})`);
            await execSSHWithConfig(adb(runner, `shell input tap ${pos.x} ${pos.y}`), runner, 8000);
            await new Promise(r => setTimeout(r, 1200));
            break;
          }

          case 'enter_text': {
            logs.push(`[${i + 1}] Enter text into ${label}: "${step.value || ''}"`);
            const pos = await this.locate(runner, finder, fallbacks, size);
            if (!pos) throw new Error(`Input not found: ${finder.strategy}="${finder.value}"`);
            logs.push(`    → Found via ${pos.via}`);
            await execSSHWithConfig(adb(runner, `shell input tap ${pos.x} ${pos.y}`), runner, 8000);
            await new Promise(r => setTimeout(r, 600));
            const escaped = escapeAdbText(step.value || '');
            if (escaped) await execSSHWithConfig(adb(runner, `shell input text '${escaped}'`), runner, 10000);
            await new Promise(r => setTimeout(r, 400));
            break;
          }

          case 'assert_visible': {
            logs.push(`[${i + 1}] Assert visible: ${label}`);
            const pos = await this.locate(runner, finder, fallbacks, size);
            if (!pos) throw new Error(`Assertion failed — element not visible: ${finder.strategy}="${finder.value}"`);
            logs.push(`    → Visible ✓ (${pos.via})`);
            break;
          }

          case 'assert_not_visible': {
            logs.push(`[${i + 1}] Assert NOT visible: ${label}`);
            const pos = await this.locate(runner, finder, fallbacks, size);
            if (pos) throw new Error(`Assertion failed — element IS visible: ${finder.strategy}="${finder.value}"`);
            logs.push(`    → Not visible ✓`);
            break;
          }

          case 'assert_text': {
            const expected = step.text || step.value || '';
            logs.push(`[${i + 1}] Assert text on screen: "${expected}"`);
            const xml = await dumpHierarchy(runner);
            const haystack = decodeXmlEntities(xml).toLowerCase();
            if (!haystack.includes(expected.toLowerCase())) {
              throw new Error(`Assertion failed — text not found on screen: "${expected}"`);
            }
            logs.push(`    → Text found ✓`);
            break;
          }

          case 'wait': {
            const ms = parseInt(step.value || '1000', 10) || 1000;
            logs.push(`[${i + 1}] Wait ${ms}ms`);
            await new Promise(r => setTimeout(r, ms));
            break;
          }

          case 'screenshot': {
            logs.push(`[${i + 1}] Screenshot`);
            screenshots.push(await screenshot(runner));
            break;
          }

          case 'press_key': {
            const key = step.value || 'Enter';
            const code = KEYCODES[key] ?? parseInt(key, 10);
            if (isNaN(code)) throw new Error(`Unknown key: ${key}`);
            logs.push(`[${i + 1}] Press key: ${key} (keycode ${code})`);
            await execSSHWithConfig(adb(runner, `shell input keyevent ${code}`), runner, 8000);
            await new Promise(r => setTimeout(r, 600));
            break;
          }

          case 'scroll': {
            const dir = step.value === 'up' ? 'up' : 'down';
            const cx = Math.round(size.w / 2);
            const [fromY, toY] = dir === 'down'
              ? [Math.round(size.h * 0.7), Math.round(size.h * 0.3)]
              : [Math.round(size.h * 0.3), Math.round(size.h * 0.7)];
            logs.push(`[${i + 1}] Scroll ${dir}`);
            await execSSHWithConfig(adb(runner, `shell input swipe ${cx} ${fromY} ${cx} ${toY} 400`), runner, 8000);
            await new Promise(r => setTimeout(r, 800));
            break;
          }

          default:
            logs.push(`[${i + 1}] Skipping unsupported step type: ${step.type}`);
        }
      }

      // Final screenshot for the report
      screenshots.push(await screenshot(runner));
      const duration = Date.now() - startTime;
      logs.push('');
      logs.push(`=== All ${steps.length} steps PASSED in ${(duration / 1000).toFixed(1)}s ===`);
      return { success: true, output: logs.join('\n'), duration, screenshots };
    } catch (err: any) {
      // Failure screenshot so the user sees the screen state at the failing step
      await screenshot(runner).then(s => screenshots.push(s)).catch(() => {});
      const duration = Date.now() - startTime;
      logs.push('');
      logs.push(`❌ FAILED: ${err.message}`);
      return { success: false, output: logs.join('\n'), duration, screenshots };
    }
  }
}

export const androidNativeDriver = new AndroidNativeDriver();
