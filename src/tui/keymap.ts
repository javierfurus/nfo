export interface UiState {
  selectedIndex: number;
  musicianCount: number;
  pendingDismissIndex: number | null;
}

export interface KeyInput {
  input: string;
  downArrow: boolean;
  upArrow: boolean;
  tab: boolean;
  shiftTab: boolean;
  return: boolean;
  escape: boolean;
}

export type KeyAction =
  | { kind: 'open-target'; selectedIndex: number }
  | { kind: 'request-dismiss-musician'; index: number }
  | { kind: 'dismiss-musician'; index: number }
  | { kind: 'next-orchestra' }
  | { kind: 'prev-orchestra' }
  | { kind: 'open-notes' }
  | { kind: 'detach-session' }
  | { kind: 'jump-to-pending' }
  | { kind: 'toggle-help' };

export interface ReduceResult {
  ui: UiState;
  action?: KeyAction;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function reduceKey(ui: UiState, key: KeyInput): ReduceResult {
  const maxIndex = Math.max(0, ui.musicianCount);
  const selectedMusicianIndex = ui.selectedIndex - 1;

  if (key.input === 'd') {
    if (selectedMusicianIndex < 0 || selectedMusicianIndex >= ui.musicianCount) {
      return { ui };
    }
    if (ui.pendingDismissIndex === selectedMusicianIndex) {
      return {
        ui: { ...ui, pendingDismissIndex: null },
        action: { kind: 'dismiss-musician', index: selectedMusicianIndex },
      };
    }
    return {
      ui: { ...ui, pendingDismissIndex: selectedMusicianIndex },
      action: { kind: 'request-dismiss-musician', index: selectedMusicianIndex },
    };
  }

  if (ui.pendingDismissIndex !== null) {
    if (key.input === 'y' || key.return) {
      return {
        ui: { ...ui, pendingDismissIndex: null },
        action: { kind: 'dismiss-musician', index: ui.pendingDismissIndex },
      };
    }
    if (key.input === 'n' || key.escape) {
      return { ui: { ...ui, pendingDismissIndex: null } };
    }
    ui = { ...ui, pendingDismissIndex: null };
  }

  if (key.downArrow || key.input === 'j') {
    return { ui: { ...ui, selectedIndex: clamp(ui.selectedIndex + 1, 0, maxIndex) } };
  }
  if (key.upArrow || key.input === 'k') {
    return { ui: { ...ui, selectedIndex: clamp(ui.selectedIndex - 1, 0, maxIndex) } };
  }
  if (key.tab) {
    return { ui, action: { kind: 'next-orchestra' } };
  }
  if (key.shiftTab) {
    return { ui, action: { kind: 'prev-orchestra' } };
  }
  if (key.return) {
    return { ui, action: { kind: 'open-target', selectedIndex: ui.selectedIndex } };
  }
  if (key.input === 'n') {
    return { ui, action: { kind: 'open-notes' } };
  }
  if (key.input === 'q') {
    return { ui, action: { kind: 'detach-session' } };
  }
  if (key.input === 'p') {
    return { ui, action: { kind: 'jump-to-pending' } };
  }
  if (key.input === '?') {
    return { ui, action: { kind: 'toggle-help' } };
  }
  return { ui };
}
