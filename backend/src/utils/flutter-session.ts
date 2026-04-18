/**
 * Flutter Session Manager
 *
 * Manages long-running `flutter run --debug` processes on remote runners via SSH.
 * Each session:
 *   1. Starts `flutter run --debug` on the Mac runner (background process)
 *   2. Tails the log to extract the Observatory/VM Service URL
 *   3. Holds the VM Service URL for widget tree queries
 *   4. Kills the process on session end
 *
 * Sessions are in-memory — they don't survive server restart.
 */

import { execSSHWithConfig } from './ssh-client';
import { FlutterVMService } from './flutter-vm-service';
import logger from './logger';

export interface FlutterSession {
  id: string;
  runnerId: string;
  runner: { host: string; username: string; sshKeyPath: string; deviceId: string; projectPath: string };
  vmServiceUrl: string | null;
  pid: string | null;
  logFile: string;
  startedAt: number;
  vmService: FlutterVMService | null;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  error?: string;
}

const sessions = new Map<string, FlutterSession>();

// ─── Session Lifecycle ────────────────────────────────────────────────────────

export async function startFlutterSession(
  runnerId: string,
  runner: FlutterSession['runner'],
): Promise<FlutterSession> {
  const id = `flutter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const logFile = `/tmp/flutter-session-${id}.log`;
  // ADB uses -s for serial number, flutter uses -d for device
  const adbDeviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';
  const flutterDeviceArg = runner.deviceId ? `-d ${runner.deviceId}` : '';

  // ADB environment setup (used for device check and flutter run)
  const adbEnv =
    'export ANDROID_HOME="$HOME/Library/Android/sdk" && ' +
    'export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ' +
    'export PATH="/Users/$(whoami)/development/flutter/bin:/usr/local/flutter/bin:$PATH" && ';

  const session: FlutterSession = {
    id, runnerId, runner, vmServiceUrl: null, pid: null,
    logFile, startedAt: Date.now(), vmService: null, status: 'starting',
  };
  sessions.set(id, session);

  // Optional device check - warn but don't fail (flutter run will give better error)
  try {
    const deviceCheckCmd =
      adbEnv +
      `adb ${adbDeviceArg} shell echo "device_connected"`;
    const deviceCheck = await execSSHWithConfig(deviceCheckCmd, runner, 10000);
    if (deviceCheck.output.includes('device_connected')) {
      logger.info(`[FlutterSession ${id}] Device check passed`);
    } else {
      logger.warn(`[FlutterSession ${id}] Device check returned unexpected output, continuing anyway: ${deviceCheck.output.slice(0, 100)}`);
    }
  } catch (err: any) {
    logger.warn(`[FlutterSession ${id}] Device check failed (continuing anyway): ${err.message}`);
  }

  // Launch flutter run --debug as background process, capture PID and log
  const launchCmd =
    adbEnv +
    `cd '${runner.projectPath}' && ` +
    `flutter run --debug ${flutterDeviceArg} --no-pub --machine > '${logFile}' 2>&1 & echo $!`;

  try {
    logger.info(`[FlutterSession ${id}] Starting flutter run on ${runner.host} (project: ${runner.projectPath}, device: ${runner.deviceId || 'default'})`);
    logger.info(`[FlutterSession ${id}] Launch command: cd '${runner.projectPath}' && flutter run --debug ${runner.deviceId ? `-d ${runner.deviceId}` : ''} --no-pub --machine`);
    const result = await execSSHWithConfig(launchCmd, runner, 30000);
    const pid = result.output.trim();
    logger.info(`[FlutterSession ${id}] SSH command output: ${result.output.slice(0, 200)}`);
    if (!pid || !/^\d+$/.test(pid)) {
      throw new Error(`flutter run did not start (output: ${result.output.slice(0, 200)})`);
    }
    session.pid = pid;
    logger.info(`[FlutterSession ${id}] flutter run PID=${pid}, waiting for VM service URL...`);

    // Poll log file for the Observatory URL (flutter --machine mode outputs JSON events)
    const vmUrl = await pollForVMServiceUrl(id, runner, logFile);
    session.vmServiceUrl = vmUrl;
    logger.info(`[FlutterSession ${id}] VM Service URL: ${vmUrl}`);

    // VM Service is on the Mac runner's localhost — backend Docker can't reach it directly.
    // Widget-tree scans use pure SSH source grep (no direct VM Service connection needed).
    // Just mark session as ready once we have the URL.
    session.status = 'ready';
    logger.info(`[FlutterSession ${id}] Session ready`);
    return session;
  } catch (err: any) {
    session.status = 'error';
    session.error = err.message;
    logger.error(`[FlutterSession ${id}] Failed to start:`, err);
    await cleanupSession(session);
    throw err;
  }
}

export async function stopFlutterSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  session.status = 'stopped';
  await cleanupSession(session);
  sessions.delete(id);
}

export function getSession(id: string): FlutterSession | undefined {
  return sessions.get(id);
}

export function listSessions(): FlutterSession[] {
  return [...sessions.values()];
}

// ─── Port Forwarding ──────────────────────────────────────────────────────────

async function forwardVMPort(vmUrl: string, runner: FlutterSession['runner'], sessionId: string): Promise<number> {
  // vmUrl is like http://127.0.0.1:PORT/TOKEN/ — this is on the Mac runner
  // We need to forward runner:PORT → localhost:LOCAL_PORT via ADB or SSH tunnel
  const portMatch = vmUrl.match(/:(\d+)\//);
  if (!portMatch) throw new Error(`Cannot parse VM service port from URL: ${vmUrl}`);
  const remotePort = parseInt(portMatch[1]);

  // Use a unique local port derived from session
  const localPort = 9100 + (sessions.size % 100);

  // Forward via SSH: ssh -L localPort:127.0.0.1:remotePort runner
  // We'll do this by running a background SSH tunnel from the backend
  // For simplicity, use direct connection to runner host (VM service binds to 127.0.0.1 on the Mac,
  // so we need the Mac to forward it. Use adb forward if it's an emulator port, or direct SSH tunnel)
  //
  // Simpler: forward via adb (only works for emulator/device ports)
  const adbEnv = 'export ANDROID_HOME="$HOME/Library/Android/sdk" && export PATH="$ANDROID_HOME/platform-tools:/usr/local/bin:/opt/homebrew/bin:$PATH" && ';
  const deviceArg = runner.deviceId ? `-s ${runner.deviceId}` : '';

  try {
    // Tell the Mac runner to forward the port to be accessible from outside
    // By using SSH reverse tunnel or nc - this is complex.
    // Alternative: use `ssh -R` from backend to create reverse tunnel.
    // For now: if VM service URL uses 127.0.0.1 (Mac-local), we need SSH port forwarding.
    // Store the remote port and use execSSHWithConfig to query via ssh -W (not ideal).
    // Best approach: store the URL and have a proxy endpoint that relays VM Service RPCs via SSH.
    logger.info(`[FlutterSession ${sessionId}] VM port ${remotePort} on ${runner.host}, using SSH relay`);
    return remotePort; // Return remote port, actual connection will be via SSH relay
  } catch (err: any) {
    logger.warn(`[FlutterSession ${sessionId}] ADB port forward failed: ${err.message}`);
    return remotePort;
  }
}

// ─── VM Service via SSH relay ─────────────────────────────────────────────────

/**
 * Instead of direct WebSocket (which can't cross SSH), relay VM Service RPCs
 * through SSH by running a node one-liner on the Mac runner.
 */
export async function vmServiceRpc(session: FlutterSession, method: string, params: Record<string, any> = {}): Promise<any> {
  if (!session.vmServiceUrl) throw new Error('VM Service URL not available');

  const portMatch = session.vmServiceUrl.match(/:(\d+)\//);
  if (!portMatch) throw new Error('Cannot parse VM service port');
  const port = portMatch[1];
  const token = session.vmServiceUrl.match(/\/([a-zA-Z0-9_-]+)\/?$/)?.[1] || '';

  const payload = JSON.stringify({ jsonrpc: '2.0', id: '1', method, params });
  const escapedPayload = payload.replace(/'/g, "'\\''");

  // Use node on the Mac runner to make the WebSocket call and return the result
  const nodeScript = `
const ws = require('ws');
const w = new ws('ws://127.0.0.1:${port}/${token}/ws');
w.on('open', () => w.send('${escapedPayload}'));
w.on('message', d => { console.log(d.toString()); w.close(); process.exit(0); });
w.on('error', e => { console.error(e.message); process.exit(1); });
setTimeout(() => process.exit(1), 10000);
`.trim().replace(/\n/g, ' ');

  const cmd = `node -e "${nodeScript.replace(/"/g, '\\"')}"`;
  const result = await execSSHWithConfig(cmd, session.runner, 15000);

  if (result.code !== 0) throw new Error(`VM Service RPC failed: ${result.output}`);
  try {
    const parsed = JSON.parse(result.output.trim());
    if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
    return parsed.result;
  } catch {
    throw new Error(`VM Service returned invalid JSON: ${result.output.slice(0, 200)}`);
  }
}

