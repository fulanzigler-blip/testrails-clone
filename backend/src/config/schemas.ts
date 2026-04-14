import { z } from 'zod';

// ─── SSH Scanner Configuration Schema ─────────────────────────────────────────────

export const SSHConfigSchema = z.object({
  host: z.string().min(1, 'SSH host must not be empty'),
  username: z.string().min(1, 'SSH username must not be empty'),
  sshKeyPath: z.string().min(1, 'SSH key path must not be empty'),
});

export type SSHConfig = z.infer<typeof SSHConfigSchema>;

export const ScannerConfigSchema = z.object({
  host: z.string().min(1, 'Host must not be empty').optional(),
  username: z.string().min(1, 'Username must not be empty').optional(),
  projectPath: z.string().min(1, 'Project path must not be empty').optional(),
  deviceId: z.string().optional(),
  sshKeyPath: z.string().min(1, 'SSH key path must not be empty').optional(),
}).strict();

export type ScannerConfig = z.infer<typeof ScannerConfigSchema>;

// ─── Web Scraper Configuration Schema ──────────────────────────────────────────────

export const ScraperConfigSchema = z.object({
  maxPages: z.number().int().positive().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  timeout: z.number().int().positive().optional(),
  headless: z.boolean().optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
  requestDelay: z.number().int().nonnegative().optional(),
  concurrentRequests: z.number().int().positive().optional(),
  respectRobotsTxt: z.boolean().optional(),
}).strict();

export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;

// ─── Validation Helpers ───────────────────────────────────────────────────────────

export function validateScannerConfig(config: unknown): ScannerConfig {
  const result = ScannerConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid ScannerConfig: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }
  return result.data;
}

export function validateSSHConfig(config: unknown): SSHConfig {
  const result = SSHConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid SSHConfig: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }
  return result.data;
}

export function validateScraperConfig(config: unknown): ScraperConfig {
  const result = ScraperConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid ScraperConfig: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }
  return result.data;
}
