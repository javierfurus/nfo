import { describe, expect, it } from 'vitest';
import { resolveSpanStyle } from '../../src/tui/OrchestratorPane.js';

describe('resolveSpanStyle', () => {
  it('renders a visible block cursor when the terminal is focused', () => {
    expect(resolveSpanStyle({ text: 'x', color: 'red', cursor: true }, true)).toEqual({
      color: 'black',
      backgroundColor: 'white',
      dimColor: undefined,
      bold: undefined,
      italic: undefined,
      underline: undefined,
      strikethrough: undefined,
      inverse: false,
    });
  });

  it('leaves non-focused cursor spans unchanged', () => {
    expect(resolveSpanStyle({ text: 'x', color: 'red', cursor: true }, false)).toEqual({
      color: 'red',
      backgroundColor: undefined,
      dimColor: undefined,
      bold: undefined,
      italic: undefined,
      underline: undefined,
      strikethrough: undefined,
      inverse: undefined,
    });
  });
});
