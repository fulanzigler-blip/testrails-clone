# TestRails Clone - Frontend

Modern test management system frontend built with React 18, TypeScript, and Tailwind CSS.

## 🚀 Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **Redux Toolkit** - State management
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Recharts** - Data visualization
- **Lucide React** - Icons

## 📦 Features

- ✅ Dashboard with test statistics and charts
- ✅ Test case management (CRUD operations)
- ✅ Test run execution with real-time progress
- ✅ Test suite organization (hierarchical structure)
- ✅ User management with role-based access
- ✅ Reports and analytics
- ✅ Responsive design
- ✅ Accessibility (ARIA, keyboard navigation)
- ✅ Dark mode support

## 🛠️ Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your API URL:
```
VITE_API_URL=http://localhost:3001/api/v1
```

4. Start development server:
```bash
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/           # Reusable UI components (shadcn/ui)
│   │   └── Layout.tsx    # Main layout component
│   ├── lib/
│   │   ├── api.ts        # Axios configuration
│   │   └── utils.ts      # Utility functions
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── TestCases.tsx
│   │   ├── TestRuns.tsx
│   │   ├── TestSuites.tsx
│   │   ├── Users.tsx
│   │   ├── Reports.tsx
│   │   └── Login.tsx
│   ├── store/
│   │   ├── slices/       # Redux slices
│   │   ├── index.ts      # Store configuration
│   │   └── hooks.ts      # Typed hooks
│   ├── App.tsx           # Main app component
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── public/               # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

## 🎨 UI Components

This project uses shadcn/ui components, which are:
- Fully customizable
- Accessible (WCAG 2.1 AA compliant)
- Built with Radix UI primitives
- Styled with Tailwind CSS

Available components:
- Button
- Input
- Label
- Card
- Badge
- (More can be added as needed)

## 🔐 Authentication

The app uses JWT tokens for authentication:
- Access token stored in localStorage (expires in 15 minutes)
- Refresh token stored as HTTP-only cookie
- Automatic token refresh on 401 errors

## 📊 State Management

Redux Toolkit is used for state management with the following slices:
- `auth` - User authentication
- `projects` - Project data
- `testCases` - Test case management
- `testRuns` - Test run execution
- `users` - User management
- `notifications` - Notification system

## 🔄 API Integration

All API calls are made through the configured Axios instance:
- Base URL from environment variable
- Automatic Bearer token injection
- Request/response interceptors
- Error handling

## 📈 Charts & Reports

Recharts is used for data visualization:
- Line charts for trends
- Bar charts for comparisons
- Pie charts for distributions
- Responsive and interactive

## ♿ Accessibility

The application follows WCAG 2.1 AA guidelines:
- Semantic HTML
- ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader friendly

## 🌙 Dark Mode

Built-in dark mode support with CSS custom properties.
Toggle between light and dark themes.

## 🚢 Building for Production

```bash
npm run build
```

The optimized production build will be in the `dist` directory.

## 🧪 Testing

Tests can be added using:
- Vitest for unit tests
- React Testing Library for component tests
- Playwright for E2E tests

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Ensure TypeScript compilation passes
4. Submit a pull request

## 📄 License

[To be determined]

## 🔗 Related

- [Backend API](../backend)
- [Architecture](../ARCHITECTURE.md)
- [API Contracts](../API_CONTRACTS.md)
