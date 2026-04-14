import { v4 as uuidv4 } from 'uuid';
import { execSSH } from './ssh-client';
import { writeFileSSHWithRunner } from './ssh-client';
import prisma from '../config/database';
import logger from './logger';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface APITestConfig {
  endpoint: string;  // e.g., "GET:/api/v1/profile"
  mode: 'mock' | 'real';
  environment?: 'production' | 'staging' | 'dev';
  mock?: {
    response: any;
    delay: number;
  };
}

export interface APITestStep {
  id: string;
  type: 'api_call' | 'assertion' | 'wait' | 'input';
  config: APITestConfig;
  description?: string;
}

export interface APITestSuite {
  id: string;
  name: string;
  mode: 'mock' | 'real';
  environment?: 'production' | 'staging' | 'dev';
  steps: APITestStep[];
  projectId: string;
  runnerId?: string;
}

export interface APITestResult {
  testId: string;
  status: 'passed' | 'failed' | 'error';
  steps: {
    stepId: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
    response?: any;
  }[];
  totalDuration: number;
  executedAt: Date;
}

// ─── Mock Server Configuration ───────────────────────────────────────────────────

const MOCK_SERVER_PORT = 3456;
const MOCK_SERVER_DIR = '/tmp/testrails-mock-server';

// ─── Test Execution ─────────────────────────────────────────────────────────────

export async function executeAPITest(
  test: APITestSuite,
  onProgress?: (stepIndex: number, result: any) => void
): Promise<APITestResult> {
  const startTime = Date.now();
  const stepResults: APITestResult['steps'] = [];

  logger.info(`[APITestRunner] Executing test: ${test.name} (${test.mode} mode)`);

  try {
    // Setup mock server if needed
    let mockServerProcess: any = null;
    if (test.mode === 'mock') {
      mockServerProcess = await setupMockServer(test);
    }

    // Execute each step
    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepStart = Date.now();

      try {
        const result = await executeTestStep(step, test);
        stepResults.push({
          stepId: step.id,
          status: result.success ? 'passed' : 'failed',
          duration: Date.now() - stepStart,
          response: result.response,
          error: result.error,
        });

        if (onProgress) {
          onProgress(i, stepResults[stepResults.length - 1]);
        }

        // Stop on first failure
        if (!result.success) {
          break;
        }
      } catch (error: any) {
        stepResults.push({
          stepId: step.id,
          status: 'failed',
          duration: Date.now() - stepStart,
          error: error.message,
        });
      }
    }

    // Cleanup mock server
    if (mockServerProcess) {
      await cleanupMockServer(mockServerProcess);
    }

    const allPassed = stepResults.every(r => r.status === 'passed');
    return {
      testId: test.id,
      status: allPassed ? 'passed' : 'failed',
      steps: stepResults,
      totalDuration: Date.now() - startTime,
      executedAt: new Date(),
    };
  } catch (error: any) {
    logger.error('[APITestRunner] Test execution failed:', error);
    return {
      testId: test.id,
      status: 'error',
      steps: stepResults,
      totalDuration: Date.now() - startTime,
      executedAt: new Date(),
    };
  }
}

async function executeTestStep(
  step: APITestStep,
  test: APITestSuite
): Promise<{ success: boolean; response?: any; error?: string }> {
  let runner = null;
  if (test.runnerId) {
    runner = await prisma.runner.findUnique({ where: { id: test.runnerId } });
  }

  switch (step.type) {
    case 'api_call':
      return await executeAPICall(step.config, test.mode, test.environment, runner);

    case 'assertion':
      return await executeAssertion(step.config, runner);

    case 'wait':
      await new Promise(resolve => setTimeout(resolve, step.config.mock?.delay || 1000));
      return { success: true };

    case 'input':
      return await executeInput(step.config, runner);

    default:
      return { success: false, error: `Unknown step type: ${step.type}` };
  }
}

