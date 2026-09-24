import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Root Vitest config for the user-story suites under tests/. The frontend keeps its own config for
// its co-located tests; this one never collects frontend/src or the backend node:test files.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.jsx'],
          setupFiles: ['tests/shared/setup/jsdom.setup.js'],
          clearMocks: true,
          // Whole-application flows type into several fields with user-event; no sleeps are involved.
          testTimeout: 20000,
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.js'],
          clearMocks: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'json-summary'],
      // Application-owned authentication, registration and authorisation code only — never Firebase.
      include: [
        'frontend/src/context/**',
        'frontend/src/hooks/useAuth.js',
        'frontend/src/components/ProtectedRoute.jsx',
        'frontend/src/components/Navbar.jsx',
        'frontend/src/pages/LoginPage.jsx',
        'frontend/src/pages/RegisterPage.jsx',
        'frontend/src/pages/ProfilePage.jsx',
        'frontend/src/pages/ForbiddenPage.jsx',
        'frontend/src/utils/authErrors.js',
        'frontend/src/utils/access.js',
        'frontend/src/utils/roleLabels.js',
        'frontend/src/services/api.js',
        'backend/src/app.js',
        'backend/src/middleware/authenticate.js',
        'backend/src/middleware/requireRole.js',
        'backend/src/routes/profileRoutes.js',
        'backend/src/routes/eventRequestRoutes.js',
        'backend/src/controllers/profileController.js',
        'backend/src/services/profileService.js',
        'shared/userProfile.js',
        'shared/permissions.js',
      ],
      exclude: ['**/*.test.*', '**/*.cases.js', '**/*.live.js', 'backend/src/testing/**'],
    },
  },
})
