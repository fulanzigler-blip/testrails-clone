import React from 'react';
import { LogoutButton, ProtectedRoute, SessionTimeoutWarning } from '../components/auth';
import { useAuthStore } from '../store/authStore';

/**
 * Dashboard Page (Protected)
 * 
 * Example protected page showing logged-in state.
 * Includes logout button and session timeout warning.
 */
export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* User Info */}
              <div className="hidden sm:flex items-center gap-3">
                {user?.profilePicture ? (
                  <img 
                    src={user.profilePicture} 
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </div>
              
              {/* Logout */}
              <LogoutButton />
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Welcome Card */}
            <div className="md:col-span-2 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Selamat Datang, {user?.name?.split(' ')[0] || 'Pengguna'}! 👋
              </h2>
              <p className="text-gray-600">
                Anda berhasil login ke aplikasi. Ini adalah contoh halaman dashboard 
                yang dilindungi oleh autentikasi.
              </p>
              
              <div className="mt-4 p-4 bg-blue-50 rounded-md">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Fitur Tersedia:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✅ Login dengan Email/Password (US-001)</li>
                  <li>✅ Remember Me / Stay Logged In (US-002)</li>
                  <li>✅ Forgot Password / Reset Password (US-003)</li>
                  <li>✅ Logout (US-004)</li>
                  <li>✅ Session Timeout with Warning (US-005)</li>
                  <li>✅ Rate Limiting UI Feedback (US-007)</li>
                </ul>
              </div>
            </div>
            
            {/* Session Info Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Informasi Sesi</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Aktif
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">User ID:</span>
                  <span className="ml-2 text-gray-700 font-mono">{user?.id?.slice(0, 8)}...</span>
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>
                  <span className="ml-2 text-gray-700">{user?.email}</span>
                </div>
                {user?.createdAt && (
                  <div>
                    <span className="text-gray-500">Member Sejak:</span>
                    <span className="ml-2 text-gray-700">
                      {new Date(user.createdAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
        
        {/* Session Timeout Warning Modal (US-005) */}
        <SessionTimeoutWarning />
      </div>
    </ProtectedRoute>
  );
};