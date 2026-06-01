import xtermHeadless from '@xterm/headless';
import type { IBufferCell, IBufferLine, Terminal as XTermTerminal } from '@xterm/headless';
import { spawn, type IPty } from 'node-pty';

const { Terminal } = xtermHeadless;

export interface EmbeddedTerminalSpan {
  text: string;
  color?: string;
  backgroundColor?: string;
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  cursor?: boolean;
}

export interface EmbeddedTerminalLine {
  spans: EmbeddedTerminalSpan[];
}

export interface EmbeddedTerminalSnapshot {
  title: string;
  lines: EmbeddedTerminalLine[];
  connected: boolean;
}

export interface EmbeddedTerminalOptions {
  sessionName: string;
  cwd: string;
  cols: number;
  rows: number;
}

type Listener = (snapshot: EmbeddedTerminalSnapshot) => void;
type Disposable = { dispose(): void };

function toRgbColor(value: number): string {
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return `rgb(${red}, ${green}, ${blue})`;
}

function toInkColor(cell: IBufferCell, layer: 'foreground' | 'background'): string | undefined {
  if (layer === 'foreground') {
    if (cell.isFgRGB()) {
      return toRgbColor(cell.getFgColor());
    }
    if (cell.isFgPalette()) {
      return `ansi256(${cell.getFgColor()})`;
    }
    return undefined;
  }
  if (cell.isBgRGB()) {
    return toRgbColor(cell.getBgColor());
  }
  if (cell.isBgPalette()) {
    return `ansi256(${cell.getBgColor()})`;
  }
  return undefined;
}

function getSpanStyle(cell: IBufferCell): Omit<EmbeddedTerminalSpan, 'text'> {
  const style: Omit<EmbeddedTerminalSpan, 'text'> = {};
  const color = toInkColor(cell, 'foreground');
  const backgroundColor = toInkColor(cell, 'background');
  if (color !== undefined) {
    style.color = color;
  }
  if (backgroundColor !== undefined) {
    style.backgroundColor = backgroundColor;
  }
  if (cell.isDim() === 1) {
    style.dimColor = true;
  }
  if (cell.isBold() === 1) {
    style.bold = true;
  }
  if (cell.isItalic() === 1) {
    style.italic = true;
  }
  if (cell.isUnderline() === 1) {
    style.underline = true;
  }
  if (cell.isStrikethrough() === 1) {
    style.strikethrough = true;
  }
  if (cell.isInverse() === 1) {
    style.inverse = true;
  }
  return style;
}

function sameStyle(left: Omit<EmbeddedTerminalSpan, 'text'>, right: Omit<EmbeddedTerminalSpan, 'text'>): boolean {
  return left.color === right.color
    && left.backgroundColor === right.backgroundColor
    && left.dimColor === right.dimColor
    && left.bold === right.bold
    && left.italic === right.italic
    && left.underline === right.underline
    && left.strikethrough === right.strikethrough
    && left.inverse === right.inverse
    && left.cursor === right.cursor;
}

function appendSpan(spans: EmbeddedTerminalSpan[], next: EmbeddedTerminalSpan): void {
  if (next.text.length === 0) {
    return;
  }
  const previous = spans.at(-1);
  if (previous && sameStyle(previous, next)) {
    previous.text += next.text;
    return;
  }
  spans.push({ ...next });
}

function hasStyle(span: EmbeddedTerminalSpan): boolean {
  return span.color !== undefined
    || span.backgroundColor !== undefined
    || span.dimColor === true
    || span.bold === true
    || span.italic === true
    || span.underline === true
    || span.strikethrough === true
    || span.inverse === true
    || span.cursor === true;
}

function trimTrailingPlainWhitespace(spans: EmbeddedTerminalSpan[]): EmbeddedTerminalSpan[] {
  const trimmed = spans.map((span) => {
    return { ...span };
  });

  while (trimmed.length > 0) {
    const last = trimmed.at(-1);
    if (!last || hasStyle(last)) {
      break;
    }
    const text = last.text.replace(/\s+$/u, '');
    if (text.length === 0) {
      trimmed.pop();
      continue;
    }
    if (text !== last.text) {
      last.text = text;
    }
    break;
  }

  return trimmed;
}

