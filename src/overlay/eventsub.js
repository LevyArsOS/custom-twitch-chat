import { ENDPOINTS } from '../shared/constants.js';

export function createEventSubClient({
  clientId = '',
  getAccessToken = () => '',
  refreshToken = async () => null,
  broadcasterId = '',
  userId = '',
  enablePoints = false,
  enableFollows = false,
  wsFactory = (url) => new WebSocket(url),
  fetchImpl = (...args) => fetch(...args),
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
  onEvent = () => {},
  onStatus = () => {},
  onAuthInvalid = () => {},
} = {}) {
  let activeWs = null;
  let pendingWs = null;
  let watchdogTimer = null;
  let stopped = false;
  const seenIds = new Set();
  const seenQueue = [];

  function clearWatchdog() {
    if (watchdogTimer !== null) {
      clearTimeoutImpl(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function resetWatchdog(keepaliveSec = 10) {
    clearWatchdog();
    if (stopped) return;
    watchdogTimer = setTimeoutImpl(() => {
      if (activeWs) activeWs.close();
      connect(ENDPOINTS.TWITCH_EVENTSUB_WS, false);
    }, (Number(keepaliveSec) + 10) * 1000);
  }

  function recordSeen(id) {
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    seenQueue.push(id);
    if (seenQueue.length > 500) {
      seenIds.delete(seenQueue.shift());
    }
    return true;
  }

  async function postSubscription(type, version, condition, sessionId) {
    const body = JSON.stringify({
      type,
      version,
      condition,
      transport: { method: 'websocket', session_id: sessionId },
    });
    const send = (token) => fetchImpl(`${ENDPOINTS.TWITCH_HELIX_BASE}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json',
      },
      body,
    });

    let res = await send(getAccessToken());
    if (res.status === 401) {
      const updated = await refreshToken();
      if (updated?.access_token) res = await send(updated.access_token);
    }
    if (res.status === 401) { onAuthInvalid(); return false; }
    if (res.status === 403) { onStatus('scopeWarning'); return false; }
    return res.ok;
  }

  async function subscribeAll(sessionId) {
    const tasks = [];
    if (enablePoints && broadcasterId) {
      tasks.push(postSubscription(
        'channel.channel_points_custom_reward_redemption.add',
        '1',
        { broadcaster_user_id: String(broadcasterId) },
        sessionId
      ));
    }
    if (enableFollows && broadcasterId && userId) {
      tasks.push(postSubscription(
        'channel.follow',
        '2',
        { broadcaster_user_id: String(broadcasterId), moderator_user_id: String(userId) },
        sessionId
      ));
    }
    const results = await Promise.all(tasks);
    onStatus(results.every(Boolean) ? 'subscribed' : 'partial');
  }

  function connect(url = ENDPOINTS.TWITCH_EVENTSUB_WS, isReconnect = false) {
    if (stopped || !clientId || !getAccessToken()) return;
    const sock = wsFactory(url);
    if (isReconnect) pendingWs = sock;
    else {
      if (activeWs) { activeWs.onclose = null; activeWs.close(); }
      activeWs = sock;
    }

    sock.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data || '{}')); } catch { return; }
      const meta = msg.metadata || {};
      const payload = msg.payload || {};
      const msgType = meta.message_type;

      if (msgType === 'session_welcome') {
        resetWatchdog(payload.session?.keepalive_timeout_seconds);
        if (isReconnect) {
          if (activeWs && activeWs !== sock) { activeWs.onclose = null; activeWs.close(); }
          activeWs = sock;
          pendingWs = null;
        } else {
          await subscribeAll(payload.session?.id);
        }
      } else if (msgType === 'session_keepalive') {
        resetWatchdog(payload.session?.keepalive_timeout_seconds);
      } else if (msgType === 'session_reconnect' && payload.session?.reconnect_url) {
        connect(payload.session.reconnect_url, true);
      } else if (msgType === 'revocation') {
        onStatus('revoked');
      } else if (msgType === 'notification' && recordSeen(meta.message_id)) {
        resetWatchdog();
        onEvent(payload.subscription?.type, payload.event);
      }
    };

    sock.onerror = () => {};
    sock.onclose = () => {
      if (sock === activeWs && !stopped) {
        activeWs = null;
        clearWatchdog();
      }
    };
  }

  function disconnect() {
    stopped = true;
    clearWatchdog();
    if (pendingWs) { pendingWs.onclose = null; pendingWs.close(); pendingWs = null; }
    if (activeWs) { activeWs.onclose = null; activeWs.close(); activeWs = null; }
  }

  return {
    connect: () => { stopped = false; connect(ENDPOINTS.TWITCH_EVENTSUB_WS, false); },
    disconnect,
  };
}
