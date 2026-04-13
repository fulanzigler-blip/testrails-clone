import { Client } from 'ssh2';
import * as fs from 'fs';

const SSH_KEY_PATH = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/nodejs/.ssh/id_ed25519';

export interface RunnerConfig {
  host: string;
  username: string;
  sshKeyPath?: string;
  projectPath: string;
  deviceId?: string;
}

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2 MB cap to prevent OOM

export function execSSHWithConfig(command: string, cfg: Partial<RunnerConfig>, timeoutMs: number = 30000): Promise<{ output: string; code: number }> {
  const host = cfg.host || '';
  const username = cfg.username || 'clawbot';
  const keyPath = cfg.sshKeyPath || SSH_KEY_PATH;
  const privateKey = fs.readFileSync(keyPath);

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { try { client.end(); } catch {} reject(new Error(`SSH timeout: ${timeoutMs}ms`)); }, timeoutMs);
    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { client.end(); clearTimeout(timer); reject(err); return; }
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let truncated = false;

        const appendChunk = (d: Buffer | string) => {
          const buf = Buffer.isBuffer(d) ? d : Buffer.from(d);
          if (totalBytes >= MAX_OUTPUT_BYTES) {
            truncated = true;
            return;
          }
          const remaining = MAX_OUTPUT_BYTES - totalBytes;
          chunks.push(buf.slice(0, remaining));
          totalBytes += Math.min(buf.length, remaining);
          if (totalBytes >= MAX_OUTPUT_BYTES) truncated = true;
        };

        stream.on('data', appendChunk);
        stream.stderr.on('data', appendChunk);
        stream.on('close', code => {
          client.end();
          clearTimeout(timer);
          let output = Buffer.concat(chunks).toString('utf8').trim();
          if (truncated) output += '\n[... output truncated at 2MB ...]';
          resolve({ output, code: code ?? -1 });
        });
      });
    });
    client.on('error', e => { clearTimeout(timer); reject(e); });
    client.connect({ host, username, privateKey, readyTimeout: 30000 });
  });
}

export async function writeFileSSHWithRunner(remotePath: string, content: string, runner: Partial<RunnerConfig>): Promise<void> {
  const privateKey = fs.readFileSync(runner.sshKeyPath || SSH_KEY_PATH);
  const escaped = content.replace(/'/g, "'\\''");

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => { try { client.end(); } catch {} reject(new Error('SSH file write timed out')); }, 60000);
    client.on('ready', () => {
      const dirPath = remotePath.substring(0, remotePath.lastIndexOf('/'));
      const cmd = `mkdir -p '${dirPath}' && printf '%s' '${escaped}' > '${remotePath}'`;
      client.exec(cmd, (err, stream) => {
        if (err) { client.end(); clearTimeout(timer); reject(err); return; }
        stream.on('data', () => {});
        stream.stderr.on('data', () => {});
        stream.on('close', code => {
          client.end();
          clearTimeout(timer);
          if (code !== 0) reject(new Error(`SSH file write failed with exit code ${code}`));
          else resolve();
        });
      });
    });
    client.on('error', e => { clearTimeout(timer); reject(e); });
    client.connect({ host: runner.host || '', username: runner.username || 'clawbot', privateKey, readyTimeout: 30000 });
  });
}

export async function executeDartTestOnRunner(dartCode: string, testFileName: string, runner: RunnerConfig): Promise<{ success: boolean; output: string; duration: number }> {
  const scriptPath = `/tmp/run_test_${Date.now()}.sh`;
  // Use bash -l (login shell) to load PATH with flutter
  const scriptContent = `#!/bin/bash -l
cd "${runner.projectPath}"
flutter test integration_test/${testFileName} -d ${runner.deviceId || 'emulator-5554'} 2>&1
echo "EXIT_CODE:$?"`;

  await writeFileSSHWithRunner(scriptPath, scriptContent, runner);

  const startTime = Date.now();
  // Use bash -l to load login shell environment (includes flutter PATH)
  const result = await execSSHWithConfig(`bash -l "${scriptPath}"`, {
    host: runner.host,
    username: runner.username,
    sshKeyPath: runner.sshKeyPath,
  }, 600000);

  const duration = Date.now() - startTime;
  const exitMatch = result.output.match(/EXIT_CODE:(\d+)/);
  const exitCode = exitMatch ? parseInt(exitMatch[1]) : -1;

  return { success: exitCode === 0, output: result.output, duration };
}
