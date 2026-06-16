import { describe, expect, it } from 'vitest';
import xtermHeadless from '@xterm/headless';
import { buildSnapshot } from '../../src/tui/embedded-terminal.js';

const { Terminal } = xtermHeadless;

async function write(terminal: InstanceType<typeof Terminal>, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    terminal.write(data, () => {
      resolve();
    });
  });
}

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
