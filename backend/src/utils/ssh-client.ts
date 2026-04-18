import { Client } from 'ssh2';
import * as fs from 'fs';
import { validateSSHConfig, type SSHConfig } from '../config/schemas';
import logger from './logger';

// ─── SSH Configuration ─────────────────────────────────────────────────────────

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/clawdbot/.ssh/id_ed25519';

// Cache SSH key at module init
let cachedKey: Buffer | null = null;

function getSSHKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!SSH_KEY_PATH) throw new Error('MAESTRO_RUNNER_KEY_PATH environment variable is not set');
  cachedKey = fs.readFileSync(SSH_KEY_PATH);
  return cachedKey;
}

function validateDefaultSSHConfig(): void {
  if (!SSH_HOST) throw new Error('MAESTRO_RUNNER_HOST environment variable is not set');
  if (!SSH_USER) throw new Error('MAESTRO_RUNNER_USER environment variable is not set');
  getSSHKey();
}

// ─── SSH Execution Helper ──────────────────────────────────────────────────────

export interface SSHExecResult {
  output: string;
  code: number;
}

export function execSSH(command: string, timeoutMs: number = 60000): Promise<SSHExecResult> {
  validateDefaultSSHConfig();
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

// ─── SSH Execution with Custom Config ───────────────────────────────────────────

export function execSSHWithConfig(command: string, cfg: unknown, timeoutMs: number = 30000): Promise<SSHExecResult> {
  // Validate config
  const validatedConfig = cfg ? validateSSHConfig(cfg) : undefined;

  const host = validatedConfig?.host || SSH_HOST;
  const username = validatedConfig?.username || SSH_USER;
  const keyPath = validatedConfig?.sshKeyPath || SSH_KEY_PATH;

  if (!keyPath) {
    throw new Error('SSH key path not configured. Set SSH_KEY_PATH env var or provide sshKeyPath in config.');
  }
  if (!host) {
    throw new Error('SSH host not configured. Set MAESTRO_RUNNER_HOST env var or provide host in config.');
  }
  if (!username) {
    throw new Error('SSH username not configured. Set MAESTRO_RUNNER_USER env var or provide username in config.');
  }

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
          const combined = [output, stderr].filter(Boolean).join('\n').trim();
          resolve({ output: combined, code: code ?? -1 });
        });
      });
    });
    client.on('error', (err) => { clearTimeout(timer); reject(err); });
    client.connect({ host, username, privateKey, readyTimeout: 30000 });
  });
}

// ─── SSH Binary Exec (returns Buffer, for screencap PNG) ──────────────────────

export function execSSHBinary(command: string, cfg: { host: string; username: string; sshKeyPath: string }, timeoutMs: number = 15000): Promise<Buffer> {
  const privateKey = fs.readFileSync(cfg.sshKeyPath);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const client = new Client();
    const timer = setTimeout(() => {
      try { client.end(); } catch {}
      reject(new Error(`SSH binary command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); client.end(); reject(err); return; }
        // Collect raw bytes — must NOT toString() here (would corrupt PNG)
        let stderrMsg = '';
        stream.on('data', (d: Buffer) => chunks.push(d));
        stream.stderr.on('data', (d: Buffer) => { stderrMsg += d.toString(); });
        stream.on('close', () => {
          clearTimeout(timer);
          client.end();
          const buf = Buffer.concat(chunks);
          if (buf.length < 100) {
            const detail = stderrMsg.trim() || 'no output received';
            reject(new Error(`ADB screencap returned no data (${detail}). Is a device plugged in and ADB-authorized?`));
          } else {
            resolve(buf);
          }
        });
      });
    });
    client.on('error', (err) => { clearTimeout(timer); reject(err); });
    client.connect({ host: cfg.host, username: cfg.username, privateKey, readyTimeout: 10000 });
  });
}

// ─── File Write via SSH ─────────────────────────────────────────────────────────

export interface SSHRunnerConfig {
  host: string;
  username: string;
  sshKeyPath: string;
}

async function writeFileSSHWithRunner(remotePath: string, content: string, runner: SSHRunnerConfig): Promise<void> {
  const privateKey = fs.readFileSync(runner.sshKeyPath || '/home/clawdbot/.ssh/id_ed25519');
  const escaped = content.replace(/'/g, "'\\''");

  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      try { client.end(); } catch {}
      reject(new Error(`SSH file write timed out to ${runner.host}:${runner.username}`));
    }, 60000);

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
      host: runner.host,
      username: runner.username,
      privateKey,
      readyTimeout: 30000,
    });
  });
}

// ─── Default File Write (no runner) ──────────────────────────────────────────────

async function writeFileSSH(remotePath: string, content: string): Promise<void> {
  validateDefaultSSHConfig();
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

export { writeFileSSH, writeFileSSHWithRunner };