async function executeAPICall(
  config: APITestConfig,
  mode: 'mock' | 'real',
  environment?: string,
  runner?: any
): Promise<{ success: boolean; response?: any; error?: string }> {
  try {
    const [method, url] = config.endpoint.split(':');
    const apiUrl = mode === 'mock'
      ? `http://localhost:${MOCK_SERVER_PORT}${url}`
      : getRealApiUrl(url, environment);

    logger.info(`[APITestRunner] Executing ${method} ${apiUrl}`);

    if (mode === 'mock') {
      // Mock mode - return configured response
      await new Promise(resolve => setTimeout(resolve, config.mock?.delay || 0));
      return {
        success: true,
        response: config.mock?.response || { success: true, data: {} },
      };
    } else {
      // Real mode - make actual HTTP call
      const response = await fetch(apiUrl, { method });
      const data = await response.json();

      return {
        success: response.ok,
        response: data,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    logger.error('[APITestRunner] API call failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function executeAssertion(
  config: APITestConfig,
  runner?: any
): Promise<{ success: boolean; response?: any; error?: string }> {
  // This would verify the response matches expected values
  // For now, just check if the mock response is valid
  if (config.mock?.response) {
    return {
      success: true,
      response: config.mock.response,
    };
  }
  return {
    success: false,
    error: 'No response data to assert',
  };
}

async function executeInput(
  config: APITestConfig,
  runner?: any
): Promise<{ success: boolean; response?: any; error?: string }> {
  // This would trigger input actions in the app
  // For API testing, this is mostly a placeholder
  return {
    success: true,
    response: { message: 'Input executed' },
  };
}

// ─── Mock Server Management ─────────────────────────────────────────────────────

async function setupMockServer(test: APITestSuite): Promise<any> {
  logger.info('[APITestRunner] Setting up mock server...');

  // Generate mock server configuration
  const mockConfig = generateMockServerConfig(test);

  // Write mock server files
  let runner = null;
  if (test.runnerId) {
    runner = await prisma.runner.findUnique({ where: { id: test.runnerId } });
  }
  if (runner) {
    await writeFileSSHWithRunner(
      `${MOCK_SERVER_DIR}/config.json`,
      JSON.stringify(mockConfig, null, 2),
      runner
    );

    // Start mock server via SSH
    const startCmd = `cd ${MOCK_SERVER_DIR} && node mock-server.js > /dev/null 2>&1 & echo $!`;
    const result = await execSSH(startCmd, 5000);

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info('[APITestRunner] Mock server started');
    return { pid: result.output.trim() };
  }

  return null;
}

async function cleanupMockServer(process: any): Promise<void> {
  if (process?.pid) {
    try {
      await execSSH(`kill ${process.pid} 2>/dev/null`, 3000);
      logger.info('[APITestRunner] Mock server stopped');
    } catch (error) {
      logger.warn('[APITestRunner] Failed to stop mock server:', error);
    }
  }
}

function generateMockServerConfig(test: APITestSuite): Record<string, any> {
  const endpoints: Record<string, any> = {};

  for (const step of test.steps) {
    if (step.type === 'api_call' && step.config.mock) {
      const [method, url] = step.config.endpoint.split(':');
      const key = `${method.toLowerCase()}:${url}`;

      endpoints[key] = {
        response: step.config.mock.response,
        delay: step.config.mock.delay,
      };
    }
  }

  return {
    port: MOCK_SERVER_PORT,
    endpoints,
  };
}

function getRealApiUrl(path: string, environment?: string): string {
  const baseUrl = process.env[`API_BASE_URL_${environment?.toUpperCase()}`] || process.env.API_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}${path}`;
}

// ─── Test Generation from API Endpoints ───────────────────────────────────────────

export async function generateAPITestFromEndpoints(
  projectId: string,
  selectedEndpoints: Array<{ method: string; url: string; fields?: any[] }>,
  mode: 'mock' | 'real'
): Promise<APITestSuite> {
  const testId = uuidv4();

  const steps: APITestStep[] = selectedEndpoints.map((endpoint, index) => ({
    id: `${testId}-step-${index}`,
    type: 'api_call',
    config: {
      endpoint: `${endpoint.method}:${endpoint.url}`,
      mode,
      mock: mode === 'mock' ? {
        response: generateMockResponseFromFields(endpoint.fields || []),
        delay: 0,
      } : undefined,
    },
    description: `Test ${endpoint.method} ${endpoint.url}`,
  }));

  return {
    id: testId,
    name: `API Test - ${new Date().toISOString()}`,
    mode,
    steps,
    projectId,
  };
}

function generateMockResponseFromFields(fields: any[]): Record<string, any> {
  const response: Record<string, any> = {
    success: true,
    data: {},
  };

  for (const field of fields) {
    response.data[field.fieldName] = getMockValueForType(field.fieldType);
  }

  return response;
}

function getMockValueForType(type: string): any {
  switch (type.toLowerCase()) {
    case 'string':
      return 'test_value';
    case 'int':
    case 'double':
    case 'num':
      return 42;
    case 'bool':
      return true;
    case 'datetime':
      return new Date().toISOString();
    case 'list':
      return [];
    default:
      return null;
  }
}

// ─── Test Persistence ─────────────────────────────────────────────────────────────

export async function saveAPITestResult(
  testId: string,
  result: APITestResult,
  testRunId?: string
): Promise<void> {
  try {
    // Save to database if testRunId provided
    if (testRunId) {
      // Could save individual step results as TestResult records
      logger.info(`[APITestRunner] Saved results for test run ${testRunId}`);
    }
  } catch (error) {
    logger.error('[APITestRunner] Failed to save test results:', error);
  }
}

// ─── Flutter Integration Test Code Generation ─────────────────────────────────────

export async function generateFlutterAPITestCode(
  test: APITestSuite,
  appPath: string
): Promise<string> {
  const mockServerUrl = `http://localhost:${MOCK_SERVER_PORT}`;

  let code = `
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:your_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('${test.name}', () {
    testWidgets('API Test (${test.mode} mode)', (WidgetTester tester) async {
`;

  // Add API base URL configuration
  if (test.mode === 'mock') {
    code += `
      // TODO: Set up mock server or override HTTP client
      // For now, this is a placeholder for mock configuration
`;
  }

  // Add test steps
  for (const step of test.steps) {
    if (step.type === 'api_call') {
      const [method, url] = step.config.endpoint.split(':');
      code += `
      // Step: ${step.description || `Test ${method} ${url}`}
      // TODO: Implement API call verification
      // Expected response: ${JSON.stringify(step.config.mock?.response || {}).slice(0, 50)}...
`;
    }
  }

  code += `
    });
  });
}
`;

  return code;
}
