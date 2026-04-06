import { FastifyInstance } from 'fastify';
import { Client } from 'ssh2';
import * as fs from 'fs';
import { successResponse, errorResponses } from '../utils/response';
import {
  generateIntegrationTestSchema,
  runIntegrationTestSchema,
  saveIntegrationTestSchema,
} from '../types/schemas';
import logger from '../utils/logger';
import prisma from '../config/database';

// ─── SSH Configuration ─────────────────────────────────────────────────────────

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '100.76.181.104';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/nodejs/.ssh/id_ed25519';
const FLUTTER_PROJECT_PATH: string =
  process.env.FLUTTER_PROJECT_PATH ||
  '/Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker';

// Cache SSH key at module init
let cachedKey: Buffer | null = null;
function getSSHKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!SSH_KEY_PATH) throw new Error('MAESTRO_RUNNER_KEY_PATH environment variable is not set');
  cachedKey = fs.readFileSync(SSH_KEY_PATH);
  return cachedKey;
}

function validateSSHConfig(): void {
  if (!SSH_HOST) throw new Error('MAESTRO_RUNNER_HOST environment variable is not set');
  if (!SSH_USER) throw new Error('MAESTRO_RUNNER_USER environment variable is not set');
  getSSHKey();
}

// ─── SSH Execution Helper ──────────────────────────────────────────────────────

function execSSH(command: string, timeoutMs: number = 60000): Promise<{ output: string; code: number }> {
  validateSSHConfig();
  const privateKey = getSSHKey();

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      try { client.end(); } catch {}
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) {
          client.end();
          clearTimeout(timer);
          reject(err);
          return;
        }

        let output = '';
        let stderr = '';

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        stream.on('close', (code: number | null) => {
          client.end();
          clearTimeout(timer);
          resolve({ output: output.trim(), code: code ?? -1 });
        });
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    client.connect({
      host: SSH_HOST,
      username: SSH_USER,
      privateKey,
      readyTimeout: 30000,
    });
  });
}

// ─── File Write via SSH ────────────────────────────────────────────────────────

