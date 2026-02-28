import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm';

/**
 * Forgot Password Page (US-003)
 * 
 * Page for requesting password reset link.
 */
export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  
  const handleBackToLogin = () => {
    navigate('/login');
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
        
        {/* Forgot Password Form */}
        <ForgotPasswordForm 
          onBackToLogin={handleBackToLogin}
        />
      </div>
    </div>
  );
};