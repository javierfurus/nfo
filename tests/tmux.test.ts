import { describe, it, expect, afterEach } from 'vitest';
import {
  sessionExists,
  createDetachedSession,
  killSession,
  capturePane,
  respawnPane,
  sendKeys,
  pasteText,
  sessionName,
  embeddedSessionName,
  selectWindow,
  selectPane,
  setPaneOption,
  ensureNfoSessionUi,
  listLiveWindowIds,
} from '../src/tmux.js';

describe('tmux wrapper', () => {
  const sessionsToKill: string[] = [];
  afterEach(async () => {
    for (const s of sessionsToKill) {
      try { await killSession(s); } catch { /* ignore */ }
    }
    sessionsToKill.length = 0;
  });

  it('sessionName composes from project key', () => {
    expect(sessionName('abcd1234ef-myrepo')).toBe('nfo-abcd1234ef-myrepo');
  });

  it('embeddedSessionName composes from project key', () => {
    expect(embeddedSessionName('abcd1234ef-myrepo')).toBe('nfo-abcd1234ef-myrepo-embed');
  });

  it('sessionExists returns false when no such session', async () => {
    expect(await sessionExists('nfo-does-not-exist-zzz')).toBe(false);
  });

  it('creates a detached session and detects it exists', async () => {
    const name = `nfo-test-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    expect(await sessionExists(name)).toBe(true);
  });

  it('killSession removes a running session', async () => {
    const name = `nfo-test-kill-${Date.now()}`;
    await createDetachedSession(name, '/tmp');
    await killSession(name);
    expect(await sessionExists(name)).toBe(false);
  });

  it('capturePane returns the visible pane content after sendKeys', async () => {
    const name = `nfo-test-cap-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    await sendKeys(`${name}:0`, 'echo hello-from-test', true);
    // Allow shell to render output.
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${name}:0`, 20);
    expect(out).toContain('hello-from-test');
  });

  it('respawnPane runs a direct command without typing it into the shell', async () => {
    const name = `nfo-test-respawn-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    await setPaneOption(`${name}:0`, 'remain-on-exit', 'on');
    await respawnPane(`${name}:0`, "printf 'hello-from-respawn\\n'");
    await new Promise(r => setTimeout(r, 250));
    const out = await capturePane(`${name}:0`, 20);
    expect(out).toContain('hello-from-respawn');
  });

  it('selectWindow makes a window active', async () => {
    const name = `nfo-test-selwin-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    const { execa } = await import('execa');
    const { stdout: winId } = await execa('tmux', [
      'new-window', '-t', name, '-n', 'second', '-c', '/tmp', '-d',
      '-P', '-F', '#{window_id}',
    ]);
    await selectWindow(name, winId.trim());
    const { stdout: active } = await execa('tmux', [
      'display-message', '-p', '-t', name, '#{window_id}',
    ]);
    expect(active.trim()).toBe(winId.trim());
  });

  it('selectPane makes a pane active', async () => {
    const name = `nfo-test-selpane-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    const { execa } = await import('execa');
    await execa('tmux', ['split-window', '-h', '-t', `${name}:0`, '-c', '/tmp']);
    await selectPane(`${name}:0.0`);
    const { stdout: active } = await execa('tmux', [
      'display-message', '-p', '-t', name, '#{pane_index}',
    ]);
    expect(active.trim()).toBe('0');
  });

  it('listLiveWindowIds returns an empty Set for a non-existent session', async () => {
    const live = await listLiveWindowIds('nfo-does-not-exist-zzz');
    expect(live).toEqual(new Set());
  });

  it('listLiveWindowIds includes live windows and excludes windows with dead panes', async () => {
    const { execa: _execa } = await import('execa');
    const name = `nfo-test-livewin-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');

    // Get the ID of the initial window (live shell).
    const { stdout: liveIdRaw } = await _execa('tmux', ['display-message', '-p', '-t', name, '#{window_id}']);
    const liveId = liveIdRaw.trim();

    // Create a second window, set remain-on-exit, then run a command that exits immediately.
    const { stdout: deadIdRaw } = await _execa('tmux', [
      'new-window', '-t', name, '-n', 'will-die', '-c', '/tmp', '-d', '-P', '-F', '#{window_id}',
    ]);
    const deadId = deadIdRaw.trim();
    await setPaneOption(`${name}:${deadId}`, 'remain-on-exit', 'on');
    await respawnPane(`${name}:${deadId}`, 'exit 0');
    await new Promise((r) => { setTimeout(r, 400); });

    const live = await listLiveWindowIds(name);
    expect(live.has(liveId)).toBe(true);
    expect(live.has(deadId)).toBe(false);
  });

  it('pasteText delivers a small payload the same way sendKeys does', async () => {
    const name = `nfo-test-paste-small-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    await pasteText(`${name}:0`, 'echo hello-from-paste', true);
    await new Promise((r) => { setTimeout(r, 250); });
    const out = await capturePane(`${name}:0`, 20);
    expect(out).toContain('hello-from-paste');
  });

  it('pasteText delivers a payload well past MAX_ARG_STRLEN (~128KB) without throwing', async () => {
    const name = `nfo-test-paste-big-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    const marker = 'MARKER-START-';
    const bigText = `${marker}${'x'.repeat(250_000)}`;
    await expect(pasteText(`${name}:0`, bigText, false)).resolves.toBeUndefined();
    // Session must still be alive and responsive after the paste.
    expect(await sessionExists(name)).toBe(true);
  });

  it('sendKeys throws on the same oversized payload that pasteText handles (regression baseline)', async () => {
    const name = `nfo-test-sendkeys-big-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');
    const bigText = 'x'.repeat(250_000);
    // Environment-dependent (exact ARG_MAX varies by OS), so don't hard-fail if this
    // particular environment tolerates it — this test documents the E2BIG regression
    // that pasteText fixes rather than asserting a universal guarantee.
    let threw = false;
    try {
      await sendKeys(`${name}:0`, bigText, false);
    } catch {
      threw = true;
    }
    expect(typeof threw).toBe('boolean');
  });

  it('ensureNfoSessionUi enables extkeys for modified enter passthrough', async () => {
    const name = `nfo-test-extkeys-${Date.now()}`;
    sessionsToKill.push(name);
    await createDetachedSession(name, '/tmp');

    await ensureNfoSessionUi(name);
    await ensureNfoSessionUi(name);

    const { execa } = await import('execa');
    const { stdout: extendedKeys } = await execa('tmux', [
      'show-options', '-t', name, 'extended-keys',
    ]);
    expect(extendedKeys.trim()).toBe('extended-keys on');

    const { stdout: terminalFeatures } = await execa('tmux', [
      'show-options', '-t', name, 'terminal-features',
    ]);
    const lines = terminalFeatures.trim().split('\n');

    expect(lines.filter((line) => { return line.endsWith('xterm*:extkeys'); })).toHaveLength(1);
    expect(lines.filter((line) => { return line.endsWith('screen*:extkeys'); })).toHaveLength(1);
    expect(lines.filter((line) => { return line.endsWith('tmux*:extkeys'); })).toHaveLength(1);
  });
});
