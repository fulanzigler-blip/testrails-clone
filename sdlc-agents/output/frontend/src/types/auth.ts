/**
 * Authentication Types
 * 
 * Type definitions for auth system based on user stories:
 * - US-001: Login with email/password
 * - US-002: Remember Me
 * - US-003: Forgot Password
 * - US-004: Logout
 * - US-005: Session Timeout
 * - US-007: Rate Limiting
 */

// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
  createdAt: string;
}

// Login Types
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
}

// Password Reset Types
export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

// Session Types
export interface SessionState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  lastActivity: number;
}

// Rate Limiting Types
export interface RateLimitState {
  failedAttempts: number;
  isLocked: boolean;
  lockExpiresAt: number | null;
  requiresCaptcha: boolean;
}

export interface LoginError {
  type: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'ACCOUNT_LOCKED' | 'SERVER_ERROR' | 'VALIDATION_ERROR';
  message: string;
  lockDuration?: number; // minutes remaining
  retryAfter?: number; // seconds
}

// Idle Timeout Types
export interface IdleTimeoutConfig {
  warningDuration: number; // 5 minutes (300000ms)
  timeoutDuration: number; // 30 minutes (1800000ms)
  absoluteTimeout: number; // 8 hours (28800000ms)
}

export interface IdleState {
  isWarningShown: boolean;
  remainingSeconds: number;
  lastActivity: number;
}

// API Response Types
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  retryAfter?: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Form Validation Types
export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface ForgotPasswordFormData {
  email: string;
}

export interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

// Route Protection Types
export interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Component Props Types
export interface AuthFormProps {
  onSubmit: (data: LoginFormData) => Promise<void>;
  isLoading: boolean;
  error?: LoginError | null;
}

export interface SessionTimeoutWarningProps {
  isOpen: boolean;
  remainingSeconds: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}