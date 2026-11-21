import { describe, it, expect, vi } from 'vitest';
import { encodeConfigHash, getDefaultConfig } from '../../src/shared/config.js';
import { createOverlayApp, resolveInitialConfig } from '../../src/overlay/main.js';

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('OAuth Device Flow, EventSub, and overlay bootstrap integration', () => {
  it('completes device flow QR activation, stores token, subscribes EventSub, and deduplicates notifications', async () => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="auth"></div><div id="chat"></div>';

    const storage = makeMemoryStorage();
    const sockets = [];
    let pollCount = 0;
    const fetchMock = vi.fn(async (url, opts) => {
      if (url.includes('/oauth2/device')) {
        return { ok: true, json: async () => ({ device_code: 'dc1', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate', interval: 2 }) };
      }
      if (url.includes('/oauth2/token')) {
        pollCount += 1;
        if (pollCount === 1) return { ok: false, status: 400, json: async () => ({ message: 'authorization_pending' }) };
        return { ok: true, json: async () => ({ access_token: 'tok1', refresh_token: 'ref1', expires_in: 3600, scope: ['channel:read:redemptions', 'moderator:read:followers'] }) };
      }
      if (url.includes('/oauth2/validate')) {
        return { ok: true, json: async () => ({ user_id: '777', login: 'streamer', scopes: ['channel:read:redemptions', 'moderator:read:followers'] }) };
      }
      if (url.includes('/helix/eventsub/subscriptions')) {
        return { ok: true, status: 202, json: async () => ({ data: [{ id: 'sub1' }] }) };
      }
      if (url.includes('/oauth2/revoke')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes('api.ivr.fi')) {
        return { ok: true, json: async () => [{ id: '42', login: 'fan', logo: 'https://img.example/fan.png' }] };
      }
      return { ok: false, status: 404 };
    });

    const wsFactory = (url) => {
      const sock = { url, readyState: 1, sent: [], send(d) { this.sent.push(d); }, close() { this.readyState = 3; this.onclose?.(); } };
      sockets.push(sock);
      return sock;
    };

    const app = createOverlayApp({
      win: { location: { search: '', hash: '', origin: 'https://app.example.com' }, __CTC_CONFIG__: { channel: 'streamer', lang: 'en', authEnabled: 'yes', authPoints: 'yes', authFollows: 'yes', clientId: 'cid-1' } },
      doc: document,
      rootElement: document.getElementById('chat'),
      authRoot: document.getElementById('auth'),
      fetchImpl: fetchMock,
      wsFactory,
      storage,
    });

    await app.start();
    expect(document.querySelector('.ctc-auth-code').textContent).toBe('ABCD-EFGH');
    expect(document.querySelector('.ctc-auth-qr svg')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.ctc-auth-card')).toBeNull();
    expect(JSON.parse(storage.getItem('ctc.auth.v1.cid-1')).access_token).toBe('tok1');

    const ircSock = sockets.find((s) => s.url.includes('irc-ws'));
    ircSock.onopen();
    ircSock.onmessage({ data: '@room-id=777 :tmi.twitch.tv ROOMSTATE #streamer\r\n' });

    const esSock = sockets.find((s) => s.url.includes('eventsub'));
    expect(esSock).toBeDefined();
    await esSock.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'es-sess', keepalive_timeout_seconds: 10 } } }) });

    const notif = JSON.stringify({
      metadata: { message_type: 'notification', message_id: 'dup-1' },
      payload: {
        subscription: { type: 'channel.channel_points_custom_reward_redemption.add' },
        event: { id: 'r1', user_id: '42', user_name: 'Fan', reward: { title: 'Hydrate' }, user_input: 'sip' },
      },
    });
    await esSock.onmessage({ data: notif });
    await esSock.onmessage({ data: notif });
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.points-message')).toHaveLength(1);
    });
    expect(document.querySelector('.points-message').textContent).toContain('Hydrate');
    expect(app.getConfig().channel).toBe('streamer');

    app.applyConfig({ ...app.getConfig(), lang: 'pt-BR' });
    app.destroy();
    vi.useRealTimers();
  });

  it('handles preview postMessage origin isolation, hash config, and ?logout=1 revocation', async () => {
    document.body.innerHTML = '<div id="auth"></div><div id="chat"></div>';
    const hash = encodeConfigHash({ ...getDefaultConfig(), channel: 'hashchan', lang: 'en' });
    expect(resolveInitialConfig({ location: { hash } }).channel).toBe('hashchan');
    expect(resolveInitialConfig({ location: { hash: '' } }).channel).toBe('');

    const listeners = {};
    const fakeWin = {
      location: { search: '?preview=1', hash, origin: 'https://host.example.com' },
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      removeEventListener: vi.fn(),
    };
    const sockets = [];
    const app = createOverlayApp({
      win: fakeWin,
      doc: document,
      rootElement: document.getElementById('chat'),
      authRoot: document.getElementById('auth'),
      fetchImpl: async () => ({ ok: false }),
      wsFactory: (url) => { const s = { url, readyState: 1, send: vi.fn(), close: vi.fn() }; sockets.push(s); return s; },
    });

    await app.start();
    listeners.message({ origin: 'https://evil.example.com', data: { type: 'ctc:sim', action: 'testSub' } });
    expect(document.querySelectorAll('.sub-message')).toHaveLength(0);

    listeners.message({ origin: 'https://host.example.com', data: null });
    listeners.message({ origin: 'https://host.example.com', data: { type: 'ctc:config', config: { channel: 'livechan', lang: 'en' } } });
    listeners.message({ origin: 'https://host.example.com', data: { type: 'ctc:sim', action: 'testSub' } });
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.sub-message')).toHaveLength(1);
    });
    listeners.message({ origin: 'https://host.example.com', data: { type: 'ctc:live', connect: true } });
    expect(sockets).toHaveLength(1);
    listeners.message({ origin: 'https://host.example.com', data: { type: 'ctc:live', connect: false } });
    app.destroy();

    const storage = makeMemoryStorage();
    storage.setItem('ctc.auth.v1.cid-2', JSON.stringify({ access_token: 'old', refresh_token: 'ref', scopes: ['channel:read:redemptions'], nonce: 1 }));
    const revokeFetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    const logoutApp = createOverlayApp({
      win: { location: { search: '?logout=1', hash: '', origin: 'https://host.example.com' }, __CTC_CONFIG__: { clientId: 'cid-2' } },
      doc: document,
      rootElement: document.getElementById('chat'),
      authRoot: document.getElementById('auth'),
      fetchImpl: revokeFetch,
      storage,
    });
    await logoutApp.start();
    expect(storage.getItem('ctc.auth.v1.cid-2')).toBeNull();
    expect(revokeFetch).toHaveBeenCalledWith(expect.stringContaining('/oauth2/revoke'), expect.any(Object));

    const noopApp = createOverlayApp({
      win: { location: { search: '', hash: '', origin: 'https://host.example.com' }, __CTC_CONFIG__: { authEnabled: 'yes', clientId: 'cid-3', channel: 'c' } },
      doc: document,
      rootElement: document.getElementById('chat'),
      authRoot: null,
      fetchImpl: async () => ({ ok: false }),
      wsFactory: () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }),
      storage,
    });
    await noopApp.start();
    noopApp.destroy();
  });
});
