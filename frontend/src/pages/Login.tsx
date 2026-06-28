import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch } from '../store/hooks'
import { login } from '../store/slices/authSlice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await dispatch(login({ email, password })).unwrap()
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <svg viewBox="0 0 120 120" className="h-16 w-16" aria-hidden="true">
            <defs>
              <linearGradient id="vetLogin" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#6366f1" />
                <stop offset="1" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <rect width="120" height="120" rx="28" fill="url(#vetLogin)" />
            <path d="M22 60 C40 36, 80 36, 98 60 C80 84, 40 84, 22 60 Z" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
            <path d="M51 47 L73 60 L51 73 Z" fill="#fff" />
          </svg>
          <div className="text-center">
            <div className="text-2xl font-bold tracking-wide leading-none">VET</div>
            <div className="text-sm text-muted-foreground mt-1">Visual Exploratory Test Engine</div>
          </div>
        </div>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription>Sign in to your VET Engine account</CardDescription>
            {new URLSearchParams(window.location.search).get('reason') === 'idle' && (
              <p className="text-xs text-amber-600 mt-1">Your session expired due to inactivity. Please sign in again.</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <a href="/register" className="text-primary hover:underline">
                Sign up
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
