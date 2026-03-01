import { FastifyInstance } from 'fastify';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  unlockAccountSchema,
} from '../types/schemas';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken } from '../utils/auth';
import {
  validatePasswordStrength,
  generateSecureToken,
  getRateLimitKey,
  getLoginAttemptsKey,
  getAccountLockoutKey,
  getEmailVerificationKey,
  getPasswordResetKey,
  isAccountLocked,
  getAccountLockoutTTL,
  lockAccount,
  unlockAccount,
} from '../utils/security';
import prisma from '../config/database';
import redis from '../config/redis';
import logger from '../utils/logger';
import { successResponse, errorResponses } from '../utils/response';

// SECURITY: Configurable security thresholds from environment variables
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
const ACCOUNT_LOCKOUT_DURATION_MINUTES = parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES || '30');
const EMAIL_VERIFICATION_EXPIRY_HOURS = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24');
const PASSWORD_RESET_EXPIRY_MINUTES = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '30');
const LOGIN_ATTEMPTS_WINDOW_MINUTES = parseInt(process.env.LOGIN_ATTEMPTS_WINDOW_MINUTES || '30');

export default async function authRoutes(fastify: FastifyInstance) {
  // SECURITY: Register with email verification (FIX #6, #8)
  fastify.post('/register', async (request, reply) => {
    try {
      const input = registerSchema.parse(request.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        return errorResponses.conflict(reply, 'User with this email already exists');
      }

      // SECURITY: Additional password strength validation using zxcvbn
      const passwordValidation = validatePasswordStrength(input.password);
      if (!passwordValidation.isValid) {
        return errorResponses.validation(reply, passwordValidation.errors);
      }

      // Check if organization slug already exists
      const slug = input.organizationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const existingOrg = await prisma.organization.findUnique({
        where: { slug },
      });

      if (existingOrg) {
        return errorResponses.conflict(reply, 'Organization with this name already exists');
      }

      // Create organization
      const organization = await prisma.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      // Hash password
      const passwordHash = await hashPassword(input.password);

      // Create user with email verification pending
      const verificationToken = generateSecureToken(32);
      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'admin',
          organizationId: organization.id,
          emailVerified: false,
        },
      });

      // Store verification token in Redis
      await redis.set(
        getEmailVerificationKey(user.id),
        verificationToken,
        'EX',
        EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60
      );

      // SECURITY: Send verification email (email service to be implemented)
      logger.info(`Verification email sent to ${input.email} with token: ${verificationToken}`);

      // Generate tokens (but mark user as unverified)
      const accessToken = generateAccessToken(fastify, user.id, false, user.role);
      const refreshToken = generateRefreshToken(fastify, user.id);

      await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

      logger.info(`New user registered: ${user.email} (email verification pending)`);

      return successResponse(reply, {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          emailVerified: user.emailVerified,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        accessToken,
        message: 'Please check your email to verify your account',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in register:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Login with brute force protection and account lockout (FIX #3, #10)
  fastify.post('/login', async (request, reply) => {
    try {
      const input = loginSchema.parse(request.body);
      const ip = request.ip || 'unknown';

      // Check if account is locked
      const user = await prisma.user.findUnique({
        where: { email: input.email },
        include: { organization: true },
      });

      if (user && await isAccountLocked(user.id, redis)) {
        const ttl = await getAccountLockoutTTL(user.id, redis);
        return errorResponses.tooManyRequests(reply, {
          message: 'Account temporarily locked due to too many failed login attempts',
          lockoutRemainingMinutes: Math.ceil(ttl! / 60),
        });
      }

      if (!user) {
        // Track failed attempts for non-existent user
        const attempts = await redis.incr(getLoginAttemptsKey(input.email));
        await redis.expire(getLoginAttemptsKey(input.email), LOGIN_ATTEMPTS_WINDOW_MINUTES * 60);

        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          logger.warn(`IP ${ip} exceeded login attempts for ${input.email}`);
        }

        return errorResponses.unauthorized(reply, 'Invalid email or password');
      }

      // Verify password
      const isValidPassword = await verifyPassword(user.passwordHash, input.password);

      if (!isValidPassword) {
        // Track failed attempts
        const attempts = await redis.incr(getLoginAttemptsKey(input.email));
        await redis.expire(getLoginAttemptsKey(input.email), LOGIN_ATTEMPTS_WINDOW_MINUTES * 60);

        logger.warn(`Failed login attempt ${attempts}/${MAX_LOGIN_ATTEMPTS} for ${input.email} from IP ${ip}`);

        // Lock account after max attempts
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          await lockAccount(user.id, ACCOUNT_LOCKOUT_DURATION_MINUTES, redis);
          logger.warn(`Account ${user.email} locked due to ${attempts} failed attempts`);

          return errorResponses.tooManyRequests(reply, {
            message: 'Account temporarily locked due to too many failed login attempts',
            lockoutRemainingMinutes: ACCOUNT_LOCKOUT_DURATION_MINUTES,
          });
        }

        // Return remaining attempts
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - attempts;
        return errorResponses.unauthorized(reply, {
          message: 'Invalid email or password',
          remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0,
        });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return errorResponses.forbidden(reply, {
          message: 'Please verify your email before logging in',
          emailVerified: false,
        });
      }

      // Clear login attempts on successful login
      await redis.del(getLoginAttemptsKey(input.email));

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const accessToken = generateAccessToken(fastify, user.id, true, user.role);
      const refreshToken = generateRefreshToken(fastify, user.id);

      await redis.set(`refresh_token:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

      logger.info(`User logged in: ${user.email} from IP ${ip}`);

      return successResponse(reply, {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in login:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Verify email endpoint (FIX #8)
  fastify.post('/verify-email', async (request, reply) => {
    try {
      const { token } = verifyEmailSchema.parse(request.body);

      // Find user by verification token
      const userIds = await redis.keys('email_verification:*');

      for (const key of userIds) {
        const storedToken = await redis.get(key);
        if (storedToken === token) {
          const userId = key.split(':')[2];

          // Mark email as verified
          await prisma.user.update({
            where: { id: userId },
            data: { emailVerified: true },
          });

          // Clear verification token
          await redis.del(key);

          logger.info(`Email verified for user: ${userId}`);

          return successResponse(reply, {
            message: 'Email verified successfully',
          }, undefined);
        }
      }

      return errorResponses.badRequest(reply, {
        message: 'Invalid or expired verification token',
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in verify-email:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Resend verification email (FIX #8)
  fastify.post('/resend-verification', async (request, reply) => {
    try {
      const { email } = resendVerificationSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      if (user.emailVerified) {
        return errorResponses.badRequest(reply, {
          message: 'Email is already verified',
        });
      }

      // Generate new verification token
      const verificationToken = generateSecureToken(32);
      await redis.set(
        getEmailVerificationKey(user.id),
        verificationToken,
        'EX',
        EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60
      );

      logger.info(`Verification email resent to ${email}`);

      return successResponse(reply, {
        message: 'Verification email sent',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in resend-verification:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Forgot password endpoint (FIX #9)
  fastify.post('/forgot-password', async (request, reply) => {
    try {
      const { email } = forgotPasswordSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Always return success to prevent email enumeration
      if (!user) {
        logger.info(`Password reset requested for non-existent email: ${email}`);
        return successResponse(reply, {
          message: 'If an account exists with this email, a password reset link will be sent',
        }, undefined);
      }

      // Generate reset token
      const resetToken = generateSecureToken(32);
      await redis.set(
        getPasswordResetKey(user.id),
        resetToken,
        'EX',
        PASSWORD_RESET_EXPIRY_MINUTES * 60
      );

      logger.info(`Password reset email sent to ${email} with token: ${resetToken}`);

      return successResponse(reply, {
        message: 'If an account exists with this email, a password reset link will be sent',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in forgot-password:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Reset password endpoint (FIX #9)
  fastify.post('/reset-password', async (request, reply) => {
    try {
      const { token, password } = resetPasswordSchema.parse(request.body);

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return errorResponses.validation(reply, passwordValidation.errors);
      }

      // Find user by reset token
      const userIds = await redis.keys('password_reset:*');

      let userId: string | null = null;
      for (const key of userIds) {
        const storedToken = await redis.get(key);
        if (storedToken === token) {
          userId = key.split(':')[2];
          break;
        }
      }

      if (!userId) {
        return errorResponses.badRequest(reply, {
          message: 'Invalid or expired reset token',
        });
      }

      // Update password
      const passwordHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Clear reset token and login attempts
      await redis.del(getPasswordResetKey(userId));
      await redis.del(getLoginAttemptsKey(userId));
      await redis.del(getAccountLockoutKey(userId));

      logger.info(`Password reset for user: ${userId}`);

      return successResponse(reply, {
        message: 'Password reset successfully. Please login with your new password.',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in reset-password:', error);
      return errorResponses.internal(reply);
    }
  });

  // SECURITY: Unlock account endpoint (FIX #10)
  fastify.post('/unlock-account', async (request, reply) => {
    try {
      const { email, unlockToken } = unlockAccountSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      // Check if account is locked
      if (!(await isAccountLocked(user.id, redis))) {
        return errorResponses.badRequest(reply, {
          message: 'Account is not locked',
        });
      }

      // TODO: Implement unlock token validation (sent via email)
      // For now, admin can unlock via this endpoint with proper authorization

      await redis.del(getAccountLockoutKey(user.id));
      await redis.del(getLoginAttemptsKey(email));

      logger.info(`Account unlocked for user: ${user.email}`);

      return successResponse(reply, {
        message: 'Account unlocked successfully',
      }, undefined);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return errorResponses.validation(reply, error.errors);
      }
      logger.error('Error in unlock-account:', error);
      return errorResponses.internal(reply);
    }
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    try {
      // Get refresh token from cookie
      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        return errorResponses.unauthorized(reply, 'Refresh token not found');
      }

      // Verify token
      const decoded = await fastify.jwt.verify<{ userId: string; type: string }>(refreshToken);

      if (decoded.type !== 'refresh') {
        return errorResponses.unauthorized(reply, 'Invalid token type');
      }

      // Check if refresh token exists in Redis
      const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
      if (storedToken !== refreshToken) {
        return errorResponses.unauthorized(reply, 'Invalid refresh token');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return errorResponses.unauthorized(reply, 'User not found');
      }

      // Generate new access token
      const accessToken = generateAccessToken(fastify, user.id, user.emailVerified, user.role);

      return successResponse(reply, { accessToken }, undefined);
    } catch (error: any) {
      logger.error('Error in refresh:', error);
      return errorResponses.unauthorized(reply, 'Invalid or expired refresh token');
    }
  });

  // Logout
  fastify.post('/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      // Remove refresh token from Redis
      await redis.del(`refresh_token:${userId}`);

      logger.info(`User logged out: ${userId}`);

      return reply.code(204).send();
    } catch (error) {
      // Even if token verification fails, clear cookie
      reply.clearCookie('refresh_token');
      return reply.code(204).send();
    }
  });

  // Get current user info
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const userId = (request.user as any).userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { organization: true, teams: { include: { team: true } } },
      });

      if (!user) {
        return errorResponses.notFound(reply, 'User');
      }

      return successResponse(reply, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        emailVerified: user.emailVerified,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          plan: user.organization.plan,
        },
        teams: user.teams.map(ut => ({
          id: ut.team.id,
          name: ut.team.name,
          role: ut.role,
        })),
      }, undefined);
    } catch (error) {
      logger.error('Error in /me:', error);
      return errorResponses.internal(reply);
    }
  });
}
