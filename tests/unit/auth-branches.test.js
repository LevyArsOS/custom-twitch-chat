import { describe, it, expect, vi } from 'vitest';
import { createAuthManager } from '../../src/overlay/auth.js';
import { createEventSubClient } from '../../src/overlay/eventsub.js';
import { createOverlayApp } from '../../src/overlay/main.js';

describe('auth and eventsub branch coverage', () => {
  it('validates cached session, refreshes expired cached session, and handles revoke/empty cases', async () => {
    const map = new Map();
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
    const onAuth = vi.fn();

    storage.setItem('ctc.auth.v1.cid', JSON.stringify({ access_token: 'ok', refresh_token: 'r1', scopes: ['s1'], nonce: 1 }));
    const mgrOk = createAuthManager({
      clientId: 'cid', scopes: ['s1'], nonce: 1, storage, onAuthenticated: onAuth,
      fetchImpl: async () => ({ ok: true, json: async () => ({ user_id: '10', login: 'me', scopes: ['s1'] }) }),
    });
    expect((await mgrOk.init()).user_id).toBe('10');
    expect(mgrOk.getAccessToken()).toBe('ok');
    mgrOk.stop();

    const mgrRefresh = createAuthManager({
      clientId: 'cid', scopes: ['s1'], nonce: 1, storage, onAuthenticated: onAuth,
      fetchImpl: async (url) => {
        if (url.includes('/validate')) return { ok: false, status: 401 };
        if (url.includes('/token')) return { ok: true, json: async () => ({ access_token: 'new-ok', expires_in: 100 }) };
        return { ok: false };
      },
    });
    expect((await mgrRefresh.init()).access_token).toBe('new-ok');
    mgrRefresh.stop();

    const mgrNetErr = createAuthManager({
      clientId: 'cid', scopes: ['s1'], storage,
      fetchImpl: async () => { throw new Error('offline'); },
    });
    expect(await mgrNetErr.refreshToken(true)).toBeNull();
    await mgrNetErr.revoke();
    await mgrNetErr.revoke();
    expect(await mgrNetErr.refreshToken(true)).toBeNull();
  });

  it('retries EventSub subscription after 401 refresh and succeeds', async () => {
    const sockets = [];
    let attempt = 0;
    const client = createEventSubClient({
      clientId: 'cid',
      getAccessToken: () => 't1',
      refreshToken: async () => ({ access_token: 't2' }),
      broadcasterId: '1',
      enablePoints: true,
      wsFactory: (u) => { const s = { url: u, close: vi.fn() }; sockets.push(s); return s; },
      fetchImpl: async () => {
        attempt += 1;
        return attempt === 1 ? { ok: false, status: 401 } : { ok: true, status: 202 };
      },
    });
    client.connect();
    await sockets[0].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's' } } }) });
    expect(attempt).toBe(2);
    client.disconnect();

    vi.useFakeTimers();
    const map = new Map();
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
    let tick = 0;
    const mgrMinimal = createAuthManager({
      clientId: 'cid', scopes: ['s1'], storage,
      fetchImpl: async (url) => {
        if (url.includes('/device')) return { ok: true, json: async () => ({ device_code: 'd', user_code: 'C' }) };
        if (url.includes('/token')) return { ok: true, json: async () => ({ access_token: 't' }) };
        if (url.includes('/validate')) {
          tick += 1;
          return tick === 1 ? { ok: false, status: 401 } : { ok: true, json: async () => ({ scopes: ['s1'] }) };
        }
        return { ok: false };
      },
    });
    await mgrMinimal.init();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(3600000);
    storage.removeItem('ctc.auth.v1.cid');
    await vi.advanceTimersByTimeAsync(3600000);
    mgrMinimal.stop();

    const noStorage = createAuthManager({ clientId: 'cid', storage: null });
    expect(noStorage.getAccessToken()).toBe('');
    await noStorage.revoke();

    document.body.innerHTML = '<div id="a"></div><div id="c"></div>';
    const sockets2 = [];
    const noScopeApp = createOverlayApp({
      win: { location: { search: '', hash: '', origin: 'https://x.example.com' }, __CTC_CONFIG__: { authEnabled: 'yes', authPoints: 'no', authFollows: 'no', clientId: 'cid', channel: 'ch' } },
      doc: document,
      rootElement: document.getElementById('c'),
      authRoot: document.getElementById('a'),
      storage,
      fetchImpl: async () => ({ ok: true, json: async () => ({ user_id: '1', login: 'u', scopes: [] }) }),
      wsFactory: (u) => { const s = { url: u, readyState: 1, send: vi.fn(), close: vi.fn() }; sockets2.push(s); return s; },
    });
    await noScopeApp.start();
    sockets2[0].onmessage({ data: '@room-id=1 :tmi.twitch.tv ROOMSTATE #ch\r\n' });
    noScopeApp.destroy();

    const sockets3 = [];
    let subStatus = 403;
    const warnApp = createOverlayApp({
      win: { location: { search: '', hash: '', origin: 'https://x.example.com' }, __CTC_CONFIG__: { authEnabled: 'yes', authPoints: 'yes', clientId: 'cid', channel: 'ch' } },
      doc: document,
      rootElement: document.getElementById('c'),
      authRoot: document.getElementById('a'),
      storage: { getItem: () => JSON.stringify({ access_token: 'ok', scopes: ['channel:read:redemptions'], nonce: 1 }), setItem: () => {}, removeItem: () => {} },
      fetchImpl: async (url) => {
        if (url.includes('/validate')) return { ok: true, json: async () => ({ user_id: '1', login: 'u', scopes: ['channel:read:redemptions'] }) };
        if (url.includes('/eventsub/subscriptions')) return { ok: false, status: subStatus };
        return { ok: false };
      },
      wsFactory: (u) => { const s = { url: u, readyState: 1, send: vi.fn(), close: vi.fn() }; sockets3.push(s); return s; },
    });
    await warnApp.start();
    sockets3[0].onmessage({ data: '@room-id=1 :tmi.twitch.tv ROOMSTATE #ch\r\n' });
    await sockets3[1].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's1' } } }) });
    subStatus = 401;
    await sockets3[1].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's2' } } }) });
    warnApp.destroy();

    const emptyEs = createEventSubClient({
      clientId: 'c', getAccessToken: () => 't', enablePoints: true, enableFollows: true,
      wsFactory: (u) => { const s = { url: u, close: vi.fn() }; sockets3.push(s); return s; },
    });
    emptyEs.connect();
    await sockets3.at(-1).onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 's3' } } }) });
    emptyEs.disconnect();

    vi.useRealTimers();
  });
});
