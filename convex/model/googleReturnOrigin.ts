import { DEMO } from '../../shared/config';
import { fail } from './errors';

/** Only exact application origins; paths and arbitrary redirects never enter OAuth state. */
export function googleReturnOrigin(requested?: string): string | undefined {
  if (!requested) return undefined;
  const allowed = [process.env.SITE_URL?.replace(/\/$/, '')];
  if (process.env[DEMO.envVar] === 'true') allowed.push('http://localhost:8081', 'http://localhost:8082', 'http://localhost:19006', 'http://127.0.0.1:8081', 'http://127.0.0.1:8082');
  if (!allowed.includes(requested)) fail('VALIDATION', 'Unknown app return address.');
  return requested;
}
