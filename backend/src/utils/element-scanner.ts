import * as fs from 'fs';
import * as path from 'path';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ScreenElement {
  name: string;
  file: string;
  route?: string;
  inputs: { id: string; label: string; type: string; hasOnFieldSubmitted: boolean }[];
  buttons: { id: string; text: string; type: string; action?: string }[];
  texts: { id: string; text: string }[];
}

export interface InputElement {
  id: string; label: string; type: string; screen?: string; hasOnFieldSubmitted: boolean;
}
export interface ButtonElement {
  id: string; text: string; type: string; screen?: string; action?: string;
}
export interface TextElement {
  id: string; text: string; screen?: string; isStatic: boolean;
}
export interface CredentialInfo { email: string; password: string; role: string; }
export interface AuthInfo { flow: 'tap' | 'onFieldSubmitted'; loginButton?: string; credentials: CredentialInfo[]; }

export interface ElementCatalog {
  packageName: string;
  projectPath: string;
  scannedAt: string;
  screens: ScreenElement[];
  inputs: InputElement[];
  buttons: ButtonElement[];
  texts: TextElement[];
  auth?: AuthInfo;
  routes: string[];
  source: 'local' | 'github' | 'ssh';
  repoUrl?: string;
}

// ─── Extract elements from a single file ───────────────────────────────────────

function extractElements(content: string): {
  inputs: ScreenElement['inputs'];
  buttons: ScreenElement['buttons'];
  texts: ScreenElement['texts'];
} {
  const inputs: ScreenElement['inputs'] = [];
  const buttons: ScreenElement['buttons'] = [];
  const texts: ScreenElement['texts'] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inputs
    if (line.includes('TextFormField') || line.includes('TextField(')) {
      const type = line.includes('TextFormField') ? 'TextFormField' : 'TextField';
      const hasOnSubmit = line.includes('onFieldSubmitted') || lines.slice(i, i + 5).some(l => l.includes('onFieldSubmitted'));
      const nearby = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      const hintMatch = nearby.match(/hintText\s*:\s*['"]([^'"]+)['"]/) || nearby.match(/labelText\s*:\s*['"]([^'"]+)['"]/);
      const label = hintMatch?.[1] || '';
      inputs.push({
        id: label.toLowerCase().replace(/\s+/g, '_') || `${type.toLowerCase()}_${inputs.length}`,
        label, type, hasOnFieldSubmitted: hasOnSubmit,
      });
    }

    // Buttons
    const btnMatch = line.match(/(ElevatedButton|TextButton|OutlinedButton|IconButton)\s*\(/);
    if (btnMatch) {
      const btnType = btnMatch[1];
      const nearby = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
      const textMatch = nearby.match(/Text\(\s*['"]([^'"]{2,20})['"]\s*\)/);
      const btnText = textMatch?.[1] || `${btnType}_${buttons.length}`;
      const fullNearby = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
      let action: string | undefined;
      if (fullNearby.includes('onPressed') && (fullNearby.includes('_login') || fullNearby.includes('signIn'))) action = 'triggers_login';
      else if (fullNearby.includes('onPressed')) action = 'custom_action';
      buttons.push({
        id: btnText.toLowerCase().replace(/\s+/g, '_') || `${btnType.toLowerCase()}_${buttons.length}`,
        text: btnText, type: btnType, action,
      });
    }

    // Static texts
    const textMatch = line.match(/Text\(\s*(?:const\s+)?['"]([^'"]{3,50})['"]\s*\)/);
    if (textMatch && !/\$/.test(textMatch[1]) && !textMatch[1].includes('${')) {
      texts.push({
        id: textMatch[1].toLowerCase().replace(/\s+/g, '_').slice(0, 40) || `text_${texts.length}`,
        text: textMatch[1],
      });
    }
  }

  return { inputs, buttons, texts };
}

// ─── Recursively find screen files ─────────────────────────────────────────────

function findScreenFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findScreenFiles(fullPath));
      } else if (entry.isFile() && (entry.name.includes('screen') || entry.name.endsWith('_page.dart')) && entry.name.endsWith('.dart')) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

// ─── Main Scanner ──────────────────────────────────────────────────────────────

export async function scanFlutterProjectLocal(projectPath: string, source: 'local' | 'github' | 'ssh' = 'local', repoUrl?: string): Promise<ElementCatalog> {
  const catalog: ElementCatalog = {
    packageName: '', projectPath, scannedAt: new Date().toISOString(),
    screens: [], inputs: [], buttons: [], texts: [], routes: [],
    source, repoUrl,
  };

  // 1. Package name from main.dart
  const mainFile = path.join(projectPath, 'lib', 'main.dart');
  if (!fs.existsSync(mainFile)) {
    throw new Error(`main.dart not found at ${mainFile}`);
  }
  const mainContent = fs.readFileSync(mainFile, 'utf8');
  const allImports = mainContent.match(/import\s+'package:([^/]+)/g) || [];
  const appPkgs = allImports.map(m => m.match(/package:([^/]+)/)?.[1]).filter(Boolean)
    .filter((p: string) => !['flutter', 'cupertino', 'material', 'go_router', 'flutter_riverpod', 'google_fonts', 'intl', 'provider'].includes(p));
  catalog.packageName = (appPkgs[0] as string) || 'my_app';
  const routeMatches = mainContent.match(/path:\s*['"]([^'"]+)['"]/g) || [];
  catalog.routes = routeMatches.map(r => r.match(/['"]([^'"]+)['"]/)?.[1] || '').filter(Boolean);

  // 2. Find and scan ALL screen files
  const libDir = path.join(projectPath, 'lib');
  const screenFiles = findScreenFiles(libDir);

  for (const file of screenFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(projectPath, file);
    const fileName = path.basename(file, '.dart');
    const screenName = fileName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const route = catalog.routes.find(r => r.toLowerCase().includes(fileName.toLowerCase().replace('_screen', '').replace('_page', '')));
    const elements = extractElements(content);

    catalog.screens.push({ name: screenName, file: relPath, route, ...elements });

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
  const mockDir = path.join(projectPath, 'lib', 'data', 'mock');
  if (fs.existsSync(mockDir)) {
    const mockFiles = fs.readdirSync(mockDir).filter(f => f.endsWith('.dart'));
    for (const mf of mockFiles) {
      const mockContent = fs.readFileSync(path.join(mockDir, mf), 'utf8');
      const userMatches = mockContent.matchAll(/User\s*\(\s*[^)]*email:\s*['"]([^'"]+)['"][^)]*password:\s*['"]([^'"]+)['"][^)]*role:\s*UserRole\.(\w+)/g);
      for (const match of userMatches) {
        catalog.auth = catalog.auth || { flow: 'tap', credentials: [] };
        catalog.auth.credentials.push({ email: match[1], password: match[2], role: match[3] });
      }
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
