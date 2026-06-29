import type { Key } from 'ink';

export type TerminalViewportCommand =
  | { kind: 'scroll-pages'; pageCount: number }
  | { kind: 'scroll-top' }
  | { kind: 'scroll-bottom' };

export interface TerminalMouseScroll {
  button: number;
  lineCount: number;
  column: number;
  row: number;
  sequence: string;
}

export interface TerminalMouseEvent {
  kind: 'press' | 'drag' | 'release';
  column: number;
  row: number;
}

const sgrMouseSequence =
  /^(?:\u001b)?\[<(?<button>\d+);(?<column>\d+);(?<row>\d+)(?<suffix>[Mm])$/u;

function toControlCharacter(input: string): string | null {
  if (input.length !== 1) {
    return null;
  }

  const code = input.toUpperCase().charCodeAt(0);
  if (code >= 64 && code <= 95) {
    return String.fromCharCode(code - 64);
  }

  return null;
}

export function toTerminalViewportCommand(
  key: Key,
): TerminalViewportCommand | null {
  if (!key.shift) {
    return null;
  }
  if (key.pageUp) {
    return { kind: 'scroll-pages', pageCount: -1 };
  }
  if (key.pageDown) {
    return { kind: 'scroll-pages', pageCount: 1 };
  }
  if (key.home) {
    return { kind: 'scroll-top' };
  }
  if (key.end) {
    return { kind: 'scroll-bottom' };
  }

  return null;
}

export function toTerminalMouseScroll(input: string): TerminalMouseScroll | null {
  const match = sgrMouseSequence.exec(input);
  if (!match?.groups) {
    return null;
  }

  if (match.groups.suffix !== 'M') {
    return null;
  }

  const button = Number(match.groups.button);
  const column = Number(match.groups.column);
  const row = Number(match.groups.row);
  if (
    !Number.isFinite(button)
    || !Number.isFinite(column)
    || !Number.isFinite(row)
    || (button & 64) === 0
  ) {
    return null;
  }

  return {
    button,
    lineCount: (button & 1) === 0 ? -3 : 3,
    column,
    row,
    sequence: `\u001b[<${button};${column};${row}${match.groups.suffix}`,
  };
}

export function toTerminalMouseEvent(input: string): TerminalMouseEvent | null {
  const match = sgrMouseSequence.exec(input);
  if (!match?.groups) {
    return null;
  }

  const button = Number(match.groups.button);
  const column = Number(match.groups.column);
  const row = Number(match.groups.row);
  const suffix = match.groups.suffix;

  if (
    !Number.isFinite(button)
    || !Number.isFinite(column)
    || !Number.isFinite(row)
  ) {
    return null;
  }

  // Scroll/wheel events (bit 6 set) are handled by toTerminalMouseScroll, not here.
  if ((button & 64) !== 0) {
    return null;
  }

  if (suffix === 'm') {
    return { kind: 'release', column, row };
  }

  if (suffix === 'M') {
    // Bit 5 set = motion event (drag with button held).
    const kind = (button & 32) !== 0 ? 'drag' : 'press';
    return { kind, column, row };
  }

  return null;
}

export function clampToPane(
  col: number,
  row: number,
  terminalCols: number,
  terminalRows: number,
): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(terminalCols - 1, col)),
    row: Math.max(0, Math.min(terminalRows - 1, row)),
  };
}

export function toTerminalInput(input: string, key: Key): string | null {
  if (key.return) {
    return key.shift || key.meta ? '\n' : '\r';
  }
  if (key.tab) {
    return key.shift ? '\x1b[Z' : '\t';
  }
  if (key.backspace) {
    return '\x7f';
  }
  if (key.delete) {
    return '\x1b[3~';
  }
  if (key.escape) {
    return '\x1b';
  }
  if (key.upArrow) {
    return '\x1b[A';
  }
  if (key.downArrow) {
    return '\x1b[B';
  }
  if (key.rightArrow) {
    return '\x1b[C';
  }
  if (key.leftArrow) {
    return '\x1b[D';
  }
  if (key.home) {
    return '\x1b[H';
  }
  if (key.end) {
    return '\x1b[F';
  }
  if (key.pageUp) {
    return '\x1b[5~';
  }
  if (key.pageDown) {
    return '\x1b[6~';
  }
  if (key.ctrl) {
    return toControlCharacter(input);
  }
  if (key.meta && input.length > 0) {
    return `\x1b${input}`;
  }
  if (input.length > 0) {
    return input;
  }

  return null;
}
