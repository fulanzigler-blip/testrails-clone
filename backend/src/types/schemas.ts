import { z } from 'zod';

// Auth schemas
// SECURITY: Password complexity requirements (FIX #6)
export const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .refine(password => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
    .refine(password => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
    .refine(password => /[0-9]/.test(password), 'Password must contain at least one number')
    .refine(password => /[!@#$%^&*(),.?":{}|<>]/.test(password), 'Password must contain at least one special character'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  organizationName: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1).max(128),
});

// SECURITY: Email verification schema (FIX #8)
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// SECURITY: Resend verification email schema
export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// SECURITY: Forgot password schema (FIX #9)
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// SECURITY: Reset password schema (FIX #9)
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .refine(password => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
    .refine(password => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
    .refine(password => /[0-9]/.test(password), 'Password must contain at least one number')
    .refine(password => /[!@#$%^&*(),.?":{}|<>]/.test(password), 'Password must contain at least one special character'),
});

// SECURITY: Unlock account schema (FIX #10)
export const unlockAccountSchema = z.object({
  email: z.string().email('Invalid email address'),
  unlockToken: z.string().min(1, 'Unlock token is required'),
});

// Organization schemas
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  maxUsers: z.number().int().positive().optional(),
});

// User schemas
export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['admin', 'manager', 'tester', 'viewer']).optional(),
});

// Project schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

// Test Suite schemas
export const createTestSuiteSchema = z.object({
  name: z.string().min(1, 'Suite name is required'),
  description: z.string().optional(),
  projectId: z.string().uuid('Invalid project ID'),
  parentSuiteId: z.string().uuid().optional(),
});

export const updateTestSuiteSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentSuiteId: z.string().uuid().optional(),
});

// Test Case schemas
export const createTestCaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  steps: z.array(z.object({
    order: z.number().int().positive(),
    description: z.string(),
    expected: z.string(),
  })).optional(),
  expectedResult: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  automationType: z.enum(['manual', 'automated', 'semi_automated']).optional(),
  suiteId: z.string().uuid('Invalid suite ID').optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
});

export const updateTestCaseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  steps: z.array(z.object({
    order: z.number().int().positive(),
    description: z.string(),
    expected: z.string(),
  })).optional(),
  expectedResult: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  automationType: z.enum(['manual', 'automated', 'semi_automated']).optional(),
  suiteId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  customFields: z.record(z.any()).optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
});

// Test Run schemas
export const createTestRunSchema = z.object({
  name: z.string().min(1, 'Run name is required'),
  description: z.string().optional(),
  projectId: z.string().uuid('Invalid project ID'),
  suiteId: z.string().uuid().optional(),
  includeAll: z.boolean().default(false),
  caseIds: z.array(z.string().uuid()).optional(),
  environment: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const updateTestRunSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  environment: z.string().optional(),
  config: z.record(z.any()).optional(),
});

// Test Result schemas
export const updateTestResultSchema = z.object({
  status: z.enum(['passed', 'failed', 'skipped', 'blocked', 'running']).optional(),
  comment: z.string().optional(),
  durationMs: z.number().int().positive().optional(),
  attachments: z.array(z.any()).optional(),
  customFields: z.record(z.any()).optional(),
});

// Bug schemas
export const createBugSchema = z.object({
  title: z.string().min(1, 'Bug title is required'),
  description: z.string().optional(),
  severity: z.enum(['trivial', 'minor', 'major', 'critical']).optional(),
  provider: z.enum(['jira', 'github', 'gitlab', 'linear', 'custom']).optional(),
});

// Integration schemas
export const createIntegrationSchema = z.object({
  type: z.enum(['jira', 'github', 'slack', 'email', 'webhook']),
  name: z.string().optional(),
  config: z.record(z.any()),
  enabled: z.boolean().default(true),
});

export const updateIntegrationSchema = z.object({
  name: z.string().optional(),
  config: z.record(z.any()).optional(),
  enabled: z.boolean().optional(),
});

// Pagination query schema
export const paginationSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  perPage: z.string().optional().transform(val => val ? Math.min(parseInt(val), 100) : 20),
  search: z.string().optional(),
});

// Export types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type UpdateTestResultInput = z.infer<typeof updateTestResultSchema>;
export type CreateBugInput = z.infer<typeof createBugSchema>;
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
