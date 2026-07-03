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

/** Detect the foreground app's package from a UIAutomator dump: the most common
 *  package= among nodes, excluding system UI / launchers. Used so a recorded test
 *  can relaunch the app under test even if the user scanned the "current screen"
 *  without picking a package. */
export function detectPackage(xml: string): string {
  const counts = new Map<string, number>();
  const re = /package="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const pkg = m[1];
    if (/^(android|com\.android\.systemui|com\.android\.launcher|com\.google\.android\.apps\.nexuslauncher|com\.huawei\.android\.launcher|com\.miui\.home|com\.sec\.android\.app\.launcher)/.test(pkg)) continue;
    counts.set(pkg, (counts.get(pkg) || 0) + 1);
  }
  let best = '', bestN = 0;
  for (const [pkg, n] of counts) if (n > bestN) { best = pkg; bestN = n; }
  return best;
}

/** Count interactive LEAF controls that have no identity at all (no text,
 *  content-desc, or resource-id) — e.g. an icon/toggle the dev never labelled.
 *  These can't be automated reliably; surfaced as a warning so the dev adds a
 *  testID / accessibilityLabel. Containers are excluded (their child usually
 *  provides a label); near-fullscreen nodes are excluded (decorative roots). */
export function countUnlabeledInteractive(xml: string, opts: { screenW?: number; screenH?: number } = {}): number {
  const screenW = opts.screenW ?? 1080;
  const screenH = opts.screenH ?? 1920;
  let count = 0;
  const leafRe = /<node\s+([^>]*?)\/>/g;  // self-closing = leaf
  let m: RegExpExecArray | null;
  while ((m = leafRe.exec(xml)) !== null) {
    const a = m[1];
    const g = (k: string) => { const r = new RegExp(`\\b${k}="([^"]*)"`).exec(a); return r ? r[1] : ''; };
    const interactive = g('clickable') === 'true' || g('checkable') === 'true';
    if (!interactive) continue;
    if (g('text').trim() || g('content-desc').trim() || g('resource-id').trim()) continue;
    const bm = BOUNDS_RE.exec(g('bounds'));
    if (!bm) continue;
    const x1 = +bm[1], y1 = +bm[2], x2 = +bm[3], y2 = +bm[4];
    if (x2 <= x1 || y2 <= y1) continue;
    if ((x2 - x1) >= screenW * 0.97 && (y2 - y1) >= screenH * 0.92) continue;
    // Skip slivers too small to be a real tap target (scrollbars, indicators,
    // edge artifacts) — both dimensions must be at least ~min touch size.
    if ((x2 - x1) < 48 || (y2 - y1) < 48) continue;
    count++;
  }
  return count;
}

/** Parse `adb devices` output into serials that are in the "device" state. */
export function parseAdbDevices(output: string): string[] {
  return output.split('\n').slice(1)
    .map(l => l.trim())
    .filter(l => /\sdevice$/.test(l))              // state "device" (skip offline/unauthorized)
    .map(l => l.split(/\s+/)[0])
    .filter(Boolean);
}

/** Choose the target device. A connected real device is preferred over an
 *  emulator (the configured deviceId often defaults to one). An explicit
 *  non-emulator config wins; otherwise prefer real → configured → first. */
export function pickDevice(serials: string[], configured?: string): string {
  if (serials.length === 0) return configured || '';
  if (configured && !configured.startsWith('emulator-') && serials.includes(configured)) return configured;
  const real = serials.find(s => !s.startsWith('emulator-'));
  if (real) return real;
  if (configured && serials.includes(configured)) return configured;
  return serials[0];
}

async function resolveDeviceId(runner: MobileRunnerConfig): Promise<string> {
  try {
    const r = await execSSHWithConfig(`${ADB_ENV}adb devices`, runner, 10000);
    return pickDevice(parseAdbDevices(r.output), runner.deviceId);
  } catch {
    return runner.deviceId || '';
  }
}

