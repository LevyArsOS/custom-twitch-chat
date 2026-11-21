import { createSessionStore, postForm, validateTwitchToken } from './auth-store.js';

export function createAuthManager({
  clientId = '',
  scopes = [],
  nonce = 1,
  fetchImpl = (...args) => fetch(...args),
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  locks = typeof navigator !== 'undefined' ? navigator.locks : null,
  now = () => Date.now(),
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
  setIntervalImpl = (fn, ms) => setInterval(fn, ms),
  clearIntervalImpl = (id) => clearInterval(id),
  onDevicePrompt = () => {},
  onStatus = () => {},
  onAuthenticated = () => {},
} = {}) {
  const store = createSessionStore(storage, `ctc.auth.v1.${clientId}`);
  let pollTimer = null;
  let validateTimer = null;
  let stopped = false;

  const withLock = (fn) => (locks?.request ? locks.request('ctc-auth-refresh', fn) : fn());
  const hasScopes = (granted = []) => scopes.every((s) => granted.includes(s));

  function stopTimers() {
    if (pollTimer !== null) { clearTimeoutImpl(pollTimer); pollTimer = null; }
    if (validateTimer !== null) { clearIntervalImpl(validateTimer); validateTimer = null; }
  }

  function refreshToken(force = false) {
    return withLock(async () => {
      const current = store.read();
      if (!current?.refresh_token) return null;
      if (!force && current.access_token && current.expires_at > now() + 60000) {
        return current;
      }
      try {
        const res = await postForm(fetchImpl, '/token', {
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: current.refresh_token,
        });
        if (!res.ok) { store.clear(); return null; }
        const data = await res.json();
        const updated = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || current.refresh_token,
          expires_at: now() + (Number(data.expires_in) || 14400) * 1000,
          scopes: data.scope || current.scopes || [],
          user_id: current.user_id || '',
          login: current.login || '',
          nonce,
        };
        store.write(updated);
        return updated;
      } catch {
        return null;
      }
    });
  }

  function scheduleValidation() {
    if (validateTimer !== null) clearIntervalImpl(validateTimer);
    validateTimer = setIntervalImpl(async () => {
      const cur = store.read();
      if (!cur?.access_token) return;
      const check = await validateTwitchToken(fetchImpl, cur.access_token);
      if (!check.valid) {
        const refreshed = await refreshToken(true);
        if (!refreshed && !stopped) startDeviceFlow();
      }
    }, 3600000);
  }

  async function startDeviceFlow() {
    if (stopped || !clientId) return;
    stopTimers();
    try {
      const res = await postForm(fetchImpl, '/device', {
        client_id: clientId,
        scopes: scopes.join(' '),
      });
      if (!res.ok) return;
      const dev = await res.json();
      const uri = dev.verification_uri || 'https://www.twitch.tv/activate';
      onDevicePrompt({ userCode: dev.user_code, verificationUri: uri });
      onStatus('waiting');
      let intervalMs = (Number(dev.interval) || 5) * 1000;

      const poll = async () => {
        if (stopped) return;
        try {
          const tokRes = await postForm(fetchImpl, '/token', {
            client_id: clientId,
            device_code: dev.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          });
          const data = await tokRes.json();
          if (tokRes.ok && data.access_token) {
            const info = await validateTwitchToken(fetchImpl, data.access_token);
            const session = {
              access_token: data.access_token,
              refresh_token: data.refresh_token || '',
              expires_at: now() + (Number(data.expires_in) || 14400) * 1000,
              scopes: data.scope || info.scopes || scopes,
              user_id: info.userId || '',
              login: info.login || '',
              nonce,
            };
            store.write(session);
            scheduleValidation();
            onStatus('authenticated');
            onAuthenticated(session);
            return;
          }
          if (data.message === 'slow_down') intervalMs += 5000;
          if (data.message === 'expired_token') { onStatus('expired'); startDeviceFlow(); return; }
          if (data.message === 'access_denied') { onStatus('denied'); return; }
        } catch {
          // Retry on transient poll error.
        }
        if (!stopped) pollTimer = setTimeoutImpl(poll, intervalMs);
      };

      pollTimer = setTimeoutImpl(poll, intervalMs);
    } catch {
      // Ignore unreachable auth endpoint.
    }
  }

  async function revoke(explicitToken) {
    stopTimers();
    const token = explicitToken || store.read()?.access_token;
    store.clear();
    if (!token || !clientId) return;
    try {
      await postForm(fetchImpl, '/revoke', { client_id: clientId, token });
    } catch {
      // Ignore revoke failure.
    }
  }

  async function init() {
    if (!clientId) return null;
    stopped = false;
    let session = store.read();
    if (session && session.nonce !== nonce) {
      await revoke(session.access_token);
      session = null;
    }
    if (session?.access_token && hasScopes(session.scopes)) {
      const check = await validateTwitchToken(fetchImpl, session.access_token);
      if (check.valid) {
        session.user_id = check.userId || session.user_id;
        session.login = check.login || session.login;
        store.write(session);
        scheduleValidation();
        onAuthenticated(session);
        return session;
      }
      const refreshed = await refreshToken(true);
      if (refreshed && hasScopes(refreshed.scopes)) {
        scheduleValidation();
        onAuthenticated(refreshed);
        return refreshed;
      }
    }
    await startDeviceFlow();
    return null;
  }

  return {
    init,
    refreshToken,
    revoke,
    getAccessToken: () => store.read()?.access_token || '',
    stop() { stopped = true; stopTimers(); },
  };
}
