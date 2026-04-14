import * as fs from 'fs';
import * as path from 'path';
import { execSSH } from './ssh-client';
import logger from './logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  fullPath?: string;  // Including base URL
  line?: number;
  file?: string;
  callPattern?: string;  // e.g., "dio.get('/api/v1/transactions')"
  responseType?: string;
  responseFile?: string;
  requestType?: string;
  requestFile?: string;
  fields?: APIField[];
  requestBodyFields?: APIField[];
  usedInScreens?: string[];
}

export interface APIField {
  name: string;
  type: string;
  jsonKey?: string;
  nullable?: boolean;
  isList?: boolean;
  listItemType?: string;
  description?: string;
}

export interface APIDetectionResult {
  apiEndpoints: APIEndpoint[];
  screensWithAPI: string[];
  totalEndpoints: number;
  scannedAt: string;
}

// ─── API Detection Patterns ───────────────────────────────────────────────────────

const API_PATTERNS = {
  // Common Flutter HTTP packages
  calls: [
    // dio
    /(?:await\s+)?(?:dio|httpDio|apiDio)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    // http package
    /(?:await\s+)?http\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    // Custom API client methods
    /(?:await\s+)?(?:apiClient|restClient|service)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ],

  // Response type detection
  responseType: [
    /final\s+(\w+)\s*=\s*(?:await\s+)?(?:dio|http|apiClient|restClient)\.\w+/,
    /(?:final|const)\s+(\w+)\s*=\s*(?:await\s+)?(?:dio|http|apiClient|restClient)\.\w+\s*;\s*\/\/\s*(?:Response|Data)/,
  ],

  // Model imports
  modelImport: /import\s+['"`]package:([^'"`]+)\/models\/([^'"`]+)['"`]/g,
};

// ─── Main API Detector ───────────────────────────────────────────────────────────

export async function detectAPIEndpoints(projectPath: string, viaSSH = true): Promise<APIDetectionResult> {
  const endpoints: Map<string, APIEndpoint> = new Map();
  const screenUsage: Map<string, string[]> = new Map();

  logger.info(`[APIDetection] Scanning ${projectPath} for API endpoints...`);

  // Step 1: Find all Dart files
  const dartFiles = await findDartFiles(projectPath, viaSSH);
  logger.info(`[APIDetection] Found ${dartFiles.length} Dart files`);

  // Step 2: Scan each file for API calls
  for (const file of dartFiles) {
    const content = await readFileContent(file, viaSSH);

    // Skip if not a screen or API-related file
    if (!isScreenOrAPIFile(file)) continue;

    // Find API calls in this file
    const fileEndpoints = findAPIEndpointsInFile(file, content, projectPath, dartFiles);

    // Merge with existing endpoints
    for (const endpoint of fileEndpoints) {
      const key = `${endpoint.method}:${endpoint.url}`;
      if (endpoints.has(key)) {
        // Merge usage info
        const existing = endpoints.get(key)!;
        existing.usedInScreens = [...(existing.usedInScreens || []), ...(endpoint.usedInScreens || [])];
      } else {
        endpoints.set(key, endpoint);
      }
    }
  }

  // Step 3: Parse response models for each endpoint
  const enrichedEndpoints = await enrichEndpointsWithModels(Array.from(endpoints.values()), projectPath, viaSSH);

  // Step 4: Map API fields to UI elements
  const finalEndpoints = await mapFieldsToUIElements(enrichedEndpoints, projectPath, viaSSH);

  const screensWithAPI = [...new Set(
    finalEndpoints.flatMap(e => e.usedInScreens || [])
  )];

  logger.info(`[APIDetection] Found ${finalEndpoints.length} API endpoints in ${screensWithAPI.length} screens`);

  return {
    apiEndpoints: finalEndpoints,
    screensWithAPI,
    totalEndpoints: finalEndpoints.length,
    scannedAt: new Date().toISOString(),
  };
}

// ─── File Operations ─────────────────────────────────────────────────────────────

async function findDartFiles(projectPath: string, viaSSH: boolean): Promise<string[]> {
  if (viaSSH) {
    const result = await execSSH(
      `find "${projectPath}/lib" -type f -name "*.dart" 2>/dev/null`,
      30000
    );
    return result.output.split('\n').filter(Boolean);
  } else {
    const { glob } = await import('glob');
    const files = await glob.glob('**/*.dart', { cwd: `${projectPath}/lib` });
    return files.map(f => path.join(projectPath, 'lib', f));
  }
}

async function readFileContent(filePath: string, viaSSH: boolean): Promise<string> {
  if (viaSSH) {
    const result = await execSSH(`cat "${filePath}" 2>/dev/null`, 15000);
    return result.output;
  } else {
    return fs.readFileSync(filePath, 'utf-8');
  }
}

function isScreenOrAPIFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Include screen files
  if (/screen|page|view/i.test(normalizedPath)) return true;

  // Include service, API, client files
  if (/service|api|client|repository|provider/i.test(normalizedPath)) return true;

  // Include models
  if (/models?|responses?|requests?/i.test(normalizedPath)) return true;

  return false;
}

// ─── API Endpoint Detection in File ─────────────────────────────────────────────

function findAPIEndpointsInFile(
  filePath: string,
  content: string,
  projectPath: string,
  allDartFiles: string[]
): APIEndpoint[] {
  const endpoints: APIEndpoint[] = [];
  const screenName = getScreenNameFromPath(filePath);

  // Try each API pattern
  for (const pattern of API_PATTERNS.calls) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      const url = match[2];

      // Skip non-API URLs
      if (!url.startsWith('/api/') && !url.startsWith('http')) continue;

      // Find response type
      const responseType = findResponseType(content, match.index);

      endpoints.push({
        method,
        url,
        file: filePath,
        line: getLineNumber(content, match.index),
        callPattern: match[0],
        responseType,
        usedInScreens: screenName ? [screenName] : [],
      });
    }
  }

  return endpoints;
}

