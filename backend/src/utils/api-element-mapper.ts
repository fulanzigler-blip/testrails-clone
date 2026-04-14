import { Page } from 'playwright';
import { execSSH } from './ssh-client';
import logger from './logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UIElement {
  id: string;
  type: string;  // Text, TextField, Button, Image, etc.
  label?: string;
  selector?: string;
  key?: string;
  semanticLabel?: string;
  boundToAPI?: {
    endpoint: string;  // e.g., "GET:/api/v1/profile"
    field: string;     // e.g., "name", "email"
    transform?: string;  // e.g., "formatCurrency", "formatDate"
  };
}

export interface ScreenWithAPI {
  name: string;
  file: string;
  staticElements: UIElement[];
  dynamicElements: UIElement[];  // Elements that display API data
  apiEndpoints: string[];
}

// ─── Element Mapping Detection ─────────────────────────────────────────────────────

export async function detectAPIBindingsInScreen(
  screenFile: string,
  projectPath: string,
  viaSSH = true
): Promise<ScreenWithAPI> {
  const content = await readFileContent(screenFile, viaSSH);

  // Find widgets that display data from API responses
  const elements: UIElement[] = [];
  const dynamicElements: UIElement[] = [];

  // Pattern 1: Direct field access from response object
  // e.g., Text(snapshot.data['name'])
  const fieldAccessPatterns = [
    // Text(snapshot.data['fieldName'])
    /Text\s*\(\s*snapshot\.data\[['"`]([^'"`]+)['"`]\s*\)/g,
    // Text(widget.fieldName)
    /Text\s*\(\s*[\w.]+\.(\w+)\s*\)/g,
    // value: apiResponse['fieldName']
    /value:\s*(?:apiResponse|response|data)\[['"`]([^'"`]+)['"`]\]/g,
  ];

  // Pattern 2: ListView.builder with snapshot.data
  // The list items are generated from API response
  const listPattern = /ListView\.builder\s*\([^)]*itemBuilder:[^}]*snapshot\.data/g;
  const hasListFromAPI = listPattern.test(content);

  if (hasListFromAPI) {
    // Find list item builder
    const itemBuilderMatch = content.match(
      /itemBuilder:\s*\([^)]*\)\s*{\s*([\s\S]*?)\s*return\s+([\s\S]*?);?\s*\}\s*\}\s*\)/
    );
    if (itemBuilderMatch) {
      const itemBuilderBody = itemBuilderMatch[1];
      const itemReturn = itemBuilderMatch[2];

      // Extract fields used in item from context
      const contextFields = extractContextFromBuilder(itemBuilderBody);
      const displayedFields = extractFieldsFromItem(itemReturn);

      for (const field of displayedFields) {
        dynamicElements.push({
          id: `list_item_${field}`,
          type: 'ListItem',
          label: field,
          selector: `list_item_${field}`,
          boundToAPI: {
            endpoint: 'detected_from_list',
            field,
          },
        });
      }
    }
  }

  // Pattern 3: Conditional rendering based on API data
  // e.g., if (snapshot.data['role'] == 'manager') ManagerDashboard()
  const conditionalPattern = /if\s*\([^)]*\s*(?:snapshot\.data|data|response)\[['"`]([^'"`]+)['"`]\s*==\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let conditionalMatch;
  while ((conditionalMatch = conditionalPattern.exec(content)) !== null) {
    const field = conditionalMatch[1];
    const value = conditionalMatch[2];

    // This suggests conditional rendering - mark as dynamic
    // Find what widget is rendered
    const widgetPattern = new RegExp(
      `if\\s*\\([^)]*\\s*(?:snapshot\\.data|data|response)\\[['"\`]${field}['"\`]\\s*==\\s*['"\`]${value}['"\`]\\s*\\)\\s*([\\w\\[\\]()]+)`
    );
    const widgetMatch = widgetPattern.exec(content.substring(conditionalMatch.index));

    if (widgetMatch) {
      dynamicElements.push({
        id: `conditional_${field}_${value}`,
        type: widgetMatch[1],
        label: `${field} == ${value}`,
        boundToAPI: {
          endpoint: 'detected_from_conditional',
          field,
        },
      });
    }
  }

  return {
    name: getScreenNameFromPath(screenFile),
    file: screenFile,
    staticElements: elements,
    dynamicElements,
    apiEndpoints: [...new Set([...extractAPIEndpointsFromScreen(content)])],
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────────

function extractContextFromBuilder(builderBody: string): string[] {
  // Find variables captured in context
  const contextPattern = /context\s*<\s*(\w+)\s*>/g;
  const contexts: string[] = [];
  let match;
  while ((match = contextPattern.exec(builderBody)) !== null) {
    contexts.push(match[1]);
  }
  return contexts;
}

function extractFieldsFromItem(itemReturn: string): string[] {
  const fields: string[] = [];

  // Common patterns for displaying API fields
  const patterns = [
    // Text(items[index].fieldName)
    /Text\s*\(\s*items\[[^\]]+\]\.(\w+)\s*\)/g,
    // Card(child: Text(item.fieldName))
    /(?:Card|Container|Row|Column)\([^)]*child:\s*Text\s*\(\s*[\w.]+\.(\w+)\s*\)/g,
    // value: item.fieldName
    /value:\s*[\w.]+\.(\w+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(itemReturn)) !== null) {
      if (!fields.includes(match[1])) {
        fields.push(match[1]);
      }
    }
  }

  return fields;
}

function extractAPIEndpointsFromScreen(content: string): string[] {
  const endpoints: string[] = [];

  // Find API calls in screen
  const patterns = [
    /(?:dio|http|apiClient)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const url = match[2];
      endpoints.push(`${method}:${url}`);
    }
  }

  return endpoints;
}

async function readFileContent(filePath: string, viaSSH: boolean): Promise<string> {
  if (viaSSH) {
    const result = await execSSH(`cat "${filePath}" 2>/dev/null`, 15000);
    return result.output;
  } else {
    const fs = await import('fs');
    return fs.readFileSync(filePath, 'utf-8');
  }
}

function getScreenNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1]?.replace('.dart', '') || '';
  return fileName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Web Scraping for Dynamic Elements (Playwright) ─────────────────────────────────

