import { pasteText, sessionName } from '../tmux.js';
import { readState } from '../state.js';
import type { MusicianStatus } from '../state.types.js';
import { findMusicianStrict } from './lookup.js';
import {
  setMusicianStatus,
  touchMusicianActivity,
} from '../state-updaters.js';
import {
  countPendingMusicianMessages,
  formatQueuedMusicianMessages,
  listPendingMusicianMessages,
  markMusicianMessageDelivered,
  queueMusicianMessage,
  type MusicianMessageDelivery,
} from './message-log.js';

export interface MessageMusicianOptions {
  orchestraId: string;
  musicianId: string;
  message: string;
}

export interface MessageMusicianResult {
  ok: true;
  delivery: 'immediate' | 'queued';
  message_id: string;
  pending_messages: number;
}

function isReadyForDelivery(status: MusicianStatus): boolean {
  return status === 'idle' || status === 'waiting';
}

async function deliverPendingMessages(
  orchestraId: string,
  musicianId: string,
  delivery: MusicianMessageDelivery,
): Promise<number> {
  const state = await readState(orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${orchestraId}`);
  }
  const musician = findMusicianStrict(state, musicianId);
  const pending = await listPendingMusicianMessages(orchestraId, musicianId);
  if (pending.length === 0) {
    return 0;
  }

  const target = `${sessionName(orchestraId)}:${musician.tmux_window_id}`;
  const message = formatQueuedMusicianMessages(pending);
  await pasteText(target, message, true);

  const deliveredAt = new Date().toISOString();
  for (const pendingMessage of pending) {
    await markMusicianMessageDelivered(
      orchestraId,
      musicianId,
      pendingMessage.messageId,
      delivery,
      deliveredAt,
    );
  }
  await touchMusicianActivity(orchestraId, musicianId, deliveredAt);
  return pending.length;
}

export async function messageMusician(opts: MessageMusicianOptions): Promise<MessageMusicianResult> {
  const state = await readState(opts.orchestraId);
  if (!state) {
    throw new Error(`Unknown orchestra: ${opts.orchestraId}`);
  }
  const musician = findMusicianStrict(state, opts.musicianId);
  const queued = await queueMusicianMessage(opts.orchestraId, opts.musicianId, opts.message);

  if (isReadyForDelivery(musician.status)) {
    const delivery: MusicianMessageDelivery = (await countPendingMusicianMessages(
      opts.orchestraId,
      opts.musicianId,
    )) === 1 ? 'immediate' : 'queued-drain';
    await deliverPendingMessages(opts.orchestraId, opts.musicianId, delivery);
    await setMusicianStatus(opts.orchestraId, opts.musicianId, 'working');
    return {
      ok: true,
      delivery: 'immediate',
      message_id: queued.messageId,
      pending_messages: 0,
    };
  }

  return {
    ok: true,
    delivery: 'queued',
    message_id: queued.messageId,
    pending_messages: await countPendingMusicianMessages(opts.orchestraId, opts.musicianId),
  };
}

export async function drainQueuedMusicianMessages(
  orchestraId: string,
  musicianId: string,
): Promise<number> {
  return deliverPendingMessages(orchestraId, musicianId, 'queued-drain');
}
