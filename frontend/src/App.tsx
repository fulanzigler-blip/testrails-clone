import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from './store/hooks'
import { getCurrentUser } from './store/slices/authSlice'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import TestCases from './pages/TestCases'
import TestRuns from './pages/TestRuns'
import TestSuites from './pages/TestSuites'
import Users from './pages/Users'
import Reports from './pages/Reports'
import Projects from './pages/Projects'
import FlowBuilderPage from './pages/FlowBuilderPage'
import PageAutomationPage from './pages/PageAutomationPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth)

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token && token !== 'undefined') {
      dispatch(getCurrentUser())
    } else {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
  }, [dispatch])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="test-cases" element={<TestCases />} />
          <Route path="test-runs" element={<TestRuns />} />
          <Route path="test-suites" element={<TestSuites />} />
          <Route path="users" element={<Users />} />
          <Route path="reports" element={<Reports />} />
          <Route path="flow-builder" element={<FlowBuilderPage />} />
          <Route path="page-automation" element={<PageAutomationPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
