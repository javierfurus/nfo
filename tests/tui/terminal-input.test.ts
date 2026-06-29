import { describe, expect, it } from 'vitest';
import type { Key } from 'ink';
import {
  toTerminalMouseScroll,
  toTerminalMouseEvent,
  toTerminalInput,
  toTerminalViewportCommand,
  clampToPane,
} from '../../src/tui/terminal-input.js';

function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

describe('toTerminalInput', () => {
  it('maps enter and arrows to terminal control sequences', () => {
    expect(toTerminalInput('', makeKey({ return: true }))).toBe('\r');
    expect(toTerminalInput('', makeKey({ upArrow: true }))).toBe('\x1b[A');
    expect(toTerminalInput('', makeKey({ downArrow: true }))).toBe('\x1b[B');
  });

  it('maps modified enter variants to a literal newline', () => {
    expect(toTerminalInput('\r', makeKey({ return: true, shift: true }))).toBe('\n');
    expect(toTerminalInput('\r', makeKey({ return: true, meta: true }))).toBe('\n');
  });

  it('maps ctrl keys to control characters', () => {
    expect(toTerminalInput('c', makeKey({ ctrl: true }))).toBe('\x03');
    expect(toTerminalInput('l', makeKey({ ctrl: true }))).toBe('\x0c');
  });

  it('maps tab variants and delete sequences', () => {
    expect(toTerminalInput('', makeKey({ tab: true }))).toBe('\t');
    expect(toTerminalInput('', makeKey({ tab: true, shift: true }))).toBe('\x1b[Z');
    expect(toTerminalInput('', makeKey({ delete: true }))).toBe('\x1b[3~');
  });

  it('passes through plain input', () => {
    expect(toTerminalInput('hello', makeKey())).toBe('hello');
  });
});

describe('toTerminalViewportCommand', () => {
  it('maps shift+page keys to viewport scrolling', () => {
    expect(toTerminalViewportCommand(makeKey({ shift: true, pageUp: true }))).toEqual({
      kind: 'scroll-pages',
      pageCount: -1,
    });
    expect(toTerminalViewportCommand(makeKey({ shift: true, pageDown: true }))).toEqual({
      kind: 'scroll-pages',
      pageCount: 1,
    });
  });

  describe('toTerminalMouseScroll', () => {
    it('maps SGR mouse wheel events to line scrolling', () => {
      expect(toTerminalMouseScroll('[<64;12;8M')).toEqual({
        button: 64,
        lineCount: -3,
        column: 12,
        row: 8,
        sequence: '\u001b[<64;12;8M',
      });
      expect(toTerminalMouseScroll('[<65;12;8M')).toEqual({
        button: 65,
        lineCount: 3,
        column: 12,
        row: 8,
        sequence: '\u001b[<65;12;8M',
      });
    });

    it('ignores non-wheel mouse sequences', () => {
      expect(toTerminalMouseScroll('[<0;12;8M')).toBeNull();
      expect(toTerminalMouseScroll('[<64;12;8m')).toBeNull();
      expect(toTerminalMouseScroll('hello')).toBeNull();
    });
  });

  it('maps shift+home/end to top and bottom jumps', () => {
    expect(toTerminalViewportCommand(makeKey({ shift: true, home: true }))).toEqual({
      kind: 'scroll-top',
    });
    expect(toTerminalViewportCommand(makeKey({ shift: true, end: true }))).toEqual({
      kind: 'scroll-bottom',
    });
  });

  it('ignores unmodified terminal navigation keys', () => {
    expect(toTerminalViewportCommand(makeKey({ pageUp: true }))).toBeNull();
    expect(toTerminalViewportCommand(makeKey({ end: true }))).toBeNull();
  });
});

describe('toTerminalMouseEvent', () => {
  it('parses a left-button press event', () => {
    expect(toTerminalMouseEvent('\x1b[<0;12;5M')).toEqual({
      kind: 'press',
      column: 12,
      row: 5,
    });
  });

  it('parses a drag event (button with bit 32 set)', () => {
    expect(toTerminalMouseEvent('\x1b[<32;14;6M')).toEqual({
      kind: 'drag',
      column: 14,
      row: 6,
    });
  });

  it('parses a release event (lowercase m suffix)', () => {
    expect(toTerminalMouseEvent('\x1b[<0;14;6m')).toEqual({
      kind: 'release',
      column: 14,
      row: 6,
    });
  });

  it('accepts input without leading ESC (matches existing toTerminalMouseScroll behaviour)', () => {
    expect(toTerminalMouseEvent('[<0;12;5M')).toEqual({
      kind: 'press',
      column: 12,
      row: 5,
    });
  });

  it('returns null for malformed input', () => {
    expect(toTerminalMouseEvent('hello')).toBeNull();
    expect(toTerminalMouseEvent('\x1b[<abc;12;5M')).toBeNull();
    expect(toTerminalMouseEvent('')).toBeNull();
  });

  it('returns null for scroll/wheel events (button & 64) — those are handled by toTerminalMouseScroll', () => {
    expect(toTerminalMouseEvent('\x1b[<64;12;5M')).toBeNull();
    expect(toTerminalMouseEvent('\x1b[<65;12;5M')).toBeNull();
  });

  it('scroll events are still handled by toTerminalMouseScroll when toTerminalMouseEvent returns null', () => {
    expect(toTerminalMouseScroll('[<64;12;8M')).not.toBeNull();
    expect(toTerminalMouseEvent('[<64;12;8M')).toBeNull();
  });
});

describe('clampToPane', () => {
  it('returns coordinates unchanged when inside pane bounds', () => {
    expect(clampToPane(5, 3, 10, 8)).toEqual({ col: 5, row: 3 });
    expect(clampToPane(0, 0, 10, 8)).toEqual({ col: 0, row: 0 });
    expect(clampToPane(9, 7, 10, 8)).toEqual({ col: 9, row: 7 });
  });

  it('clamps negative coordinates to 0', () => {
    expect(clampToPane(-1, -1, 10, 8)).toEqual({ col: 0, row: 0 });
    expect(clampToPane(-100, -50, 10, 8)).toEqual({ col: 0, row: 0 });
  });

  it('clamps coordinates beyond pane dimensions to the last cell', () => {
    expect(clampToPane(15, 12, 10, 8)).toEqual({ col: 9, row: 7 });
    expect(clampToPane(10, 8, 10, 8)).toEqual({ col: 9, row: 7 });
  });

  it('clamps col and row independently', () => {
    expect(clampToPane(-5, 3, 10, 8)).toEqual({ col: 0, row: 3 });
    expect(clampToPane(5, 20, 10, 8)).toEqual({ col: 5, row: 7 });
  });
});
