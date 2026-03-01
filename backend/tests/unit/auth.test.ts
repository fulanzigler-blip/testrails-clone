import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken } from '../../dist/utils/auth';

describe('Auth Utils', () => {
  describe('hashPassword', () => {
    it('should hash a password correctly', async () => {
      const password = 'SecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      expect(hash.startsWith('$argon2')).toBe(true);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'SamePassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      const password = '';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(50);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, wrongPassword);
      expect(isValid).toBe(false);
    });

    it('should reject invalid hash', async () => {
      const password = 'Password123!';
      const invalidHash = 'invalid-hash-string';

      const isValid = await verifyPassword(invalidHash, password);
      expect(isValid).toBe(false);
    });
  });

  describe('Token Generation', () => {
    it('should generate access token with correct payload', () => {
      const mockApp: any = {
        jwt: {
          sign: (payload: any, options: any) => {
            return JSON.stringify({ payload, options });
          },
        },
      };

      const userId = 'user-123';
      const token = generateAccessToken(mockApp, userId);

      const parsed = JSON.parse(token);
      expect(parsed.payload.userId).toBe(userId);
      expect(parsed.payload.type).toBe('access');
      expect(parsed.options.expiresIn).toBe('15m');
    });

    it('should generate refresh token with correct payload', () => {
      const mockApp: any = {
        jwt: {
          sign: (payload: any, options: any) => {
            return JSON.stringify({ payload, options });
          },
        },
      };

      const userId = 'user-456';
      const token = generateRefreshToken(mockApp, userId);

      const parsed = JSON.parse(token);
      expect(parsed.payload.userId).toBe(userId);
      expect(parsed.payload.type).toBe('refresh');
      expect(parsed.options.expiresIn).toBe('7d');
    });
  });

  describe('Password Hashing & Verification Together', () => {
    it('should hash and verify password successfully', async () => {
      const passwords = [
        'SimplePass',
        'ComplexP@ssw0rd!',
        '🔐🔑💻',
        'A'.repeat(100), // Long password
      ];

      for (const password of passwords) {
        const hash = await hashPassword(password);
        const isValid = await verifyPassword(hash, password);
        expect(isValid).toBe(true);
      }
    });

    it('should handle special characters', async () => {
      const passwords = [
        '密码123',
        'mot de passe',
        'пароль',
        '!@#$%^&*()_+-=[]{}|;:,.<>?',
      ];

      for (const password of passwords) {
        const hash = await hashPassword(password);
        const isValid = await verifyPassword(hash, password);
        expect(isValid).toBe(true);
      }
    });
  });
});
