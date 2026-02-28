import argon2 from 'argon2';
import { FastifyInstance, FastifyRequest } from 'fastify';
import logger from './logger';

// Password hashing with Argon2
export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  } catch (error) {
    logger.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

// Password verification
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error('Error verifying password:', error);
    return false;
  }
}

// Generate JWT token
export function generateAccessToken(fastify: FastifyInstance, userId: string): string {
  return fastify.jwt.sign(
    { userId },
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

// Generate refresh token
export function generateRefreshToken(fastify: FastifyInstance, userId: string): string {
  return fastify.jwt.sign(
    { userId, type: 'refresh' },
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
}

// Verify and decode token
export async function verifyToken(
  fastify: FastifyInstance,
  token: string
): Promise<{ userId: string; type?: string } | null> {
  try {
    const decoded = await fastify.jwt.verify<{ userId: string; type?: string }>(token);
    return decoded;
  } catch (error) {
    logger.error('Error verifying token:', error);
    return null;
  }
}

// Get user ID from request (authenticated)
export async function getUserIdFromRequest(
  request: FastifyRequest
): Promise<string | null> {
  try {
    await request.jwtVerify();
    return (request.user as any).userId;
  } catch (error) {
    return null;
  }
}

// Check if user has required role
export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  const roleHierarchy: Record<string, number> = {
    viewer: 1,
    tester: 2,
    manager: 3,
    admin: 4,
  };
  const userLevel = roleHierarchy[userRole] || 0;
  const minRequiredLevel = Math.max(...requiredRoles.map(r => roleHierarchy[r] || 0));
  return userLevel >= minRequiredLevel;
}
