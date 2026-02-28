import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { useAuthStore } from '../store/authStore';

/**
 * Login Page (US-001)
 * 
 * Main login page with:
 * - Email/password form
 * - Redirect to original destination after login
 * - Shows logout message if redirected from logout
 */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  
  // Parse query params for messages
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('message') === 'logged_out') {
      setLogoutMessage('Anda telah berhasil logout.');
    }
    if (params.get('message') === 'session_expired') {
      setLogoutMessage('Sesi Anda telah berakhir. Silakan login kembali.');
    }
  }, [location]);
  
  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);
  
  const handleLoginSuccess = () => {
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from, { replace: true });
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Aplikasi</h1>
        </div>
        
        {/* Logout/Success Message */}
        {logoutMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800 text-center">{logoutMessage}</p>
          </div>
        )}
        
        {/* Login Form */}
        <LoginForm onSuccess={handleLoginSuccess} />
        
        {/* Security Note */}
        <p className="text-center text-xs text-gray-500 mt-6">
          🔒 Login aman dengan enkripsi SSL/TLS
        </p>
      </div>
    </div>
  );
};