import zxcvbn from 'zxcvbn';

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Object with isValid flag and error message
 */
export function validatePasswordStrength(password: string) {
  const result = zxcvbn(password);

  // Check minimum requirements
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors: string[] = [];

  if (!hasMinLength) errors.push('Password must be at least 8 characters long');
  if (!hasUppercase) errors.push('Password must contain at least one uppercase letter');
  if (!hasLowercase) errors.push('Password must contain at least one lowercase letter');
  if (!hasNumber) errors.push('Password must contain at least one number');
  if (!hasSpecialChar) errors.push('Password must contain at least one special character');

  // Check password strength score (0-4, where 4 is strongest)
  if (result.score < 3) {
    errors.push('Password is too weak - avoid common patterns and use a unique password');
  }

  return {
    isValid: errors.length === 0,
    errors,
    score: result.score,
    crackTime: result.crack_times_display.offline_slow_hashing_1e4_per_second,
  };
}

/**
 * Sanitize user input to prevent XSS
 * @param input - Input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  // Basic HTML entity encoding
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
  };

  return input.replace(/[&<>"'/]/g, char => map[char]);
}

/**
 * Sanitize all string properties in an object
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = Array.isArray(value)
          ? value.map(item => typeof item === 'string' ? sanitizeInput(item) : item)
          : sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Generate a secure random token
 * @param bytes - Number of bytes to generate
 * @returns Hex string
 */
export function generateSecureToken(bytes: number = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get Redis key for rate limiting
 * @param identifier - Email or IP address
 * @param type - Type of rate limit (login, register, etc.)
 * @returns Redis key
 */
export function getRateLimitKey(identifier: string, type: string): string {
  return `rate_limit:${type}:${identifier}`;
}

/**
 * Get Redis key for login attempts
 * @param identifier - Email or IP address
 * @returns Redis key
 */
export function getLoginAttemptsKey(identifier: string): string {
  return `login_attempts:${identifier}`;
}

/**
 * Get Redis key for account lockout
 * @param userId - User ID
 * @returns Redis key
 */
export function getAccountLockoutKey(userId: string): string {
  return `account_lockout:${userId}`;
}

/**
 * Get Redis key for email verification
 * @param userId - User ID
 * @returns Redis key
 */
export function getEmailVerificationKey(userId: string): string {
  return `email_verification:${userId}`;
}

/**
 * Get Redis key for password reset
 * @param userId - User ID
 * @returns Redis key
 */
export function getPasswordResetKey(userId: string): string {
  return `password_reset:${userId}`;
}

/**
 * Check if account is locked
 * @param userId - User ID
 * @param redis - Redis client
 * @returns True if locked
 */
export async function isAccountLocked(
  userId: string,
  redis: any
): Promise<boolean> {
  const locked = await redis.get(getAccountLockoutKey(userId));
  return locked !== null;
}

/**
 * Get account lockout TTL
 * @param userId - User ID
 * @param redis - Redis client
 * @returns TTL in seconds, or null if not locked
 */
export async function getAccountLockoutTTL(
  userId: string,
  redis: any
): Promise<number | null> {
  const ttl = await redis.ttl(getAccountLockoutKey(userId));
  return ttl > 0 ? ttl : null;
}

/**
 * Lock account
 * @param userId - User ID
 * @param duration - Duration in minutes
 * @param redis - Redis client
 */
export async function lockAccount(
  userId: string,
  duration: number,
  redis: any
): Promise<void> {
  await redis.set(getAccountLockoutKey(userId), '1', 'EX', duration * 60);
}

/**
 * Unlock account
 * @param userId - User ID
 * @param redis - Redis client
 */
export async function unlockAccount(
  userId: string,
  redis: any
): Promise<void> {
  await redis.del(getAccountLockoutKey(userId));
}
