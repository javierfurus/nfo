import { describe, expect, it } from 'vitest';

import {
  claimEmbeddedSessionLease,
  embeddedSessionLeaseIsCurrent,
  runEmbeddedSessionOperation,
} from '../../src/tui/embedded-session-lifecycle.js';

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return {
    promise,
    resolve: () => resolve?.(),
  };
}

describe('embedded-session-lifecycle', () => {
  it('serializes operations for the same embedded session', async () => {
    const events: string[] = [];
    const first = createDeferred();

    const firstOperation = runEmbeddedSessionOperation('embed', async () => {
      events.push('first:start');
      await first.promise;
      events.push('first:end');
    });

    const secondOperation = runEmbeddedSessionOperation('embed', async () => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    first.resolve();

    await Promise.all([firstOperation, secondOperation]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('marks stale embedded session leases as no longer current', () => {
    const firstLease = claimEmbeddedSessionLease('embed');
    const secondLease = claimEmbeddedSessionLease('embed');

    expect(embeddedSessionLeaseIsCurrent(firstLease)).toBe(false);
    expect(embeddedSessionLeaseIsCurrent(secondLease)).toBe(true);
  });
});
