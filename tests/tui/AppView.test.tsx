import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { AppView } from '../../src/tui/components/AppView.js';
import { OrchestratorPane } from '../../src/tui/components/OrchestratorPane.js';
import type { Musician } from '../../src/state.types.js';
import type { OrchestraSummary } from '../../src/commands/list.js';
import type { EmbeddedTerminalSnapshot, TerminalFeed } from '../../src/tui/embedded-terminal.js';

const musicians: Musician[] = [{
  id: 'mus-001', name: 'alpha', task_summary: 't', status: 'working',
  tmux_window_id: '@1', claude_session_id: null, worktree_path: null, branch: null,
  spawned_at: '2026-05-29T10:00:00Z', last_activity: '2026-05-29T10:00:00Z',
}];
const orchestras: OrchestraSummary[] = [{
  id: 'aaa-one', project_path: '/tmp/one', permission_level: 'supervised',
  created_at: '2026-05-29T10:00:00Z', running: true, musician_count: 1,
}];

function makeFeed(snap: EmbeddedTerminalSnapshot): TerminalFeed {
  return {
    onChange: (listener) => {
      listener(snap);
      return () => {};
    },
    snapshot: () => snap,
  };
}

describe('AppView', () => {
  it('renders concert hall, auditorium, and status bar together', () => {
    const { lastFrame } = render(
      <AppView
        orchestras={orchestras}
        currentId="aaa-one"
        musicians={musicians}
        activity={{ 'mus-001': 'building' }}
        selectedIndex={0}
        permissionLevel="supervised"
        tokenHint="—"
        pendingCount={1}
        now="2026-05-29T10:01:00Z"
        feed={makeFeed({ title: 'Claude / tmux', lines: [{ spans: [{ text: 'claude output' }] }], connected: true })}
        activeMusicianName={null}
        errorMessage={null}
        orchestratorFocused={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Claude');
    expect(frame).toContain('claude output');
    expect(frame).toContain('No Fluff Orchestra');
    expect(frame).toContain('Concert Hall');
    expect(frame).toContain('Auditorium');
    expect(frame).toContain('alpha');
    expect(frame).toContain('building');
    expect(frame).toContain('supervised');
    expect(frame).toContain('awaiting permission');
  });

  it('renders the help overlay when showHelp=true', () => {
    const { lastFrame } = render(
      <AppView
        orchestras={[]}
        currentId="abc"
        musicians={[]}
        activity={{}}
        selectedIndex={0}
        permissionLevel="supervised"
        tokenHint="—"
        now={new Date(0).toISOString()}
        pendingCount={0}
        showHelp={true}
        feed={null}
        activeMusicianName={null}
        errorMessage={null}
        orchestratorFocused={false}
      />,
    );
    const frame = (lastFrame() ?? '').toLowerCase();
    expect(frame).toContain('cancel pending dismiss');
    expect(frame).toContain('mouse wheel');
    expect(frame).toContain('claude');
  });
});

describe('OrchestratorPane', () => {
  it('renders lines in a plain box without scroll props', () => {
    const { lastFrame } = render(
      <OrchestratorPane
        feed={makeFeed({
          title: 'Orchestrator',
          lines: [
            { spans: [{ text: 'line one' }] },
            { spans: [{ text: 'line two' }] },
          ],
          connected: true,
        })}
        activeMusicianName={null}
        errorMessage={null}
        focused={false}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('line one');
    expect(frame).toContain('line two');
  });
});
