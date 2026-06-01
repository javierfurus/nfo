import { existsSync } from 'node:fs';
import { execa } from 'execa';
import { notesDir } from '../config.js';
import { readState } from '../state.js';

export async function openNotes(orchestraId: string): Promise<void> {
  const state = await readState(orchestraId);
  if (!state) throw new Error(`Unknown orchestra: ${orchestraId}`);

  const dir = notesDir(orchestraId);
  if (!existsSync(dir)) {
    throw new Error(`Notes directory missing for ${orchestraId}: ${dir}`);
  }

  const editor = process.env.EDITOR ?? 'vi';
  // Open the dir, not a specific file — the user picks which note to edit.
  await execa(editor, [dir], { stdio: 'inherit' });
}
