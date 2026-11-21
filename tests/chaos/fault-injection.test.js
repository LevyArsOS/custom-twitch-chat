import { describe, it, expect, vi } from 'vitest';
import { createAuthManager } from '../../src/overlay/auth.js';
import { createAuthPanel } from '../../src/overlay/auth-panel.js';
import { createEventSubClient } from '../../src/overlay/eventsub.js';

function makeMutexLock() {
  let queue = Promise.resolve();
  return {
    request(_name, fn) {
      const next = queue.then(fn, fn);
      queue = next.catch(() => {});
      return next;
    },
  };
}

describe('OAuth and EventSub chaos / fault-injection', () => {
  it('serializes concurrent refresh across 2 instances so refresh token is exchanged only once', async () => {
    const map = new Map();
    const storage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
    storage.setItem('ctc.auth.v1.cid', JSON.stringify({
      access_token: 'expired',
      refresh_token: 'rot-1',
      expires_at: Date.now() - 1000,
      scopes: ['channel:read:redemptions'],
      nonce: 1,
    }));

    let tokenPosts = 0;
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/oauth2/token')) {
        tokenPosts += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { ok: true, json: async () => ({ access_token: 'fresh-tok', refresh_token: 'rot-2', expires_in: 3600 }) };
      }
      return { ok: false };
    });

    const locks = makeMutexLock();
    const mgrA = createAuthManager({ clientId: 'cid', scopes: ['channel:read:redemptions'], fetchImpl: fetchMock, storage, locks });
    const mgrB = createAuthManager({ clientId: 'cid', scopes: ['channel:read:redemptions'], fetchImpl: fetchMock, storage, locks });

    const [resA, resB] = await Promise.all([mgrA.refreshToken(false), mgrB.refreshToken(false)]);
    expect(tokenPosts).toBe(1);
    expect(resA.access_token).toBe('fresh-tok');
    expect(resB.access_token).toBe('fresh-tok');
  });

  it('handles slow_down, expired_token, access_denied, hourly invalidation, and nonce mismatch', async () => {
    vi.useFakeTimers();
    const map = new Map([['ctc.auth.v1.cid', JSON.stringify({ access_token: 'old', refresh_token: 'r0', scopes: ['s1'], nonce: 1 })]]);
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
    const statuses = [];
    let stage = 0;

    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/oauth2/revoke')) return { ok: true };
      if (url.includes('/oauth2/device')) return { ok: true, json: async () => ({ device_code: 'd1', user_code: 'U1', interval: 1 }) };
      if (url.includes('/oauth2/token')) {
        stage += 1;
        if (stage === 1) return { ok: false, status: 400, json: async () => ({ message: 'slow_down' }) };
        if (stage === 2) return { ok: false, status: 400, json: async () => ({ message: 'expired_token' }) };
        if (stage === 3) throw new Error('transient net');
        return { ok: false, status: 400, json: async () => ({ message: 'access_denied' }) };
      }
      return { ok: false };
    });

    const mgr = createAuthManager({
      clientId: 'cid', scopes: ['s1'], nonce: 2, fetchImpl: fetchMock, storage,
      onStatus: (s) => statuses.push(s),
    });

    await mgr.init();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(6000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses).toEqual(['waiting', 'expired', 'waiting', 'denied']);
    mgr.stop();

    storage.setItem('ctc.auth.v1.cid', JSON.stringify({ access_token: 'valid1', refresh_token: 'r1', scopes: ['s1'], nonce: 2 }));
    let validateCalls = 0;
    const hourlyFetch = vi.fn(async (url) => {
      if (url.includes('/validate')) {
        validateCalls += 1;
        if (validateCalls === 1) return { ok: true, json: async () => ({ user_id: '1', login: 'u', scopes: ['s1'] }) };
        return { ok: false, status: 401 };
      }
      if (url.includes('/token')) return { ok: false, status: 400 };
      if (url.includes('/device')) return { ok: false, status: 500 };
      return { ok: false };
    });
    const mgr2 = createAuthManager({ clientId: 'cid', scopes: ['s1'], nonce: 2, fetchImpl: hourlyFetch, storage });
    await mgr2.init();
    await vi.advanceTimersByTimeAsync(3600000);
    expect(validateCalls).toBe(2);
    expect(storage.getItem('ctc.auth.v1.cid')).toBeNull();
    mgr2.stop();
    vi.useRealTimers();
  });

  it('handles EventSub keepalive watchdog, session_reconnect, 401 refresh retry, 403 scope warning, and revocation', async () => {
    vi.useFakeTimers();
    const sockets = [];
    const statuses = [];
    let subAttempt = 0;
    const refreshToken = vi.fn(async () => ({ access_token: 'refreshed' }));
    const onAuthInvalid = vi.fn();

    const fetchMock = vi.fn(async () => {
      subAttempt += 1;
      if (subAttempt === 1) return { ok: false, status: 401 };
      if (subAttempt === 2) return { ok: false, status: 403 };
      return { ok: true, status: 202 };
    });

    const client = createEventSubClient({
      clientId: 'cid',
      getAccessToken: () => 'tok',
      refreshToken,
      broadcasterId: '10',
      userId: '10',
      enablePoints: true,
      enableFollows: true,
      wsFactory: (url) => { const s = { url, close: vi.fn() }; sockets.push(s); return s; },
      fetchImpl: fetchMock,
      onStatus: (s) => statuses.push(s),
      onAuthInvalid,
    });

    client.connect();
    const s0 = sockets[0];
    s0.onmessage({ data: 'not-json' });
    await s0.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's0', keepalive_timeout_seconds: 5 } } }) });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(statuses).toContain('scopeWarning');

    s0.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_keepalive' }, payload: { session: { keepalive_timeout_seconds: 5 } } }) });
    s0.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://reconnect.example/ws' } } }) });
    expect(sockets).toHaveLength(2);
    await sockets[1].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's1', keepalive_timeout_seconds: 5 } } }) });
    expect(s0.close).toHaveBeenCalled();

    sockets[1].onmessage({ data: JSON.stringify({ metadata: { message_type: 'revocation' }, payload: {} }) });
    expect(statuses).toContain('revoked');

    await vi.advanceTimersByTimeAsync(16000);
    expect(sockets.length).toBeGreaterThanOrEqual(3);
    sockets[2].onerror();
    sockets[2].onclose();

    for (let i = 0; i < 505; i += 1) {
      sockets[2].onmessage({ data: JSON.stringify({ metadata: { message_type: 'notification', message_id: `id-${i}` }, payload: {} }) });
    }
    sockets[2].onmessage({ data: JSON.stringify({ metadata: { message_type: 'notification' }, payload: {} }) });

    client.disconnect();

    const fail401 = createEventSubClient({
      clientId: 'cid', getAccessToken: () => 't', refreshToken: async () => null,
      broadcasterId: '1', enablePoints: true,
      wsFactory: (u) => { const s = { url: u, close: vi.fn() }; sockets.push(s); return s; },
      fetchImpl: async () => ({ ok: false, status: 401 }),
      onAuthInvalid,
    });
    fail401.connect();
    await sockets.at(-1).onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's' } } }) });
    expect(onAuthInvalid).toHaveBeenCalled();

    const idleEs = createEventSubClient();
    idleEs.connect();
    idleEs.disconnect();

    const panel = createAuthPanel({ container: null, doc: null });
    panel.show({ userCode: 'X', verificationUri: 'https://twitch.tv/activate' });
    panel.setStatus('waiting');
    panel.setLang('pt-BR');
    panel.hide();

    const corruptStorage = { getItem: () => '{bad-json', setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const authRes = await createAuthManager({ clientId: 'cid', scopes: ['s1'], storage: corruptStorage, fetchImpl: async () => { throw new Error('net'); } }).init();
    expect(authRes).toBeNull();
    expect(await createAuthManager({ clientId: '' }).init()).toBeNull();

    vi.useRealTimers();
  });
});
