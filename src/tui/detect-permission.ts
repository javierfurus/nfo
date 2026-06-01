const LAST_N_LINES = 20;
const MAX_TOOL_LEN = 60;

const INTRO_PATTERNS: RegExp[] = [
  /allow\s+\S+/i,
  /do you want to/i,
  /permission required/i,
  /use this tool/i,
];

export interface PermissionDetection {
  pending: boolean;
  tool: string | null;
}

function hasYesLine(lines: string[]): boolean {
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('1.') || trimmed.startsWith('1)')) {
      return true;
    }
  }
  return false;
}

function hasNoLine(lines: string[]): boolean {
  for (const line of lines) {
    const trimmed = line.trimStart();
    const startsWithSmallDigit =
      trimmed.startsWith('2.') ||
      trimmed.startsWith('2)') ||
      trimmed.startsWith('3.') ||
      trimmed.startsWith('3)');
    if (startsWithSmallDigit && trimmed.includes('No')) {
      return true;
    }
  }
  return false;
}

function hasIntroPattern(lines: string[]): boolean {
  const block = lines.join('\n');
  for (const pattern of INTRO_PATTERNS) {
    if (pattern.test(block)) {
      return true;
    }
  }
  return false;
}

function extractTool(lines: string[]): string | null {
  try {
    const block = lines.join('\n');
    const nameMatch = /^Allow ([A-Z][A-Za-z]+)/m.exec(block);
    if (!nameMatch) {
      return null;
    }
    const toolName = nameMatch[1];
    // Find the full line that contains the Allow … match, to search for backticks.
    const matchIndex = nameMatch.index;
    const lineStart = matchIndex;
    const lineEnd = block.indexOf('\n', matchIndex);
    const fullLine = lineEnd === -1 ? block.slice(lineStart) : block.slice(lineStart, lineEnd);
    const backtickMatch = /`([^`]*)`/.exec(fullLine);
    let result: string;
    if (backtickMatch) {
      result = `${toolName}: \`${backtickMatch[1]}\``;
    } else {
      result = toolName;
    }
    if (result.length > MAX_TOOL_LEN) {
      return result.slice(0, MAX_TOOL_LEN - 1) + '…';
    }
    return result;
  } catch {
    return null;
  }
}

export function detectPermissionPrompt(paneText: string): PermissionDetection {
  const allLines = paneText.split('\n');
  const nonEmpty = allLines.filter((line) => { return line.trim().length > 0; });
  const lines = nonEmpty.slice(-LAST_N_LINES);

  const pending = hasYesLine(lines) && hasNoLine(lines) && hasIntroPattern(lines);

  if (!pending) {
    return { pending: false, tool: null };
  }

  const tool = extractTool(lines);
  return { pending: true, tool };
}
