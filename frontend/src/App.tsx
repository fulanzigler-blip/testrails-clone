import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppSelector } from './store/hooks'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TestCases from './pages/TestCases'
import TestRuns from './pages/TestRuns'
import TestSuites from './pages/TestSuites'
import Users from './pages/Users'
import Reports from './pages/Reports'

function AppContent() {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/test-cases" element={<TestCases />} />
        <Route path="/test-runs" element={<TestRuns />} />
        <Route path="/test-suites" element={<TestSuites />} />
        <Route path="/users" element={<Users />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
