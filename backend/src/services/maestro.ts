import { Client } from 'ssh2';
import * as fs from 'fs';

export const MAESTRO_WEBHOOK_SECRET: string = process.env.MAESTRO_WEBHOOK_SECRET || 'dev-secret-change-in-production';

const SSH_HOST: string = process.env.MAESTRO_RUNNER_HOST || '100.76.181.104';
const SSH_USER: string = process.env.MAESTRO_RUNNER_USER || 'clawbot';
const SSH_KEY_PATH: string = process.env.MAESTRO_RUNNER_KEY_PATH || '/home/clawdbot/.ssh/id_ed25519';

export async function triggerMaestroRun(runId: string, flowPaths: string[]): Promise<void> {
  try {
    const privateKey: Buffer = fs.readFileSync(SSH_KEY_PATH);

    const flowArgs: string = flowPaths.join(' ');
    const command: string = `/Users/clawbot/.maestro/bin/maestro test ${flowArgs} --format junit --output /tmp/maestro-${runId}.xml 2>&1`;

    await new Promise<void>((resolve, reject) => {
      const client: Client = new Client();

      client.on('ready', () => {
        client.exec(command, (err: Error | undefined, stream: NodeJS.ReadableStream & { stderr: NodeJS.ReadableStream; on: (event: string, callback: (...args: any[]) => void) => any }) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          let output: string = '';

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.on('close', (exitCode: number | null, signal: string | null) => {
            if (output.length > 0) {
              console.log(`[Maestro] Run ${runId} output:\n${output}`);
            }

            if (exitCode !== 0) {
              console.warn(`[Maestro] Run ${runId} exited with code ${exitCode}, signal ${signal}. This may indicate test failures (valid results).`);
            } else {
              console.log(`[Maestro] Run ${runId} completed successfully.`);
            }

            client.end();
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
