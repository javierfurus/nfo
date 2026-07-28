import xtermHeadless from '@xterm/headless';
import type { IBufferCell, IBufferLine, Terminal as XTermTerminal } from '@xterm/headless';
import { spawn, type IPty } from 'node-pty';
import { setDestroyUnattached } from '../tmux.js';

const { Terminal } = xtermHeadless;

// Target frame interval for coalescing pty output chunks (~60 fps).
export const FRAME_MS = 16;

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
  command?: string;
  commandArgs?: string[];
}

// Minimal subscribe/snapshot API — implemented by EmbeddedTerminal and by test fakes.
export interface TerminalFeed {
  onChange(listener: (snapshot: EmbeddedTerminalSnapshot) => void): () => void;
  snapshot(): EmbeddedTerminalSnapshot;
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

// Returns true when two line snapshots have identical span content.
function linesEqual(a: EmbeddedTerminalLine, b: EmbeddedTerminalLine): boolean {
  if (a.spans.length !== b.spans.length) {
    return false;
  }
  for (let i = 0; i < a.spans.length; i++) {
    const sa = a.spans[i]!;
    const sb = b.spans[i]!;
    if (
      sa.text !== sb.text
      || sa.color !== sb.color
      || sa.backgroundColor !== sb.backgroundColor
      || sa.dimColor !== sb.dimColor
      || sa.bold !== sb.bold
      || sa.italic !== sb.italic
      || sa.underline !== sb.underline
      || sa.strikethrough !== sb.strikethrough
      || sa.inverse !== sb.inverse
      || sa.cursor !== sb.cursor
    ) {
      return false;
    }
  }
  return true;
}

export function buildSnapshot(terminal: XTermTerminal, title: string, connected: boolean, cursorHidden = false): EmbeddedTerminalSnapshot {
  const buffer = terminal.buffer.active;
  const blankCell = buffer.getNullCell();
  let visibleCursorRow: number | null = null;
  let visibleCursorColumn: number | null = null;
  if (!cursorHidden) {
    const cursorRow = (buffer.baseY + buffer.cursorY) - buffer.viewportY;
    visibleCursorRow = cursorRow >= 0 && cursorRow < terminal.rows ? cursorRow : null;
    visibleCursorColumn = visibleCursorRow !== null ? Math.min(buffer.cursorX, terminal.cols) : null;
  }
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

export class EmbeddedTerminal implements TerminalFeed {
  private readonly terminal: XTermTerminal;
  private readonly pty: IPty;
  private readonly listeners = new Set<Listener>();
  private readonly disposables: Disposable[] = [];
  private title = 'Claude';
  private connected = true;
  private cursorHidden = false;
  private readonly sessionName: string;
  private destroyUnattachedArmed = false;

  // C1: frame-coalescing state
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // C3: row-identity cache — prevLines[row] holds the last emitted line for that row.
  // forceFullRebuild bypasses the cache (after scroll/resize/clear).
  private prevLines: EmbeddedTerminalLine[] = [];
  private forceFullRebuild = true;

  public constructor(options: EmbeddedTerminalOptions) {
    this.sessionName = options.sessionName;
    this.terminal = new Terminal({
      allowProposedApi: true,
      cols: options.cols,
      rows: options.rows,
      scrollback: 5000,
    });

    // Track DECTCEM cursor visibility (CSI ?25h = show, CSI ?25l = hide)
    this.disposables.push(
      this.terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
        if (params.includes(25) && this.cursorHidden) {
          this.cursorHidden = false;
          this.forceFullRebuild = true;
        }
        return false;
      }),
      this.terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
        if (params.includes(25) && !this.cursorHidden) {
          this.cursorHidden = true;
          this.forceFullRebuild = true;
        }
        return false;
      }),
    );

    const cmd = options.command ?? 'tmux';
    const cmdArgs = options.commandArgs ?? ['attach-session', '-t', options.sessionName];
    this.pty = spawn(cmd, cmdArgs, {
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
        // First data confirms the attach client is actually live, so it is now safe to
        // arm destroy-unattached: doing this earlier risks tmux destroying the freshly
        // created detached session during the create-to-attach gap.
        if (!this.destroyUnattachedArmed) {
          this.destroyUnattachedArmed = true;
          void setDestroyUnattached(this.sessionName, true);
        }
        // C1: coalesce — write to xterm then schedule a flush instead of publishing immediately.
        this.terminal.write(data, () => {
          this.scheduleFlush();
        });
      }),
      this.pty.onExit(() => {
        this.connected = false;
        this.scheduleFlush();
      }),
      this.terminal.onTitleChange((title) => {
        this.title = title.length > 0 ? title : 'Claude';
        this.scheduleFlush();
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
    return this.buildCachedSnapshot();
  }

  public resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows);
    this.terminal.resize(cols, rows);
    // Resize changes terminal dimensions; cancel any pending flush and publish immediately
    // so the UI reflects the new size without waiting for the next frame.
    this.clearFlushTimer();
    this.dirty = false;
    this.forceFullRebuild = true;
    this.publishNow();
  }

  public scrollPages(pageCount: number): void {
    this.terminal.scrollPages(pageCount);
    this.forceFullRebuild = true;
    this.scheduleFlush();
  }

  public scrollLines(lineCount: number): void {
    this.terminal.scrollLines(lineCount);
    this.forceFullRebuild = true;
    this.scheduleFlush();
  }

  public scrollToTop(): void {
    this.terminal.scrollToTop();
    this.forceFullRebuild = true;
    this.scheduleFlush();
  }

  public scrollToBottom(): void {
    this.terminal.scrollToBottom();
    this.forceFullRebuild = true;
    this.scheduleFlush();
  }

  public write(data: string): void {
    this.pty.write(data);
  }

  public extractSelection(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): string {
    const buffer = this.terminal.buffer.active;
    const rowTexts: string[] = [];

    for (let r = startRow; r <= endRow; r++) {
      const absIndex = buffer.viewportY + r;
      const line = buffer.getLine(absIndex);

      let rowStartCol: number;
      let rowEndCol: number;

      if (r === startRow && r === endRow) {
        rowStartCol = startCol;
        rowEndCol = endCol;
      } else if (r === startRow) {
        rowStartCol = startCol;
        rowEndCol = this.terminal.cols - 1;
      } else if (r === endRow) {
        rowStartCol = 0;
        rowEndCol = endCol;
      } else {
        rowStartCol = 0;
        rowEndCol = this.terminal.cols - 1;
      }

      if (!line) {
        rowTexts.push('');
      } else {
        rowTexts.push(line.translateToString(true, rowStartCol, rowEndCol + 1));
      }
    }

    let result = rowTexts[0] ?? '';
    for (let i = 1; i < rowTexts.length; i++) {
      const thisAbsIndex = buffer.viewportY + startRow + i;
      const thisLine = buffer.getLine(thisAbsIndex);
      // isWrapped means this line is a soft-wrap continuation of the previous line.
      const separator = (thisLine && thisLine.isWrapped) ? '' : '\n';
      result += separator + (rowTexts[i] ?? '');
    }

    return result;
  }

  public dispose(): void {
    this.clearFlushTimer();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.listeners.clear();
    this.terminal.dispose();
    this.pty.kill();
  }

  // C1: schedule a flush at most once per FRAME_MS.
  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, FRAME_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private flush(): void {
    this.flushTimer = null;
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.publishNow();
  }

  private publishNow(): void {
    const snapshot = this.buildCachedSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  // C3: build a snapshot, reusing previous line objects for rows whose content is unchanged.
  // Stable references let React.memo on Row components bail out of reconciliation.
  private buildCachedSnapshot(): EmbeddedTerminalSnapshot {
    const buffer = this.terminal.buffer.active;
    const blankCell = buffer.getNullCell();
    let visibleCursorRow: number | null = null;
    let visibleCursorColumn: number | null = null;
    if (!this.cursorHidden) {
      const cursorRow = (buffer.baseY + buffer.cursorY) - buffer.viewportY;
      visibleCursorRow = cursorRow >= 0 && cursorRow < this.terminal.rows ? cursorRow : null;
      visibleCursorColumn = visibleCursorRow !== null
        ? Math.min(buffer.cursorX, this.terminal.cols)
        : null;
    }

    const skipCache = this.forceFullRebuild || this.prevLines.length !== this.terminal.rows;
    this.forceFullRebuild = false;

    const lines: EmbeddedTerminalLine[] = [];
    for (let row = 0; row < this.terminal.rows; row += 1) {
      const line = buffer.getLine(buffer.viewportY + row);
      const newLine = buildLineSnapshot(
        line,
        this.terminal.cols,
        blankCell,
        visibleCursorRow === row ? visibleCursorColumn : null,
      );

      const prevLine = this.prevLines[row];
      if (!skipCache && prevLine !== undefined && linesEqual(prevLine, newLine)) {
        lines.push(prevLine); // stable reference → React.memo skips re-render
      } else {
        lines.push(newLine);
      }
    }

    this.prevLines = lines;

    return {
      title: this.title,
      lines,
      connected: this.connected,
    };
  }
}
