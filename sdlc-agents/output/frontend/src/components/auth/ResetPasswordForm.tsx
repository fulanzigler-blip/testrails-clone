import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Password Reset Form (US-003)
 * 
 * Allows user to set new password after clicking reset link.
 * Enforces password requirements:
 * - Min 8 characters
 * - At least 1 uppercase
 * - At least 1 lowercase  
 * - At least 1 number
 * - At least 1 special character
 * - Must be different from old password
 */
const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Z]/, 'Minimal 1 huruf besar')
    .regex(/[a-z]/, 'Minimal 1 huruf kecil')
    .regex(/[0-9]/, 'Minimal 1 angka')
    .regex(/[^A-Za-z0-9]/, 'Minimal 1 simbol (!@#$%^&*)'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordFormProps {
  token: string;
  onSuccess?: () => void;
  onBackToLogin?: () => void;
}

type FormState = 'input' | 'submitting' | 'success' | 'error';

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
  token,
  onSuccess,
  onBackToLogin,
}) => {
  const [formState, setFormState] = useState<FormState>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });
  
  const password = watch('password');
  
  // Password strength indicators
  const requirements = [
    { label: 'Minimal 8 karakter', met: password.length >= 8 },
    { label: 'Huruf besar (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Huruf kecil (a-z)', met: /[a-z]/.test(password) },
    { label: 'Angka (0-9)', met: /[0-9]/.test(password) },
    { label: 'Simbol (!@#$%^&*)', met: /[^A-Za-z0-9]/.test(password) },
  ];
  
  const strength = requirements.filter(r => r.met).length;
  const strengthLabel = ['Sangat Lemah', 'Lemah', 'Sedang', 'Kuat', 'Sangat Kuat'][strength - 1] || '';
  const strengthColor = [
    'bg-red-500',
    'bg-red-400',
    'bg-yellow-500',
    'bg-green-400',
    'bg-green-500',
  ][strength - 1] || 'bg-gray-200';
  
  const onSubmit = async (data: ResetPasswordFormData) => {
    setFormState('submitting');
    setErrorMessage(null);
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: data.password,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Gagal reset password');
      }
      
      setFormState('success');
      onSuccess?.();
      
    } catch (error) {
      setFormState('error');
      setErrorMessage(
        error instanceof Error 
          ? error.message 
          : 'Terjadi kesalahan. Link mungkin sudah kadaluarsa.'
      );
    }
  };
  
  // Success state
  if (formState === 'success') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Password Berhasil Diubah!</h2>
          
          <p className="text-gray-600 mb-6">
            Password Anda telah berhasil diperbarui. Semua sesi aktif telah di-logout.
          </p>
          
          <button
            onClick={onBackToLogin}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Login dengan Password Baru
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Buat Password Baru</h1>
        <p className="text-gray-600 mt-2">
          Masukkan password baru yang aman untuk akun Anda.
        </p>
      </div>
      
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{errorMessage}</p>
          {formState === 'error' && (
            <button
              onClick={onBackToLogin}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Minta link reset baru
            </button>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Password Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password Baru
          </label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              disabled={formState === 'submitting'}
              className={cn(
                "w-full px-4 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
                errors.password ? "border-red-300" : "border-gray-300",
                formState === 'submitting' && "opacity-50"
              )}
              placeholder="Minimal 8 karakter"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              tabIndex={-1}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          
          {/* Password Strength */}
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all duration-300", strengthColor)}
                    style={{ width: `${(strength / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600">{strengthLabel}</span>
              </div>
              
              <ul className="space-y-1">
                {requirements.map((req, i) => (
                  <li key={i} className="flex items-center text-xs">
                    <span className={cn(
                      "mr-2",
                      req.met ? "text-green-500" : "text-gray-400"
                    )}>
                      {req.met ? "✓" : "○"}
                    </span>
                    <span className={req.met ? "text-green-700" : "text-gray-500"}>
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Konfirmasi Password
          </label>
          <div className="relative">
            <input
              {...register('confirmPassword')}
              type={showConfirm ? 'text' : 'password'}
              disabled={formState === 'submitting'}
              className={cn(
                "w-full px-4 py-2 pr-10 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
                errors.confirmPassword ? "border-red-300" : "border-gray-300",
                formState === 'submitting' && "opacity-50"
              )}
              placeholder="Ulangi password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              tabIndex={-1}
            >
              {showConfirm ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>
        
        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isValid || formState === 'submitting'}
          className={cn(
            "w-full py-2.5 px-4 rounded-md font-medium text-white transition-all",
            (!isValid || formState === 'submitting')
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          )}
        >
          {formState === 'submitting' ? 'Menyimpan...' : 'Simpan Password Baru'}
        </button>
      </form>
    </div>
  );
};