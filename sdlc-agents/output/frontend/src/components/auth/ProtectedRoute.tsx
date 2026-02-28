import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { ProtectedRouteProps } from '../../types/auth';

/**
 * Protected Route Component
 * 
 * Guards routes that require authentication.
 * Redirects to login if not authenticated.
 * Also handles session timeout checking.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children,
  fallback,
}) => {
  const { isAuthenticated, isLoading, checkIdleTimeout, logout } = useAuthStore();
  const location = useLocation();
  
  // Check for idle timeout on mount and periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial check
    const shouldLogout = checkIdleTimeout();
    if (shouldLogout) {
      logout();
      return;
    }
    
    // Set up activity listeners
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const updateActivity = () => {
      useAuthStore.getState().updateActivity();
    };
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });
    
    // Periodic idle check
    const interval = setInterval(() => {
      const shouldLogoutNow = checkIdleTimeout();
      if (shouldLogoutNow) {
        logout();
      }
    }, 1000); // Check every second
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(interval);
    };
  }, [isAuthenticated, checkIdleTimeout, logout]);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-gray-600">Memuat...</span>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    // Redirect to login, save attempted URL for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};