import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/components/Help.js';

describe('Help', () => {
  it('lists the core keybindings', () => {
    const { lastFrame } = render(<Help />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↑');
    expect(frame).toContain('Enter');
    expect(frame).toContain('Alt+Enter');
    expect(frame).toContain('Shift+Enter');
    expect(frame).toContain('n');
    expect(frame).toContain('d');
    expect(frame).toContain('p');
    expect(frame).toContain('q');
    expect(frame).toContain('?');
  });

  it('mentions notes, dismiss, jump-to-pending, and Claude compose', () => {
    const { lastFrame } = render(<Help />);
    const frame = (lastFrame() ?? '').toLowerCase();
    expect(frame).toContain('notes');
    expect(frame).toContain('dismiss');
    expect(frame).toContain('awaiting');
    expect(frame).toContain('claude');
    expect(frame).toContain('ctrl+g');
    expect(frame).toContain('ctrl+j');
    expect(frame).toContain('scroll');
    expect(frame).toContain('kills');
  });

  it('shows a close hint', () => {
    const { lastFrame } = render(<Help />);
    const frame = (lastFrame() ?? '').toLowerCase();
    expect(frame).toContain('close');
  });
});
