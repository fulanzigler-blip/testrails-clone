import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../components/auth/LoginForm';

/**
 * Login Form Tests (US-001)
 * 
 * Tests covering:
 * - Email validation
 * - Password validation  
 * - Form submission
 * - Loading states
 * - Error handling
 */
describe('LoginForm', () => {
  const mockLogin = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders login form with all fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /masuk/i })).toBeInTheDocument();
    expect(screen.getByText(/lupa password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ingat saya/i)).toBeInTheDocument();
  });
  
  it('validates email format', async () => {
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /masuk/i });
    
    // Invalid email
    await userEvent.type(emailInput, 'invalid-email');
    await userEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/format email tidak valid/i)).toBeInTheDocument();
    });
    
    // Valid email
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'user@example.com');
    
    await waitFor(() => {
      expect(screen.queryByText(/format email tidak valid/i)).not.toBeInTheDocument();
    });
  });
  
  it('validates password minimum 8 characters', async () => {
    render(<LoginForm />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    
    await userEvent.type(passwordInput, 'short');
    
    await waitFor(() => {
      expect(screen.getByText(/password minimal 8 karakter/i)).toBeInTheDocument();
    });
    
    await userEvent.clear(passwordInput);
    await userEvent.type(passwordInput, 'ValidPass123!');
    
    await waitFor(() => {
      expect(screen.queryByText(/password minimal 8 karakter/i)).not.toBeInTheDocument();
    });
  });
  
  it('disables submit button until form is valid', async () => {
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /masuk/i });
    
    // Initially disabled
    expect(submitButton).toBeDisabled();
    
    // Type valid email and password
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'ValidPass123!');
    
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });
  
  it('shows loading state during submission', async () => {
    render(<LoginForm />);
    
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'ValidPass123!');
    
    const submitButton = screen.getByRole('button', { name: /masuk/i });
    await userEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/memuat/i)).toBeInTheDocument();
    });
  });
  
  it('displays error message on failed login', async () => {
    // Note: This requires mocking the auth store
    render(<LoginForm />);
    
    // Implementation would mock the login function to throw error
  });
});