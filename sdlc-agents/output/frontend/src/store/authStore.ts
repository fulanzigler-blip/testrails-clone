import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  User, 
  SessionState, 
  LoginCredentials, 
  LoginResponse, 
  RateLimitState,
  IdleState,
  IdleTimeoutConfig 
} from '../types/auth';
import type { ApiResponse } from '../types/auth';

// API base URL - configurable via env
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Default idle timeout config (matches US-005)
const DEFAULT_IDLE_CONFIG: IdleTimeoutConfig = {
  warningDuration: 5 * 60 * 1000,   // 5 minutes
  timeoutDuration: 30 * 60 * 1000,  // 30 minutes
  absoluteTimeout: 8 * 60 * 60 * 1000, // 8 hours
};

interface AuthState extends SessionState {
  // Rate limiting state
  rateLimit: RateLimitState;
  
  // Idle timeout state
  idle: IdleState;
  idleConfig: IdleTimeoutConfig;
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  clearError: () => void;
  
  // Rate limiting actions
  recordFailedAttempt: () => void;
  resetRateLimit: () => void;
  
  // Idle timeout actions
  updateActivity: () => void;
  showWarning: () => void;
  hideWarning: () => void;
  extendSession: () => void;
  checkIdleTimeout: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      lastActivity: Date.now(),
      
      // Rate limit state (US-007)
      rateLimit: {
        failedAttempts: 0,
        isLocked: false,
        lockExpiresAt: null,
        requiresCaptcha: false,
      },
      
      // Idle timeout state (US-005)
      idle: {
        isWarningShown: false,
        remainingSeconds: 0,
        lastActivity: Date.now(),
      },
      idleConfig: DEFAULT_IDLE_CONFIG,
      
      // Login action (US-001)
      login: async (credentials) => {
        const { rateLimit } = get();
        
        // Check if account is locked (US-007)
        if (rateLimit.isLocked && rateLimit.lockExpiresAt && Date.now() < rateLimit.lockExpiresAt) {
          const remainingMs = rateLimit.lockExpiresAt - Date.now();
          const remainingMinutes = Math.ceil(remainingMs / 60000);
          throw new Error(`Account locked. Try again in ${remainingMinutes} minutes.`);
        }
        
        set({ isLoading: true });
        
        try {
          const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });
          
          const data: ApiResponse<LoginResponse> = await response.json();
          
          if (!data.success) {
            // Handle rate limiting (US-007)
            if (data.error?.code === 'RATE_LIMITED' || data.error?.code === 'ACCOUNT_LOCKED') {
              get().recordFailedAttempt();
            }
            throw new Error(data.error?.message || 'Login failed');
          }
          
          // Reset rate limit on successful login
          get().resetRateLimit();
          
          // Update state (US-001, US-002)
          set({
            user: data.data.user,
            accessToken: data.data.accessToken,
            isAuthenticated: true,
            isLoading: false,
            lastActivity: Date.now(),
            idle: {
              isWarningShown: false,
              remainingSeconds: 0,
              lastActivity: Date.now(),
            },
          });
          
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      
      // Logout action (US-004)
      logout: async () => {
        const { accessToken } = get();
        
        // Call logout endpoint (US-004)
        if (accessToken) {
          try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
            });
          } catch (error) {
            // Continue with local logout even if server call fails
            console.error('Logout API call failed:', error);
          }
        }
        
        // Clear all auth state
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          lastActivity: 0,
          rateLimit: {
            failedAttempts: 0,
            isLocked: false,
            lockExpiresAt: null,
            requiresCaptcha: false,
          },
          idle: {
            isWarningShown: false,
            remainingSeconds: 0,
            lastActivity: Date.now(),
          },
        });
      },
      
      // Refresh token
      refreshToken: async () => {
        // Implementation would call refresh endpoint
        // Placeholder for token refresh logic
        return true;
      },
      
      clearError: () => {
        // Error handling is done via exceptions in this implementation
      },
      
      // Rate limiting actions (US-007)
      recordFailedAttempt: () => {
        set((state) => {
          const newAttempts = state.rateLimit.failedAttempts + 1;
          const requiresCaptcha = newAttempts >= 3;
          const isLocked = newAttempts >= 5;
          const lockExpiresAt = isLocked ? Date.now() + 15 * 60 * 1000 : null; // 15 min lock
          
          return {
            rateLimit: {
              failedAttempts: newAttempts,
              isLocked,
              lockExpiresAt,
              requiresCaptcha,
            },
          };
        });
      },
      
      resetRateLimit: () => {
        set({
          rateLimit: {
            failedAttempts: 0,
            isLocked: false,
            lockExpiresAt: null,
            requiresCaptcha: false,
          },
        });
      },
      
      // Idle timeout actions (US-005)
      updateActivity: () => {
        const now = Date.now();
        set((state) => ({
          lastActivity: now,
          idle: {
            ...state.idle,
            lastActivity: now,
          },
        }));
      },
      
      showWarning: () => {
        set((state) => ({
          idle: {
            ...state.idle,
            isWarningShown: true,
            remainingSeconds: Math.floor(state.idleConfig.warningDuration / 1000),
          },
        }));
      },
      
      hideWarning: () => {
        set((state) => ({
          idle: {
            ...state.idle,
            isWarningShown: false,
            remainingSeconds: 0,
          },
        }));
      },
      
      extendSession: () => {
        const now = Date.now();
        set({
          lastActivity: now,
          idle: {
            isWarningShown: false,
            remainingSeconds: 0,
            lastActivity: now,
          },
        });
      },
      
      checkIdleTimeout: () => {
        const { idle, idleConfig, lastActivity, isAuthenticated } = get();
        
        if (!isAuthenticated) return false;
        
        const now = Date.now();
        const idleTime = now - lastActivity;
        
        // Check if past timeout duration
        if (idleTime >= idleConfig.timeoutDuration) {
          return true; // Should logout
        }
        
        // Check if should show warning (5 min before timeout)
        const warningThreshold = idleConfig.timeoutDuration - idleConfig.warningDuration;
        if (idleTime >= warningThreshold && !idle.isWarningShown) {
          get().showWarning();
        }
        
        // Update remaining seconds in warning
        if (idle.isWarningShown) {
          const remainingBeforeTimeout = idleConfig.timeoutDuration - idleTime;
          const remainingSeconds = Math.max(0, Math.floor(remainingBeforeTimeout / 1000));
          set((state) => ({
            idle: { ...state.idle, remainingSeconds },
          }));
        }
        
        return false;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
        // Don't persist rate limit or idle state
      }),
    }
  )
);