import { Client } from 'ssh2';
import * as fs from 'fs';

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '100.76.181.104';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/nodejs/.ssh/id_ed25519';
const FLUTTER_PROJECT_PATH: string = process.env.FLUTTER_PROJECT_PATH || '/Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker';

let cachedKey: Buffer | null = null;
function getSSHKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = fs.readFileSync(SSH_KEY_PATH);
  return cachedKey;
}

export function execSSHWithConfig(command: string, cfg: ScannerConfig | undefined, timeoutMs: number = 30000): Promise<{ output: string; code: number }> {
  const host = cfg?.host || SSH_HOST;
  const username = cfg?.username || SSH_USER;
  const keyPath = cfg?.sshKeyPath || SSH_KEY_PATH;
  const privateKey = fs.readFileSync(keyPath);

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      try { client.end(); } catch {}
      reject(new Error(`SSH timeout: ${timeoutMs}ms`));
    }, timeoutMs);
    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { client.end(); clearTimeout(timer); reject(err); return; }
        let output = '', stderr = '';
        stream.on('data', (d: Buffer) => { output += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number | null) => {
          client.end(); clearTimeout(timer);
          resolve({ output: output.trim(), code: code ?? -1 });
        });
      });
    });
    client.on('error', (err) => { clearTimeout(timer); reject(err); });
    client.connect({ host, username, privateKey, readyTimeout: 30000 });
  });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScreenElement {
  name: string; file: string; route?: string;
  inputs: { id: string; label: string; type: string; hasOnFieldSubmitted: boolean }[];
  buttons: ButtonInfo[];
  texts: { id: string; text: string }[];
}

export interface ButtonInfo {
  id: string;
  text: string;
  type: string;
  action?: string;
  iconName?: string;
  keyName?: string;
  tooltip?: string;
  screen?: string;
  finderStrategy: 'text' | 'icon' | 'key' | 'tooltip' | 'semantics' | 'type';
  finderValue: string;
}

export interface InputElement { id: string; label: string; type: string; screen?: string; hasOnFieldSubmitted: boolean; }
export interface TextElement { id: string; text: string; screen?: string; isStatic: boolean; }
export interface CredentialInfo { email: string; password: string; role: string; }
export interface AuthInfo { flow: 'tap' | 'onFieldSubmitted'; loginButton?: string; credentials: CredentialInfo[]; }
export interface ElementCatalog {
  packageName: string; projectPath: string; scannedAt: string;
  screens: ScreenElement[]; inputs: InputElement[]; buttons: ButtonInfo[];
  texts: TextElement[]; auth?: AuthInfo; routes: string[]; source: 'ssh';
  deviceId?: string;
}

// ─── Icon name to label mapping ────────────────────────────────────────────────

const ICON_LABELS: Record<string, string> = {
  logout_rounded: 'Logout', logout: 'Logout', exit_to_app: 'Logout',
  add: 'Add', add_circle: 'Add', add_circle_outline: 'Add',
  delete: 'Delete', delete_outline: 'Delete', clear: 'Clear',
  edit: 'Edit', create: 'Create', edit_outlined: 'Edit',
  search: 'Search', search_outlined: 'Search',
  menu: 'Menu', more_vert: 'Menu', more_horiz: 'Menu',
  arrow_back: 'Back', arrow_back_ios: 'Back',
  check: 'Done', done: 'Done',
  refresh: 'Refresh', sync: 'Refresh',
  share: 'Share',
  favorite: 'Favorite', favorite_border: 'Favorite',
  star: 'Star', star_border: 'Star',
  home: 'Home',
  settings: 'Settings',
  info: 'Info', info_outline: 'Info',
  help: 'Help', help_outline: 'Help',
  visibility: 'Show', visibility_off: 'Hide',
  close: 'Close', cancel: 'Cancel',
  send: 'Send',
  play_arrow: 'Play', pause: 'Pause',
  camera: 'Camera', photo: 'Photo', image: 'Image',
  download: 'Download', upload: 'Upload', cloud_upload: 'Upload',
};

