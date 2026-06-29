import type { Writable } from 'stream';

export function emitOsc52(stdout: Writable, text: string): void {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  stdout.write(`\x1b]52;c;${encoded}\x07`);
}
