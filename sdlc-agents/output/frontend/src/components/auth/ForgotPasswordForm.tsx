import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Validation schema for forgot password (US-003)
const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email wajib diisi')
    .email('Format email tidak valid'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordFormProps {
  onSuccess?: () => void;
  onBackToLogin?: () => void;
}

type FormState = 'input' | 'submitting' | 'success' | 'error';

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ 
  onSuccess, 
  onBackToLogin 
}) => {
  const [formState, setFormState] = useState<FormState>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });
  
  const email = watch('email');
  
  const onSubmit = async (data: ForgotPasswordFormData) => {
    setFormState('submitting');
    setErrorMessage(null);
    
    try {
      // Call forgot password API (US-003)
      const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });
      
      // Always show success message even if email doesn't exist (US-003: prevent enumeration)
      setFormState('success');
      onSuccess?.();
      
    } catch (error) {
      // Even on error, show generic success message to prevent email enumeration
      setFormState('success');
      onSuccess?.();
    }
  };
  
  // Success state (US-003)
  if (formState === 'success') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Link Reset Terkirim!</h2>
          
          <p className="text-gray-600 mb-4">
            Jika email <strong>{email}</strong> terdaftar, kami akan mengirimkan 
            instruksi untuk mereset password Anda.
          </p>
          
          <p className="text-sm text-gray-500 mb-6">
            Link reset berlaku selama 24 jam dan hanya dapat digunakan sekali.
          </p>
          
          <button
            onClick={onBackToLogin}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Lupa Password?</h1>
        <p className="text-gray-600 mt-2">
          Masukkan email Anda dan kami akan mengirimkan link untuk mereset password.
        </p>
      </div>
      
      {/* Info Note */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-800">
          📧 Link reset akan dikirim ke email terdaftar Anda dalam <strong>1 menit</strong>.
        </p>
      </div>
      
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Email Field */}
        <div>
          <label 
            htmlFor="forgot-email" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email Terdaftar
          </label>
          <input
            {...register('email')}
            type="email"
            id="forgot-email"
            autoComplete="email"
            disabled={formState === 'submitting'}
            className={cn(
              "w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors",
              errors.email ? "border-red-300" : "border-gray-300",
              formState === 'submitting' && "opacity-50 cursor-not-allowed"
            )}
            placeholder="nama@email.com"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          />
          {errors.email && (
            <p id="forgot-email-error" className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        
        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isValid || formState === 'submitting'}
          className={cn(
            "w-full py-2.5 px-4 rounded-md font-medium text-white transition-all",
            "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
            (!isValid || formState === 'submitting')
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          )}
        >
          {formState === 'submitting' ? (
            <span className="flex items-center justify-center">
              <svg 
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Mengirim...
            </span>
          ) : (
            'Kirim Link Reset'
          )}
        </button>
        
        {/* Back to Login */}
        <button
          type="button"
          onClick={onBackToLogin}
          disabled={formState === 'submitting'}
          className="w-full py-2.5 px-4 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          ← Kembali ke Login
        </button>
      </form>
    </div>
  );
};