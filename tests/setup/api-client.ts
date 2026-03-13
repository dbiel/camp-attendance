/**
 * Test API client helpers.
 * These make HTTP requests to the Next.js dev server running during integration tests.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface FetchOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

async function apiFetch(path: string, options: FetchOptions = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const url = `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/**
 * Make a request as an admin (with Bearer token).
 * In integration tests, this token comes from the Firebase Auth emulator.
 */
export function adminFetch(path: string, options: FetchOptions = {}) {
  const adminToken = process.env.TEST_ADMIN_TOKEN;
  if (!adminToken) throw new Error('TEST_ADMIN_TOKEN not set — run emulator setup first');

  return apiFetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${adminToken}`,
    },
  });
}

/**
 * Make a request as a teacher (with camp code header).
 */
export function teacherFetch(path: string, options: FetchOptions = {}) {
  const campCode = process.env.CAMP_CODE || 'test-camp-2026';
  return apiFetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'X-Camp-Code': campCode,
    },
  });
}

/**
 * Make a request with no auth at all.
 */
export function publicFetch(path: string, options: FetchOptions = {}) {
  return apiFetch(path, options);
}

/**
 * Make a request with an invalid Bearer token.
 */
export function invalidTokenFetch(path: string, options: FetchOptions = {}) {
  return apiFetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: 'Bearer invalid-garbage-token-12345',
    },
  });
}

/**
 * Make a request with an invalid camp code.
 */
export function invalidCampCodeFetch(path: string, options: FetchOptions = {}) {
  return apiFetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'X-Camp-Code': 'wrong-code-999',
    },
  });
}
