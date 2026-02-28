import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { createPortal } from 'react-dom';

/**
 * Session Timeout Warning Modal (US-005)
 * 
 * Shows warning popup 5 minutes before auto-logout.
 * User can click "Stay Logged In" to extend session.
 */
export const SessionTimeoutWarning: React.FC = () => {
  const { idle, logout, extendSession } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Don't render if not showing warning
  if (!idle.isWarningShown || !mounted) return null;
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const modalContent = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-title"
    >
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          {/* Icon */}
          <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg 
              className="w-7 h-7 text-yellow-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
              />
            </svg>
          </div>
          
          {/* Title */}
          <h2 
            id="timeout-title" 
            className="text-xl font-semibold text-gray-900 text-center mb-2"
          >
            Sesi Akan Berakhir
          </h2>
          
          {/* Description */}
          <p className="text-gray-600 text-center mb-4">
            Anda telah tidak aktif selama beberapa waktu. 
            Sesi akan berakhir otomatis dalam:
          </p>
          
          {/* Countdown Timer */}
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-2 bg-gray-100 rounded-lg font-mono text-2xl font-bold text-red-600">
              {formatTime(idle.remainingSeconds)}
            </span>
          </div>
          
          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={extendSession}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Tetap Login
            </button>
            
            <button
              onClick={logout}
              className="w-full py-2.5 px-4 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Logout Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  
  return createPortal(modalContent, document.body);
};