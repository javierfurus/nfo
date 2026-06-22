import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import xtermHeadless from '@xterm/headless';
import { buildSnapshot, EmbeddedTerminal, FRAME_MS } from '../../src/tui/embedded-terminal.js';
import type { EmbeddedTerminalSnapshot } from '../../src/tui/embedded-terminal.js';

const { Terminal } = xtermHeadless;

// ---------- node-pty mock (used by EmbeddedTerminal coalescing/row-identity tests) ----------
// Capture the onData callback each time spawn() is called so tests can simulate pty output.
let capturedOnData: (data: string) => void = () => {};

vi.mock('node-pty', () => ({
  spawn: () => ({
    onData: (cb: (data: string) => void) => {
      capturedOnData = cb;
      return { dispose: () => {} };
    },
    onExit: () => ({ dispose: () => {} }),
    write: () => {},
    kill: () => {},
    resize: () => {},
  }),
}));

// ---------- helpers ----------

async function write(terminal: InstanceType<typeof Terminal>, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    terminal.write(data, () => {
      resolve();
    });
  });
}

// ---------- buildSnapshot (existing tests) ----------

describe('buildSnapshot', () => {
  it('preserves ANSI colors and text styles from the xterm buffer', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 20,
      rows: 1,
    });

    await write(terminal, '[31mred[39m plain [38;2;1;2;3m[48;5;4m[1;3;4;9mrgb[0m');

    const snapshot = buildSnapshot(terminal, 'Claude', true);

    expect(snapshot.lines[0]).toEqual({
      spans: [
        { text: 'red', color: 'ansi256(1)' },
        { text: ' plain ' },
        {
          text: 'rgb',
          color: 'rgb(1, 2, 3)',
          backgroundColor: 'ansi256(4)',
          underline: true,
        },
        { text: ' ', cursor: true },
      ],
    });
  });

  it('trims trailing plain whitespace while keeping the visible text', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 10,
      rows: 1,
    });

    await write(terminal, 'hello');

    const snapshot = buildSnapshot(terminal, 'Claude', true);

    expect(snapshot.lines[0]).toEqual({
      spans: [
        { text: 'hello' },
        { text: ' ', cursor: true },
      ],
    });
  });

  it('tracks the cursor over the active terminal cell', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 10,
      rows: 1,
    });

    await write(terminal, 'hello[2D');

    const snapshot = buildSnapshot(terminal, 'Claude', true);

    expect(snapshot.lines[0]).toEqual({
      spans: [
        { text: 'hel' },
        { text: 'l', cursor: true },
        { text: 'o' },
      ],
    });
  });

  it('emits a cursor span by default (cursorHidden=false)', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 10,
      rows: 1,
    });

    await write(terminal, 'hello');

    const snapshot = buildSnapshot(terminal, 'Claude', true);

    const hasCursor = snapshot.lines.some((line) =>
      line.spans.some((span) => span.cursor === true),
    );
    expect(hasCursor).toBe(true);
  });

  it('suppresses all cursor spans when cursorHidden=true (DECTCEM ?25l)', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 10,
      rows: 1,
    });

    await write(terminal, 'hello[?25l');

    const snapshot = buildSnapshot(terminal, 'Claude', true, true);

    const hasCursor = snapshot.lines.some((line) =>
      line.spans.some((span) => span.cursor === true),
    );
    expect(hasCursor).toBe(false);
  });

  it('restores cursor spans when cursorHidden=false after hide (DECTCEM ?25h)', async () => {
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: 10,
      rows: 1,
    });

    await write(terminal, 'hello[?25l');
    const hiddenSnapshot = buildSnapshot(terminal, 'Claude', true, true);
    const hiddenHasCursor = hiddenSnapshot.lines.some((line) =>
      line.spans.some((span) => span.cursor === true),
    );
    expect(hiddenHasCursor).toBe(false);

    await write(terminal, '[?25h');
    const shownSnapshot = buildSnapshot(terminal, 'Claude', true, false);
    const shownHasCursor = shownSnapshot.lines.some((line) =>
      line.spans.some((span) => span.cursor === true),
    );
    expect(shownHasCursor).toBe(true);
  });
});

// ---------- C1: frame-coalescing ----------

describe('EmbeddedTerminal frame-coalescing (C1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOnData = () => {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces K writes within one frame into exactly one listener notification', async () => {
    const terminal = new EmbeddedTerminal({
      sessionName: 'nfo-test-embed',
      cwd: '/tmp',
      cols: 80,
      rows: 4,
    });

    const listener = vi.fn();
    const unsub = terminal.onChange(listener);
    // onChange() fires once immediately with the initial snapshot.
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();

    // Simulate 5 pty data chunks arriving before the frame timer fires.
    for (let i = 0; i < 5; i++) {
      capturedOnData(`chunk ${i}\r\n`);
    }

    // Timer has not fired yet → no notification.
    expect(listener).toHaveBeenCalledTimes(0);

    // Advance past xterm's internal write queue (setTimeout 0) AND past FRAME_MS.
    await vi.advanceTimersByTimeAsync(FRAME_MS + 10);

    // Exactly one snapshot+notify for all five writes.
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    terminal.dispose();
  });

  it('FRAME_MS is exported and equals 16', () => {
    expect(FRAME_MS).toBe(16);
  });
});

// ---------- C3: row referential identity ----------

describe('EmbeddedTerminal row referential identity (C3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOnData = () => {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses previous line objects for rows whose content did not change', async () => {
    const terminal = new EmbeddedTerminal({
      sessionName: 'nfo-test-embed',
      cwd: '/tmp',
      cols: 20,
      rows: 3,
    });

    const snapshots: EmbeddedTerminalSnapshot[] = [];
    const unsub = terminal.onChange((s) => {
      snapshots.push(s);
    });
    // Initial snapshot arrives synchronously via onChange().
    expect(snapshots).toHaveLength(1);
    const initial = snapshots[0]!;

    // Write text that occupies only row 0 (cursor moves to row 1 after the newline).
    capturedOnData('hello\r\n');

    // Advance timers to process xterm write queue and fire the flush.
    await vi.advanceTimersByTimeAsync(FRAME_MS + 10);

    // Exactly one more notification should have arrived.
    expect(snapshots).toHaveLength(2);
    const after = snapshots[1]!;

    // Row 0 changed (new text) → must be a new object.
    expect(after.lines[0]).not.toBe(initial.lines[0]);

    // Row 2 was not touched → must be the same object reference (C3 stable identity).
    expect(after.lines[2]).toBe(initial.lines[2]);

    unsub();
    terminal.dispose();
  });
});
