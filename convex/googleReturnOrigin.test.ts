import { afterEach, expect, test, vi } from 'vitest';
import { googleReturnOrigin } from './model/googleReturnOrigin';
afterEach(() => vi.unstubAllEnvs());
test('demo accepts exact local origin, never arbitrary redirects', () => {
  vi.stubEnv('DEMO_MODE', 'true');
  expect(googleReturnOrigin('http://localhost:8082')).toBe('http://localhost:8082');
  for (const bad of ['https://evil.test', 'http://localhost:8082.evil.test', 'http://localhost:8082/path', 'http://localhost:8082@evil.test']) expect(() => googleReturnOrigin(bad)).toThrow();
});
test('production allows only configured site; older callers keep fallback', () => {
  vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('SITE_URL', 'https://mega.example/');
  expect(googleReturnOrigin('https://mega.example')).toBe('https://mega.example');
  expect(googleReturnOrigin()).toBeUndefined();
  expect(() => googleReturnOrigin('http://localhost:8082')).toThrow();
});
