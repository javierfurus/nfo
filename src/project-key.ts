import { createHash } from 'node:crypto';
import { basename } from 'node:path';

export function projectKeyFromPath(absolutePath: string): string {
  const hash = createHash('sha1').update(absolutePath).digest('hex').slice(0, 10);
  const name = basename(absolutePath)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${hash}-${name || 'project'}`;
}
