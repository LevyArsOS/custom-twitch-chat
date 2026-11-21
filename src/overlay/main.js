import { OAUTH_SCOPES } from '../shared/constants.js';
import { decodeConfigHash, normalizeConfig } from '../shared/config.js';
import { createIrcClient } from './irc-client.js';
import { createUserDirectory } from './users.js';
import { createBadgeResolver } from './badges.js';
import { createEmoteCatalog } from './emotes.js';
import { applyOverlayStyles } from './style.js';
import { createRenderer } from './render.js';
import { createEventRouter } from './events.js';
import { createSimulator } from './simulator.js';
import { createAuthManager } from './auth.js';
import { createAuthPanel } from './auth-panel.js';
import { createEventSubClient } from './eventsub.js';

export function resolveInitialConfig(win = window) {
  if (win?.__CTC_CONFIG__) return normalizeConfig(win.__CTC_CONFIG__);
  if (win?.location?.hash) return decodeConfigHash(win.location.hash);
  return normalizeConfig({});
}

export function createOverlayApp({
  win = window,
  doc = document,
  rootElement,
  authRoot = null,
  fetchImpl = (...args) => fetch(...args),
  wsFactory = (url) => new WebSocket(url),
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  locks = typeof navigator !== 'undefined' ? navigator.locks : null,
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
  setIntervalImpl = (fn, ms) => setInterval(fn, ms),
  clearIntervalImpl = (id) => clearInterval(id),
  defaultClientId = import.meta.env?.VITE_TWITCH_CLIENT_ID || '',
} = {}) {
  let config = resolveInitialConfig(win);
  const params = new URLSearchParams(win?.location?.search || '');
  const isPreview = params.get('preview') === '1';
  const wantsLogout = params.get('logout') === '1';
  const timers = { setTimeoutImpl, clearTimeoutImpl, setIntervalImpl, clearIntervalImpl };

  const userDirectory = createUserDirectory({ fetchImpl });
  const badgeResolver = createBadgeResolver({ fetchImpl });
  const emoteCatalog = createEmoteCatalog({ fetchImpl });
  const renderer = createRenderer({ container: rootElement, doc, config, userDirectory, setTimeoutImpl, clearTimeoutImpl });

  let roomId = '';
  let authSession = null;
  let authManager = null;
  let eventSub = null;
  const authPanel = createAuthPanel({ container: authRoot, doc, lang: config.lang });

  const router = createEventRouter({
    config, renderer, userDirectory, badgeResolver, emoteCatalog,
    onRoomId(id) { roomId = id; maybeStartEventSub(); },
  });

  const ircClient = createIrcClient({
    channel: config.channel, wsFactory, setTimeoutImpl, clearTimeoutImpl,
    onMessage: (msg) => router.handleIrcMessage(msg),
  });
  const simulator = createSimulator({
    onIrcMessage: (msg) => router.handleIrcMessage(msg),
    onEventSub: (type, ev) => router.handleEventSub(type, ev),
  });

  function maybeStartEventSub() {
    if (isPreview || !authSession || !roomId || config.authEnabled !== 'yes') return;
    const clientId = config.clientId || defaultClientId;
    const enablePoints = config.authPoints === 'yes';
    const enableFollows = config.authFollows === 'yes';
    if (!clientId || (!enablePoints && !enableFollows)) return;
    eventSub?.disconnect();
    eventSub = createEventSubClient({
      clientId, broadcasterId: roomId, userId: authSession.user_id,
      enablePoints, enableFollows, wsFactory, fetchImpl, setTimeoutImpl, clearTimeoutImpl,
      getAccessToken: () => authManager?.getAccessToken() || '',
      refreshToken: () => authManager?.refreshToken(true),
      onEvent: (type, ev) => router.handleEventSub(type, ev),
      onStatus(status) {
        if (status === 'subscribed' && enablePoints) router.setEventSubPointsActive(true);
        if (status === 'scopeWarning') authPanel.setStatus('scopeWarning');
      },
      onAuthInvalid() { router.setEventSubPointsActive(false); authManager?.init(); },
    });
    eventSub.connect();
  }

  function applyConfig(nextRaw) {
    config = normalizeConfig(nextRaw);
    applyOverlayStyles(doc, config);
    renderer.setConfig(config);
    router.setConfig(config);
    authPanel.setLang(config.lang);
    if (!isPreview && config.channel) {
      badgeResolver.loadChannel(config.channel);
      ircClient.setChannel(config.channel);
    }
  }

  function handleWindowMessage(event) {
    if (!isPreview || event.origin !== win.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ctc:config') applyConfig(data.config);
    else if (data.type === 'ctc:sim' && typeof simulator[data.action] === 'function') {
      simulator[data.action](config.channel || 'demo');
    } else if (data.type === 'ctc:live') {
      if (data.connect && config.channel) {
        badgeResolver.loadChannel(config.channel);
        ircClient.setChannel(config.channel);
      } else {
        ircClient.disconnect();
      }
    }
  }

  async function start() {
    applyOverlayStyles(doc, config);
    badgeResolver.loadGlobal();
    emoteCatalog.loadGlobal().then(() => router.refreshEmoteMap());

    if (isPreview) {
      win.addEventListener('message', handleWindowMessage);
      return;
    }

    const clientId = config.clientId || defaultClientId;
    if (clientId && (config.authEnabled === 'yes' || wantsLogout)) {
      const scopes = [];
      if (config.authPoints === 'yes') scopes.push(OAUTH_SCOPES.POINTS);
      if (config.authFollows === 'yes') scopes.push(OAUTH_SCOPES.FOLLOWS);
      authManager = createAuthManager({
        clientId, scopes, nonce: config.authNonce, fetchImpl, storage, locks, ...timers,
        onDevicePrompt: (p) => authPanel.show(p),
        onStatus: (s) => authPanel.setStatus(s),
        onAuthenticated(session) { authSession = session; authPanel.hide(); maybeStartEventSub(); },
      });
      if (wantsLogout) {
        await authManager.revoke();
        authPanel.hide();
      } else if (config.authEnabled === 'yes') {
        await authManager.init();
      }
    }

    if (config.channel) {
      badgeResolver.loadChannel(config.channel);
      ircClient.connect();
    }
  }

  function destroy() {
    win?.removeEventListener?.('message', handleWindowMessage);
    ircClient.disconnect();
    eventSub?.disconnect();
    authManager?.stop();
    authPanel.hide();
  }

  return { start, destroy, applyConfig, simulator, getConfig: () => config };
}

/* v8 ignore start */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !import.meta.vitest) {
  const root = document.getElementById('chat-container');
  const authRoot = document.getElementById('ctc-auth-root');
  if (root) {
    createOverlayApp({ rootElement: root, authRoot }).start();
  }
}
/* v8 ignore stop */
