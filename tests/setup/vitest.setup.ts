import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Set test environment variables
process.env.CAMP_CODE = 'test-camp-2026';
process.env.FB_PROJECT_ID = 'demo-test-project';
process.env.FB_CLIENT_EMAIL = 'test@demo-test-project.iam.gserviceaccount.com';
process.env.FB_PRIVATE_KEY = 'fake-key';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fake-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'localhost';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-test-project';
