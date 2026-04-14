import { execSSH } from './ssh-client';
import logger from './logger';

// ─── Environment Configuration ───────────────────────────────────────────────────

const FLUTTER_PROJECT_PATH: string =
  process.env.FLUTTER_PROJECT_PATH ||
  '/Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AppContext {
  mainDart: string;
  loginScreen: string;
  authFlow: string;
  mockCredentials: string;
  routes: string;
  hasMockData: boolean;
  loginButton: string;
  fieldTypes: string;
}

// ─── App Context Discovery ───────────────────────────────────────────────────────

export async function discoverAppContext(): Promise<AppContext> {
  const projectPath = FLUTTER_PROJECT_PATH;

  const context: AppContext = {
    mainDart: '',
    loginScreen: '',
    authFlow: '',
    mockCredentials: '',
    routes: '',
    hasMockData: false,
    loginButton: '',
    fieldTypes: '',
  };

  // Read main.dart to understand app structure
  const mainResult = await execSSH(`cat "${projectPath}/lib/main.dart" 2>/dev/null | head -60`, 15000);
  context.mainDart = mainResult.output;

  // Find login screen file - prioritize login_screen over auth_provider
  const loginFileResult = await execSSH(
    `find "${projectPath}/lib" -type f \\( -name "*login_screen*" -o -name "*login*" -o -name "*sign_in*" -o -name "*auth_screen*" \\) 2>/dev/null | head -5`,
    10000
  );
  let loginFiles = loginFileResult.output.split('\n').filter(Boolean);

  // Fallback: if no login screen found, search for files containing login-related widgets
  if (loginFiles.length === 0) {
    const fallbackResult = await execSSH(
      `find "${projectPath}/lib" -type f -name "*login*" -o -name "*auth*" -o -name "*sign*" 2>/dev/null | head -10`,
      10000
    );
    loginFiles = fallbackResult.output.split('\n').filter(Boolean);
  }

  if (loginFiles.length > 0) {
    // Prefer login_screen over auth_provider - sort to get the screen file first
    loginFiles.sort((a, b) => {
      const aIsScreen = a.includes('screen') || a.includes('_screen') ? 0 : 1;
      const bIsScreen = b.includes('screen') || b.includes('_screen') ? 0 : 1;
      return aIsScreen - bIsScreen;
    });

    // Filter to only .dart files
    const dartFiles = loginFiles.filter(f => f.endsWith('.dart'));
    if (dartFiles.length === 0) return context;

    const loginContent = await execSSH(`cat "${dartFiles[0]}" 2>/dev/null`, 15000);
    context.loginScreen = loginContent.output;

    // Extract login button text
    const btnMatch = loginContent.output.match(/Text\(['"]([^'"]+)['"]\).*onPressed.*login|onPressed.*login.*Text\(['"]([^'"]+)['"]\)/i);
    if (btnMatch) {
      context.loginButton = btnMatch[1] || btnMatch[2] || 'Login';
    } else {
      // Fallback: find any Text widget near login-related code
      const textMatch = loginContent.output.match(/Text\(['"]([^'"]{2,20})['"]\)/g);
      if (textMatch) {
        context.loginButton = textMatch.map(t => t.match(/['"]([^'"]+)['"]/)?.[1]).filter(Boolean)[0] || 'Login';
      }
    }

    // Detect field types (TextField vs TextFormField)
    context.fieldTypes = loginContent.output.includes('TextFormField') ? 'TextFormField' : 'TextField';

    // Check if onFieldSubmitted triggers login (this is in the login screen, not auth provider!)
    if (loginContent.output.includes('onFieldSubmitted')) {
      context.authFlow = 'onFieldSubmitted triggers login action';
    }
  }

  // Find auth provider/service (for additional context, not for onFieldSubmitted detection)
  const authFileResult = await execSSH(
    `find "${projectPath}/lib" -type f \\( -name "*auth*" -o -name "*provider*" \\) 2>/dev/null | head -10`,
    10000
  );
  const authFiles = authFileResult.output.split('\n').filter(Boolean).filter(f => f.endsWith('.dart'));

  // Find mock data for credentials
  const mockResult = await execSSH(
    `find "${projectPath}/lib" -type f \\( -name "*mock*" -o -name "*data*" -o -name "*seed*" \\) 2>/dev/null | head -10`,
    10000
  );
  const mockFiles = mockResult.output.split('\n').filter(Boolean).filter(f => f.endsWith('.dart'));
  if (mockFiles.length > 0) {
    const mockContent = await execSSH(`cat "${mockFiles[0]}" 2>/dev/null | grep -A 2 -i "email.*password\|password.*email" | head -30`, 10000);
    if (mockContent.output) {
      context.mockCredentials = mockContent.output;
      context.hasMockData = true;
    }
  }

  // Extract routes/navigation
  const routeResult = await execSSH(
    `grep -r "GoRoute\|Navigator.push\|context.go\|context.push" "${projectPath}/lib" 2>/dev/null | head -10`,
    10000
  );
  context.routes = routeResult.output;

  return context;
}

// ─── App Hierarchy Capture ──────────────────────────────────────────────────────

export async function captureHierarchy(): Promise<string> {
  const javaHome = '/Users/clawbot/jdk17/Contents/Home';
  const androidHome = '/Users/clawbot/Library/Android/sdk';
  const adbBin = `${androidHome}/platform-tools/adb`;
  const cmd =
    `export JAVA_HOME="${javaHome}" && ` +
    `export ANDROID_HOME="${androidHome}" && ` +
    `export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ` +
    `${adbBin} shell uiautomator dump /sdcard/ui.xml 2>/dev/null && ` +
    `${adbBin} shell cat /sdcard/ui.xml 2>/dev/null`;

  const result = await execSSH(cmd, 30000);
  if (!result.output || result.output.length < 100) {
    throw new Error(`Failed to capture app hierarchy: ${result.output.slice(0, 200)}`);
  }
  return result.output;
}

// ─── Get Flutter Project Path ───────────────────────────────────────────────────

export function getFlutterProjectPath(): string {
  return FLUTTER_PROJECT_PATH;
}
