// Turns a shared/domain LINKS deep link ("mega://chat/<id>") into an in-app router path
// ("/chat/<id>"), so routes are derived from the single source of truth instead of hardcoded twice.
import { IDENTITY } from '@shared/config/identity';

const prefix = `${IDENTITY.scheme}://`;

export function toPath(link: string): string {
  return `/${link.slice(prefix.length)}`;
}