/** Returns a runner copy with deviceId set to the auto-detected target. */
async function withResolvedDevice(runner: MobileRunnerConfig): Promise<MobileRunnerConfig> {
  const deviceId = await resolveDeviceId(runner);
  if (deviceId && deviceId !== runner.deviceId) {
    logger.info(`[NativeDriver] Auto-selected device "${deviceId}" (configured: "${runner.deviceId || 'none'}")`);
  }
  return deviceId === runner.deviceId ? runner : { ...runner, deviceId };
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

  // Hierarchy-aware walk. The very common Android pattern is a clickable
  // container (RecyclerView row, ListTile) whose label lives in a child
  // TextView — the container itself has no text. A flat scan files the row under
  // "text" and misses it as a tap target. So we track open clickable ancestors
  // and let a labelled descendant CLAIM the nearest labelless clickable ancestor,
  // emitting the ROW as a button (ancestor bounds = tap target, child = label).
  // A labelless clickable container with no labelled child is emitted on pop
  // (icon-only row) only if it has a resource-id.
  interface OpenAncestor {
    interactive: boolean;   // clickable/checkable, or focusable with a button-ish id
    bounds: { x1: number; y1: number; x2: number; y2: number };
    validBounds: boolean;
    resourceId: string;
    contentDesc: string;
    className: string;
    claimed: boolean;       // a descendant text already gave it a label
    claimedLabel: string;
    emittedSelf: boolean;   // already emitted as a leaf → don't re-emit on pop
    containsInput: boolean; // wraps an EditText → it's an input wrapper, not a button
  }
  const stack: OpenAncestor[] = [];
  // RN/native touchables sometimes expose only focusable (+ a button-ish id) and
  // not clickable; treat those as interactive too.
  const BUTTONISH_ID = /butt?on|btn|tab\b|link|chip|pressable|touchable|cta|submit|action|menu|item|card/i;

  const pushElement = (e: {
    elementType: NativeElement['elementType'];
    bounds: { x1: number; y1: number; x2: number; y2: number };
    text: string; contentDesc: string; resourceId: string; className: string;
    clickable: boolean; checkable: boolean; isPassword: boolean;
  }) => {
    const key = `${e.elementType}:${e.bounds.x1},${e.bounds.y1},${e.bounds.x2},${e.bounds.y2}`;
    if (seenBounds.has(key)) return;
    seenBounds.add(key);

    const idShort = e.resourceId.split('/').pop() || '';
    const firstLine = (e.text || e.contentDesc).split('\n')[0].trim();
    const label = firstLine || idShort || e.className.split('.').pop() || 'element';
    const cx = Math.round((e.bounds.x1 + e.bounds.x2) / 2);
    const cy = Math.round((e.bounds.y1 + e.bounds.y2) / 2);

    const finders: NativeFinder[] = [];
    if (e.resourceId) finders.push({ strategy: 'resource-id', value: e.resourceId });
    if (e.contentDesc) finders.push({ strategy: 'content-desc', value: e.contentDesc.split('\n')[0].trim() });
    if (e.text.trim()) finders.push({ strategy: 'text', value: e.text.split('\n')[0].trim() });
    finders.push({ strategy: 'bounds', value: `${cx},${cy}` });
    const primary = finders[0];

    elements.push({
      id: `na_${hashString(`${e.resourceId}|${e.contentDesc}|${e.text}|${e.className}|${e.elementType}`)}`,
      elementType: e.elementType,
      label: label.slice(0, 80),
      text: e.text.slice(0, 200),
      contentDesc: e.contentDesc,
      resourceId: e.resourceId,
      className: e.className,
      bounds: e.bounds,
      clickable: e.clickable,
      checkable: e.checkable,
      isPassword: e.isPassword,
      finderStrategy: primary.strategy,
      finderValue: primary.value,
      fallbackFinders: finders.slice(1),
    });
  };

  // Tokenize opening / self-closing / closing tags in document order
  const tagRe = /<node\s+([^>]*?)(\/?)>|<\/node>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    if (m[0] === '</node>') {
      const popped = stack.pop();
      // Emit exactly ONE button per interactive container on close: labelled by a
      // claimed child text, else its own content-desc, else its resource-id.
      // Skip input wrappers (those are represented by the EditText input) and
      // already-emitted leaves.
      if (popped && popped.interactive && !popped.emittedSelf && !popped.containsInput && popped.validBounds) {
        const label = popped.claimedLabel || popped.contentDesc.split('\n')[0].trim();
        if (label || popped.resourceId) {
          pushElement({
            elementType: 'button', bounds: popped.bounds, text: label, contentDesc: popped.contentDesc,
            resourceId: popped.resourceId, className: popped.className,
            clickable: true, checkable: false, isPassword: false,
          });
        }
      }
      continue;
    }

    const attrs = m[1];
    const selfClosing = m[2] === '/';
    const get = (k: string) => {
      const r = new RegExp(`\\b${k}="([^"]*)"`).exec(attrs);
      return r ? decodeXmlEntities(r[1]) : '';
    };

    const className = get('class');
    const bm = BOUNDS_RE.exec(get('bounds'));
    const text = get('text');
    const contentDesc = get('content-desc');
    const resourceId = get('resource-id');
    const clickable = get('clickable') === 'true';
    const checkable = get('checkable') === 'true';
    const focusable = get('focusable') === 'true';
    const isPassword = get('password') === 'true';
    const ownLabel = (text || contentDesc).trim();

    let x1 = 0, y1 = 0, x2 = 0, y2 = 0, validBounds = false;
    if (bm) {
      x1 = parseInt(bm[1]); y1 = parseInt(bm[2]); x2 = parseInt(bm[3]); y2 = parseInt(bm[4]);
      validBounds = x2 > x1 && y2 > y1;
    }
    const usable = !!className && !className.includes('DecorView') && validBounds
      && !((x2 - x1) >= screenW * 0.97 && (y2 - y1) >= screenH * 0.92);

    const isEditText = /EditText|AutoCompleteTextView|SearchView/.test(className);
    const isTextView = /TextView|CheckedTextView/.test(className) && !isEditText;
    const interactive = !isEditText && !isPassword && (clickable || checkable || (focusable && BUTTONISH_ID.test(resourceId)));
    const bounds = { x1, y1, x2, y2 };
    let emittedSelf = false;

    if (usable) {
      if (isEditText || isPassword) {
        pushElement({ elementType: 'input', bounds, text, contentDesc, resourceId, className, clickable, checkable, isPassword });
        emittedSelf = true;
        // The nearest interactive ancestor is an input wrapper — not a button
        const wrap = [...stack].reverse().find(a => a.interactive && !a.emittedSelf);
        if (wrap) wrap.containsInput = true;
      } else if (interactive) {
        if (selfClosing && (ownLabel || resourceId)) {
          // Interactive leaf (icon/labelled button) — emit now
          pushElement({ elementType: 'button', bounds, text, contentDesc, resourceId, className, clickable: true, checkable, isPassword });
          emittedSelf = true;
        }
        // else: interactive container → defer; emit one button on close (pop)
      } else if (isTextView && text.trim().length >= 2) {
        // A text inside an interactive (non-input) ancestor is that button's label,
        // not a standalone text — claim it and suppress the standalone.
        const anc = [...stack].reverse().find(a => a.interactive && !a.containsInput);
        if (anc) {
          if (!anc.claimed) { anc.claimed = true; anc.claimedLabel = text.split('\n')[0].trim(); }
        } else {
          pushElement({ elementType: 'text', bounds, text, contentDesc, resourceId, className, clickable, checkable, isPassword });
        }
      }
    }

    if (!selfClosing && !className.includes('DecorView')) {
      stack.push({
        interactive, bounds, validBounds, resourceId, contentDesc, className,
        claimed: false, claimedLabel: '', emittedSelf, containsInput: false,
      });
    }
  }

  // Associate a human label with inputs that only have an id-like label. A field's
  // label/placeholder sits inside or just above the field and overlaps it
  // horizontally; validation errors sit below. So require horizontal overlap +
  // vertically inside-or-just-above, exclude error text, and pick the topmost.
  const inputsNeedingLabel = elements.filter(e => e.elementType === 'input' && !e.text.trim() && !e.contentDesc.trim());
  if (inputsNeedingLabel.length) {
    const textEls = elements.filter(e => e.elementType === 'text');
    const ERRORISH = /wajib|harus|required|invalid|tidak valid|min\.|maks|max /i;
    for (const inp of inputsNeedingLabel) {
      const b = inp.bounds;
      let best: typeof textEls[number] | null = null, bestTop = Infinity;
      for (const t of textEls) {
        if (t.text.length > 30 || ERRORISH.test(t.text)) continue;
        const overlapsX = t.bounds.x1 < b.x2 && t.bounds.x2 > b.x1;
        const insideOrAbove = t.bounds.y2 <= b.y2 + 8 && t.bounds.y2 >= b.y1 - 140;
        if (!overlapsX || !insideOrAbove) continue;
        // Prefer the text closest to the field's top edge
        const gap = Math.abs(t.bounds.y1 - b.y1);
        if (gap < bestTop) { bestTop = gap; best = t; }
      }
      if (best) inp.label = best.text.split('\n')[0].slice(0, 80);
    }
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
      // Exact, else suffix match so a short id ("action_bar_title") matches a
      // fully-qualified one ("com.app:id/action_bar_title") — Flutter live-view
      // "key" finders and some scrapers emit the short form.
      return elements.find(e => e.resourceId === finder.value)
        || elements.find(e => e.resourceId.endsWith(`/${finder.value}`) || e.resourceId.endsWith(`:id/${finder.value}`))
        || null;
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
  // `--compressed` is the primary path: it returns immediately and reliably,
  // whereas plain `uiautomator dump` first waits ~10s for the app to go idle —
  // React Native (JS bridge / Animated loops) and indeterminate spinners never
  // idle, so plain fails with "could not get idle state" AND that 10s stall lets
  // transient UI (e.g. "field required" validation) disappear before the dump
  // runs. Compressed keeps every accessibility-relevant node (inputs, buttons,
  // text, validation messages) — verified capturing validation that plain misses
  // entirely. Plain is only a fallback for the rare device where compressed is
  // empty.
  const dev = deviceArg(runner);
  const script = [
    'rm -f /sdcard/ui.xml',
    'uiautomator dump --compressed /sdcard/ui.xml >/dev/null 2>&1',
    'grep -q "<hierarchy" /sdcard/ui.xml 2>/dev/null || uiautomator dump /sdcard/ui.xml >/dev/null 2>&1',
  ].join('; ');
  const cmd = `${ADB_ENV}adb ${dev} shell '${script}' && ${ADB_ENV}adb ${dev} shell cat /sdcard/ui.xml 2>/dev/null`;
  const result = await execSSHWithConfig(cmd, runner, 30000);
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
    runner = await withResolvedDevice(runner);
    const result = await execSSHWithConfig(adb(runner, 'shell pm list packages -3'), runner, 15000);
    return result.output
      .split('\n')
      .map(l => l.replace(/^package:/, '').trim())
      .filter(Boolean)
      .sort();
  }

  async launchApp(runner: MobileRunnerConfig, appId: string): Promise<void> {
    runner = await withResolvedDevice(runner);
    await execSSHWithConfig(
      adb(runner, `shell monkey -p ${appId} -c android.intent.category.LAUNCHER 1`),
      runner, 15000,
    );
    await new Promise(r => setTimeout(r, 2500));
  }

  /** Foreground app package from the window manager — more reliable than parsing
   *  node package= attrs (which compressed dumps sometimes omit or fill with the
   *  launcher). Excludes launchers / system UI. */
  private async foregroundPackage(runner: MobileRunnerConfig): Promise<string> {
    try {
      const r = await execSSHWithConfig(adb(runner, 'shell dumpsys window'), runner, 10000);
      const m = r.output.match(/mCurrentFocus=Window\{[^}]*?([\w.]+)\/[\w.]+\}/)
        || r.output.match(/mFocusedApp=ActivityRecord\{[^}]*?\s([\w.]+)\/[\w.]+/);
      const pkg = m ? m[1] : '';
      // Ignore launchers, system UI, and transient system dialogs (permission
      // prompts, package installer, IME) — none of those are the app under test.
      if (!pkg || /launcher|systemui|permissioncontroller|packageinstaller|inputmethod|^android$/.test(pkg)) return '';
      return pkg;
    } catch {
      return '';
    }
  }

  async captureScreen(runner: MobileRunnerConfig): Promise<ScreenSnapshot> {
    runner = await withResolvedDevice(runner);
    const size = await getScreenSize(runner);
    const [xml, shot, fgPkg] = await Promise.all([dumpHierarchy(runner), screenshot(runner), this.foregroundPackage(runner)]);
    const elements = parseNativeUiDump(xml, { screenW: size.w, screenH: size.h });
    const currentPackage = fgPkg || detectPackage(xml);
    const unlabeledInteractive = countUnlabeledInteractive(xml, { screenW: size.w, screenH: size.h });
    logger.info(`[NativeDriver] Screen captured: ${elements.length} elements (${elements.filter(e => e.elementType === 'input').length} inputs, ${elements.filter(e => e.elementType === 'button').length} buttons), pkg=${currentPackage || 'unknown'}, unlabeled=${unlabeledInteractive}`);
    return { screenshot: shot, elements, screenW: size.w, screenH: size.h, currentPackage, unlabeledInteractive };
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
    runner = await withResolvedDevice(runner);
    const size = await getScreenSize(runner);

    if (opts.appId) {
      logs.push(`Launching app: ${opts.appId}`);
      await this.launchApp(runner, opts.appId);
      // Wait until the app has rendered something (cold start, esp. React Native,
      // can take several seconds) before replaying the first step.
      const readyStart = Date.now();
      while (Date.now() - readyStart < 12000) {
        const xml = await dumpHierarchy(runner);
        if (parseNativeUiDump(xml, { screenW: size.w, screenH: size.h }).length > 0) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      logs.push(`  → App ready after ${((Date.now() - readyStart) / 1000).toFixed(1)}s`);
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
