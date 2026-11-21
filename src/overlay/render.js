import { ANIMATE_V4_MAP } from '../shared/constants.js';
import { t } from '../i18n/index.js';
import { pickDefaultColor } from './users.js';

const animClass = (name) => (!name || name === 'none' ? '' : `animate__${ANIMATE_V4_MAP[name] || name}`);

export function createRenderer({
  container,
  doc = container.ownerDocument,
  config,
  userDirectory,
  setTimeoutImpl = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutImpl = (id) => clearTimeout(id),
} = {}) {
  let cfg = config;
  let previousSender = '';
  const timers = new Map();

  function cancelTimer(el) {
    const id = timers.get(el);
    if (id !== undefined) {
      clearTimeoutImpl(id);
      timers.delete(el);
    }
  }

  function removeElementNow(el) {
    cancelTimer(el);
    if (el?.parentNode) el.remove();
  }

  function animateOutAndRemove(row) {
    cancelTimer(row);
    if (!row?.parentNode) return;
    const outCls = animClass(cfg.animationOut);
    if (!outCls) {
      row.remove();
      return;
    }
    const inCls = animClass(cfg.animationIn);
    if (inCls) row.classList.remove(inCls);
    row.classList.add('animate__animated', outCls);
    timers.set(row, setTimeoutImpl(() => removeElementNow(row), 1000));
  }

  function buildTokens(tokens, isSoloEmotes) {
    const frag = doc.createDocumentFragment();
    for (const tok of tokens || []) {
      if (tok.type === 'text') {
        frag.appendChild(doc.createTextNode(tok.text));
      } else if (tok.type === 'emote' || tok.type === 'emoji') {
        const img = doc.createElement('img');
        img.className = isSoloEmotes ? 'emote solo' : 'emote';
        img.src = isSoloEmotes && tok.urlHi ? tok.urlHi : tok.url;
        img.alt = tok.alt || tok.name || '';
        img.draggable = false;
        if (tok.type === 'emoji') {
          img.addEventListener('error', () => img.replaceWith(doc.createTextNode(tok.alt || '')));
        }
        frag.appendChild(img);
      } else if (tok.type === 'mention') {
        const span = doc.createElement('span');
        span.className = 'mention';
        span.textContent = tok.text;
        frag.appendChild(span);
        userDirectory?.getUserColor(tok.username).then((color) => {
          if (color) span.style.color = color;
        });
      }
    }
    return frag;
  }

  function appendImg(parent, className, src) {
    if (!src) return;
    const img = doc.createElement('img');
    img.className = className;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    parent.appendChild(img);
  }

  function buildUserBox(entry) {
    const box = doc.createElement('div');
    box.className = entry.isAction ? 'user-box action' : 'user-box';
    appendImg(box, 'avatar origin', entry.originUrl);
    appendImg(box, 'avatar', entry.avatarUrl);
    for (const badge of entry.badges || []) {
      appendImg(box, `badge ${badge.type}-icon`, badge.url);
    }
    if (entry.isFirstMsg) {
      const first = doc.createElement('span');
      first.className = 'first-badge';
      first.textContent = t(cfg.lang, 'events.firstMsg');
      box.appendChild(first);
    }
    if (cfg.nickColor !== 'remove') {
      const nameSpan = doc.createElement('span');
      nameSpan.textContent = `${entry.displayName}${cfg.nameSuffix ?? ':'}`;
      if (cfg.nickColor === 'user') {
        nameSpan.style.color = entry.displayColor || pickDefaultColor(entry.login || entry.displayName);
      } else if (cfg.nickColor === 'custom') {
        nameSpan.style.color = cfg.customNickColor;
      }
      box.appendChild(nameSpan);
    }
    return box;
  }

  function addMessage(entry) {
    const isSpecial = Boolean(entry.extraClasses?.length);
    if (cfg.mergeMessages === 'yes' && previousSender && previousSender === entry.userId && !isSpecial) {
      const targetRow = cfg.alignMessages === 'block' ? container.firstElementChild : container.lastElementChild;
      const msgDiv = targetRow?.querySelector('.user-message');
      if (msgDiv) {
        const merged = doc.createElement('span');
        merged.dataset.sender = String(entry.userId || '');
        merged.dataset.msgid = String(entry.id || '');
        merged.appendChild(doc.createTextNode(' '));
        merged.appendChild(buildTokens(entry.tokens, entry.isSoloEmotes));
        msgDiv.appendChild(merged);
        return;
      }
    }

    const row = doc.createElement('div');
    row.className = ['message-row', ...(entry.extraClasses || []), ...(entry.roles || [])].join(' ');
    const inCls = animClass(cfg.animationIn);
    if (inCls) row.classList.add('animate__animated', inCls);
    row.dataset.sender = String(entry.userId || '');
    row.dataset.msgid = String(entry.id || '');
    if (entry.announceColor) row.style.setProperty('--ctc-announce-color', entry.announceColor);

    if (entry.replyTo) {
      const reply = doc.createElement('div');
      reply.className = 'reply-context';
      reply.textContent = t(cfg.lang, 'events.replyPrefix', { user: entry.replyTo });
      row.appendChild(reply);
    }

    row.appendChild(buildUserBox(entry));
    const msgBox = doc.createElement('div');
    msgBox.className = entry.isAction ? 'user-message action' : 'user-message';
    msgBox.appendChild(buildTokens(entry.tokens, entry.isSoloEmotes));
    row.appendChild(msgBox);

    if (cfg.alignMessages === 'block') container.prepend(row);
    else container.append(row);

    previousSender = isSpecial ? '' : String(entry.userId || '');

    if (cfg.hideAfter !== 999) {
      timers.set(row, setTimeoutImpl(() => animateOutAndRemove(row), cfg.hideAfter * 1000));
    }

    while (container.children.length > cfg.messagesLimit) {
      const oldest = cfg.alignMessages === 'block' ? container.lastElementChild : container.firstElementChild;
      if (!oldest) break;
      removeElementNow(oldest);
    }
  }

  function deleteMessage(msgId) {
    const id = String(msgId || '');
    for (const el of container.querySelectorAll('[data-msgid]')) {
      if (el.dataset.msgid === id) removeElementNow(el);
    }
  }

  function deleteUserMessages(userId) {
    const uid = String(userId || '');
    for (const row of Array.from(container.children)) {
      if (row.dataset.sender === uid) removeElementNow(row);
    }
  }

  function clearAll() {
    for (const row of Array.from(container.children)) cancelTimer(row);
    container.replaceChildren();
    previousSender = '';
  }

  return {
    addMessage,
    deleteMessage,
    deleteUserMessages,
    clearAll,
    setConfig(next) { cfg = next; },
  };
}
