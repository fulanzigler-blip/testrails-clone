import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../store/authStore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Validation schema matching US-001 requirements
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email wajib diisi')
    .email('Format email tidak valid'),
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
    .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
    .regex(/[0-9]/, 'Password harus mengandung angka'),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const { login, rateLimit, logout } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });
  
  // Watch form values for button state
  const formValues = watch();
  const isFormFilled = formValues.email.length > 0 && formValues.password.length >= 8;
  
  // Handle account lock countdown (US-007)
  useEffect(() => {
    if (rateLimit.isLocked && rateLimit.lockExpiresAt) {
      const updateCountdown = () => {
        const remaining = Math.max(0, rateLimit.lockExpiresAt! - Date.now());
        setLockCountdown(Math.ceil(remaining / 1000));
        
        if (remaining <= 0) {
          useAuthStore.getState().resetRateLimit();
        }
      };
      
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [rateLimit.isLocked, rateLimit.lockExpiresAt]);
  
  const onSubmit = async (data: LoginFormData) => {
    // Check if account is locked
    if (rateLimit.isLocked) {
      const remainingMinutes = Math.ceil(lockCountdown / 60);
      setError(`Akun terkunci. Coba lagi dalam ${remainingMinutes} menit.`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
      });
      
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat login';
      setError(message);
      
      // Check if we need to show rate limit warning
      if (rateLimit.failedAttempts > 0) {
        const remainingAttempts = 5 - rateLimit.failedAttempts;
        if (remainingAttempts > 0) {
          setError(`${message} (${remainingAttempts} percobaan tersisa)`);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Masuk ke Akun</h1>
        <p className="text-gray-600 mt-2">Silakan masukkan email dan password Anda</p>
      </div>
      
      {/* Rate Limit Warning (US-007) */}
      {rateLimit.requiresCaptcha && !rateLimit.isLocked && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            ⚠️ Terlalu banyak percobaan gagal. Verifikasi tambahan mungkin diperlukan.
          </p>
        </div>
      )}
      
      {/* Account Locked Warning (US-007) */}
      {rateLimit.isLocked && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm font-medium text-red-800">
            🔒 Akun Terkunci
          </p>
          <p className="text-sm text-red-700 mt-1">
            Coba lagi dalam: <span className="font-mono font-bold">{formatCountdown(lockCountdown)}</span>
          </p>
        </div>
      )}
      
      {/* Error Message (US-001: without leaking valid/invalid info) */}
      {error && !rateLimit.isLocked && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Email Field (US-001) */}
        <div>
          <label 
            htmlFor="email" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            autoComplete="email"
            disabled={isLoading || rateLimit.isLocked}
            className={cn(
              "w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
              errors.email ? "border-red-300" : "border-gray-300",
              (isLoading || rateLimit.isLocked) && "opacity-50 cursor-not-allowed"
            )}
            placeholder="nama@email.com"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        
        {/* Password Field (US-001) */}
        <div>
          <label 
            htmlFor="password" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              disabled={isLoading || rateLimit.isLocked}
              className={cn(
                "w-full px-4 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
                errors.password ? "border-red-300" : "border-gray-300",
                (isLoading || rateLimit.isLocked) && "opacity-50 cursor-not-allowed"
              )}
              placeholder="Minimal 8 karakter"
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>
        
        {/* Remember Me & Forgot Password (US-002, US-003) */}
        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              {...register('rememberMe')}
              type="checkbox"
              disabled={isLoading || rateLimit.isLocked}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-600">Ingat saya</span>
          </label>
          
          <a 
            href="/forgot-password" 
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Lupa password?
          </a>
        </div>
        
        {/* Submit Button (US-001: disabled until valid) */}
        <button
          type="submit"
          disabled={!isValid || isLoading || rateLimit.isLocked || !isFormFilled}
          className={cn(
            "w-full py-2.5 px-4 rounded-md font-medium text-white transition-all",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
            (!isValid || isLoading || rateLimit.isLocked || !isFormFilled)
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          )}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg 
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Memuat...
            </span>
          ) : (
            'Masuk'
          )}
        </button>
        
        {/* Register Link */}
        <p className="text-center text-sm text-gray-600 mt-4">
          Belum punya akun?{' '}
          <a href="/register" className="text-blue-600 hover:text-blue-800 hover:underline">
            Daftar sekarang
          </a>
        </p>
      </form>
    </div>
  );
};