// ─── Response Type Detection ─────────────────────────────────────────────────────

function findResponseType(content: string, callIndex: number): string | undefined {
  // Look for variable assignment after API call
  const afterCall = content.substring(callIndex);

  // Pattern: final typeName = await api.get(...)
  const match = afterCall.match(/(?:final|const)\s+(\w+)\s*=/);
  if (match) {
    return match[1];
  }

  // Pattern: direct usage in widget
  // e.g., Text(api.data['name'])
  const directMatch = afterCall.match(/\.\s*data\s*[\[\.]/);
  if (directMatch) {
    // Try to infer from usage
    return 'dynamic'; // Will be enriched later
  }

  return undefined;
}

// ─── Model Enrichment ─────────────────────────────────────────────────────────────

async function enrichEndpointsWithModels(
  endpoints: APIEndpoint[],
  projectPath: string,
  viaSSH: boolean
): Promise<APIEndpoint[]> {
  const enriched: APIEndpoint[] = [];

  for (const endpoint of endpoints) {
    const enriched = { ...endpoint };

    if (enriched.responseType) {
      // Find response model file
      const responseModel = await findModelFile(enriched.responseType, projectPath, viaSSH);
      if (responseModel) {
        enriched.responseFile = responseModel.file;
        enriched.fields = await parseModelFields(responseModel.file, responseModel.content, viaSSH);
      }
    }

    enriched;
  }

  return enriched;
}

async function findModelFile(modelName: string, projectPath: string, viaSSH: boolean): Promise<{ file: string; content: string } | null> {
  // Try to find model file by name
  const possibleFiles = [
    `${projectPath}/lib/models/${toSnakeCase(modelName)}.dart`,
    `${projectPath}/lib/models/${modelName.toLowerCase()}.dart`,
    `${projectPath}/lib/models/${modelName}.dart`,
    `${projectPath}/lib/responses/${toSnakeCase(modelName)}.dart`,
  ];

  for (const file of possibleFiles) {
    try {
      const content = await readFileContent(file, viaSSH);
      if (content.includes(`class ${modelName}`)) {
        return { file, content };
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  // Search in all files
  const { glob } = await import('glob');
  const pattern = `**/${modelName}.dart`;

  // For SSH, use find command
  if (viaSSH) {
    const result = await execSSH(`find "${projectPath}/lib" -name "${modelName}.dart" -o -name "${toSnakeCase(modelName)}.dart" 2>/dev/null | head -1`, 15000);
    if (result.output) {
      const content = await readFileContent(result.output, viaSSH);
      return { file: result.output, content };
    }
  }

  return null;
}

async function parseModelFields(modelFile: string, content: string, viaSSH: boolean): Promise<APIField[]> {
  const fields: APIField[] = [];

  // Simple field parsing - look for final declarations
  const lines = content.split('\n');

  for (const line of lines) {
    // Match: final Type fieldName;
    const match = line.match(/final\s+(\w+(?:<[^>]+>)?\s+)??(\w+);/);
    if (match) {
      const type = match[1];
      const name = match[2];

      // Skip common non-model fields
      if (['toString', 'hashCode', 'runtimeType', 'copyWith', 'fromJson'].includes(name)) continue;

      fields.push({
        name,
        type: type,
        jsonKey: name,
      });
    }
  }

  return fields;
}

function findJsonKeyForField(content: string, className: string, fieldName: string): string | null {
  // Simplified version - just check if field exists in fromJson
  const fromJsonIndex = content.indexOf(className + '.fromJson');
  if (fromJsonIndex === -1) return null;

  const searchEnd = content.indexOf('}', fromJsonIndex + 2000);
  if (searchEnd === -1) return null;

  const methodBody = content.substring(fromJsonIndex, searchEnd);

  // Simple substring search for the field
  if (methodBody.includes(fieldName + ':')) {
    return fieldName;
  }

  return null;
}

// ─── UI Element Mapping ─────────────────────────────────────────────────────────────

async function mapFieldsToUIElements(
  endpoints: APIEndpoint[],
  projectPath: string,
  viaSSH: boolean
): Promise<APIEndpoint[]> {
  // For each endpoint, find which UI elements display the API data
  // This requires scanning screen files for data binding patterns

  // Implementation pending - would analyze widget trees
  // to find which Text/Widget display which API fields

  return endpoints;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────────

function getScreenNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1]?.replace('.dart', '') || '';
  return fileName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_+|_+$/g, '');
}

function simplifyType(type: string): string {
  return type
    .replace(/\bint\b/g, 'int')
    .replace(/\bdouble\b/g, 'double')
    .replace(/\bString\b/g, 'String')
    .replace(/\bbool\b/g, 'bool')
    .replace(/\bDateTime\b/g, 'DateTime')
    .replace(/\?$/g, '');
}

function extractListItemType(type: string): string | undefined {
  const match = type.match(/List<(.+)>/);
  return match ? match[1] : undefined;
}

// ─── Export for Route Usage ─────────────────────────────────────────────────────

export async function scanProjectAPIEndpoints(
  projectPath: string,
  config?: { viaSSH?: boolean }
): Promise<APIDetectionResult> {
  const viaSSH = config?.viaSSH ?? true;
  return detectAPIEndpoints(projectPath, viaSSH);
}
