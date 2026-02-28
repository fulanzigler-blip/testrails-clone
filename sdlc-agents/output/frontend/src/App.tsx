import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage, DashboardPage } from './pages';

/**
 * App Component
 * 
 * Main application with React Router setup.
 * Routes:
 * - /login - Login page
 * - /forgot-password - Forgot password page
 * - /reset-password/:token - Reset password page
 * - /dashboard - Protected dashboard
 * - / - Redirect to dashboard or login
 */
const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token?" element={<ResetPasswordPage />} />
        
        {/* Protected Routes */}
        <Route path="/dashboard" element={<DashboardPage />} />
        
        {/* Default Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* 404 - Redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
};

export default App;