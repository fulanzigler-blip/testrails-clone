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
import { getScanCacheKey, deleteCachedKey } from '../utils/scan-cache';
import { scanFlutterProjectLocal } from '../utils/element-scanner';
import { hybridScanFlutterProject, mergeScanResults, HybridScannerConfig } from '../utils/element-scanner-hybrid';

// Modular utilities (refactored from this file)
import { execSSH, writeFileSSH, writeFileSSHWithRunner, execSSHWithConfig, execSSHBinary, type SSHRunnerConfig } from '../utils/ssh-client';
import { discoverAppContext, captureHierarchy, getFlutterProjectPath } from '../utils/flutter-scanner';
import { generateDartCode } from '../utils/dart-codegen';
import { startFlutterSession, stopFlutterSession, getSession, listSessions, vmServiceRpc } from '../utils/flutter-session';
import { parseWidgetTree } from '../utils/flutter-vm-service';
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
  const ts = Date.now();
  const scriptPath = `/tmp/run_test_${ts}.sh`;
  const tempKeyPath = `/tmp/gh_key_${ts}`;
  const sshKeyPath = runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519';

  const scriptLines = [
    '#!/bin/bash -l',
    `cd "${projectPath}"`,
  ];

  // Workaround for macOS 13 + newer Flutter: bypass VM version check
  const flutterEnv = [
    'export DART_VM_OPTIONS="--no-enable-macos-version-check"',
    'export FLUTTER_ROOT="/Users/clawbot/development/flutter"',
    'export PATH="/Users/clawbot/development/flutter/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"',
  ].join(' && ');

  if (noBuild) {
    // Use the forwarded SSH key for git to access private repos
    scriptLines.push(
      flutterEnv,
      `echo "Running flutter pub get (using forwarded SSH key)..."`,
      `GIT_SSH_COMMAND="ssh -i ${tempKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" flutter pub get 2>&1`,
      'PUB_EXIT=$?',
      `rm -f ${tempKeyPath}`,
      'if [ $PUB_EXIT -ne 0 ]; then',
      '  echo "flutter pub get failed with exit code $PUB_EXIT"',
      '  echo "EXIT_CODE:$PUB_EXIT"',
      '  exit $PUB_EXIT',
      'fi',
    );
  } else {
    scriptLines.push(
      flutterEnv,
      `echo "Running flutter pub get..."`,
      `flutter pub get 2>&1`,
      'PUB_EXIT=$?',
      'if [ $PUB_EXIT -ne 0 ]; then',
      '  echo "flutter pub get failed with exit code $PUB_EXIT"',
      '  echo "EXIT_CODE:$PUB_EXIT"',
      '  exit $PUB_EXIT',
      'fi',
    );
  }

  scriptLines.push(
    `echo "Running test..."`,
    `${flutterEnv} flutter test integration_test/${testFileName} -d ${deviceId}${noBuild ? ' --no-pub' : ''} 2>&1`,
    'echo "EXIT_CODE:$?"',
  );
  const scriptContent = scriptLines.join('\n') + '\n';

  logger.info(`[IntegrationTest] Running test on ${runner.name}: ${testFileName} (project: ${projectPath})`);
  const startTime = Date.now();

  try {
    // Step 1: SFTP — write the script and (if noBuild) the SSH key for private repo access
    const sftpResult = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      const client = new (require('ssh2').Client)();
      const timer = setTimeout(() => { try { client.end(); } catch {} reject(new Error('SFTP timeout')); }, 30000);
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) { client.end(); clearTimeout(timer); reject(err); return; }

          const writeScript = () => {
            const writeStream = sftp.createWriteStream(scriptPath, { mode: 0o755 });
            writeStream.on('close', () => { client.end(); clearTimeout(timer); resolve({ success: true }); });
            writeStream.on('error', (e: Error) => { client.end(); clearTimeout(timer); reject(e); });
            writeStream.end(scriptContent);
          };

          if (noBuild) {
            // Upload the server SSH key to runner so git can use it for private repos
            const keyContent = fs.readFileSync(sshKeyPath);
            const keyStream = sftp.createWriteStream(tempKeyPath, { mode: 0o600 });
            keyStream.on('close', writeScript);
            keyStream.on('error', (e: Error) => { client.end(); clearTimeout(timer); reject(e); });
            keyStream.end(keyContent);
          } else {
            writeScript();
          }
        });
      });
      client.on('error', e => { clearTimeout(timer); reject(e); });
      client.connect({ host: runner.host, username: runner.username, privateKey: fs.readFileSync(sshKeyPath), readyTimeout: 15000 });
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
        // Live-view step: use finderStrategy/finderValue directly
        if (!input && (step as any).finderStrategy && (step as any).finderValue) {
          const fs = (step as any).finderStrategy as string;
          const fv = (step as any).finderValue as string;
          finder =
            fs === 'text'      ? `find.text('${fv}')` :
            fs === 'semantics' ? `find.bySemanticsLabel('${fv}')` :
            fs === 'key'       ? `find.byKey(const ValueKey('${fv}'))` :
                                 `find.byType(${fv}).first`;
        } else if (input?.finderStrategy === 'key') {
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

        // Live-view steps carry finderStrategy/finderValue — use them directly
        if (!button && (step as any).finderStrategy && (step as any).finderValue) {
          const fs = (step as any).finderStrategy as string;
          const fv = (step as any).finderValue as string;
          const finder =
            fs === 'text'      ? `find.text('${fv}')` :
            fs === 'semantics' ? `find.bySemanticsLabel('${fv}')` :
            fs === 'key'       ? `find.byKey(const ValueKey('${fv}'))` :
                                 `find.byType(${fv})`;
          code += `    await tester.tap(${finder});\n`;
          code += `    await tester.pumpAndSettle();\n`;
          code += `    await tester.pump(const Duration(seconds: 2));\n`;
          code += `    await tester.pumpAndSettle();\n`;
          break;
        }

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

  // ─── Live View: screenshot + tap + element-at ────────────────────────────────

  // Parse UIAutomator XML and find the deepest (smallest) element containing (x, y)
  function findElementAt(xml: string, x: number, y: number) {
    // Bounds format: [x1,y1][x2,y2]
    const boundsRe = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
    const nodeRe = /<node\s+([^>]*)\/>/g;

    let best: any = null;
    let bestArea = Infinity;

    let m: RegExpExecArray | null;
    while ((m = nodeRe.exec(xml)) !== null) {
      const attrs = m[1];
      const get = (k: string) => { const r = new RegExp(`${k}="([^"]*)"`).exec(attrs); return r ? r[1] : ''; };

      const bounds = get('bounds');
      const bm = boundsRe.exec(bounds);
      if (!bm) continue;

      const x1 = parseInt(bm[1]), y1 = parseInt(bm[2]);
      const x2 = parseInt(bm[3]), y2 = parseInt(bm[4]);

      if (x < x1 || x > x2 || y < y1 || y > y2) continue;

      const area = (x2 - x1) * (y2 - y1);
      if (area < bestArea) {
        bestArea = area;
        const rawText = get('text') || '';
        const contentDesc = get('content-desc') || '';
        const text = rawText || contentDesc; // display text
        const resourceId = get('resource-id') || '';
        const className = get('class') || '';
        const clickable = get('clickable') === 'true';
        const isInput = className.includes('EditText');
        const isCheckable = get('checkable') === 'true';

        // Build selector: prefer resourceId short form, then text
        const idShort = resourceId.includes('/') ? resourceId.split('/')[1] : resourceId;
        const selector = idShort
          ? `[resource-id="${resourceId}"]`
          : text ? `[text="${text}"]` : bounds;

        // Flutter finder strategy: text → find.text(), semantics label (content-desc) → find.bySemanticsLabel(),
        // key (idShort, no raw text) → find.byKey(), empty → no finder (user must supply)
        const finderStrategy: 'text' | 'semantics' | 'key' | 'type' =
          rawText ? 'text' : contentDesc ? 'semantics' : idShort ? 'key' : 'type';
        const finderValue = rawText || contentDesc || idShort || '';

        best = { text, contentDesc, resourceId, idShort, className, clickable, isInput, isCheckable, bounds, selector,
          elementType: isInput ? 'input' : isCheckable ? 'checkbox' : clickable ? 'button' : 'text',
          finderStrategy, finderValue };
      }
    }
    return best;
  }

  // Helper: resolve runner SSH config from runnerId (or default/first runner)
  async function resolveRunnerSSH(runnerId?: string): Promise<{ host: string; username: string; sshKeyPath: string; deviceId: string; projectPath?: string }> {
    let runner: any = null;
    if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
    if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
    if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!runner) throw new Error('No runner configured. Please add a runner in Settings.');
    return {
      host: runner.host,
      username: runner.username,
      sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
      deviceId: runner.deviceId || '',
      projectPath: runner.projectPath || undefined,
    };
  }

  // GET /screenshot?runnerId=... — capture device screen via ADB on the selected runner
  fastify.get('/screenshot', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId } = request.query as { runnerId?: string };
      const runner = await resolveRunnerSSH(runnerId);

      const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
      const cmd =
        'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
        'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ' +
        `adb ${deviceArg} exec-out screencap -p`;

      const buf = await execSSHBinary(cmd, runner, 25000);
      const screenshot = buf.toString('base64');

      logger.info(`[LiveView] Screenshot from runner ${runner.host} (${Math.round(buf.length / 1024)} KB)`);
      return successResponse(reply, { screenshot, timestamp: Date.now() }, undefined);
    } catch (error: any) {
      logger.error('[LiveView] Screenshot failed:', error);
      return errorResponses.handle(reply, error, 'capture screenshot');
    }
  });

  // POST /tap — send ADB tap at (x, y) on the selected runner's device
  fastify.post('/tap', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { x, y, runnerId } = request.body as { x: number; y: number; runnerId?: string };

      if (typeof x !== 'number' || typeof y !== 'number') {
        return errorResponses.badRequest(reply, 'x and y coordinates are required');
      }

      const runner = await resolveRunnerSSH(runnerId);
      const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
      const cmd =
        'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
        'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ' +
        `adb ${deviceArg} shell input tap ${Math.round(x)} ${Math.round(y)}`;

      await execSSHWithConfig(cmd, runner, 8000);

      logger.info(`[LiveView] Tapped (${x}, ${y}) on runner ${runner.host}`);
      return successResponse(reply, { ok: true, x, y }, undefined);
    } catch (error: any) {
      logger.error('[LiveView] Tap failed:', error);
      return errorResponses.handle(reply, error, 'send tap');
    }
  });

  // POST /element-at — identify element at (x, y) AND capture fresh screenshot simultaneously
  fastify.post('/element-at', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { x, y, runnerId } = request.body as { x: number; y: number; runnerId?: string };
      const runner = await resolveRunnerSSH(runnerId);
      const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
      const adbEnv =
        'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
        'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ';

      const xmlCmd = adbEnv +
        `adb ${deviceArg} shell uiautomator dump /sdcard/ui.xml 2>/dev/null && ` +
        `adb ${deviceArg} shell cat /sdcard/ui.xml 2>/dev/null`;
      const screencapCmd = adbEnv + `adb ${deviceArg} exec-out screencap -p`;

      // Run both in parallel so screenshot and element data are from the same moment
      const [xmlResult, screenshotBuf] = await Promise.all([
        execSSHWithConfig(xmlCmd, runner, 20000),
        execSSHBinary(screencapCmd, runner, 25000),
      ]);

      const element = findElementAt(xmlResult.output, Math.round(x), Math.round(y));
      const screenshot = screenshotBuf.toString('base64');

      logger.info(`[LiveView] Element at (${x},${y}): ${element?.text || element?.resourceId || 'none'}`);
      return successResponse(reply, { element, screenshot }, undefined);
    } catch (error: any) {
      logger.error('[LiveView] Element-at failed:', error);
      return errorResponses.handle(reply, error, 'identify element');
    }
  });

  // POST /screen-elements — scan ALL interactive elements on current screen + fresh screenshot
  // If runner has projectPath: use pure Flutter source scan (UIAutomator only for screen detection)
  // Otherwise: fall back to raw UIAutomator elements
  fastify.post('/screen-elements', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId } = request.body as { runnerId?: string };
      const runner = await resolveRunnerSSH(runnerId);
      const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
      const adbEnv =
        'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
        'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ';

      const xmlCmd = adbEnv +
        `adb ${deviceArg} shell uiautomator dump /sdcard/ui.xml 2>/dev/null && ` +
        `adb ${deviceArg} shell cat /sdcard/ui.xml 2>/dev/null`;
      const screencapCmd = adbEnv + `adb ${deviceArg} exec-out screencap -p`;

      // If runner has projectPath, use source-based scan for clean Flutter element labels
      if (runner.projectPath) {
        const projectPath = runner.projectPath;
        const [inputGrepResult, buttonGrepResult, xmlResult, screenshotBuf] = await Promise.all([
          execSSHWithConfig(`grep -rn 'hintText:' '${projectPath}/lib' 2>/dev/null | grep -v '.g.dart' | grep -v '.freezed.dart'`, runner, 20000).catch(() => ({ output: '' })),
          execSSHWithConfig(`grep -rn 'ElevatedButton\\|TextButton\\|OutlinedButton\\|FilledButton\\|InkWell\\|GestureDetector\\|FloatingActionButton\\|IconButton\\|ListTile\\|Chip\\b\\|Tab\\b' '${projectPath}/lib' 2>/dev/null | grep -v '.g.dart' | grep -v '.freezed.dart'`, runner, 20000).catch(() => ({ output: '' })),
          execSSHWithConfig(xmlCmd, runner, 20000).catch(() => ({ output: '' })),
          execSSHBinary(screencapCmd, runner, 25000),
        ]);

        // Extract visible texts from UIAutomator for screen detection
        const visibleTexts = new Set<string>();
        const uiRe = /<node\s+([^>]*)\/>/g; let uiM: RegExpExecArray | null;
        while ((uiM = uiRe.exec(xmlResult.output)) !== null) {
          const a = uiM[1];
          const gv = (k: string) => { const r = new RegExp(`${k}="([^"]*)"`).exec(a); return r ? r[1] : ''; };
          const t = gv('text'); if (t && t.length > 1) visibleTexts.add(t.toLowerCase().trim());
          const d = gv('content-desc'); if (d && d.length > 1) visibleTexts.add(d.toLowerCase().trim());
        }

        // Collect all dart files referenced in greps
        const allFiles = new Set<string>();
        for (const line of [...inputGrepResult.output.split('\n'), ...buttonGrepResult.output.split('\n')]) {
          const m = line.match(/^([^:]+\.dart):/); if (m) allFiles.add(m[1]);
        }

        let sourceElements: any[] = [];
        if (allFiles.size > 0 && allFiles.size <= 50) {
          const batchCmd = [...allFiles].map(f => `echo "===FILE:${f}===" && cat '${f}' 2>/dev/null`).join(' && ');
          const batchResult = await execSSHWithConfig(batchCmd, runner, 40000).catch(() => ({ output: '' }));

          let curFile = '';
          const fileContents = new Map<string, string[]>();
          for (const line of batchResult.output.split('\n')) {
            const fm = line.match(/^===FILE:(.+)===$/);
            if (fm) { curFile = fm[1]; fileContents.set(curFile, []); }
            else if (curFile) fileContents.get(curFile)!.push(line);
          }

          // Score files by matching static Text() against UIAutomator visible texts
          const fileScores = new Map<string, number>();
          for (const [file, lines] of fileContents) {
            let score = 0;
            for (const line of lines) {
              const tm = line.match(/Text\s*\(\s*(?:const\s+)?['"]([^'"]{3,})['"]/);
              if (tm && visibleTexts.has(tm[1].toLowerCase().trim())) score++;
            }
            fileScores.set(file, score);
          }
          const maxScore = Math.max(0, ...[...fileScores.values()]);
          const screenFiles = new Set<string>();
          if (maxScore > 0) {
            for (const [f, s] of fileScores) { if (s >= Math.max(1, maxScore - 1)) screenFiles.add(f); }
          } else {
            // No text match — dynamic screen, use heuristic
            const heuristicScores = new Map<string, number>();
            for (const [file, lines] of fileContents) {
              let inputCount = 0;
              let buttonCount = 0;
              for (const line of lines) {
                if (/hintText\s*:/.test(line)) inputCount++;
                if (/ElevatedButton|TextButton|OutlinedButton|FilledButton|InkWell|GestureDetector/.test(line)) buttonCount++;
              }
              heuristicScores.set(file, inputCount * 2 + buttonCount);
            }
            const sortedByHeuristic = [...heuristicScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
            for (const [file, _] of sortedByHeuristic) screenFiles.add(file);
          }
          logger.info(`[LiveView] Source scan screen files: ${[...screenFiles].map(f => f.split('/').pop()).join(', ')}`);

          // HYBRID APPROACH:
          // - INPUTS: from source grep (hintText) — proper labels, not raw "EditText"
          // - BUTTONS/CLICKABLE: from UIAutomator — sees ALL visible elements including dynamic list items
          const sourceElements: any[] = [];
          const seenInputLabels = new Set<string>();

          // 1. Source inputs for current screen (only)
          for (const line of inputGrepResult.output.split('\n')) {
            const fm = line.match(/^([^:]+\.dart):/);
            if (!fm || !screenFiles.has(fm[1])) continue;
            const hm = line.match(/hintText\s*:\s*['"]([^'"]+)['"]/);
            const label = hm?.[1]; if (!label || seenInputLabels.has(label)) continue;
            seenInputLabels.add(label);
            sourceElements.push({ text: label, contentDesc: label, resourceId: '', idShort: '', className: 'android.widget.EditText', clickable: true, isInput: true, isCheckable: false, bounds: '', x1: 0, y1: 0, x2: 0, y2: 0, elementType: 'input', finderStrategy: 'text', finderValue: label, selector: `[hint="${label}"]` });
          }

          // 2. UIAutomator clickable elements (buttons, list items, tabs — everything visible now)
          // Clean up multiline text: take first line as display label
          const boundsRe = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
          const nodeRe = /<node\s+([^>]*)\/>/g;
          const seenClickable = new Set<string>();
          let nm: RegExpExecArray | null;
          let totalNodes = 0, filteredClickable = 0, filteredNoText = 0, added = 0;
          while ((nm = nodeRe.exec(xmlResult.output)) !== null) {
            totalNodes++;
            const a = nm[1];
            const gv = (k: string) => { const r = new RegExp(`${k}="([^"]*)"`).exec(a); return r ? r[1] : ''; };
            const bounds = gv('bounds');
            const bm = boundsRe.exec(bounds);
            if (!bm) continue;
            const x1 = parseInt(bm[1]), y1 = parseInt(bm[2]), x2 = parseInt(bm[3]), y2 = parseInt(bm[4]);
            if (x2 <= x1 || y2 <= y1) continue;
            if ((x2 - x1) > 970 && (y2 - y1) > 1720) continue; // skip root container

            // More lenient filter: include elements with text, even if not clickable
            const isClickable = gv('clickable') === 'true';
            const isInput = gv('class').includes('EditText');
            const hasText = gv('text') || gv('content-desc');

            if (!isClickable && !isInput && !hasText) {
              filteredNoText++;
              continue;
            }
            filteredClickable++;

            // Skip raw input fields — we have source inputs already
            if (isInput) continue;

            const rawText = gv('text') || gv('content-desc');
            if (!rawText) continue;

            // Clean multiline text: take first meaningful line as label (skip single letters)
            const lines = rawText.split(/\n|&#10;/).map(s => s.trim()).filter(Boolean);
            let firstLine = lines[0] || rawText;
            // If first line is too short (single letter like "a", "s", "d"), try next line
            if (firstLine.length < 2 && lines.length > 1) {
              firstLine = lines[1];
            }
            if (firstLine.length < 2 && lines.length > 2) {
              firstLine = lines[2];
            }
            // Still too short? Skip (probably just noise)
            if (firstLine.length < 2) continue;

            const key = bounds;
            if (seenClickable.has(key)) continue;
            seenClickable.add(key);

            const idShort = gv('resource-id').includes('/') ? gv('resource-id').split('/')[1] : gv('resource-id');
            const finderStrategy = idShort ? 'key' : 'text';
            const finderValue = idShort || firstLine;

            added++;
            // Log first 5 elements for debugging
            if (added <= 5) {
              logger.info(`[LiveView] Added element: "${firstLine}" (raw: "${rawText.slice(0, 50).replace(/\n/g, '\\n')}") clickable=${isClickable}`);
            }
            sourceElements.push({
              text: firstLine, contentDesc: rawText.replace(/&#10;/g, ' '), resourceId: gv('resource-id'), idShort,
              className: gv('class'), clickable: isClickable, isInput: false, isCheckable: gv('checkable') === 'true',
              bounds, x1, y1, x2, y2,
              elementType: 'button', finderStrategy, finderValue,
              selector: idShort ? `[resource-id="${gv('resource-id')}"]` : `[text="${firstLine}"]`,
            });
          }
          logger.info(`[LiveView] UIAutomator filter: ${totalNodes} nodes, ${filteredClickable} passed clickable/text check, ${filteredNoText} no text skipped, ${added} elements added`);

          // Sort: inputs first, then buttons by position (top to bottom)
          sourceElements.sort((a, b) => {
            if (a.elementType !== b.elementType) return a.elementType === 'input' ? -1 : 1;
            return (a.y1 || 0) - (b.y1 || 0);
          });

          const screenshot = screenshotBuf.toString('base64');
          logger.info(`[LiveView] Hybrid scan: ${sourceElements.filter(e => e.elementType === 'input').length} inputs (source), ${sourceElements.filter(e => e.elementType === 'button').length} buttons (UIAutomator) from ${[...screenFiles].map(f => f.split('/').pop()).join(', ')}`);
          return successResponse(reply, { elements: sourceElements, screenshot, scannedAt: Date.now() }, undefined);
        }

        const screenshot = screenshotBuf.toString('base64');
        return successResponse(reply, { elements: sourceElements, screenshot, scannedAt: Date.now() }, undefined);
      }

      // Fallback: no projectPath — raw UIAutomator
      const [xmlResult, screenshotBuf] = await Promise.all([
        execSSHWithConfig(xmlCmd, runner, 20000),
        execSSHBinary(screencapCmd, runner, 25000),
      ]);
      const elements = extractAllElements(xmlResult.output);
      const screenshot = screenshotBuf.toString('base64');
      logger.info(`[LiveView] Screen scan (UIAutomator): ${elements.length} elements on runner ${runner.host}`);
      return successResponse(reply, { elements, screenshot, scannedAt: Date.now() }, undefined);
    } catch (error: any) {
      logger.error('[LiveView] Screen scan failed:', error);
      return errorResponses.handle(reply, error, 'scan screen elements');
    }
  });

  // ─── Flutter Session (VM Service — per-screen exploratory builder) ───────────

  // POST /flutter-session/start — launch flutter run --debug, return session ID
  fastify.post('/flutter-session/start', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { runnerId } = request.body as { runnerId?: string };

      // Resolve runner with project path
      let runner: any = null;
      if (runnerId) runner = await prisma.runner.findUnique({ where: { id: runnerId } });
      if (!runner) runner = await prisma.runner.findFirst({ where: { isDefault: true } });
      if (!runner) runner = await prisma.runner.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!runner) return errorResponses.badRequest(reply, 'No runner configured');
      if (!runner.projectPath) return errorResponses.badRequest(reply, 'Runner has no project path configured');

      const session = await startFlutterSession(runnerId || runner.id, {
        host: runner.host,
        username: runner.username,
        sshKeyPath: runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519',
        deviceId: runner.deviceId || '',
        projectPath: runner.projectPath,
      });

      return successResponse(reply, {
        sessionId: session.id,
        status: session.status,
        vmServiceUrl: session.vmServiceUrl,
      }, undefined);
    } catch (error: any) {
      logger.error('[FlutterSession] Start failed:', error);
      return errorResponses.handle(reply, error, 'start flutter session');
    }
  });

  // GET /flutter-session/:id/widget-tree — pure Flutter VM Service approach (NO UIAutomator)
  fastify.get('/flutter-session/:id/widget-tree', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      const session = getSession(id);
      if (!session) return errorResponses.notFound(reply, 'Flutter session');
      if (session.status !== 'ready') {
        return reply.code(503).send({ success: false, error: { code: 'SESSION_NOT_READY', message: `Session status: ${session.status}` } });
      }

      // Pure Flutter approach: use VM Service via SSH relay to query live widget tree
      logger.info(`[FlutterSession ${id}] Using pure VM Service approach (no UIAutomator)`);
      const { elements, screenshot } = await getFlutterWidgetTreePureVM(session);

      return successResponse(reply, {
        elements,
        widgets: elements,
        screenshot,
        scannedAt: Date.now(),
        _debug: {
          method: 'pure-vm-service',
          elementCount: elements.length,
          elementTypes: elements.reduce((acc, e) => {
            acc[e.elementType] = (acc[e.elementType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      }, undefined);
    } catch (error: any) {
      logger.error('[FlutterSession] Widget tree failed:', error);
      return errorResponses.handle(reply, error, 'get widget tree');
    }
  });

  // GET /flutter-session — list active sessions
  fastify.get('/flutter-session', {
    onRequest: [fastify.authenticate],
  }, async (_request, reply) => {
    const sessions = listSessions().map(s => ({
      id: s.id, runnerId: s.runnerId, status: s.status,
      startedAt: s.startedAt, error: s.error,
    }));
    return successResponse(reply, { sessions }, undefined);
  });

  // DELETE /flutter-session/:id — stop session, kill flutter run
  fastify.delete('/flutter-session/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await stopFlutterSession(id);
      return successResponse(reply, { stopped: true }, undefined);
    } catch (error: any) {
      logger.error('[FlutterSession] Stop failed:', error);
      return errorResponses.handle(reply, error, 'stop flutter session');
    }
  });
}

