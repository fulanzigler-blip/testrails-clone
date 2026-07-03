// ─── Mobile driver abstraction ─────────────────────────────────────────────────
//
// One Visual Test Builder menu, multiple platforms behind it:
//   flutter — white-box: source scan + generated integration_test Dart code
//             (existing flow in routes/integration-tests.ts; richest finders)
//   android — black-box: UIAutomator dump + adb step replay (native-android-driver)
//   ios     — black-box: planned via Appium/XCUITest (slots into this interface)
//
// Native platforms don't generate compiled test code — a test is a JSON list of
// NativeSteps replayed by the driver against the installed app.

export type MobilePlatform = 'flutter' | 'android' | 'ios';

export interface MobileRunnerConfig {
  host: string;
  username: string;
  sshKeyPath: string;
  deviceId: string;
}

export type NativeFinderStrategy = 'resource-id' | 'content-desc' | 'text' | 'bounds';

export interface NativeFinder {
  strategy: NativeFinderStrategy;
  value: string;
}

export interface NativeElement {
  id: string;                       // stable content hash — survives re-scans
  elementType: 'input' | 'button' | 'text';
  label: string;
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  bounds: { x1: number; y1: number; x2: number; y2: number };
  clickable: boolean;
  checkable: boolean;
  isPassword: boolean;
  finderStrategy: NativeFinderStrategy;
  finderValue: string;
  fallbackFinders: NativeFinder[];
}

export interface ScreenSnapshot {
  screenshot: string;               // base64 PNG
  elements: NativeElement[];
  screenW: number;
  screenH: number;
  currentPackage?: string;          // foreground app package detected from the dump
  unlabeledInteractive?: number;    // clickable controls with no id/label (warn)
}

export interface NativeStep {
  id?: string;
  type: 'tap' | 'enter_text' | 'assert_visible' | 'assert_not_visible' | 'assert_text'
      | 'wait' | 'screenshot' | 'press_key' | 'scroll';
  elementId?: string;
  finderStrategy?: NativeFinderStrategy;
  finderValue?: string;
  fallbackFinders?: NativeFinder[];
  value?: string;
  text?: string;
}

export interface NativeRunResult {
  success: boolean;
  output: string;
  duration: number;
  screenshots: string[];            // base64 PNGs (intermediate + final/failure)
}

export interface MobileDriver {
  readonly platform: MobilePlatform;
  listApps(runner: MobileRunnerConfig): Promise<string[]>;
  launchApp(runner: MobileRunnerConfig, appId: string): Promise<void>;
  captureScreen(runner: MobileRunnerConfig): Promise<ScreenSnapshot>;
  runSteps(runner: MobileRunnerConfig, steps: NativeStep[], opts?: { appId?: string }): Promise<NativeRunResult>;
}

/** Platform → driver. Flutter intentionally absent: it is white-box (source +
 *  generated Dart) and stays on its dedicated routes; this registry serves the
 *  black-box platforms. */
export function getMobileDriver(platform: MobilePlatform): MobileDriver {
  // Lazy require to avoid a circular import (driver imports types from here)
  if (platform === 'android') {
    const { androidNativeDriver } = require('./native-android-driver');
    return androidNativeDriver;
  }
  throw new Error(`No driver available for platform "${platform}" yet${platform === 'ios' ? ' — iOS support is planned via Appium/XCUITest' : ''}`);
}
