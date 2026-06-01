import { describe, it, expect } from 'vitest';
import { reduceKey, type UiState, type KeyInput } from '../../src/tui/keymap.js';

function ui(over: Partial<UiState> = {}): UiState {
  return { selectedIndex: 0, musicianCount: 3, pendingDismissIndex: null, ...over };
}
function key(over: Partial<KeyInput> = {}): KeyInput {
  return {
    input: '',
    downArrow: false,
    upArrow: false,
    tab: false,
    shiftTab: false,
    return: false,
    escape: false,
    ...over,
  };
}

describe('reduceKey', () => {
  it('down arrow / j moves selection down, clamped', () => {
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ downArrow: true })).ui.selectedIndex).toBe(1);
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ input: 'j' })).ui.selectedIndex).toBe(1);
    expect(reduceKey(ui({ selectedIndex: 3, musicianCount: 3 }), key({ downArrow: true })).ui.selectedIndex).toBe(3);
  });
  it('up arrow / k moves selection up, clamped', () => {
    expect(reduceKey(ui({ selectedIndex: 3 }), key({ upArrow: true })).ui.selectedIndex).toBe(2);
    expect(reduceKey(ui({ selectedIndex: 0 }), key({ input: 'k' })).ui.selectedIndex).toBe(0);
  });
  it('Enter emits an open-target action for the selected index', () => {
    const r = reduceKey(ui({ selectedIndex: 1 }), key({ return: true }));
    expect(r.action).toEqual({ kind: 'open-target', selectedIndex: 1 });
  });
  it('Enter with zero musicians still opens the orchestrator target', () => {
    const r = reduceKey(ui({ selectedIndex: 0, musicianCount: 0 }), key({ return: true }));
    expect(r.action).toEqual({ kind: 'open-target', selectedIndex: 0 });
  });
  it('Tab emits next-orchestra, Shift-Tab prev-orchestra', () => {
    expect(reduceKey(ui(), key({ tab: true })).action).toEqual({ kind: 'next-orchestra' });
    expect(reduceKey(ui(), key({ shiftTab: true })).action).toEqual({ kind: 'prev-orchestra' });
  });
  it('n emits open-notes and q emits detach-session', () => {
    expect(reduceKey(ui(), key({ input: 'n' })).action).toEqual({ kind: 'open-notes' });
    expect(reduceKey(ui(), key({ input: 'q' })).action).toEqual({ kind: 'detach-session' });
  });
  it('d on the orchestrator row is a no-op', () => {
    const r = reduceKey(ui({ selectedIndex: 0 }), key({ input: 'd' }));
    expect(r.ui.pendingDismissIndex).toBeNull();
    expect(r.action).toBeUndefined();
  });
  it('d arms dismiss; second d confirms dismiss', () => {
    const armed = reduceKey(ui({ selectedIndex: 2 }), key({ input: 'd' }));
    expect(armed.ui.pendingDismissIndex).toBe(1);
    expect(armed.action).toEqual({ kind: 'request-dismiss-musician', index: 1 });

    const confirmed = reduceKey(armed.ui, key({ input: 'd' }));
    expect(confirmed.ui.pendingDismissIndex).toBeNull();
    expect(confirmed.action).toEqual({ kind: 'dismiss-musician', index: 1 });
  });
  it('pending dismiss confirms on y/Enter and cancels on n/Esc', () => {
    const pending = ui({ selectedIndex: 2, pendingDismissIndex: 1 });
    expect(reduceKey(pending, key({ input: 'y' })).action).toEqual({ kind: 'dismiss-musician', index: 1 });
    expect(reduceKey(pending, key({ return: true })).action).toEqual({ kind: 'dismiss-musician', index: 1 });

    const canceledByN = reduceKey(pending, key({ input: 'n' }));
    expect(canceledByN.ui.pendingDismissIndex).toBeNull();
    expect(canceledByN.action).toBeUndefined();

    const canceledByEsc = reduceKey(pending, key({ escape: true }));
    expect(canceledByEsc.ui.pendingDismissIndex).toBeNull();
    expect(canceledByEsc.action).toBeUndefined();
  });
  it('unknown key is a no-op', () => {
    const r = reduceKey(ui({ selectedIndex: 1 }), key({ input: 'z' }));
    expect(r.ui.selectedIndex).toBe(1);
    expect(r.action).toBeUndefined();
  });
  it('p with non-zero musicians emits jump-to-pending', () => {
    const r = reduceKey(ui({ musicianCount: 3 }), key({ input: 'p' }));
    expect(r.action).toEqual({ kind: 'jump-to-pending' });
  });
  it('p with zero musicians still emits jump-to-pending (App resolves the no-pending case)', () => {
    const r = reduceKey(ui({ musicianCount: 0 }), key({ input: 'p' }));
    expect(r.action).toEqual({ kind: 'jump-to-pending' });
  });
  it("'?' emits toggle-help", () => {
    const result = reduceKey(
      { selectedIndex: 0, musicianCount: 0 },
      { input: '?', downArrow: false, upArrow: false, tab: false, shiftTab: false, return: false, escape: false },
    );
    expect(result.action).toEqual({ kind: 'toggle-help' });
  });
});
