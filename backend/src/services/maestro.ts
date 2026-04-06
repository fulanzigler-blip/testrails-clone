import { Client } from 'ssh2';
import * as fs from 'fs';

export const MAESTRO_WEBHOOK_SECRET: string = process.env.MAESTRO_WEBHOOK_SECRET || 'dev-secret-change-in-production';

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || '';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '';

// Read SSH key once at module initialization
let SSH_KEY: Buffer | null = null;
function getSSHKey(): Buffer {
  if (SSH_KEY) return SSH_KEY;
  if (!SSH_KEY_PATH) throw new Error('MAESTRO_RUNNER_KEY_PATH environment variable is not set');
  SSH_KEY = fs.readFileSync(SSH_KEY_PATH);
  return SSH_KEY;
}

function validateSSHConfig(): void {
  if (!SSH_HOST) throw new Error('MAESTRO_RUNNER_HOST environment variable is not set');
  if (!SSH_USER) throw new Error('MAESTRO_RUNNER_USER environment variable is not set');
  getSSHKey(); // validates key path
}

export async function triggerMaestroRun(
  runId: string,
  flowPaths: string[],
  onRunning?: () => void,
  onCompleted?: (exitCode: number) => void,
  onFlowUpdate?: (flowName: string, status: 'running' | 'passed' | 'failed', duration?: number) => void,
  onOutput?: (line: string) => void,
  screenshotDir?: string,
): Promise<void> {
  try {
    validateSSHConfig();
    const privateKey: Buffer = getSSHKey();

    const quotedArgs = flowPaths.map(p => `'${p}'`).join(' ');
    const command: string = [
      'export JAVA_HOME="/Users/clawbot/jdk17/Contents/Home"',
      'export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"',
      `/Users/clawbot/.maestro/bin/maestro test ${quotedArgs} --format junit --output /tmp/maestro-${runId}.xml --no-ansi 2>&1`,
    ].join(' && ');

    // Pre-stream flow content so user sees what's being run
    if (onOutput) {
      onOutput(`═══ Maestro Run ${runId.slice(0, 8)} ═══`);
      onOutput('');
      for (const fp of flowPaths) {
        const flowName = fp.split('/').pop()?.replace('.yaml', '') || fp;
        try {
          const { execSync } = await import('child_process');
          const yamlContent = execSync(
            `ssh -o StrictHostKeyChecking=no -i ${SSH_KEY_PATH} ${SSH_USER}@${SSH_HOST} "cat ${fp}" 2>/dev/null`,
            { timeout: 10000, encoding: 'utf-8' }
          );
          onOutput(`── Flow: ${flowName} ──`);
          yamlContent.split('\n').forEach(l => onOutput(`  ${l}`));
          onOutput('');
        } catch {
          onOutput(`── Flow: ${flowName} ──`);
          onOutput('  (unable to read flow content)');
          onOutput('');
        }
      }
      onOutput('Starting execution...');
      onOutput('');
    }

    await new Promise<void>((resolve, reject) => {
      const client: Client = new Client();

      client.on('ready', () => {
        if (onRunning) onRunning();

        client.exec(command, { pty: true }, (err: Error | undefined, stream: NodeJS.ReadableStream & { stderr: NodeJS.ReadableStream; on: (event: string, callback: (...args: any[]) => void) => any }) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          let output = '';
          let lineBuffer = '';

          const processLine = (line: string) => {
            if (!line.trim()) return;

            // Send raw output to UI
            if (onOutput) onOutput(line);

            // Parse flow results: "[Passed] login_verified (23s)" or "[Failed] deep_navigation (36s)"
            const passedMatch = line.match(/^\[Passed\]\s+(\S+)\s+\((\d+)s?\)/i);
            const failedMatch = line.match(/^\[Failed\]\s+(\S+)\s+\((\d+)s?\)/i);
            const runningMatch = line.match(/^\[Maestro\] Run\s+.*Running\s+on/i);

            if (passedMatch && onFlowUpdate) {
              onFlowUpdate(passedMatch[1], 'passed', parseInt(passedMatch[2], 10));
            } else if (failedMatch && onFlowUpdate) {
              onFlowUpdate(failedMatch[1], 'failed', parseInt(failedMatch[2], 10));
            } else if (runningMatch && onFlowUpdate) {
              const firstFlow = flowPaths[0]?.split('/').pop()?.replace('.yaml', '');
              if (firstFlow) onFlowUpdate(firstFlow, 'running');
            }
          };

          stream.on('data', (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;
            lineBuffer += chunk;

            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';
            for (const line of lines) {
              processLine(line);
            }
          });

          stream.stderr.on('data', (data: Buffer) => {
            const chunk = data.toString();
            output += chunk;
            lineBuffer += chunk;

            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';
            for (const line of lines) {
              processLine(line);
            }
          });

          stream.on('close', (exitCode: number | null, signal: string | null) => {
            if (output.length > 0) {
              console.log(`[Maestro] Run ${runId} output:\n${output}`);
            }

            if (exitCode !== 0) {
              console.warn(`[Maestro] Run ${runId} exited with code ${exitCode}, signal ${signal}.`);
            } else {
              console.log(`[Maestro] Run ${runId} completed successfully.`);
            }

            client.end();
            if (onCompleted) onCompleted(exitCode ?? 1);
            resolve();
          });
        });
      });

      client.on('error', (err: Error) => {
        console.error(`[Maestro] SSH connection error for run ${runId}:`, err.message);
        reject(err);
      });

      client.connect({
        host: SSH_HOST,
        username: SSH_USER,
        privateKey: privateKey,
        readyTimeout: 30000,
      });
    });
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    console.error(`[Maestro] Failed to trigger run ${runId}:`, message);
  }
}
