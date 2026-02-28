# Frontend - Authentication System

React-based authentication frontend implementing user stories for Login feature.

## 📋 User Stories Implemented

| US | Feature | Status | File |
|----|---------|--------|------|
| US-001 | Login with Email/Password | ✅ | `components/auth/LoginForm.tsx` |
| US-002 | Remember Me / Stay Logged In | ✅ | `store/authStore.ts` |
| US-003 | Forgot Password / Reset Password | ✅ | `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx` |
| US-004 | Logout | ✅ | `components/auth/LogoutButton.tsx` |
| US-005 | Session Timeout with Warning | ✅ | `components/auth/SessionTimeoutWarning.tsx` |
| US-007 | Rate Limiting UI | ✅ | `components/auth/LoginForm.tsx` |

## 🏗️ Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand (with persist middleware)
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **Testing**: Vitest + React Testing Library

## 📁 Project Structure

```
src/
├── components/
│   └── auth/
│       ├── LoginForm.tsx          # US-001
│       ├── ForgotPasswordForm.tsx # US-003
│       ├── ResetPasswordForm.tsx  # US-003
│       ├── LogoutButton.tsx       # US-004
│       ├── SessionTimeoutWarning.tsx # US-005
│       ├── ProtectedRoute.tsx     # Route guard
│       └── index.ts               # Exports
├── pages/
│   ├── LoginPage.tsx
│   ├── ForgotPasswordPage.tsx
│   ├── ResetPasswordPage.tsx
│   └── DashboardPage.tsx
├── store/
│   └── authStore.ts               # Auth state + US-002, US-005, US-007
├── types/
│   └── auth.ts                    # TypeScript interfaces
├── __tests__/
│   ├── LoginForm.test.tsx
│   └── authStore.test.ts
├── App.tsx                        # Router setup
├── main.tsx                       # Entry point
└── index.css                      # Tailwind imports
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

App runs on `http://localhost:5173`

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

## 🔌 API Integration

### Environment Variables

```bash
VITE_API_URL=http://localhost:3000/api/v1  # Backend API base URL
VITE_API_PROXY=/api                        # Dev proxy target
```

### API Endpoints Expected

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with credentials |
| POST | `/auth/logout` | Logout user |
| POST | `/auth/forgot-password` | Send reset link |
| POST | `/auth/reset-password` | Reset password with token |
| POST | `/auth/refresh` | Refresh access token |

### Request/Response Format

**Login Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "rememberMe": true
}
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "accessToken": "jwt-token",
    "expiresIn": 7200
  }
}
```

## 🎨 Design System

### Colors
- Primary: Blue (#2563eb)
- Success: Green (#16a34a)
- Error: Red (#dc2626)
- Warning: Yellow (#ca8a04)

### Typography
- Font: System font stack
- Headings: Bold, text-gray-900
- Body: text-gray-600

### Spacing
- Base unit: 4px (Tailwind default)
- Container max-width: 448px (forms), 1152px (dashboard)

## ♿ Accessibility

- Semantic HTML structure
- ARIA labels for form fields
- Focus-visible outlines
- Proper heading hierarchy
- Reduced motion support

## 📱 Responsive

- Mobile-first design
- Form max-width: 448px
- Dashboard responsive grid
- Touch-friendly inputs (min 44px tap targets)