import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
const AdmZip = require('adm-zip');

import { successResponse, errorResponses } from '../utils/response';
import {
  generateIntegrationTestSchema,
  runIntegrationTestSchema,
  saveIntegrationTestSchema,
} from '../types/schemas';
import logger from '../utils/logger';
import prisma from '../config/database';

// Element scanners
import { scanFlutterProjectSSH, ElementCatalog, ButtonInfo } from '../utils/element-scanner-ssh';
import { scanFlutterProjectLocal } from '../utils/element-scanner';
import { hybridScanFlutterProject, mergeScanResults, HybridScannerConfig } from '../utils/element-scanner-hybrid';

// Modular utilities (refactored from this file)
import { execSSH, writeFileSSH, writeFileSSHWithRunner, execSSHWithConfig, type SSHRunnerConfig } from '../utils/ssh-client';
import { discoverAppContext, captureHierarchy, getFlutterProjectPath } from '../utils/flutter-scanner';
import { generateDartCode } from '../utils/dart-codegen';
import { executeFlutterTest, listIntegrationTests, getTestFileContent } from '../utils/test-executor';
import type { AppContext } from '../utils/flutter-scanner';

// ─── Environment Constants ───────────────────────────────────────────────────────

const FLUTTER_PROJECT_PATH: string =
  process.env.FLUTTER_PROJECT_PATH ||
  '/Users/clawbot/actions-runner/_work/discipline-tracker/discipline-tracker';
const FLUTTER_BIN: string =
  process.env.FLUTTER_BIN || '/Users/clawbot/development/flutter/bin/flutter';

// ─── Enhanced Dart Code Generation (with fix-up logic) ───────────────────────────

