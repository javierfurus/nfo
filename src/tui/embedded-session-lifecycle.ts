export interface EmbeddedSessionLease {
  readonly sessionName: string;
  readonly token: number;
}

const embeddedSessionTokens = new Map<string, number>();
const embeddedSessionQueues = new Map<string, Promise<void>>();

export function claimEmbeddedSessionLease(
  sessionName: string,
): EmbeddedSessionLease {
  const token = (embeddedSessionTokens.get(sessionName) ?? 0) + 1;
  embeddedSessionTokens.set(sessionName, token);
  return { sessionName, token };
}

export function embeddedSessionLeaseIsCurrent(
  lease: EmbeddedSessionLease,
): boolean {
  return embeddedSessionTokens.get(lease.sessionName) === lease.token;
}

export async function runEmbeddedSessionOperation<T>(
  sessionName: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = embeddedSessionQueues.get(sessionName) ?? Promise.resolve();
  let releaseQueue: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  embeddedSessionQueues.set(sessionName, current);

  await previous;

  try {
    return await operation();
  } finally {
    releaseQueue?.();
    if (embeddedSessionQueues.get(sessionName) === current) {
      embeddedSessionQueues.delete(sessionName);
    }
  }
}
