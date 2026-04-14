import { z } from 'zod';

// ─── API Detection Schemas ─────────────────────────────────────────────────────────

export const APIFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  jsonKey: z.string().optional(),
  nullable: z.boolean().optional(),
  isList: z.boolean().optional(),
  listItemType: z.string().optional(),
  description: z.string().optional(),
});

export type APIField = z.infer<typeof APIFieldSchema>;

export const APIEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  url: z.string(),
  fullPath: z.string().optional(),
  line: z.number().optional(),
  file: z.string().optional(),
  callPattern: z.string().optional(),
  responseType: z.string().optional(),
  responseFile: z.string().optional(),
  requestType: z.string().optional(),
  requestFile: z.string().optional(),
  fields: z.array(APIFieldSchema).optional(),
  requestBodyFields: z.array(APIFieldSchema).optional(),
  usedInScreens: z.array(z.string()).optional(),
});

export type APIEndpoint = z.infer<typeof APIEndpointSchema>;

export const APIDetectionResultSchema = z.object({
  apiEndpoints: z.array(APIEndpointSchema),
  screensWithAPI: z.array(z.string()),
  totalEndpoints: z.number(),
  scannedAt: z.string(),
  projectId: z.string().optional(),
});

export type APIDetectionResult = z.infer<typeof APIDetectionResultSchema>;

// ─── API Scan Request/Response Schemas ────────────────────────────────────────────

export const ScanAPIRequestSchema = z.object({
  projectId: z.string().optional(),
  projectPath: z.string().optional(),
  viaSSH: z.boolean().default(true),
});

export type ScanAPIRequest = z.infer<typeof ScanAPIRequestSchema>;

// ─── Mock Data Schemas ─────────────────────────────────────────────────────────────

export const MockDataValueSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'null']),
  value: z.any(),
  description: z.string().optional(),
});

export type MockDataValue = z.infer<typeof MockDataValueSchema>;

export const APIEndpointMockSchema = z.object({
  endpoint: z.string(),  // e.g., "GET:/api/v1/transactions"
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  url: z.string(),
  delay: z.number().optional().default(0),  // Simulated delay in ms
  response: z.object({
    success: z.boolean().default(true),
    data: z.any().optional(),
    error: z.string().optional(),
  }).optional(),
  scenario: z.string().optional(),  // e.g., "success", "error", "empty"
  label: z.string().optional(),  // e.g., "Success Response", "Not Found"
});

export type APIEndpointMock = z.infer<typeof APIEndpointMockSchema>;

// ─── Test Configuration Schemas ───────────────────────────────────────────────────

export const APITestConfigSchema = z.object({
  endpoint: z.string(),
  mode: z.enum(['mock', 'real']),
  environment: z.enum(['production', 'staging', 'dev']).default('staging'),
  mock: z.union([
    z.string(),  // Use predefined mock by name
    z.object({
      response: z.any(),
      delay: z.number().optional(),
    }),
  ]).optional(),
});

export type APITestConfig = z.infer<typeof APITestConfigSchema>;

// ─── Validation Helpers ─────────────────────────────────────────────────────────────

export function validateScanAPIRequest(data: unknown): ScanAPIRequest {
  const result = ScanAPIRequestSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid scan request: ${result.error.errors.map(e => e.message).join(', ')}`);
  }
  return result.data;
}

export function validateMockData(data: unknown): APIEndpointMock {
  const result = APIEndpointMockSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid mock data: ${result.error.errors.map(e => e.message).join(', ')}`);
  }
  return result.data;
}
