import React from 'react';
import { useAuthStore } from '../../store/authStore';

/**
 * Logout Button (US-004)
 * 
 * Accessible logout button with confirmation.
 * Clears session from server and client.
 */
interface LogoutButtonProps {
  variant?: 'button' | 'menu-item';
  showConfirm?: boolean;
  className?: string;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  variant = 'button',
  showConfirm = false,
  className = '',
}) => {
  const { logout, isLoading } = useAuthStore();
  
  const handleLogout = async () => {
    if (showConfirm) {
      const confirmed = window.confirm('Apakah Anda yakin ingin logout?');
      if (!confirmed) return;
    }
    
    await logout();
    // Redirect happens via router/navigation
    window.location.href = '/login?message=logged_out';
  };
  
  const baseClasses = "inline-flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500";
  
  const variantClasses = {
    button: "px-4 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 font-medium",
    'menu-item': "w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 hover:text-red-800",
  };
  
  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${className} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-label="Logout"
    >
      <svg 
        className="w-5 h-5" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
        />
      </svg>
      
      <span>{isLoading ? 'Logging out...' : 'Logout'}</span>
    </button>
  );
};