async function generateDartCodeWithFixups(
  hierarchy: string,
  scenario: string,
  credentials?: Record<string, string>,
  appContext?: AppContext,
): Promise<string> {
  // Call the base generation function from the module
  let cleaned = await generateDartCode(hierarchy, scenario, credentials, appContext);

  // FIX: If app uses onFieldSubmitted, FORCE replace tap() with receiveAction pattern
  // The AI often ignores this instruction, so we do it programmatically — be AGGRESSIVE
  if (appContext?.authFlow?.includes('onFieldSubmitted')) {
    const hasReceiveAction = cleaned.includes('receiveAction');
    const hasTapLogin = /tap\(find\.text\(['"]([^'"]+)['"]\)\)/.test(cleaned);
    const hasEnterText = cleaned.includes('enterText');

    // If AI generated tap() but NOT receiveAction, and the code has enterText (login flow)
    if (hasTapLogin && !hasReceiveAction && hasEnterText) {
      // Replace ALL tap(find.text('...')) with receiveAction
      // (In a login flow, the tap is always the login button)
      cleaned = cleaned.replace(
        /await\s+tester\.tap\(find\.text\(['"][^'"]+['"]\)\);?\s*\n?\s*/,
        `await tester.testTextInput.receiveAction(TextInputAction.done);\n    `
      );
      logger.info(`[IntegrationTest] INJECTED receiveAction — replaced tap() that AI generated`);
    }
  }

  // FIX: Replace any placeholder credentials with actual values
  // The AI often ignores credential instructions, so we do this programmatically
  if (credentials && Object.keys(credentials).length > 0) {
    const email = credentials.email || credentials.emailAddress || credentials.username || '';
    const password = credentials.password || '';

    if (email) {
      // Replace common email placeholder patterns (handles both TextField and TextFormField)
      cleaned = cleaned
        .replace(
          /(await\s+tester\.enterText\(\s*(?:find\.byType\(Text(?:Form)?Field\)\.(?:first|at\(0\))|find\.byKey\(ValueKey\(['"](?:email|Email|username|Username)['"]\))\)\s*,\s*)['"][^'"]*['"]/,
          `$1'${email.replace(/'/g, "\\'")}'`
        );

      // Pattern 2: Broader - if the AI used placeholder values
      if (cleaned.includes('email@example.com') || cleaned.includes('user@test.com') ||
          cleaned.includes('your_') || cleaned.includes('REPLACE') || cleaned.includes('placeholder')) {
        cleaned = cleaned.replace(
          /(await\s+tester\.enterText\(\s*find\.byType\(Text(?:Form)?Field\)\.first\s*,\s*)['"][^'"]*['"]/,
          `$1'${email.replace(/'/g, "\\'")}'`
        );
      }
    }

    if (password) {
      // Replace common password placeholder patterns (handles both TextField and TextFormField)
      cleaned = cleaned
        .replace(
          /(await\s+tester\.enterText\(\s*(?:find\.byType\(Text(?:Form)?Field\)\.(?:last|at\(1\))|find\.byKey\(ValueKey\(['"](?:password|Password)['"]\))\)\s*,\s*)['"][^'"]*['"]/,
          `$1'${password.replace(/'/g, "\\'")}'`
        );

      // Pattern 2: Broader - if the AI used generic password placeholders
      if (cleaned.includes('password123') || cleaned.includes('your_actual') ||
          cleaned.includes('REPLACE') || cleaned.includes('placeholder') ||
          cleaned.match(/['"]pass(word)?['"]/i)) {
        cleaned = cleaned.replace(
          /(await\s+tester\.enterText\(\s*find\.byType\(Text(?:Form)?Field\)\.last\s*,\s*)['"][^'"]*['"]/,
          `$1'${password.replace(/'/g, "\\'")}'`
        );
      }
    }

    logger.info(`[IntegrationTest] Replaced placeholder credentials with actual values`);
  }

  return cleaned;
}

// ─── Execute Test via SSH ──────────────────────────────────────────────────────

async function executeTest(testFileName: string, noBuild: boolean = false): Promise<{ success: boolean; output: string; duration: number }> {
  const testFilePath = `${FLUTTER_PROJECT_PATH}/integration_test/${testFileName}`;
  const resultFile = `/tmp/flutter_test_result_${Date.now()}.txt`;
  const pidFile = `/tmp/flutter_test_pid_${Date.now()}.txt`;

  const javaHome = '/Users/clawbot/jdk17/Contents/Home';
  const androidHome = '/Users/clawbot/Library/Android/sdk';
  const flutterBin = FLUTTER_BIN;

  // --no-build skips APK compilation (uses previously installed app)
  const buildFlag = noBuild ? '--no-build' : '';
  const startCmd =
    `export JAVA_HOME="${javaHome}" && ` +
    `export ANDROID_HOME="${androidHome}" && ` +
    `export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:/opt/homebrew/bin:/usr/local/bin:$PATH" && ` +
    `cd "${FLUTTER_PROJECT_PATH}" && ` +
    `nohup ${flutterBin} test integration_test/${testFileName} -d SDE0219926003245 ${buildFlag} > "${resultFile}" 2>&1 & ` +
    `echo $! > "${pidFile}" && ` +
    `echo "PID:$(cat ${pidFile})"`;

  const startResult = await execSSH(startCmd, 15000);
  logger.info(`[IntegrationTest] Test start: ${startResult.output}${noBuild ? ' (no-build mode)' : ''}`);

  const pidMatch = startResult.output.match(/PID:(\d+)/);
  if (!pidMatch) {
    return {
      success: false,
      output: `Failed to start test. Output: ${startResult.output}`,
      duration: 0,
    };
  }

  const pid = pidMatch[1];
  const startTime = Date.now();
  const maxWait = 600000; // 10 minutes
  let lastOutputSize = 0;
  let stagnantChecks = 0;

  // Poll for completion
  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    try {
      // First, check if output file has completion/failure indicators
      const checkOutput = await execSSH(
        `wc -c < "${resultFile}" 2>/dev/null || echo 0`,
        10000
      );
      const currentSize = parseInt(checkOutput.output) || 0;
      
      // Read the last few lines to check for completion indicators
      const tailOutput = await execSSH(
        `tail -20 "${resultFile}" 2>/dev/null || echo "NO_OUTPUT"`,
        10000
      );
      
      const hasPassed = tailOutput.output.includes('All tests passed') || 
                        tailOutput.output.includes('+1:');
      const hasFailed = tailOutput.output.includes('FAILED') ||
                        tailOutput.output.includes('Error: ') ||
                        tailOutput.output.includes('Error:') ||
                        tailOutput.output.includes('Exception') ||
                        tailOutput.output.includes('BUILD FAILED') ||
                        tailOutput.output.includes('Exited (1)') ||
                        tailOutput.output.includes('target of URI does not exist') ||
                        tailOutput.output.includes('undefined name') ||
                        tailOutput.output.includes('This expression has type');
      
      // Process is done if we see completion indicators
      if (hasPassed || hasFailed) {
        // Give it a moment to finish writing
        await new Promise(r => setTimeout(r, 2000));
        
        const resultContent = await execSSH(`cat "${resultFile}" 2>/dev/null || echo "NO_OUTPUT"`, 10000);
        const duration = Date.now() - startTime;
        
        logger.info(`[IntegrationTest] Test completed in ${duration}ms`);
        
        // Clean up temp files
        try {
          await execSSH(`kill -9 ${pid} 2>/dev/null; rm -f "${resultFile}" "${pidFile}"`, 5000);
        } catch {}
        
        const output = resultContent.output;
        const success = output.includes('All tests passed') || 
                        (output.includes('+1:') && !output.includes('-1'));
        
        return {
          success,
          output,
          duration,
        };
      }
      
      // Also check if process is still running
      const checkProc = await execSSH(`kill -0 ${pid} 2>/dev/null && echo "running" || echo "done"`, 10000);

      if (checkProc.output.includes('done')) {
        // Process finished, read results
        const resultContent = await execSSH(`cat "${resultFile}" 2>/dev/null || echo "NO_OUTPUT"`, 10000);
        const duration = Date.now() - startTime;

        logger.info(`[IntegrationTest] Test completed in ${duration}ms`);

        // Clean up temp files
        try {
          await execSSH(`rm -f "${resultFile}" "${pidFile}"`, 5000);
        } catch {}

        const output = resultContent.output;
        const success = output.includes('All tests passed') || output.includes('+1:') || output.includes('+0:');
        const exitCodeMatch = output.match(/Exited \((\w+)\)/);
        const exitStatus = exitCodeMatch ? exitCodeMatch[1] : 'unknown';

        return {
          success: success || exitStatus === 'ok',
          output: output,
          duration,
        };
      }
      
      // Check if output has stopped growing (stagnant for 30+ seconds)
      if (currentSize === lastOutputSize && currentSize > 0) {
        stagnantChecks++;
        if (stagnantChecks >= 10) { // 30 seconds stagnant
          logger.warn(`[IntegrationTest] Output stagnant, killing process`);
          try {
            await execSSH(`kill -9 ${pid} 2>/dev/null`, 5000);
          } catch {}
          await new Promise(r => setTimeout(r, 2000));
          const resultContent = await execSSH(`cat "${resultFile}" 2>/dev/null || echo "NO_OUTPUT"`, 10000);
          const duration = Date.now() - startTime;
          
          try {
            await execSSH(`rm -f "${resultFile}" "${pidFile}"`, 5000);
          } catch {}
          
          return {
            success: false,
            output: resultContent.output + '\n\n[Test runner killed: output stopped growing]',
            duration,
          };
        }
      } else {
        lastOutputSize = currentSize;
        stagnantChecks = 0;
      }
    } catch (e) {
      logger.warn(`[IntegrationTest] Poll error: ${e}`);
    }
  }

  // Timeout - kill the process
  try {
    await execSSH(`kill -9 ${pid} 2>/dev/null; rm -f "${resultFile}" "${pidFile}"`, 10000);
  } catch {}

  const duration = Date.now() - startTime;
  return {
    success: false,
    output: `Test timed out after ${Math.round(duration / 1000)}s. Process ${pid} was killed.`,
    duration,
  };
}

async function executeTestWithRunner(testFileName: string, noBuild: boolean, runner: any | null, overrideProjectPath?: string): Promise<{ success: boolean; output: string; duration: number }> {
  if (!runner) return executeTest(testFileName, noBuild);

  const projectPath = overrideProjectPath || runner.projectPath;
  const deviceId = runner.deviceId || 'emulator-5554';

  // Use SFTP to write the test script, then execute it (avoids SSH shell escaping issues)
  const scriptPath = `/tmp/run_test_${Date.now()}.sh`;
  // Determine flutter path - use login shell to get correct PATH
  const scriptLines = [
    '#!/bin/bash -l',  // -l for login shell to load PATH with flutter
    `cd "${projectPath}"`,
    '# Run flutter pub get first (required before testing)',
    `echo "Running flutter pub get..."`,
    `flutter pub get 2>&1`,
    'PUB_EXIT=$?',
    'if [ $PUB_EXIT -ne 0 ]; then',
    '  echo "flutter pub get failed with exit code $PUB_EXIT"',
    '  echo "EXIT_CODE:$PUB_EXIT"',
    '  exit $PUB_EXIT',
    'fi',
    `echo "Running test..."${noBuild ? ' (no-build mode - skipping APK build)' : ''}`,
    `flutter test integration_test/${testFileName} -d ${deviceId} ${noBuild ? '--no-build' : ''} 2>&1`,
    'echo "EXIT_CODE:$?"',
  ];
  const scriptContent = scriptLines.join('\n') + '\n';

  logger.info(`[IntegrationTest] Running test on ${runner.name}: ${testFileName} (project: ${projectPath})`);
  const startTime = Date.now();

  try {
    // Step 1: SFTP write the script
    const sftpResult = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      const client = new (require('ssh2').Client)();
      const timer = setTimeout(() => { try { client.end(); } catch {} reject(new Error('SFTP timeout')); }, 30000);
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) { client.end(); clearTimeout(timer); reject(err); return; }
          const writeStream = sftp.createWriteStream(scriptPath, { mode: 0o755 });
          writeStream.on('close', () => { client.end(); clearTimeout(timer); resolve({ success: true }); });
          writeStream.on('error', (e) => { client.end(); clearTimeout(timer); reject(e); });
          writeStream.end(scriptContent);
        });
      });
      client.on('error', e => { clearTimeout(timer); reject(e); });
      client.connect({ host: runner.host, username: runner.username, privateKey: fs.readFileSync(runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519'), readyTimeout: 15000 });
    });

    if (!sftpResult.success) throw new Error('Failed to write script via SFTP');

    // Step 2: Execute the script (shebang has -l for login shell)
    const execCmd = `"${scriptPath}"`;
    const result = await execSSHWithConfig(execCmd, {
      host: runner.host,
      username: runner.username,
      sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
    }, 600000); // 10 minute timeout for flutter test

    const duration = Date.now() - startTime;
    const output = result.output;
    const exitMatch = output.match(/EXIT_CODE:(\d+)/);
    const exitCode = exitMatch ? parseInt(exitMatch[1]) : -1;
    const success = exitCode === 0;

    logger.info(`[IntegrationTest] Test ${success ? 'passed' : 'failed'} on ${runner.name} in ${duration}ms (exit: ${exitCode})`);
    return { success, output, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(`[IntegrationTest] Test error on ${runner.name}: ${error.message}`);
    return { success: false, output: `Error: ${error.message}`, duration };
  }
}


// ─── Deterministic Code Generator (from user selections) ───────────────────────

export function generateTestFromElements(
  catalog: ElementCatalog,
  steps: Array<{
    type: string;
    elementId?: string;
    value?: string;
    value2?: string;
    text?: string;
  }>,
  _credentials?: { email: string; password: string },
): string {
  const pkg = catalog.packageName;
  const isOnFieldSubmitted = catalog.auth?.flow === 'onFieldSubmitted';

  // Safety net: if credentials provided, fill empty enterText values
  let finalSteps = steps.map(s => {
    if (s.type === 'enter_text' && (!s.value || s.value === '')) {
      // Try to infer from elementId or fill from credentials
      const input = catalog.inputs.find(i => i.id === s.elementId);
      if (input && input.label.toLowerCase().includes('email')) return { ...s, value: _credentials?.email || '' };
      if (input && (input.label.toLowerCase().includes('pass') || input.label.toLowerCase().includes('password'))) return { ...s, value: _credentials?.password || '' };
    }
    return s;
  });

  let code = `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:${pkg}/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Generated Test Scenario', (WidgetTester tester) async {
    app.main();
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

`;

  // Helper: build a Dart finder string from any catalog element (button/input/text)
  const buildFinder = (elementId?: string): string => {
    if (!elementId) return `find.text('Element')`;

    // Try buttons first (has richest finderStrategy)
    const button = catalog.buttons.find(b => b.id === elementId);
    if (button?.finderStrategy) {
      switch (button.finderStrategy) {
        case 'text': return `find.text('${button.finderValue}')`;
        case 'icon': return `find.byIcon(Icons.${button.finderValue})`;
        case 'key': return `find.byKey(const ValueKey('${button.finderValue}'))`;
        case 'tooltip': return `find.byTooltip('${button.finderValue}')`;
        case 'semantics': return `find.bySemanticsLabel('${button.finderValue}')`;
        case 'type': return `find.byType(${button.finderValue})`;
      }
    }
    if (button?.iconName) return `find.byIcon(Icons.${button.iconName})`;
    if (button?.text) return `find.text('${button.text}')`;

    // Try inputs
    const input = catalog.inputs.find(i => i.id === elementId);
    if (input) {
      if (input.finderStrategy === 'key') return `find.byKey(const ValueKey('${input.finderValue}'))`;
      if (input.finderStrategy === 'label') return `find.text('${input.finderValue}')`;
      const idx = catalog.inputs.indexOf(input);
      return idx >= 0 ? `find.byType(${input.type}).at(${idx})` : `find.byType(${input.type}).first`;
    }

    // Try texts
    const text = catalog.texts.find(t => t.id === elementId);
    if (text?.finderStrategy === 'key') return `find.byKey(const ValueKey('${text.finderValue}'))`;
    if (text?.text) return `find.text('${text.text}')`;

    return `find.text('Element')`;
  };

  for (const step of finalSteps) {
    switch (step.type) {
      case 'enter_text': {
        const input = catalog.inputs.find(i => i.id === step.elementId);
        const value = step.value || '';
        // Use finderStrategy if available, fallback to index-based
        let finder: string;
        if (input?.finderStrategy === 'key') {
          finder = `find.byKey(const ValueKey('${input.finderValue}'))`;
        } else if (input?.finderStrategy === 'label') {
          finder = `find.text('${input.finderValue}')`;
        } else {
          const fieldType = input?.type || 'TextField';
          const inputIndex = input ? catalog.inputs.indexOf(input) : -1;
          finder = inputIndex >= 0
            ? `find.byType(${fieldType}).at(${inputIndex})`
            : `find.byType(${fieldType}).first`;
        }
        // On real devices, must tap the field first to focus it (opens keyboard)
        code += `    await tester.tap(${finder});\n`;
        code += `    await tester.pumpAndSettle();\n`;
        code += `    await tester.enterText(${finder}, '${value}');\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'tap': {
        const button = catalog.buttons.find(b => b.id === step.elementId) as any;
        const btnText = button?.text || step.text || 'Button';

        // Longer delay to let keyboard auto-dismiss from previous text entry
        code += `    await tester.pump(const Duration(milliseconds: 500));\n`;

        // Smart selector: try multiple finder strategies with fallback
        // Priority: key > semantics/tooltip > text > type > icon
        const tryTapStrategies = (primaryFinder?: string, fallbackFinders?: string[]) => {
          if (primaryFinder) {
            code += `    // Try primary finder first\n`;
            code += `    try {\n`;
            code += `      await tester.tap(${primaryFinder});\n`;
            code += `      await tester.pumpAndSettle();\n`;
            code += `    } catch (e) {\n`;
            if (fallbackFinders && fallbackFinders.length > 0) {
              fallbackFinders.forEach((fallback, idx) => {
                code += `      try {\n`;
                code += `        await tester.tap(${fallback});\n`;
                code += `        await tester.pumpAndSettle();\n`;
                if (idx < fallbackFinders.length - 1) {
                  code += `      } catch (e${idx + 1}) {\n`;
                } else {
                  code += `      } catch (e2) {\n`;
                  code += `        throw Exception('Failed to tap button: all strategies failed');\n`;
                  code += `      }\n`;
                }
              });
            } else {
              code += `      throw e;\n`;
            }
            code += `    }\n`;
          } else {
            // No primary finder, use fallback only
            if (fallbackFinders && fallbackFinders.length > 0) {
              fallbackFinders.forEach((fallback, idx) => {
                code += `    try {\n`;
                code += `      await tester.tap(${fallback});\n`;
                if (idx < fallbackFinders.length - 1) {
                  code += `      await tester.pumpAndSettle();\n`;
                  code += `    } catch (e${idx}) {\n`;
                } else {
                  code += `      await tester.pumpAndSettle();\n`;
                }
              });
              // Close all try-catch blocks
              for (let i = 1; i < fallbackFinders.length; i++) {
                code += `    }\n`;
              }
            }
          }
        };

        // Build finder strategies based on button properties
        if (button?.finderStrategy === 'key') {
          // Key is most reliable - use directly
          code += `    await tester.tap(find.byKey(const ValueKey('${button.finderValue}')));\n`;
        } else if (button?.finderStrategy === 'semantics') {
          code += `    await tester.tap(find.bySemanticsLabel('${button.finderValue}'));\n`;
        } else if (button?.finderStrategy === 'tooltip') {
          code += `    await tester.tap(find.byTooltip('${button.finderValue}'));\n`;
        } else {
          // For text/type/icon finders, use smart fallback
          const fallbackFinders: string[] = [];

          if (button?.finderStrategy === 'text') {
            fallbackFinders.push(`find.text('${button.finderValue}')`);
          }
          if (button?.type) {
            fallbackFinders.push(`find.byType(${button.type}).first`);
          }
          if (button?.iconName) {
            fallbackFinders.push(`find.byIcon(Icons.${button.iconName})`);
          }
          if (button?.text && button?.finderStrategy !== 'text') {
            fallbackFinders.push(`find.text('${button.text}')`);
          }

          tryTapStrategies(undefined, fallbackFinders);
        }

        code += `    await tester.pump(const Duration(seconds: 2));\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'hide_keyboard': {
        code += `    await tester.testTextInput.receiveAction(TextInputAction.done);\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'double_tap': {
        const finder = buildFinder(step.elementId);
        code += `    await tester.tap(${finder}, tapCount: 2);\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'long_press': {
        const finder = buildFinder(step.elementId);
        code += `    await tester.longPress(${finder});\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'scroll': {
        const dy = step.value || '-300';
        const dx = step.value2 || '0';
        code += `    await tester.dragFrom(tester.getCenter(find.byType(ScrollView)), Offset(${dx}, ${dy}));\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'scroll_until_visible': {
        const finder = buildFinder(step.elementId);
        code += `    await tester.ensureVisible(${finder});\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'send_key': {
        const key = step.value || 'LogicalKeyboardKey.escape';
        if (key === 'closeConnection') {
          code += `    tester.testTextInput.closeConnection();\n`;
        } else if (key === 'receiveAction') {
          code += `    await tester.testTextInput.receiveAction(TextInputAction.done);\n`;
        } else {
          code += `    await tester.sendKeyEvent(${key});\n`;
        }
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'assert_text': {
        const textValue = step.text || 'Text';
        code += `    expect(find.textContaining('${textValue}'), findsOneWidget);\n`;
        break;
      }
      case 'screenshot': {
        code += `    final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized() as IntegrationTestWidgetsFlutterBinding;\n`;
        code += `    await binding.convertFlutterSurfaceToImage();\n`;
        code += `    await tester.pumpAndSettle();\n`;
        code += `    // Screenshot will be saved to test_outputs\n`;
        break;
      }
      case 'set_surface_size': {
        const w = step.value || '375';
        const h = step.value2 || '812';
        code += `    tester.view.physicalSize = Size(${w}, ${h});\n`;
        code += `    tester.view.devicePixelRatio = 1.0;\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
      case 'assert_visible': {
        const finder = buildFinder(step.elementId);
        code += `    expect(${finder}, findsOneWidget);\n`;
        break;
      }
      case 'assert_not_visible': {
        const finder = buildFinder(step.elementId);
        code += `    expect(${finder}, findsNothing);\n`;
        break;
      }
      case 'wait': {
        const duration = step.value || '2';
        code += `    await tester.pump(const Duration(seconds: ${duration}));\n`;
        code += `    await tester.pumpAndSettle();\n`;
        break;
      }
    }
  }

  code += `  });\n}\n`;
  return code;
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
      logger.info(`[IntegrationTest] Request credentials: ${JSON.stringify(credentials)}`);

      // Step 0: Discover app context dynamically
      const appContext = await discoverAppContext();
      logger.info(`[IntegrationTest] Discovered app context: pkg=${appContext.mainDart ? 'yes' : 'no'}, login=${appContext.loginButton}, fields=${appContext.fieldTypes}`);

      // Step 1: Capture hierarchy via SSH
      const hierarchy = await captureHierarchy();
      logger.info(`[IntegrationTest] Captured hierarchy (${hierarchy.length} chars)`);

      // Step 2: Generate Dart code via AI (with dynamic app context)
      const dartCode = await generateDartCodeWithFixups(hierarchy, scenario, credentials, appContext);
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

      // Step 0: Discover app context dynamically
      const appContext = await discoverAppContext();
      logger.info(`[IntegrationTest] Discovered app context: pkg=${appContext.mainDart ? 'yes' : 'no'}, login=${appContext.loginButton}, fields=${appContext.fieldTypes}`);

      // Step 1: Capture hierarchy via SSH
      const hierarchy = await captureHierarchy();
      logger.info(`[IntegrationTest] Captured hierarchy (${hierarchy.length} chars)`);

      // Step 2: Generate Dart code via AI (with dynamic app context)
      const dartCode = await generateDartCodeWithFixups(hierarchy, scenario, credentials, appContext);
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

  // POST /save-as-testcase - Save generated test as a test case document
  fastify.post('/save-as-testcase', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { dartCode, testResult, runnerId } = request.body as {
        dartCode: string;
        testResult?: { success: boolean; output: string; duration: number };
        runnerId?: string;
      };
      if (!dartCode) return errorResponses.validation(reply, [{ field: 'dartCode', message: 'Dart code is required' }]);

      // Find runner info
      let runner: any = null;
      if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
      if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });

      // Extract test metadata from Dart code
      const titleMatch = dartCode.match(/testWidgets\(\s*['"]([^'"]+)['"]/);
      const title = titleMatch?.[1] || 'Generated Integration Test';

      // Extract steps from Dart code using regex
      const steps: Array<{ order: number; description: string; expected: string }> = [];
      let order = 1;

      // Match tap actions
      const tapMatches = dartCode.matchAll(/await tester\.tap\((.+?)\)/g);
      for (const match of tapMatches) {
        const finder = match[1].trim();
        let desc = `Tap on ${finder}`;
        if (finder.includes("find.text('")) desc = `Tap on "${finder.match(/find\.text\('([^']+)'\)/)?.[1]}"`;
        else if (finder.includes("find.byIcon(Icons.")) desc = `Tap on ${finder.match(/find\.byIcon\(Icons\.(\w+)\)/)?.[1]} icon`;
        else if (finder.includes("find.byType(")) desc = `Tap on ${finder.match(/find\.byType\((\w+)\)/)?.[1]} widget`;
        steps.push({ order: order++, description: desc, expected: 'Widget responds' });
      }

      // Match enterText actions
      const enterMatches = dartCode.matchAll(/await tester\.enterText\((.+?),\s*['"]([^'"]+)['"]\)/g);
      for (const match of enterMatches) {
        const value = match[2];
        let desc = `Enter text`;
        if (match[1].includes('.at(0)') || match[1].includes('.first')) desc = `Enter email: "${value}"`;
        else if (match[1].includes('.at(1)') || match[1].includes('.last')) desc = `Enter password: "${value}"`;
        else desc = `Enter "${value}"`;
        steps.push({ order: order++, description: desc, expected: 'Text is displayed' });
      }

      // Match receiveAction
      if (dartCode.includes('receiveAction')) {
        steps.push({ order: order++, description: 'Submit form (keyboard done)', expected: 'Form submitted' });
      }

      // Match assertions
      const expectMatches = dartCode.matchAll(/expect\((.+?),\s*(.+?)\)/g);
      for (const match of expectMatches) {
        const finder = match[1];
        const matcher = match[2];
        let desc = 'Assert';
        let expected = 'Assertion passed';
        if (matcher.includes('findsOneWidget')) { desc = `Verify ${finder} is visible`; expected = 'Widget is found'; }
        else if (matcher.includes('findsNothing')) { desc = `Verify ${finder} is gone`; expected = 'Widget not found'; }
        else { desc = `Assert: ${match[0]}`; expected = 'Assertion passed'; }
        steps.push({ order: order++, description: desc, expected });
      }

      // Match wait/pump
      const waitMatches = dartCode.matchAll(/await tester\.pump\(const Duration\((seconds|milliseconds):\s*(\d+)\)\)/g);
      for (const match of waitMatches) {
        const unit = match[1] === 'milliseconds' ? 'ms' : 's';
        steps.push({ order: order++, description: `Wait ${match[2]}${unit}`, expected: 'UI updates' });
      }

      // Build description
      const description = `Integration test: ${title}\n\n` +
        `Runner: ${runner?.name || 'Unknown'}\n` +
        `Device: ${runner?.deviceId || 'Unknown'}\n` +
        (testResult ? `Result: ${testResult.success ? 'PASSED' : 'FAILED'} in ${(testResult.duration / 1000).toFixed(1)}s` : 'Not yet executed');

      // Determine priority
      const isLogin = title.toLowerCase().includes('login') || dartCode.toLowerCase().includes('password');
      const priority = isLogin ? 'critical' as const : 'high' as const;

      // Get user ID from request
      const userId = (request.user as any)?.userId;
      if (!userId) return errorResponses.validation(reply, [{ field: 'user', message: 'Authentication required' }]);

      // Save test case - match actual table schema column order
      const testCaseId = require('crypto').randomUUID();
      const tagsList = ['integration-test', runner ? `runner:${runner.name}` : 'default', isLogin ? 'auth' : 'e2e'].filter(Boolean);
      const pgArray = '{' + tagsList.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',') + '}';
      const expectedResult = testResult?.success ? 'All assertions passed' : 'Test completed';
      const statusVal = testResult?.success ? 'active' : 'draft';
      const customFields = JSON.stringify({ dartCode, testOutput: testResult?.output || '', runnerId: runner?.id || null, runnerName: runner?.name || null, deviceId: runner?.deviceId || null });
      const stepsJson = JSON.stringify(steps);

      // Insert with proper column order matching actual DB schema
      const sql = `
        INSERT INTO test_cases 
          (id, title, description, steps, expected_result, priority, automation_type, suite_id, created_by, created_at, updated_at, version, status, custom_fields, tags)
        VALUES 
          ($1, $2, $3, $4::jsonb, $5, $6::"TestCasePriority", 'automated'::"AutomationType", NULL, $9::text, NOW(), NOW(), 1, $7::"TestCaseStatus", $8::jsonb, $10::text[])
      `;
      
      await prisma.$executeRawUnsafe(sql, testCaseId, title, description, stepsJson, expectedResult, priority, statusVal, customFields, userId, pgArray);

      // Also save to integration_tests table
      await prisma.integrationTest.create({
        data: {
          name: title,
          dartCode,
          appId: runner?.name || 'unknown',
          scenario: JSON.stringify({ steps, testResult }),
        },
      });

      logger.info(`[TestCase] Saved "${title}" (${steps.length} steps) to test_cases`);
      return successResponse(reply, { id: testCaseId, title, stepCount: steps.length }, undefined);
    } catch (error: any) {
      logger.error('[TestCase] Error saving test case:', error);
      return errorResponses.handle(reply, error, 'save test case');
    }
  });

  // POST /run-testcase/:id - Re-run a saved test case
  fastify.post('/run-testcase/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const { runnerId, noBuild = false } = (request.body as any) || {};

      // Fetch test case from DB
      const tc = await prisma.testCase.findUnique({ where: { id } });
      if (!tc) return errorResponses.validation(reply, [{ field: 'id', message: 'Test case not found' }]);

      const dartCode = (tc as any).customFields?.dartCode;
      if (!dartCode) return errorResponses.validation(reply, [{ field: 'dartCode', message: 'No generated code in this test case' }]);

      // Find runner
      let runner: any = null;
      if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
      if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });

      logger.info(`[TestRun] Re-running test case "${tc.title}" on runner: ${runner?.name || 'default'}`);

      // Write test file
      const testFileName = `visual_builder_${Date.now()}.dart`;
      const projectPath = runner?.projectPath || FLUTTER_PROJECT_PATH;
      const testFilePath = `${projectPath}/integration_test/${testFileName}`;
      if (runner) {
        await writeFileSSHWithRunner(testFilePath, dartCode, runner);
      } else {
        await writeFileSSH(testFilePath, dartCode);
      }

      // Execute
      const result = await executeTestWithRunner(testFileName, noBuild, runner);
      logger.info(`[TestRun] Test "${tc.title}" ${result.success ? 'passed' : 'failed'} in ${result.duration}ms`);

      // Update test case status
      await prisma.testCase.update({
        where: { id },
        data: { status: result.success ? 'active' as const : 'draft' as const },
      });

      return successResponse(reply, { ...result, testCaseId: id, testCaseTitle: tc.title }, undefined);
    } catch (error: any) {
      logger.error('[TestRun] Error running test case:', error);
      return errorResponses.handle(reply, error, 'run test case');
    }
  });

  // ─── Runner Management ──────────────────────────────────────────────────────

  // GET /runners - List all runners
  fastify.get('/runners', {
    onRequest: [fastify.authenticate],
  }, async (_request: any, reply) => {
    try {
      const runners = await prisma.runner.findMany({ orderBy: { createdAt: 'asc' } });
      return successResponse(reply, runners, undefined);
    } catch (error: any) {
      return errorResponses.handle(reply, error, 'list runners');
    }
  });

  // POST /runners - Create runner
  fastify.post('/runners', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { name, host, username, projectPath, deviceId, isDefault } = request.body as any;
      const runner = await prisma.runner.create({
        data: {
          name, host,
          username: username || 'clawbot',
          projectPath,
          deviceId: deviceId || null,
          isDefault: isDefault || false,
        },
      });
      logger.info(`[Runners] Created runner: ${name}`);
      return successResponse(reply, runner, undefined);
    } catch (error: any) {
      return errorResponses.handle(reply, error, 'create runner');
    }
  });

  // PUT /runners/:id - Update runner
  fastify.put('/runners/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      const data = request.body as any;
      const runner = await prisma.runner.update({ where: { id }, data });
      return successResponse(reply, runner, undefined);
    } catch (error: any) {
      return errorResponses.handle(reply, error, 'update runner');
    }
  });

  // DELETE /runners/:id - Delete runner
  fastify.delete('/runners/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params;
      await prisma.runner.delete({ where: { id } });
      return successResponse(reply, { deleted: true }, undefined);
    } catch (error: any) {
      return errorResponses.handle(reply, error, 'delete runner');
    }
  });

  // ─── New: Visual Test Builder Endpoints ──────────────────────────────────────

  // POST /run-generated - Run pre-generated deterministic test code
  fastify.post('/run-generated', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { dartCode, credentials, noBuild = false, runnerId, projectPath } = request.body as {
        dartCode: string;
        credentials?: { email: string; password: string };
        noBuild?: boolean;
        runnerId?: string;
        projectPath?: string;
      };
      if (!dartCode) return errorResponses.validation(reply, [{ field: 'dartCode', message: 'Dart code is required' }]);

      // Find runner
      let runner = null;
      if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
      if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });

      const testProjectPath = projectPath || runner?.projectPath || FLUTTER_PROJECT_PATH;

      logger.info(`[IntegrationTest] Running pre-generated test code (${dartCode.length} chars) on runner: ${runner?.name || 'default'} (project: ${testProjectPath})`);

      // Apply credential replacement
      let finalCode = dartCode;
      if (credentials?.email && credentials?.password) {
        finalCode = dartCode
          .replace(/'test@example\.com'|'user@test\.com'|'email@example\.com'/g, `'${credentials.email}'`)
          .replace(/'password123'|'password'|'pass123'/g, `'${credentials.password}'`)
          .replace(/(\.first,\s*)''/g, `$1'${credentials.email}'`)
          .replace(/(\.last,\s*)''/g, `$1'${credentials.password}'`);
        logger.info(`[IntegrationTest] Replaced placeholder credentials in code`);
      }

      // Write test file
      const testFileName = `visual_builder_${Date.now()}.dart`;
      const testFilePath = `${testProjectPath}/integration_test/${testFileName}`;

      if (runner) {
        await writeFileSSHWithRunner(testFilePath, finalCode, runner);
      } else {
        await writeFileSSH(testFilePath, finalCode);
      }
      logger.info(`[IntegrationTest] Wrote test to ${testFilePath}`);

      // Execute
      const result = await executeTestWithRunner(testFileName, noBuild, runner, testProjectPath);
      logger.info(`[IntegrationTest] Test ${result.success ? 'passed' : 'failed'} in ${result.duration}ms`);

      return successResponse(reply, result, undefined);
    } catch (error: any) {
      logger.error('[IntegrationTest] Error running generated test:', error);
      return errorResponses.handle(reply, error, 'run generated test');
    }
  });

  // POST /scan - Scan Flutter codebase and return element catalog
  fastify.post('/scan', {
    onRequest: [fastify.authenticate],
  }, async (_request: any, reply) => {
    try {
      // Find default runner config
      let runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!runner) return errorResponses.validation(reply, [{ field: 'runner', message: 'No runner configured. Set up a runner in Visual Test Builder first.' }]);

      const catalog = await scanFlutterProjectSSH({
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        projectPath: runner.projectPath,
        deviceId: runner.deviceId,
      });
      logger.info(`[ElementCatalog] Found ${catalog.screens.length} screens, ${catalog.inputs.length} inputs, ${catalog.buttons.length} buttons from ${runner.name}`);
      return successResponse(reply, catalog, undefined);
    } catch (error: any) {
      logger.error('[ElementCatalog] Scan failed:', error);
      return errorResponses.handle(reply, error, 'scan flutter project');
    }
  });

  // POST /scan-github - Download from GitHub and scan
  fastify.post('/scan-github', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { url, branch = 'main', token } = request.body as { url: string; branch?: string; token?: string };
      if (!url) return errorResponses.validation(reply, [{ field: 'url', message: 'GitHub URL is required' }]);

      // Parse GitHub URL
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return errorResponses.validation(reply, [{ field: 'url', message: 'Invalid GitHub URL' }]);
      const [, owner, repo] = match;
      const cleanRepo = repo.replace(/\.git$/, '');
      const zipUrl = `https://github.com/${owner}/${cleanRepo}/archive/refs/heads/${branch}.zip`;

      logger.info(`[ElementCatalog] Downloading from GitHub: ${owner}/${cleanRepo} (${branch})`);

      // Download ZIP
      const scanDir = '/app/scans';
      if (!fs.existsSync(scanDir)) fs.mkdirSync(scanDir, { recursive: true });

      const tempZip = path.join(scanDir, `${cleanRepo}-${Date.now()}.zip`);
      const extractDir = path.join(scanDir, `${cleanRepo}-${Date.now()}`);

      // Download
      const zipStream = fs.createWriteStream(tempZip);
      await new Promise<void>((resolve, reject) => {
        const headers: Record<string, string> = { 'User-Agent': 'TestRails' };
        if (token) headers.Authorization = `Bearer ${token}`;
        https.get(zipUrl, { headers }, (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            https.get(res.headers.location!, { headers }, (res2) => {
              res2.pipe(zipStream);
              zipStream.on('finish', () => { zipStream.close(); resolve(); });
            }).on('error', reject);
          } else if (res.statusCode === 200) {
            res.pipe(zipStream);
            zipStream.on('finish', () => { zipStream.close(); resolve(); });
          } else {
            reject(new Error(`GitHub returned ${res.statusCode}`));
          }
        }).on('error', reject);
      });

      // Extract
      const zip = new AdmZip(tempZip);
      zip.extractAllTo(extractDir, true);

      // Find the extracted folder (GitHub ZIP extracts to repo-name-branch/)
      const extractedFolders = fs.readdirSync(extractDir);
      const appDir = path.join(extractDir, extractedFolders[0]);

      // Scan
      logger.info(`[ElementCatalog] Scanning extracted app: ${appDir}`);
      const catalog = await scanFlutterProjectLocal(appDir, 'github', url);

      // Cleanup ZIP
      fs.unlinkSync(tempZip);

      logger.info(`[ElementCatalog] Found ${catalog.screens.length} screens from GitHub`);
      return successResponse(reply, catalog, undefined);
    } catch (error: any) {
      logger.error('[ElementCatalog] GitHub scan failed:', error);
      return errorResponses.handle(reply, error, 'scan from GitHub');
    }
  });

  // GET /catalog - Get element catalog
  fastify.get('/catalog', {
    onRequest: [fastify.authenticate],
  }, async (_request: any, reply) => {
    try {
      let runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!runner) return errorResponses.validation(reply, [{ field: 'runner', message: 'No runner configured.' }]);

      const catalog = await scanFlutterProjectSSH({
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        projectPath: runner.projectPath,
        deviceId: runner.deviceId,
      });
      return successResponse(reply, catalog, undefined);
    } catch (error: any) {
      logger.error('[ElementCatalog] Failed to fetch catalog:', error);
      return errorResponses.handle(reply, error, 'fetch element catalog');
    }
  });

  // POST /scan-hybrid - Hybrid scan (static + API inference)
  fastify.post('/scan-hybrid', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId, projectPath } = request.body as { runnerId?: string; projectPath?: string };

      // Find runner
      let runner = runnerId 
        ? await prisma.runner.findUnique({ where: { id: runnerId } })
        : await prisma.runner.findFirst({ where: { isDefault: true } });
      
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!runner) return errorResponses.validation(reply, [{ field: 'runner', message: 'No runner configured. Set up a runner in Visual Test Builder first.' }]);

      const scanPath = projectPath || runner.projectPath;

      // Step 1: Run static scan
      logger.info('[HybridScanner] Running static scan...');
      const staticResult = await scanFlutterProjectSSH({
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        projectPath: scanPath,
        deviceId: runner.deviceId,
      });
      logger.info(`[HybridScanner] Static scan: ${staticResult.screens.length} screens, ${staticResult.texts.length} texts`);

      // Step 2: Run hybrid scan (API inference)
      logger.info('[HybridScanner] Running API inference scan...');
      const hybridConfig: HybridScannerConfig = {
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        projectPath: scanPath,
      };
      const hybridResult = await hybridScanFlutterProject(hybridConfig, staticResult);

      // Step 3: Merge results
      const mergedResult = mergeScanResults(staticResult, hybridResult);

      logger.info(`[HybridScanner] Complete: ${hybridResult.apiEndpoints.length} API endpoints, ${hybridResult.dynamicContentHints.length} dynamic hints`);
      return successResponse(reply, mergedResult, undefined);
    } catch (error: any) {
      logger.error('[HybridScanner] Scan failed:', error);
      return errorResponses.handle(reply, error, 'hybrid scan flutter project');
    }
  });

  // POST /generate-deterministic - Generate Dart code from user-selected elements
  fastify.post('/generate-deterministic', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { steps, credentials, projectPath } = request.body as {
        steps: Array<{ type: string; elementId?: string; value?: string; value2?: string; text?: string }>;
        credentials?: { email: string; password: string };
        projectPath?: string;
      };

      if (!steps || steps.length === 0) {
        return errorResponses.validation(reply, [{ field: 'steps', message: 'At least one step is required' }]);
      }

      let runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!runner) return errorResponses.validation(reply, [{ field: 'runner', message: 'No runner configured.' }]);

      const scanPath = projectPath || runner.projectPath;
      const catalog = await scanFlutterProjectSSH({
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        projectPath: scanPath,
        deviceId: runner.deviceId,
      });
      const dartCode = generateTestFromElements(catalog, steps, credentials);
      const fileName = `generated_test_${Date.now()}.dart`;

      logger.info(`[TestBuilder] Generated deterministic test code with ${steps.length} steps (project: ${scanPath})`);
      return successResponse(reply, { dartCode, fileName, catalog }, undefined);
    } catch (error: any) {
      logger.error('[TestBuilder] Generation failed:', error);
      return errorResponses.handle(reply, error, 'generate deterministic test');
    }
  });
}