export async function captureDynamicElementsWithAPI(
  screenName: string,
  projectPath: string,
  apiEndpoints: string[],
  page: Page,
  viaSSH = true
): Promise<UIElement[]> {
  const dynamicElements: UIElement[] = [];

  // This would be used during runtime scanning to capture
  // elements that actually appear after API calls complete

  // For now, return empty - to be implemented with runtime capture
  return dynamicElements;
}

// ─── Complete Element Scan with API Integration ─────────────────────────────────────

export async function scanProjectWithAPIBindings(
  projectPath: string,
  viaSSH = true
): Promise<{
  screens: ScreenWithAPI[];
  totalAPIBindings: number;
}> {
  const screens: ScreenWithAPI[] = [];

  // Find all screen files
  const screenFiles = await findScreenFiles(projectPath, viaSSH);

  for (const file of screenFiles) {
    const screenWithAPI = await detectAPIBindingsInScreen(file, projectPath, viaSSH);
    if (screenWithAPI.dynamicElements.length > 0 || screenWithAPI.apiEndpoints.length > 0) {
      screens.push(screenWithAPI);
    }
  }

  const totalAPIBindings = screens.reduce(
    (sum, screen) => sum + screen.dynamicElements.length,
    0
  );

  return {
    screens,
    totalAPIBindings,
  };
}

async function findScreenFiles(projectPath: string, viaSSH: boolean): Promise<string[]> {
  if (viaSSH) {
    const result = await execSSH(
      `find "${projectPath}/lib" -type f \\( -name "*screen*.dart" -o -name "*_page.dart" -o -name "*_view.dart" \\) 2>/dev/null | head -100`,
      30000
    );
    return result.output.split('\n').filter(Boolean);
  } else {
    const { glob } = await import('glob');
    const files = await glob.glob('**/*{screen,page,view}*.dart', {
      cwd: `${projectPath}/lib`,
    });
    return files;
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────────

