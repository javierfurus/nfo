import { describe, it, expect, vi } from 'vitest';
import { notifyAwaitingPermission } from '../src/notify.js';

describe('notifyAwaitingPermission', () => {
  it('writes a BEL character to the bell sink', async () => {
    const bell = vi.fn();
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'linux',
      bell,
      spawn,
    });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(bell).toHaveBeenCalledWith('\x07');
  });

  it('on linux, spawns notify-send with NFO title and count message', async () => {
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 2,
      platform: 'linux',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args] = spawn.mock.calls[0];
    expect(bin).toBe('notify-send');
    expect(args).toEqual(['NFO', '2 musicians awaiting permission']);
  });

  it('on darwin, spawns osascript with display notification AppleScript', async () => {
    const spawn = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'darwin',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [bin, args] = spawn.mock.calls[0];
    expect(bin).toBe('osascript');
    expect(args.length).toBe(2);
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('display notification');
    expect(args[1]).toContain('1 musician awaiting permission');
    expect(args[1]).toContain('NFO');
  });

  it('on unknown platform, fires bell only (no spawn)', async () => {
    const spawn = vi.fn();
    await notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'win32',
      bell: vi.fn(),
      spawn,
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('swallows spawn errors silently', async () => {
    const spawn = vi.fn().mockRejectedValue(new Error('notify-send not installed'));
    await expect(notifyAwaitingPermission({
      pendingCount: 1,
      platform: 'linux',
      bell: vi.fn(),
      spawn,
    })).resolves.toBeUndefined();
  });

  it('uses singular noun for count=1, plural otherwise', async () => {
    const spawn1 = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({ pendingCount: 1, platform: 'linux', bell: vi.fn(), spawn: spawn1 });
    expect(spawn1.mock.calls[0][1]).toEqual(['NFO', '1 musician awaiting permission']);

    const spawnN = vi.fn().mockResolvedValue(undefined);
    await notifyAwaitingPermission({ pendingCount: 3, platform: 'linux', bell: vi.fn(), spawn: spawnN });
    expect(spawnN.mock.calls[0][1]).toEqual(['NFO', '3 musicians awaiting permission']);
  });
});
