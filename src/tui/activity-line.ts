const MAX_LEN = 60;

export function extractActivityLine(paneText: string): string {
  const lines = paneText.split('\n');
  let last = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      last = trimmed;
    }
  }
  if (last.length > MAX_LEN) {
    return last.slice(0, MAX_LEN - 1) + '…';
  }
  return last;
}
