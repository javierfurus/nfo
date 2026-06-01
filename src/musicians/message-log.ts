import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { messageLogsDir } from '../config.js';

export type MusicianMessageDelivery = 'immediate' | 'queued-drain';

interface MusicianMessageQueuedEvent {
  type: 'message_queued';
  message_id: string;
  musician_id: string;
  message: string;
  created_at: string;
}

interface MusicianMessageDeliveredEvent {
  type: 'message_delivered';
  message_id: string;
  delivered_at: string;
  delivery: MusicianMessageDelivery;
}

type MusicianMessageEvent = MusicianMessageQueuedEvent | MusicianMessageDeliveredEvent;

export interface PendingMusicianMessage {
  messageId: string;
  musicianId: string;
  message: string;
  createdAt: string;
}

export interface QueueMusicianMessageResult {
  messageId: string;
  createdAt: string;
}

function messageLogFile(orchestraId: string, musicianId: string): string {
  return join(messageLogsDir(orchestraId), `${musicianId}.jsonl`);
}

async function appendEvent(
  orchestraId: string,
  musicianId: string,
  event: MusicianMessageEvent,
): Promise<void> {
  const dir = messageLogsDir(orchestraId);
  await mkdir(dir, { recursive: true });
  await appendFile(messageLogFile(orchestraId, musicianId), JSON.stringify(event) + '\n', 'utf8');
}

async function readEvents(orchestraId: string, musicianId: string): Promise<MusicianMessageEvent[]> {
  const file = messageLogFile(orchestraId, musicianId);
  if (!existsSync(file)) {
    return [];
  }
  const raw = await readFile(file, 'utf8');
  return raw
    .split('\n')
    .map((line) => { return line.trim(); })
    .filter((line) => { return line.length > 0; })
    .map((line) => { return JSON.parse(line) as MusicianMessageEvent; });
}

export async function queueMusicianMessage(
  orchestraId: string,
  musicianId: string,
  message: string,
): Promise<QueueMusicianMessageResult> {
  const createdAt = new Date().toISOString();
  const messageId = `${Date.now()}-${randomUUID()}`;
  await appendEvent(orchestraId, musicianId, {
    type: 'message_queued',
    message_id: messageId,
    musician_id: musicianId,
    message,
    created_at: createdAt,
  });
  return { messageId, createdAt };
}

export async function markMusicianMessageDelivered(
  orchestraId: string,
  musicianId: string,
  messageId: string,
  delivery: MusicianMessageDelivery,
  deliveredAt = new Date().toISOString(),
): Promise<void> {
  await appendEvent(orchestraId, musicianId, {
    type: 'message_delivered',
    message_id: messageId,
    delivered_at: deliveredAt,
    delivery,
  });
}

export async function listPendingMusicianMessages(
  orchestraId: string,
  musicianId: string,
): Promise<PendingMusicianMessage[]> {
  const events = await readEvents(orchestraId, musicianId);
  const pending = new Map<string, PendingMusicianMessage>();

  for (const event of events) {
    if (event.type === 'message_queued') {
      pending.set(event.message_id, {
        messageId: event.message_id,
        musicianId: event.musician_id,
        message: event.message,
        createdAt: event.created_at,
      });
      continue;
    }
    pending.delete(event.message_id);
  }

  return [...pending.values()].sort((left, right) => {
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export async function countPendingMusicianMessages(
  orchestraId: string,
  musicianId: string,
): Promise<number> {
  const pending = await listPendingMusicianMessages(orchestraId, musicianId);
  return pending.length;
}

export function formatQueuedMusicianMessages(messages: PendingMusicianMessage[]): string {
  if (messages.length === 0) {
    return '';
  }
  if (messages.length === 1) {
    return messages[0].message;
  }

  const lines = [
    'NFO queued follow-up messages while you were busy:',
    '',
  ];

  messages.forEach((message, index) => {
    lines.push(`${index + 1}.`);
    lines.push(message.message);
    if (index < messages.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}