function buildLineSnapshot(
  line: IBufferLine | undefined,
  cols: number,
  blankCell: IBufferCell,
  cursorColumn: number | null,
): EmbeddedTerminalLine {
  if (!line) {
    return cursorColumn === cols
      ? { spans: [{ text: ' ', cursor: true }] }
      : { spans: [] };
  }

  const spans: EmbeddedTerminalSpan[] = [];
  for (let col = 0; col < cols; col += 1) {
    const cell = line.getCell(col, blankCell);
    if (!cell) {
      appendSpan(spans, { text: ' ' });
      continue;
    }
    if (cell.getWidth() === 0) {
      continue;
    }

    const chars = cell.isInvisible() === 1
      ? ' '.repeat(Math.max(1, cell.getWidth()))
      : (cell.getChars() || ' ');

    appendSpan(spans, {
      text: chars,
      ...getSpanStyle(cell),
      ...(cursorColumn === col ? { cursor: true } : {}),
    });
  }

  if (cursorColumn === cols) {
    appendSpan(spans, { text: ' ', cursor: true });
  }

  return {
    spans: trimTrailingPlainWhitespace(spans),
  };
}

export function buildSnapshot(terminal: XTermTerminal, title: string, connected: boolean): EmbeddedTerminalSnapshot {
  const buffer = terminal.buffer.active;
  const blankCell = buffer.getNullCell();
  const cursorRow = (buffer.baseY + buffer.cursorY) - buffer.viewportY;
  const visibleCursorRow = cursorRow >= 0 && cursorRow < terminal.rows ? cursorRow : null;
  const visibleCursorColumn = visibleCursorRow !== null ? Math.min(buffer.cursorX, terminal.cols) : null;
  const lines: EmbeddedTerminalLine[] = [];
  for (let row = 0; row < terminal.rows; row += 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    lines.push(buildLineSnapshot(
      line,
      terminal.cols,
      blankCell,
      visibleCursorRow === row ? visibleCursorColumn : null,
    ));
  }

  return {
    title,
    lines,
    connected,
  };
}

export class EmbeddedTerminal {
  private readonly terminal: XTermTerminal;
  private readonly pty: IPty;
  private readonly listeners = new Set<Listener>();
  private readonly disposables: Disposable[] = [];
  private title = 'Claude';
  private connected = true;

  public constructor(options: EmbeddedTerminalOptions) {
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols: options.cols,
      rows: options.rows,
      scrollback: 5000,
    });
    this.pty = spawn('tmux', ['attach-session', '-t', options.sessionName], {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    this.disposables.push(
      this.pty.onData((data) => {
        this.terminal.write(data, () => {
          this.publish();
        });
      }),
      this.pty.onExit(() => {
        this.connected = false;
        this.publish();
      }),
      this.terminal.onTitleChange((title) => {
        this.title = title.length > 0 ? title : 'Claude';
        this.publish();
      }),
    );
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public snapshot(): EmbeddedTerminalSnapshot {
    return buildSnapshot(this.terminal, this.title, this.connected);
  }

  public resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
    this.terminal.resize(cols, rows);
    this.publish();
  }

  public scrollPages(pageCount: number): void {
    this.terminal.scrollPages(pageCount);
    this.publish();
  }

  public scrollLines(lineCount: number): void {
    this.terminal.scrollLines(lineCount);
    this.publish();
  }

  public scrollToTop(): void {
    this.terminal.scrollToTop();
    this.publish();
  }

  public scrollToBottom(): void {
    this.terminal.scrollToBottom();
    this.publish();
  }

  public write(data: string): void {
    this.pty.write(data);
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.listeners.clear();
    this.terminal.dispose();
    this.pty.kill();
  }

  private publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
