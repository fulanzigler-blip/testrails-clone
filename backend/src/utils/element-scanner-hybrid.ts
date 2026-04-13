import { Client } from 'ssh2';
import * as fs from 'fs';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  file: string;
  line: number;
  responseModel?: string;
  description?: string;
}

export interface ApiResponseField {
  fieldName: string;
  fieldType: string;
  modelClass: string;
  sourceFile: string;
  isNullable: boolean;
}

export interface DynamicContentHint {
  screenFile: string;
  screenName: string;
  apiEndpoint?: string;
  responseFields: ApiResponseField[];
  widgetPattern: string;
  description: string;
}

export interface HybridScanResult {
  staticScan: any; // From original scanner
  apiEndpoints: ApiEndpoint[];
  responseModels: ApiResponseField[];
  dynamicContentHints: DynamicContentHint[];
  scannedAt: string;
  source: 'hybrid';
}

// ─── SSH Helper ────────────────────────────────────────────────────────────────

function execSSH(
  command: string,
  host: string,
  username: string,
  keyPath: string,
  timeoutMs: number = 30000
): Promise<{ output: string; code: number }> {
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

// ─── API Endpoint Detection ────────────────────────────────────────────────────

async function detectApiEndpoints(
  projectPath: string,
  execSSH: (cmd: string, timeoutMs?: number) => Promise<{ output: string; code: number }>
): Promise<ApiEndpoint[]> {
  const endpoints: ApiEndpoint[] = [];

  // Find all files with Dio or HTTP calls, then cat them all in ONE SSH call
  const apiFilesResult = await execSSH(
    `grep -rl '_dio\\.\\|dio\\.\\|http\\.\\|RestClient\\|ApiClient' "${projectPath}/lib" 2>/dev/null | grep -v '.freezed.dart' | grep -v '.g.dart' | head -50`
  );

  const apiFiles = apiFilesResult.output.split('\n').filter(Boolean);
  if (apiFiles.length === 0) return [];

  // Batch cat all files with awk separator in ONE SSH call
  const batchCmd = apiFiles.map(f => `echo "===FILE_START===:${f}" && cat "${f}" 2>/dev/null`).join(' ; ');
  const batchResult = await execSSH(batchCmd, 60000);
  const batchOutput = batchResult.output;

  // Parse batched output
  let currentFile = '';
  const linesByFile = new Map<string, string[]>();
  for (const line of batchOutput.split('\n')) {
    if (line.startsWith('===FILE_START===:')) {
      currentFile = line.replace('===FILE_START===:', '');
      if (!linesByFile.has(currentFile)) linesByFile.set(currentFile, []);
    } else if (currentFile) {
      linesByFile.get(currentFile)!.push(line);
    }
  }

  for (const [file, lines] of linesByFile) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect HTTP method calls
      const methodMatch = line.match(/(_dio|dio|http)\.(get|post|put|delete|patch)\s*\(/);
      if (!methodMatch) continue;

      const method = methodMatch[2].toUpperCase() as ApiEndpoint['method'];

      // Extract URL (might be on same line or nearby)
      const nearby = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
      const urlMatch = nearby.match(/['"](https?:\/\/[^'"]+|\/[^'"]+)['"]/);
      const url = urlMatch?.[1] || 'unknown';

      // Look for response model type
      const responseModelMatch = nearby.match(/as\s+(\w+Model|\w+Response|\w+Data)/);
      const responseModel = responseModelMatch?.[1];

      // Extract function name for context
      const funcMatch = lines.slice(Math.max(0, i - 20), i).reverse().find(l => l.match(/(Future|void|async)\s+\w+/));
      const funcName = funcMatch?.match(/(Future|void|async)\s+(\w+)/)?.[2];

      endpoints.push({
        method,
        url,
        file,
        line: i + 1,
        responseModel,
        description: funcName,
      });
    }
  }

  return endpoints;
}

// ─── Response Model Analysis ───────────────────────────────────────────────────

async function analyzeResponseModels(
  projectPath: string,
  execSSH: (cmd: string, timeoutMs?: number) => Promise<{ output: string; code: number }>
): Promise<ApiResponseField[]> {
  const fields: ApiResponseField[] = [];

  // Find model files
  const modelsResult = await execSSH(
    `find "${projectPath}/lib" -type f \\( -name '*_model.dart' -o -name '*_response.dart' -o -name '*_data.dart' -o -name '*_entity.dart' \\) 2>/dev/null | grep -v '.freezed.dart' | grep -v '.g.dart' | head -80`
  );

  const modelFiles = modelsResult.output.split('\n').filter(Boolean);
  if (modelFiles.length === 0) return [];

  // Batch cat all files in ONE SSH call
  const batchCmd = modelFiles.map(f => `echo "===FILE_START===:${f}" && cat "${f}" 2>/dev/null`).join(' ; ');
  const batchResult = await execSSH(batchCmd, 60000);
  const batchOutput = batchResult.output;

  // Parse batched output
  let currentFile = '';
  const contentByFile = new Map<string, string>();
  for (const line of batchOutput.split('\n')) {
    if (line.startsWith('===FILE_START===:')) {
      currentFile = line.replace('===FILE_START===:', '');
      contentByFile.set(currentFile, '');
    } else if (currentFile) {
      contentByFile.set(currentFile, (contentByFile.get(currentFile) || '') + line + '\n');
    }
  }

  for (const [file, content] of contentByFile) {
    // Extract class names (Freezed and regular classes)
    const classMatches = content.matchAll(/class\s+(\w+)\s+(?:with|extends|implements|\{)/g);

    for (const classMatch of classMatches) {
      const className = classMatch[1];

      // Skip if it's a generated file class
      if (className.startsWith('_$')) continue;

      // Extract fields — Pattern 1: Freezed factory constructor params
      const factoryMatches = content.matchAll(/factory\s+\w+\(\{?([^)]*)\}/g);
      for (const factoryMatch of factoryMatches) {
        const params = factoryMatch[1];
        const paramMatches = params.matchAll(/(\w+)\??\s+(\w+)/g);
        for (const paramMatch of paramMatches) {
          const fieldType = paramMatch[1];
          const fieldName = paramMatch[2];

          // Skip common non-data fields
          if (['copyWith', 'toString', 'toJson', 'fromJson', 'when', 'map', 'maybeWhen', 'maybeMap', 'props'].includes(fieldName)) continue;

          fields.push({
            fieldName,
            fieldType,
            modelClass: className,
            sourceFile: file,
            isNullable: paramMatch[0].includes('?'),
          });
        }
      }

      // Extract fields — Pattern 2: Regular class fields (fallback)
      const fieldMatches = content.matchAll(/(?:final|var|const)\s+(\w+)(?:<[^>]*>)?\s+(\w+)\??\s*[=;]/g);
      for (const fieldMatch of fieldMatches) {
        const fieldType = fieldMatch[1];
        const fieldName = fieldMatch[2];

        // Skip common non-data fields
        if (['copyWith', 'toString', 'toJson', 'fromJson', 'when', 'map', 'maybeWhen', 'maybeMap', 'props'].includes(fieldName)) continue;

        // Deduplicate
        const exists = fields.some(f => f.fieldName === fieldName && f.modelClass === className);
        if (!exists) {
          fields.push({
            fieldName,
            fieldType,
            modelClass: className,
            sourceFile: file,
            isNullable: fieldMatch[0].includes('?'),
          });
        }
      }
    }
  }

  return fields;
}

// ─── Dynamic Content Detection in UI ───────────────────────────────────────────

async function detectDynamicContentInUI(
  projectPath: string,
  apiEndpoints: ApiEndpoint[],
  responseFields: ApiResponseField[],
  execSSH: (cmd: string, timeoutMs?: number) => Promise<{ output: string; code: number }>
): Promise<DynamicContentHint[]> {
  const hints: DynamicContentHint[] = [];

  // Find UI files
  const uiFilesResult = await execSSH(
    `find "${projectPath}/lib/ui" "${projectPath}/lib/presentation" "${projectPath}/lib/screens" -type f \\( -name '*_view.dart' -o -name '*_screen.dart' -o -name '*_page.dart' -o -name '*_widget.dart' \\) 2>/dev/null | head -100`
  );

  const uiFiles = uiFilesResult.output.split('\n').filter(Boolean);
  if (uiFiles.length === 0) return [];

  // Batch cat all files in ONE SSH call
  const batchCmd = uiFiles.map(f => `echo "===FILE_START===:${f}" && cat "${f}" 2>/dev/null`).join(' ; ');
  const batchResult = await execSSH(batchCmd, 90000);
  const batchOutput = batchResult.output;

  // Parse batched output
  let currentFile = '';
  const contentByFile = new Map<string, string>();
  for (const line of batchOutput.split('\n')) {
    if (line.startsWith('===FILE_START===:')) {
      currentFile = line.replace('===FILE_START===:', '');
      contentByFile.set(currentFile, '');
    } else if (currentFile) {
      contentByFile.set(currentFile, (contentByFile.get(currentFile) || '') + line + '\n');
    }
  }

  for (const [file, content] of contentByFile) {
    // Pattern 1: Text(model.fieldName) or Text(viewModel.fieldName)
    const dynamicTextMatches = content.matchAll(/Text\s*\(\s*(\w+)\.(\w+)/g);

    for (const match of dynamicTextMatches) {
      const modelVar = match[1];
      const fieldName = match[2];

      // Check if this field matches any API response field
      const matchingField = responseFields.find(f =>
        f.fieldName.toLowerCase() === fieldName.toLowerCase()
      );

      if (matchingField) {
        const screenName = file.split('/').pop()?.replace('.dart', '').replace(/_/g, ' ') || 'Unknown';
        
        hints.push({
          screenFile: file,
          screenName,
          responseFields: [matchingField],
          widgetPattern: `Text(${modelVar}.${fieldName})`,
          description: `Dynamic text from ${matchingField.modelClass}.${fieldName}`,
        });
      }
    }

    // Look for FutureBuilder patterns
    if (content.includes('FutureBuilder')) {
      const futureMatches = content.matchAll(/future:\s*(\w+)/g);
      for (const match of futureMatches) {
        const futureVar = match[1];
        const screenName = file.split('/').pop()?.replace('.dart', '').replace(/_/g, ' ') || 'Unknown';
        
        hints.push({
          screenFile: file,
          screenName,
          widgetPattern: `FutureBuilder(future: ${futureVar})`,
          responseFields: [],
          description: `Async content via FutureBuilder`,
        });
      }
    }
  }

  return hints;
}

// ─── Main Hybrid Scanner ──────────────────────────────────────────────────────

export interface HybridScannerConfig {
  host: string;
  username: string;
  projectPath: string;
  sshKeyPath: string;
}

export async function hybridScanFlutterProject(
  config: HybridScannerConfig,
  staticScanResult: any
): Promise<HybridScanResult> {
  const { host, username, projectPath, sshKeyPath } = config;

  // Create bound SSH executor
  const execBound = (cmd: string, timeoutMs?: number) => execSSH(cmd, host, username, sshKeyPath, timeoutMs || 30000);

  console.log('[HybridScanner] Starting hybrid scan...');

  // 1. Detect API endpoints
  console.log('[HybridScanner] Detecting API endpoints...');
  const apiEndpoints = await detectApiEndpoints(projectPath, execBound);
  console.log(`[HybridScanner] Found ${apiEndpoints.length} API endpoints`);

  // 2. Analyze response models
  console.log('[HybridScanner] Analyzing response models...');
  const responseFields = await analyzeResponseModels(projectPath, execBound);
  console.log(`[HybridScanner] Found ${responseFields.length} response fields`);

  // 3. Detect dynamic content in UI
  console.log('[HybridScanner] Detecting dynamic content in UI...');
  const dynamicHints = await detectDynamicContentInUI(
    projectPath,
    apiEndpoints,
    responseFields,
    execBound
  );
  console.log(`[HybridScanner] Found ${dynamicHints.length} dynamic content hints`);

  return {
    staticScan: staticScanResult,
    apiEndpoints,
    responseModels: responseFields,
    dynamicContentHints: dynamicHints,
    scannedAt: new Date().toISOString(),
    source: 'hybrid',
  };
}

// ─── Merge Static and Dynamic Results ──────────────────────────────────────────

export interface MergedElementCatalog {
  packageName: string;
  projectPath: string;
  scannedAt: string;
  source: 'hybrid';
  screens: any[];
  inputs: any[];
  buttons: any[];
  texts: any[]; // Includes both static and dynamic text hints
  apiEndpoints: ApiEndpoint[];
  dynamicContentHints: DynamicContentHint[];
  routes: string[];
}

export function mergeScanResults(
  staticResult: any,
  hybridResult: HybridScanResult
): MergedElementCatalog {
  // Mark static texts
  const staticTexts = (staticResult.texts || []).map((t: any) => ({
    ...t,
    isStatic: true,
    source: 'static',
  }));

  // Create text elements from dynamic content hints
  const dynamicTexts = hybridResult.dynamicContentHints.map(hint => ({
    id: `dynamic_${hint.screenName}_${hint.responseFields[0]?.fieldName || 'unknown'}`.toLowerCase().replace(/\s+/g, '_'),
    text: `[Dynamic] ${hint.responseFields[0]?.fieldName || 'Unknown field'} (${hint.responseFields[0]?.modelClass || 'Unknown model'})`,
    screen: hint.screenName,
    isStatic: false,
    source: 'api-inference',
    apiEndpoint: hint.apiEndpoint,
    modelClass: hint.responseFields[0]?.modelClass,
    fieldName: hint.responseFields[0]?.fieldName,
  }));

  return {
    packageName: staticResult.packageName || 'unknown',
    projectPath: staticResult.projectPath || '',
    scannedAt: hybridResult.scannedAt,
    source: 'hybrid',
    screens: staticResult.screens || [],
    inputs: staticResult.inputs || [],
    buttons: staticResult.buttons || [],
    texts: [...staticTexts, ...dynamicTexts],
    apiEndpoints: hybridResult.apiEndpoints,
    dynamicContentHints: hybridResult.dynamicContentHints,
    routes: staticResult.routes || [],
  };
}
