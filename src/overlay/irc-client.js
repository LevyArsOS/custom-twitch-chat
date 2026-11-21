import { ENDPOINTS } from '../shared/constants.js';
import { parseIrcFrame } from './irc-parser.js';

export function createIrcClient({
  channel = '',
  wsFactory = (url) => new WebSocket(url),
  onMessage = () => {},
  onStatus = () => {},
  backoffBaseMs = 1000,
  maxBackoffMs = 30000,
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
} = {}) {
  let currentChannel = String(channel).replace(/^[@#\s]+/, '').toLowerCase();
  let ws = null;
  let stopped = false;
  let attempt = 0;
  let reconnectTimer = null;

  function clearTimer() {
    if (reconnectTimer !== null) {
      clearTimeoutImpl(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function send(line) {
    if (ws && ws.readyState === 1) {
      ws.send(line);
    }
  }

  function scheduleReconnect() {
    if (stopped || !currentChannel || reconnectTimer !== null) return;
    const delay = Math.min(maxBackoffMs, backoffBaseMs * (2 ** attempt));
    attempt += 1;
    onStatus('reconnecting');
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (!currentChannel) return;
    stopped = false;
    clearTimer();
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    }
    ws = wsFactory(ENDPOINTS.TWITCH_IRC_WS);

    ws.onopen = () => {
      attempt = 0;
      send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      send('PASS SCHMOOPIIE');
      send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
      send(`JOIN #${currentChannel}`);
      onStatus('connected');
    };

    ws.onmessage = (event) => {
      for (const msg of parseIrcFrame(String(event.data || ''))) {
        if (msg.command === 'PING') {
          send(`PONG :${msg.text || 'tmi.twitch.tv'}`);
        } else if (msg.command === 'RECONNECT') {
          ws.close();
        } else {
          onMessage(msg);
        }
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      ws = null;
      if (!stopped) scheduleReconnect();
    };
  }

  function disconnect() {
    stopped = true;
    clearTimer();
    if (ws) {
      const target = ws;
      ws = null;
      target.onclose = null;
      target.close();
    }
    onStatus('disconnected');
  }

  function setChannel(nextChannel) {
    const clean = String(nextChannel || '').replace(/^[@#\s]+/, '').toLowerCase();
    if (clean === currentChannel) return;
    if (ws && ws.readyState === 1 && currentChannel) {
      send(`PART #${currentChannel}`);
    }
    currentChannel = clean;
    if (!currentChannel) {
      disconnect();
      return;
    }
    if (ws && ws.readyState === 1) {
      send(`JOIN #${currentChannel}`);
    } else {
      connect();
    }
  }

  return { connect, disconnect, setChannel, getChannel: () => currentChannel };
}
