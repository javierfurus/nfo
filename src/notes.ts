import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { notesDir } from './config.js';

function ensureSafeFilename(filename: string): void {
  if (!filename || /[\/\\]/.test(filename) || filename.includes('..')) {
    throw new Error(`invalid filename: ${filename}`);
  }
}

export async function noteWrite(
  orchestraId: string,
  filename: string,
  content: string,
): Promise<void> {
  ensureSafeFilename(filename);
  const dir = notesDir(orchestraId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), content, 'utf8');
}

export async function noteRead(orchestraId: string, filename: string): Promise<string> {
  ensureSafeFilename(filename);
  const file = join(notesDir(orchestraId), filename);
  if (!existsSync(file)) {
    return '';
  }
  return readFile(file, 'utf8');
}

export async function noteList(orchestraId: string): Promise<string[]> {
  const dir = notesDir(orchestraId);
  if (!existsSync(dir)) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => { return e.isFile(); }).map((e) => { return e.name; });
}