async function writeFileSSH(remotePath: string, content: string): Promise<void> {
  validateSSHConfig();
  const privateKey = getSSHKey();

  // Escape single quotes for shell heredoc
  const escaped = content.replace(/'/g, "'\\''");

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      try { client.end(); } catch {}
      reject(new Error('SSH file write timed out'));
    }, 30000);

    client.on('ready', () => {
      const dirPath = remotePath.substring(0, remotePath.lastIndexOf('/'));
      const cmd = `mkdir -p '${dirPath}' && printf '%s' '${escaped}' > '${remotePath}'`;
      client.exec(cmd, (err) => {
        client.end();
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    client.connect({
      host: SSH_HOST,
      username: SSH_USER,
      privateKey,
      readyTimeout: 30000,
    });
  });
}

// ─── Capture App Hierarchy via SSH ─────────────────────────────────────────────

async function captureHierarchy(): Promise<string> {
  const javaHome = '/Users/clawbot/jdk17/Contents/Home';
  const androidHome = '/Users/clawbot/Library/Android/sdk';
  const cmd =
    `export JAVA_HOME="${javaHome}" && ` +
    `export ANDROID_HOME="${androidHome}" && ` +
    `export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ` +
    `adb shell uiautomator dump /sdcard/ui.xml 2>/dev/null && ` +
    `adb shell cat /sdcard/ui.xml 2>/dev/null`;

  const result = await execSSH(cmd, 30000);
  if (!result.output || result.output.length < 100) {
    throw new Error(`Failed to capture app hierarchy: ${result.output.slice(0, 200)}`);
  }
  return result.output;
}

// ─── AI Code Generation ────────────────────────────────────────────────────────

async function generateDartCode(hierarchy: string, scenario: string, credentials?: Record<string, string>): Promise<string> {
  if (!process.env.ZAI_API_KEY) {
    throw new Error('ZAI_API_KEY environment variable is not set');
  }

  const credText = credentials
    ? `Use these credentials in the test: ${JSON.stringify(credentials, null, 2)}`
    : 'No credentials provided.';

  const systemPrompt = `You are a Flutter integration test expert. Given this app UI hierarchy from uiautomator dump:

${hierarchy.slice(0, 12000)}

Generate a complete integration test for: ${scenario}

Use these patterns:
- \`await tester.tap(find.text('Label'))\`
- \`await tester.enterText(find.byType(TextFormField).at(index), 'value')\`
- \`expect(find.text('Expected'), findsOneWidget)\`
- Always use \`await tester.pumpAndSettle()\` after interactions
- Import: \`import 'package:flutter_test/flutter_test.dart';\`
- Import: \`import 'package:integration_test/integration_test.dart';\`
- Import: \`import 'package:discipline_tracker/main.dart' as app;\`

${credText}

Output ONLY valid Dart code, no markdown, no explanation. Start with imports, end with test function.`;

  const body = {
    model: 'glm-4.5-air',
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: systemPrompt },
    ],
  };

  const response = await fetch(
    'https://api.z.ai/api/coding/paas/v4/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Z.ai API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content: string = data.choices?.[0]?.message?.content ?? '';

  if (!content) {
    throw new Error('AI returned no content');
  }

  // Strip markdown code fences if present
  const cleaned = content
    .replace(/^```dart\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) {
    throw new Error('AI returned empty content after cleanup');
  }

  return cleaned;
}

// ─── Execute Test via SSH ──────────────────────────────────────────────────────

async function executeTest(testFileName: string): Promise<{ success: boolean; output: string; duration: number }> {
  const testFilePath = `${FLUTTER_PROJECT_PATH}/integration_test/${testFileName}`;

  const javaHome = '/Users/clawbot/jdk17/Contents/Home';
  const androidHome = '/Users/clawbot/Library/Android/sdk';
  const flutterBin = '/Users/clawbot/flutter/bin/flutter';

  const cmd =
    `export JAVA_HOME="${javaHome}" && ` +
    `export ANDROID_HOME="${androidHome}" && ` +
    `export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:/usr/local/bin:$PATH" && ` +
    `cd "${FLUTTER_PROJECT_PATH}" && ` +
    `echo "___START___" && ` +
    `${flutterBin} test integration_test/${testFileName} 2>&1 && ` +
    `echo "___END___"`;

  const startTime = Date.now();
  const result = await execSSH(cmd, 300000); // 5 minute timeout
  const duration = Date.now() - startTime;

  const fullOutput = result.output;
  const success = result.code === 0 && fullOutput.includes('All tests passed');

  return {
    success,
    output: fullOutput,
    duration,
  };
}

// ─── Route Handlers ────────────────────────────────────────────────────────────

export default async function integrationTestRoutes(fastify: FastifyInstance) {
  // POST /generate - Generate Dart test code using AI
  fastify.post('/generate', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const body = generateIntegrationTestSchema.parse(request.body);
      const { appId, scenario, credentials } = body;

      logger.info(`[IntegrationTest] Generating test for app=${appId}, scenario=${scenario.slice(0, 80)}`);

      // Step 1: Capture hierarchy via SSH
      const hierarchy = await captureHierarchy();
      logger.info(`[IntegrationTest] Captured hierarchy (${hierarchy.length} chars)`);

      // Step 2: Generate Dart code via AI
      const dartCode = await generateDartCode(hierarchy, scenario, credentials);
      logger.info(`[IntegrationTest] Generated Dart code (${dartCode.length} chars)`);

      // Generate a safe filename
      const safeName = scenario
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
      const fileName = `${safeName}_test.dart`;

      return successResponse(reply, { dartCode, fileName }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('[IntegrationTest] Error generating test:', error);
      return errorResponses.handle(reply, error, 'generate integration test');
    }
  });

  // POST /run - Generate, save, and run the test
  fastify.post('/run', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const body = runIntegrationTestSchema.parse(request.body);
      const { appId, scenario, credentials } = body;

      logger.info(`[IntegrationTest] Full run for app=${appId}, scenario=${scenario.slice(0, 80)}`);

      // Step 1: Capture hierarchy via SSH
      const hierarchy = await captureHierarchy();
      logger.info(`[IntegrationTest] Captured hierarchy (${hierarchy.length} chars)`);

      // Step 2: Generate Dart code via AI
      const dartCode = await generateDartCode(hierarchy, scenario, credentials);
      logger.info(`[IntegrationTest] Generated Dart code (${dartCode.length} chars)`);

      // Step 3: Generate a safe filename
      const safeName = scenario
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
      const fileName = `${safeName}_test.dart`;

      // Step 4: Write to Flutter project on Mac via SSH
      const testFilePath = `${FLUTTER_PROJECT_PATH}/integration_test/${fileName}`;
      await writeFileSSH(testFilePath, dartCode);
      logger.info(`[IntegrationTest] Saved test to ${testFilePath}`);

      // Step 5: Execute the test via SSH
      const result = await executeTest(fileName);
      logger.info(
        `[IntegrationTest] Test ${result.success ? 'passed' : 'failed'} in ${result.duration}ms`,
      );

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('[IntegrationTest] Error running test:', error);
      return errorResponses.handle(reply, error, 'run integration test');
    }
  });

  // POST /save - Save generated test to database
  fastify.post('/save', {
    onRequest: [fastify.authenticate, fastify.getOrganizationContext],
  }, async (request: any, reply) => {
    try {
      const body = saveIntegrationTestSchema.parse(request.body);
      const { name, dartCode, appId, scenario, suiteId } = body;

      const saved = await prisma.integrationTest.create({
        data: { name, dartCode, appId, scenario, suiteId: suiteId || null },
      });

      logger.info(`[IntegrationTest] Saved test "${name}" (id=${saved.id})`);
      return successResponse(reply, { id: saved.id }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('[IntegrationTest] Error saving test:', error);
      return errorResponses.handle(reply, error, 'save integration test');
    }
  });

  // GET / - List all saved tests
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (_request: any, reply) => {
    try {
      const tests = await prisma.integrationTest.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return successResponse(reply, tests, undefined);
    } catch (error: any) {
      logger.error('[IntegrationTest] Error listing tests:', error);
      return errorResponses.handle(reply, error, 'list integration tests');
    }
  });

  // GET /:id - Get a specific test
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;

      const test = await prisma.integrationTest.findUnique({
        where: { id },
      });

      if (!test) {
        return errorResponses.notFound(reply, 'Integration Test');
      }

      return successResponse(reply, test, undefined);
    } catch (error: any) {
      logger.error('[IntegrationTest] Error fetching test:', error);
      return errorResponses.handle(reply, error, 'fetch integration test');
    }
  });

  // POST /:id/run - Run a saved test
  fastify.post('/:id/run', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;

      const savedTest = await prisma.integrationTest.findUnique({
        where: { id },
      });

      if (!savedTest) {
        return errorResponses.notFound(reply, 'Integration Test');
      }

      logger.info(`[IntegrationTest] Running saved test "${savedTest.name}" (id=${id})`);

      // Write the saved Dart code to the Flutter project
      const safeName = savedTest.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
      const fileName = `${safeName}_test.dart`;
      const testFilePath = `${FLUTTER_PROJECT_PATH}/integration_test/${fileName}`;

      await writeFileSSH(testFilePath, savedTest.dartCode);
      logger.info(`[IntegrationTest] Saved test to ${testFilePath}`);

      // Execute the test via SSH
      const result = await executeTest(fileName);
      logger.info(
        `[IntegrationTest] Saved test ${result.success ? 'passed' : 'failed'} in ${result.duration}ms`,
      );

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('[IntegrationTest] Error running saved test:', error);
      return errorResponses.handle(reply, error, 'run saved integration test');
    }
  });
}
