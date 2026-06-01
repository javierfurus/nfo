import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { SidebarHeader } from '../../src/tui/SidebarHeader.js';

describe('SidebarHeader', () => {
  it('renders orchestra id and musician counts', () => {
    const { lastFrame } = render(<SidebarHeader orchestraId="aaa-one" musicianCount={3} pendingCount={0} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('No Fluff Orchestra');
    expect(frame).toContain('aaa-one');
    expect(frame).toContain('3 musicians');
    expect(frame).toContain('0 awaiting permission');
  });

  it('shows pending count when musicians await permission', () => {
    const { lastFrame } = render(<SidebarHeader orchestraId="aaa-one" musicianCount={3} pendingCount={2} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('2 awaiting permission');
  });
});
