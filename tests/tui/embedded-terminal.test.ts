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

    await write(terminal, '\u001b[31mred\u001b[39m plain \u001b[38;2;1;2;3m\u001b[48;5;4m\u001b[1;3;4;9mrgb\u001b[0m');

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

    await write(terminal, 'hello\u001b[2D');

    const snapshot = buildSnapshot(terminal, 'Claude', true);

    expect(snapshot.lines[0]).toEqual({
      spans: [
        { text: 'hel' },
        { text: 'l', cursor: true },
        { text: 'o' },
      ],
    });
  });
});