// ─── Pure Flutter VM Service Widget Tree (NO UIAutomator) ─────────────────────
// Converts FlutterWidget[] from VM Service to element format

function flutterWidgetToElement(widget: any, index: number): any {
  const description = widget.description || '';
  const widgetType = description.split('(')[0] || 'Widget';

  // Build finderValue based on priority: key > tooltip > text > type#index
  let finderValue = widget.finderValue || '';
  let finderStrategy = widget.finderStrategy || 'type';
  let selector = '';

  if (finderStrategy === 'key') {
    selector = `[byKey='${finderValue}']`;
  } else if (finderStrategy === 'tooltip') {
    selector = `[byTooltip='${finderValue}']`;
  } else if (finderStrategy === 'text') {
    selector = `[text='${finderValue}']`;
  } else if (finderStrategy === 'type') {
    // Type finder with index for duplicates
    const match = finderValue.match(/^(.+?)\s+#(\d+)$/);
    if (match) {
      selector = `[byType('${match[1]}').at(${match[2]} - 1)]`; // convert to 0-based index
    } else {
      selector = `[byType('${finderValue}')]`;
    }
  }

  // Map elementType to standard values
  const elementTypeMap: Record<string, 'button' | 'input' | 'text' | 'checkbox'> = {
    'button': 'button',
    'input': 'input',
    'text': 'text',
    'other': 'button', // Default 'other' to button for clickable elements
    'checkbox': 'checkbox',
  };
  const elementType = elementTypeMap[widget.elementType || 'other'] || 'button';

  return {
    text: widget.text || finderValue || description,
    contentDesc: widget.tooltip || widget.text || finderValue || '',
    resourceId: widget.key || '',
    idShort: widget.key || '',
    className: `flutter.${widgetType}`,
    clickable: elementType === 'button' || elementType === 'checkbox',
    isInput: elementType === 'input',
    isCheckable: elementType === 'checkbox',
    bounds: widget.x1 !== undefined ? `[${widget.x1},${widget.y1}][${widget.x2},${widget.y2}]` : '',
    x1: widget.x1 || 0, y1: widget.y1 || 0, x2: widget.x2 || 0, y2: widget.y2 || 0,
    elementType,
    finderStrategy,
    finderValue,
    selector,
    // Additional Flutter-specific fields
    widgetId: widget.widgetId || '',
    description,
  };
}

async function getFlutterWidgetTreePureVM(session: any): Promise<{ elements: any[]; screenshot: string }> {
  const { id, runner } = session;

  // Use vmServiceRpc to call Flutter VM Service via SSH relay
  // Get the root widget tree (summary tree - fast, includes all widgets)
  const rootTree = await vmServiceRpc(session, 'ext.flutter.inspector.getRootWidgetTree', {
    groupName: 'explorer',
    isSummaryTree: 'true',
    withPreviews: 'true',
  });

  if (!rootTree) {
    throw new Error('Failed to get widget tree from VM Service');
  }

  // Parse the widget tree into actionable elements
  const flutterWidgets = parseWidgetTree(rootTree);
  logger.info(`[FlutterSession ${id}] VM Service returned ${flutterWidgets.length} widgets`);

  // Convert FlutterWidget[] to element format
  const elements = flutterWidgets
    .map((w, i) => flutterWidgetToElement(w, i))
    .filter(e => {
      // Filter out low-value elements
      // - Keep all buttons, inputs, checkboxes
      // - For text: keep only if has meaningful content (>2 chars)
      if (e.elementType === 'button' || e.elementType === 'input' || e.elementType === 'checkbox') {
        return true;
      }
      if (e.elementType === 'text' && e.text && e.text.length > 2) {
        // Skip generic text labels like "/", ":", etc.
        const skipPatterns = /^[\/\:\;\,\.\-\+\=\(\)\[\]\{\}]+$/;
        return !skipPatterns.test(e.text.trim());
      }
      return false;
    });

  // Deduplicate by finderValue + elementType
  const seen = new Set<string>();
  const deduped = elements.filter(e => {
    const key = `${e.elementType}|${e.finderValue}|${e.finderStrategy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(`[FlutterSession ${id}] After filtering: ${deduped.length} actionable elements`);

  // Take screenshot at same time
  const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
  const adbEnv = 'export ANDROID_HOME="$HOME/Library/Android/sdk" && export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ';
  const screenshotBuf = await execSSHBinary(adbEnv + `adb ${deviceArg} exec-out screencap -p`, runner, 25000);
  const screenshot = screenshotBuf.toString('base64');

  return { elements: deduped, screenshot };
}

// ─── Extract all interactive elements from UIAutomator XML ──────────────────

function extractAllElements(xml: string) {
  const boundsRe = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
  const nodeRe = /<node\s+([^>]*)\/>/g;
  const seen = new Set<string>();
  const elements: any[] = [];

  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(xml)) !== null) {
    const attrs = m[1];
    const get = (k: string) => { const r = new RegExp(`${k}="([^"]*)"`).exec(attrs); return r ? r[1] : ''; };

    const bounds = get('bounds');
    const bm = boundsRe.exec(bounds);
    if (!bm) continue;

    const x1 = parseInt(bm[1]), y1 = parseInt(bm[2]);
    const x2 = parseInt(bm[3]), y2 = parseInt(bm[4]);
    if (x2 <= x1 || y2 <= y1) continue; // zero-size node

    const rawText = get('text') || '';
    const contentDesc = get('content-desc') || '';
    const resourceId = get('resource-id') || '';
    const className = get('class') || '';
    const clickable = get('clickable') === 'true';
    const isInput = className.includes('EditText');
    const isCheckable = get('checkable') === 'true';

    // Skip elements that have no useful info AND are not actionable
    if (!clickable && !isInput && !isCheckable && !rawText && !contentDesc) continue;
    // Skip very large root containers (>90% of typical screen 1080x1920)
    if ((x2 - x1) > 970 && (y2 - y1) > 1720) continue;

    const text = rawText || contentDesc;
    const idShort = resourceId.includes('/') ? resourceId.split('/')[1] : resourceId;

    const finderStrategy: 'text' | 'semantics' | 'key' | 'type' =
      rawText ? 'text' : contentDesc ? 'semantics' : idShort ? 'key' : 'type';
    const finderValue = rawText || contentDesc || idShort || className.split('.').pop() || '';
    const elementType: 'button' | 'input' | 'checkbox' | 'text' =
      isInput ? 'input' : isCheckable ? 'checkbox' : clickable ? 'button' : 'text';

    // For inputs: deduplicate by bounds only (two empty EditText at different positions must both show)
    // For others: deduplicate by bounds+text
    const key = isInput ? bounds : `${bounds}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    elements.push({
      text, contentDesc, resourceId, idShort, className, clickable, isInput, isCheckable,
      bounds, x1, y1, x2, y2, elementType, finderStrategy, finderValue,
      selector: idShort ? `[resource-id="${resourceId}"]` : text ? `[text="${text}"]` : bounds,
    });
  }

  // Sort: inputs first, then buttons, then texts — helps UX ordering
  const order = { input: 0, button: 1, checkbox: 2, text: 3 };
  return elements.sort((a, b) => order[a.elementType as keyof typeof order] - order[b.elementType as keyof typeof order]);
}
