import { describe, it, expect } from 'vitest';
import { computeSidebarVisible, NARROW_COLUMN_THRESHOLD } from '../src/tui/sidebar-visibility.js';

describe('computeSidebarVisible', () => {
  it('is visible by default (wide, focused, auto-hide off)', () => {
    expect(
      computeSidebarVisible({ autoHideMode: false, columns: 120, orchestratorFocused: true }),
    ).toBe(true);
  });

  it('is hidden when auto-hide mode is on, claude is focused, and terminal is wide', () => {
    expect(
      computeSidebarVisible({ autoHideMode: true, columns: 120, orchestratorFocused: true }),
    ).toBe(false);
  });

  it('peeks visible when auto-hide mode is on but claude is unfocused (wide)', () => {
    expect(
      computeSidebarVisible({ autoHideMode: true, columns: 120, orchestratorFocused: false }),
    ).toBe(true);
  });

  it('forces hidden on a narrow terminal even with auto-hide mode off, while focused', () => {
    expect(
      computeSidebarVisible({ autoHideMode: false, columns: NARROW_COLUMN_THRESHOLD - 1, orchestratorFocused: true }),
    ).toBe(false);
  });

  it('peeks visible on a narrow terminal when claude is unfocused', () => {
    expect(
      computeSidebarVisible({ autoHideMode: false, columns: NARROW_COLUMN_THRESHOLD - 1, orchestratorFocused: false }),
    ).toBe(true);
  });

  it('is visible when auto-hide mode is off, wide, and unfocused', () => {
    expect(
      computeSidebarVisible({ autoHideMode: false, columns: 120, orchestratorFocused: false }),
    ).toBe(true);
  });
});
