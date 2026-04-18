import { Client } from 'ssh2';
import * as fs from 'fs';
import { validateScannerConfig, ScannerConfig } from '../config/schemas';
import { getCached, setCached, getScanCacheKey } from './scan-cache';
import logger from './logger';

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/clawdbot/.ssh/id_ed25519';
const FLUTTER_PROJECT_PATH: string = process.env.FLUTTER_PROJECT_PATH || '';

let cachedKey: Buffer | null = null;
function getSSHKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = fs.readFileSync(SSH_KEY_PATH);
  return cachedKey;
}

export function execSSHWithConfig(command: string, cfg: unknown, timeoutMs: number = 30000): Promise<{ output: string; code: number }> {
  // Validate config if provided, otherwise use defaults
  const validatedConfig = cfg ? validateScannerConfig(cfg) : undefined;

  const host = validatedConfig?.host || SSH_HOST;
  const username = validatedConfig?.username || SSH_USER;
  const keyPath = validatedConfig?.sshKeyPath || SSH_KEY_PATH;

  if (!keyPath) {
    throw new Error('SSH key path not configured. Set SSH_KEY_PATH env var or provide sshKeyPath in config.');
  }
  if (!host) {
    throw new Error('SSH host not configured. Set MAESTRO_RUNNER_HOST env var or provide host in config.');
  }
  if (!username) {
    throw new Error('SSH username not configured. Set MAESTRO_RUNNER_USER env var or provide username in config.');
  }

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
  inputs: { id: string; label: string; type: string; hasOnFieldSubmitted: boolean; finderStrategy: 'label' | 'key' | 'type'; finderValue: string }[];
  buttons: ButtonInfo[];
  texts: { id: string; text: string; finderStrategy?: 'text' | 'key'; finderValue?: string }[];
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

export interface InputElement {
  id: string;
  label: string;
  type: string;
  screen?: string;
  hasOnFieldSubmitted: boolean;
  finderStrategy: 'label' | 'key' | 'type';
  finderValue: string;
}

export interface TextElement {
  id: string;
  text: string;
  screen?: string;
  isStatic: boolean;
  finderStrategy?: 'text' | 'key' | 'type';
  finderValue?: string;
}
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
    // Increase look-ahead range to catch widgets nested in Stack, IndexedStack, etc.
    const nearby = lines.slice(i, Math.min(i + 25, lines.length)).join('\n');
    const fullNearby = lines.slice(i, Math.min(i + 40, lines.length)).join('\n');

    // ─── Input Fields ───
    // Match standard TextField/TextFormField AND any custom widget that has hintText/labelText
    const isStandardInput = line.includes('TextFormField') || line.includes('TextField(');
    const isCustomInputWithHint = !isStandardInput && (line.includes('hintText') || line.includes('labelText') ||
      (line.match(/\w*(?:Input|Field|TextField|FormField)\w*\s*\(/) != null));

    if (isStandardInput || isCustomInputWithHint) {
      const type = line.includes('TextFormField') ? 'TextFormField' : 'TextField';
      const hasOnSubmit = line.includes('onFieldSubmitted') || lines.slice(i, i + 5).some(l => l.includes('onFieldSubmitted'));
      const hintMatch = nearby.match(/hintText\s*:\s*['"]([^'"]+)['"]/) || nearby.match(/labelText\s*:\s*['"]([^'"]+)['"]/);
      const label = hintMatch?.[1] || '';
      // Skip custom-widget lines that have no hintText — they're not input fields
      if (isCustomInputWithHint && !label) continue;

      const keyMatch = nearby.match(/key:\s*(?:const\s+)?(?:ValueKey|Key)\(['"]([^'"]+)['"]\)/);
      const keyName = keyMatch?.[1];

      // Determine finder strategy: key > label > type
      let inputStrategy: 'key' | 'label' | 'type' = 'type';
      let inputValue = type;
      if (keyName) {
        inputStrategy = 'key';
        inputValue = keyName;
      } else if (label) {
        inputStrategy = 'label';
        inputValue = label;
      }

      // Deduplicate by finderValue so the same field isn't added twice
      if (inputs.some(inp => inp.finderValue === inputValue && inputValue !== type)) continue;

      inputs.push({
        id: label.toLowerCase().replace(/\s+/g, '_') || `${type.toLowerCase()}_${inputs.length}`,
        label,
        type,
        hasOnFieldSubmitted: hasOnSubmit,
        finderStrategy: inputStrategy,
        finderValue: inputValue,
      });
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

    // Determine button type - includes custom widgets
    const btnTypeMatch = line.match(/(ElevatedButton|TextButton|OutlinedButton|IconButton|FloatingActionButton|PopupMenuButton|InkWell|GestureDetector|RawMaterialButton|Tooltip|CustomTextButton|CustomElevatedButton|CustomOutlinedButton|CustomIconButton)\s*\(/);

    if (btnTypeMatch) {
      const btnType = btnTypeMatch[1];
      let textMatch = nearby.match(/Text\(\s*(?:const\s+)?['"]([^'"]{2,20})['"]\s*\)/);
      let text = textMatch?.[1];

      // For custom buttons like CustomTextButton, extract label parameter
      if (btnType.startsWith('Custom') && !text) {
        const labelMatch = nearby.match(/label:\s*['"]([^'"]+)['"]/);
        if (labelMatch) {
          text = labelMatch[1];
        }
      }

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
      const txtKeyMatch = nearby.match(/key:\s*(?:const\s+)?(?:ValueKey|Key)\(['"]([^'"]+)['"]\)/);
      const txtKeyName = txtKeyMatch?.[1];
      texts.push({
        id: textLineMatch[1].toLowerCase().replace(/\s+/g, '_').slice(0, 40) || `text_${texts.length}`,
        text: textLineMatch[1],
        finderStrategy: txtKeyName ? 'key' as const : 'text' as const,
        finderValue: txtKeyName || textLineMatch[1],
      });
    }

    // ─── Navigation Tab Labels (BottomNavigationBarItem, NavigationDestination, NavigationRailDestination) ───
    const navItemMatch = line.match(/(BottomNavigationBarItem|NavigationDestination|NavigationRailDestination)\s*\(/);
    if (navItemMatch) {
      const labelMatch = nearby.match(/label:\s*(?:const\s+)?['"]([^'"]{2,50})['"]/);
      if (labelMatch && !/\$/.test(labelMatch[1])) {
        const navId = labelMatch[1].toLowerCase().replace(/\s+/g, '_').slice(0, 40);
        if (!texts.some(t => t.id === navId)) {
          texts.push({
            id: navId,
            text: labelMatch[1],
            finderStrategy: 'text' as const,
            finderValue: labelMatch[1],
          });
        }
      }
    }
  }

  return { inputs, buttons, texts };
}

// ─── Main Scanner ──────────────────────────────────────────────────────────────

export async function scanFlutterProjectSSH(config?: unknown): Promise<ElementCatalog> {
  // Validate config
  const validatedConfig = config ? validateScannerConfig(config) : undefined;

  const host = validatedConfig?.host || SSH_HOST;
  const username = validatedConfig?.username || SSH_USER;
  const path = validatedConfig?.projectPath || FLUTTER_PROJECT_PATH;
  const sshKeyPath = validatedConfig?.sshKeyPath || SSH_KEY_PATH;
  const deviceId = validatedConfig?.deviceId;

  // Check cache first (30 minute TTL)
  const cacheKey = getScanCacheKey(path, deviceId);
  const cached = await getCached<ElementCatalog>(cacheKey, '');
  if (cached) {
    logger.info(`[ElementScanner] Using cached scan for ${cacheKey}`);
    return cached;
  }

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

  // 2. Find ALL dart files containing UI widgets (not just *screen*/*.page*/*view*)
  // Two-pass: first all screen/page/view files, then any OTHER file with TextField/hintText
  const screenPatternResult = await execSSHWithConfig(
    `find "${path}/lib" -type f \\( -name "*screen*.dart" -o -name "*_page.dart" -o -name "*_view.dart" -o -name "*_form.dart" -o -name "*_widget.dart" -o -name "*_dialog.dart" \\) 2>/dev/null | grep -v '.g.dart' | grep -v '.freezed.dart'`,
    config, 30000
  );
  const screenPatternFiles = new Set(screenPatternResult.output.split('\n').filter(Boolean));

  // Also grep ALL dart files for TextField/TextFormField/hintText to catch custom wrappers
  const grepResult = await execSSHWithConfig(
    `grep -rl 'TextField\\|TextFormField\\|hintText:' "${path}/lib" 2>/dev/null | grep -v '.g.dart' | grep -v '.freezed.dart' | head -100`,
    config, 30000
  );
  const grepFiles = grepResult.output.split('\n').filter(Boolean);

  // Merge both lists (deduped)
  const allFiles = [...new Set([...screenPatternFiles, ...grepFiles])];
  const screenFiles = allFiles;

  // Process files in parallel batches for better performance
  const BATCH_SIZE = 20;
  for (let i = 0; i < screenFiles.length; i += BATCH_SIZE) {
    const batch = screenFiles.slice(i, Math.min(i + BATCH_SIZE, screenFiles.length));
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const contentResult = await execSSHWithConfig(`cat "${file}" 2>/dev/null`, config, 15000);
          const content = contentResult.output;
          const fileName = file.split('/').pop()?.replace('.dart', '') || '';
          const screenName = fileName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const route = catalog.routes.find(r => r.toLowerCase().includes(fileName.toLowerCase().replace('_screen', '').replace('_page', '').replace('_view', '')));
          const elements = extractElements(content);
          return { file, screenName, route, elements };
        } catch (e) {
          logger.warn(`[ElementScanner] Failed to scan ${file}: ${e}`);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (!result) continue;
      const { file, screenName, route, elements } = result;

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

    // Log progress every batch
    if ((i / BATCH_SIZE) % 5 === 0) {
      logger.info(`[ElementScanner] Scanned ${Math.min(i + BATCH_SIZE, screenFiles.length)}/${screenFiles.length} files`);
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

  // Save to cache (30 minute TTL)
  setCached(cacheKey, '', catalog);
  logger.info(`[ElementScanner] Cached scan result for ${cacheKey} (TTL: 30min)`);

  return catalog;
}