// ─── Poll for Observatory URL ─────────────────────────────────────────────────

async function pollForVMServiceUrl(
  sessionId: string, runner: FlutterSession['runner'], logFile: string,
  timeoutMs = 60000,
): Promise<string> {
  const start = Date.now();
  let lastLogSize = 0;
  let pollCount = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      pollCount++;
      const result = await execSSHWithConfig(`cat '${logFile}' 2>/dev/null || echo ""`, runner, 8000);
      const output = result.output;
      const logSize = output.length;

      // Log progress every 5 polls
      if (pollCount % 5 === 0) {
        logger.info(`[FlutterSession ${sessionId}] Still waiting for VM Service URL (poll ${pollCount}, log size: ${logSize} chars)`);
      }

      // flutter --machine mode outputs JSON events, one per line
      // Look for: {"event":"app.debugPort","params":{"wsUri":"ws://127.0.0.1:PORT/TOKEN/"}}
      // Or plain text: "An Observatory debugger and profiler on ... is available at: http://..."
      const machineMatch = output.match(/"wsUri"\s*:\s*"([^"]+)"/);
      if (machineMatch) {
        return machineMatch[1].replace(/^ws:/, 'http:').replace(/\/ws$/, '/');
      }

      const plainMatch = output.match(/(?:Observatory|VM Service).*?(?:http|ws):\/\/([^\s"]+)/i);
      if (plainMatch) {
        return `http://${plainMatch[1]}`.replace(/\/ws$/, '/');
      }

      // Also check for machine-mode app.started + debugPort events
      const lines = output.split('\n');
      for (const line of lines) {
        try {
          const evt = JSON.parse(line.trim());
          if (evt?.event === 'app.debugPort' && evt?.params?.wsUri) {
            return evt.params.wsUri.replace(/^ws:/, 'http:').replace(/\/ws$/, '/');
          }
          if (evt?.event === 'app.start' && evt?.params?.deviceId) continue;
          // Machine mode error event
          if (evt?.event === 'app.stop' || (evt?.event === 'news' && evt?.params?.level === 'error')) {
            throw new Error(`Flutter app stopped/errored:\n${output.slice(-1000)}`);
          }
        } catch (e: any) {
          if (e.message?.startsWith('Flutter')) throw e; // rethrow our error
          /* not JSON, ignore */
        }
      }

      // Fast-fail on clearly fatal log output
      const fatalPatterns = [
        /flutter: command not found/i,
        /No supported devices/i,
        /error: no devices found/i,
        /Unable to locate a development device/i,
        /Gradle task assembleDebug failed/i,
        /FAILURE: Build failed/i,
      ];
      for (const pat of fatalPatterns) {
        if (pat.test(output)) {
          throw new Error(`flutter run failed:\n${output.slice(-800)}`);
        }
      }
    } catch (e: any) {
      if (e.message?.startsWith('flutter run failed') || e.message?.startsWith('Flutter app stopped')) throw e;
      /* ignore SSH read errors */
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Read last 30 lines of log for error context
  let logTail = '';
  try {
    const tailResult = await execSSHWithConfig(`tail -30 '${logFile}' 2>/dev/null || echo "(log empty)"`, runner, 8000);
    logTail = tailResult.output.trim();
  } catch { /* ignore */ }

  throw new Error(`Timed out waiting for Flutter VM Service URL.\n\nLast log output:\n${logTail || '(no log)'}`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanupSession(session: FlutterSession): Promise<void> {
  session.vmService?.disconnect();
  session.vmService = null;

  if (session.pid) {
    try {
      await execSSHWithConfig(`kill ${session.pid} 2>/dev/null; rm -f '${session.logFile}'`, session.runner, 8000);
      logger.info(`[FlutterSession ${session.id}] Killed PID ${session.pid}`);
    } catch { /* ignore */ }
  }
}
