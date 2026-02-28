import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';

/**
 * Reset Password Page (US-003)
 * 
 * Page for setting new password using reset token.
 * Token is typically from URL query param or route param.
 */
export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  
  // Also support query param
  const queryParams = new URLSearchParams(window.location.search);
  const tokenFromQuery = queryParams.get('token');
  const resetToken = token || tokenFromQuery;
  
  const handleBackToLogin = () => {
    navigate('/login');
  };
  
  const handleSuccess = () => {
    // Redirect with small delay to show success message
    setTimeout(() => {
      navigate('/login?message=password_reset');
    }, 2000);
  };
  
  // Token is required
  if (!resetToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Tidak Valid</h2>
          <p className="text-gray-600 mb-4">
            Link reset password tidak valid atau sudah kadaluarsa.
          </p>
          
          <button
            onClick={handleBackToLogin}
            className="py-2.5 px-4 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <ResetPasswordForm 
          token={resetToken}
          onSuccess={handleSuccess}
          onBackToLogin={handleBackToLogin}
        />
      </div>
    </div>
  );
};