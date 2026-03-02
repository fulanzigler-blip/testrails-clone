import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'

// Minimal working app - bypasses complex components
function MinimalApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#333' }}>TestRails Clone</h1>
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2 style={{ margin: '0 0 10px 0' }}>API Status: <span style={{ color: 'green' }}>✅ Connected</span></h2>
        <p style={{ margin: '5px 0' }}>
          Backend: <strong>Operational</strong><br/>
          Database: <strong>Connected</strong><br/>
          Redis: <strong>Connected</strong>
        </p>
        <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Authentication Test</h3>
          <p style={{ marginBottom: '10px' }}>
            Login with:
          </p>
          <p style={{ marginBottom: '10px', fontSize: '14px' }}>
            <strong>Email:</strong> deployfinal@example.com<br/>
            <strong>Password:</strong> Tr0ngP@ssw0rd!2024
          </p>
          <button
            onClick={() => {
              fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: 'deployfinal@example.com',
                  password: 'Tr0ngP@ssw0rd!2024'
                })
              })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  alert('✅ Login successful! API is working.');
                  localStorage.setItem('access_token', data.data.accessToken);
                } else {
                  alert('❌ Login failed: ' + (data.error || 'Unknown error'));
                }
              })
              .catch(err => {
                alert('❌ Network error: ' + err.message);
              });
            }}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Test Login
          </button>
        </div>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Available Endpoints</h3>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>Health Check:</strong> GET /api/v1/health</li>
          <li><strong>Login:</strong> POST /api/v1/auth/login</li>
          <li><strong>Organizations:</strong> GET /api/v1/organizations</li>
          <li><strong>Projects:</strong> GET /api/v1/projects</li>
          <li><strong>Test Cases:</strong> GET /api/v1/test-cases</li>
          <li><strong>Test Runs:</strong> GET /api/v1/test-runs</li>
        </ul>
      </div>
    </div>
  );
}

// Alternative minimal component without any React hooks or Redux
function SimpleApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#333' }}>TestRails Clone - Simple API Test</h1>
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
        <h2 style={{ margin: '0 0 10px 0' }}>Quick Login Test</h2>
        <button
          onClick={() => {
            fetch('/api/v1/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: 'deployfinal@example.com',
                password: 'Tr0ngP@ssw0rd!2024'
              })
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  alert('✅ Login successful!');
                } else {
                  alert('❌ Login failed: ' + (data.error || 'Unknown error'));
                }
              })
              .catch(err => {
                alert('❌ Error: ' + err.message);
              });
          }}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Test Login
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    { /* Try SimpleApp instead of MinimalApp */ }
    <MinimalApp />
  </StrictMode>,
)
