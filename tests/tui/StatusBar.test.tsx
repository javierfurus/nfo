import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../src/tui/components/StatusBar.js';

describe('StatusBar', () => {
  it('shows permission level and the token placeholder', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" pendingCount={0} dismissConfirmation={null} orchestratorFocused={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('supervised');
    expect(frame).toContain('—');
    expect(frame).not.toContain('awaiting permission');
  });
  it('shows key hints', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="auto" tokenHint="—" pendingCount={0} dismissConfirmation={null} orchestratorFocused={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('nav');
    expect(frame).toContain('Ctrl+g');
    expect(frame).toContain('[q] quit');
  });
  it('shows the pending-permission banner when pendingCount > 0', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" pendingCount={2} dismissConfirmation={null} orchestratorFocused={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('2 awaiting permission');
    expect(frame).toContain('[p] jump to next');
  });
  it('advertises [?] help in the bottom hint', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" pendingCount={0} dismissConfirmation={null} orchestratorFocused={false} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[?] help');
  });
  it('shows compose hints while the left pane is focused', () => {
    const { lastFrame } = render(<StatusBar permissionLevel="supervised" tokenHint="—" pendingCount={0} dismissConfirmation={null} orchestratorFocused={true} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('active terminal');
    expect(frame).toContain('Ctrl+g');
  });
  it('shows dismiss confirmation guidance when present', () => {
    const { lastFrame } = render(
      <StatusBar
        permissionLevel="supervised"
        tokenHint="—"
        pendingCount={0}
        dismissConfirmation="Confirm dismiss alpha · [y]/[Enter] confirm · [n]/[Esc] cancel"
        orchestratorFocused={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Confirm dismiss alpha');
    expect(frame).toContain('[y]/[Enter]');
  });
});