function getIconLabel(iconName: string): string {
  if (ICON_LABELS[iconName]) return ICON_LABELS[iconName];
  // Convert snake_case to Title Case
  return iconName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Extract elements from file ────────────────────────────────────────────────

function extractElements(content: string): { inputs: ScreenElement['inputs']; buttons: ButtonInfo[]; texts: ScreenElement['texts'] } {
  const inputs: ScreenElement['inputs'] = [];
  const buttons: ButtonInfo[] = [];
  const texts: ScreenElement['texts'] = [];
  const lines = content.split('\n');
  const seenKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nearby = lines.slice(i, Math.min(i + 12, lines.length)).join('\n');
    const fullNearby = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');

    // ─── Input Fields ───
    if (line.includes('TextFormField') || line.includes('TextField(')) {
      const type = line.includes('TextFormField') ? 'TextFormField' : 'TextField';
      const hasOnSubmit = line.includes('onFieldSubmitted') || lines.slice(i, i + 5).some(l => l.includes('onFieldSubmitted'));
      const hintMatch = nearby.match(/hintText\s*:\s*['"]([^'"]+)['"]/) || nearby.match(/labelText\s*:\s*['"]([^'"]+)['"]/);
      const label = hintMatch?.[1] || '';
      inputs.push({ id: label.toLowerCase().replace(/\s+/g, '_') || `${type.toLowerCase()}_${inputs.length}`, label, type, hasOnFieldSubmitted: hasOnSubmit });
    }

    // ─── Buttons ───

    // Check for key-based finder first
    const keyMatch = nearby.match(/key:\s*(?:const\s+)?(?:ValueKey|Key)\(['"]([^'"]+)['"]\)/);
    const keyName = keyMatch?.[1];

    // Check for tooltip
    const tooltipMatch = nearby.match(/tooltip:\s*['"]([^'"]+)['"]/);
    const tooltip = tooltipMatch?.[1];

    // Check for semantics label
    const semanticsMatch = nearby.match(/label:\s*['"]([^'"]+)['"]/);
    const semanticsLabel = semanticsMatch?.[1];

    // Determine button type
    const btnTypeMatch = line.match(/(ElevatedButton|TextButton|OutlinedButton|IconButton|FloatingActionButton|PopupMenuButton|InkWell|GestureDetector|RawMaterialButton|Tooltip)\s*\(/);

    if (btnTypeMatch) {
      const btnType = btnTypeMatch[1];
      let textMatch = nearby.match(/Text\(\s*(?:const\s+)?['"]([^'"]{2,20})['"]\s*\)/);
      let text = textMatch?.[1];
      const iconMatch = nearby.match(/Icon\(\s*(?:const\s+)?Icons\.(\w+)/);
      const iconName = iconMatch?.[1];

      // Determine finder strategy (priority: key > text > icon > tooltip > semantics > type)
      let strategy: ButtonInfo['finderStrategy'] = 'type';
      let finderValue = btnType;

      if (keyName) {
        strategy = 'key';
        finderValue = keyName;
        text = text || `Key: ${keyName}`;
      } else if (text) {
        strategy = 'text';
        finderValue = text;
      } else if (iconName) {
        strategy = 'icon';
        finderValue = iconName;
        text = text || getIconLabel(iconName);
      } else if (tooltip) {
        strategy = 'tooltip';
        finderValue = tooltip;
        text = text || `Tooltip: ${tooltip}`;
      } else if (semanticsLabel) {
        strategy = 'semantics';
        finderValue = semanticsLabel;
        text = text || `Semantics: ${semanticsLabel}`;
      }

      // Deduplicate
      const buttonKey = `${btnType}-${text || iconName || keyName || 'unknown'}-${i}`;
      if (seenKeys.has(buttonKey)) continue;
      seenKeys.add(buttonKey);

      // Detect action
      let action: string | undefined;
      if (fullNearby.includes('onPressed') || fullNearby.includes('onTap')) {
        if (fullNearby.includes('_login') || fullNearby.includes('signIn')) action = 'triggers_login';
        else if (fullNearby.includes('logout') || fullNearby.includes('signOut')) action = 'triggers_logout';
        else action = 'custom_action';
      }

      buttons.push({
        id: (text || iconName || keyName || tooltip || btnType).toLowerCase().replace(/\s+/g, '_') || `${btnType.toLowerCase()}_${buttons.length}`,
        text: text || getIconLabel(iconName || '') || keyName || tooltip || btnType,
        type: btnType,
        action,
        iconName: iconName || undefined,
        keyName: keyName || undefined,
        tooltip: tooltip || undefined,
        finderStrategy: strategy,
        finderValue: finderValue,
      });
    }

    // ─── Static Text ───
    const textLineMatch = line.match(/Text\(\s*(?:const\s+)?['"]([^'"]{3,50})['"]\s*\)/);
    if (textLineMatch && !/\$/.test(textLineMatch[1]) && !textLineMatch[1].includes('${')) {
      texts.push({ id: textLineMatch[1].toLowerCase().replace(/\s+/g, '_').slice(0, 40) || `text_${texts.length}`, text: textLineMatch[1] });
    }
  }

  return { inputs, buttons, texts };
}

// ─── Main Scanner ──────────────────────────────────────────────────────────────

interface ScannerConfig {
  host?: string;
  username?: string;
  projectPath?: string;
  deviceId?: string;
  sshKeyPath?: string;
}

export async function scanFlutterProjectSSH(config?: ScannerConfig): Promise<ElementCatalog> {
  const host = config?.host || SSH_HOST;
  const username = config?.username || SSH_USER;
  const path = config?.projectPath || FLUTTER_PROJECT_PATH;
  const sshKeyPath = config?.sshKeyPath || SSH_KEY_PATH;
  const deviceId = config?.deviceId;

  const catalog: ElementCatalog = {
    packageName: '', projectPath: path, scannedAt: new Date().toISOString(),
    screens: [], inputs: [], buttons: [], texts: [], routes: [], source: 'ssh',
    deviceId,
  };

  // 1. Package name from main.dart
  const mainResult = await execSSHWithConfig(`cat "${path}/lib/main.dart" 2>/dev/null | head -80`, config, 15000);
  const allImports = mainResult.output.match(/import\s+'package:([^/]+)/g) || [];
  const appPkgs = allImports.map(m => m.match(/package:([^/]+)/)?.[1]).filter(Boolean)
    .filter((p: string) => !['flutter', 'cupertino', 'material', 'go_router', 'flutter_riverpod', 'google_fonts', 'intl', 'provider'].includes(p));
  catalog.packageName = (appPkgs[0] as string) || 'my_app';
  const routeMatches = mainResult.output.match(/path:\s*['"]([^'"]+)['"]/g) || [];
  catalog.routes = routeMatches.map(r => r.match(/['"]([^'"]+)['"]/)?.[1] || '').filter(Boolean);

  // 2. Find and scan ALL screen files
  const screenResult = await execSSHWithConfig(
    `find "${path}/lib" -type f -name "*screen*.dart" 2>/dev/null; find "${path}/lib" -type f -name "*_page.dart" 2>/dev/null | head -30`,
    config, 15000
  );
  const screenFiles = screenResult.output.split('\n').filter(Boolean);

  for (const file of screenFiles) {
    const contentResult = await execSSHWithConfig(`cat "${file}" 2>/dev/null`, config, 15000);
    const content = contentResult.output;
    const fileName = file.split('/').pop()?.replace('.dart', '') || '';
    const screenName = fileName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const route = catalog.routes.find(r => r.toLowerCase().includes(fileName.toLowerCase().replace('_screen', '').replace('_page', '')));
    const elements = extractElements(content);

    catalog.screens.push({ name: screenName, file, route, ...elements });
    for (const inp of elements.inputs) {
      catalog.inputs.push({ ...inp, screen: screenName });
      if (inp.hasOnFieldSubmitted) {
        catalog.auth = catalog.auth || { flow: 'onFieldSubmitted', credentials: [] };
        catalog.auth.flow = 'onFieldSubmitted';
      }
    }
    for (const btn of elements.buttons) {
      catalog.buttons.push({ ...btn, screen: screenName });
    }
    for (const txt of elements.texts) {
      catalog.texts.push({ ...txt, screen: screenName, isStatic: true });
    }
  }

  // 3. Mock credentials
  const mockResult = await execSSHWithConfig(`find "${path}/lib" -type f -name "*mock*.dart" 2>/dev/null | head -3`, config, 15000);
  const mockFiles = mockResult.output.split('\n').filter(Boolean).filter(f => f.endsWith('.dart'));
  if (mockFiles.length > 0) {
    const mockContent = await execSSHWithConfig(`cat "${mockFiles[0]}" 2>/dev/null`, config, 15000);
    const userMatches = mockContent.output.matchAll(/User\s*\(\s*[^)]*email:\s*['"]([^'"]+)['"][^)]*password:\s*['"]([^'"]+)['"][^)]*role:\s*UserRole\.(\w+)/g);
    for (const match of userMatches) {
      catalog.auth = catalog.auth || { flow: 'tap', credentials: [] };
      catalog.auth.credentials.push({ email: match[1], password: match[2], role: match[3] });
    }
  }

  // Set default auth
  if (!catalog.auth) catalog.auth = { flow: catalog.inputs.some(i => i.hasOnFieldSubmitted) ? 'onFieldSubmitted' : 'tap', credentials: [] };
  if (!catalog.auth.loginButton && catalog.buttons.length > 0) {
    catalog.auth.loginButton = catalog.buttons.find(b => b.action === 'triggers_login')?.text || catalog.buttons[0]?.text;
  }

  // Deduplicate texts
  const seen = new Set<string>();
  catalog.texts = catalog.texts.filter(t => { if (seen.has(t.text)) return false; seen.add(t.text); return true; });

  return catalog;
}
