import { ENDPOINTS } from '../shared/constants.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const EMOJI_RE = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF\u2B50\u2B55])/u;
const MENTION_RE = /^@[a-zA-Z0-9_]{2,25}$/;

const normalizeUrl = (url) => (url?.startsWith('//') ? `https:${url}` : url || '');

export function codePointToTwemojiUrl(segment) {
  const code = Array.from(segment)
    .map((ch) => ch.codePointAt(0).toString(16))
    .join('-')
    .toLowerCase()
    .replace(/-fe0[ef]/g, '');
  return `${ENDPOINTS.TWEMOJI_BASE}${code}.png`;
}

function parse7tvEmotes(list) {
  const map = new Map();
  for (const item of list || []) {
    if (!item?.name || !item?.id) continue;
    const host = normalizeUrl(item.data?.host?.url) || `https://cdn.7tv.app/emote/${item.id}`;
    map.set(item.name, { url: `${host}/2x.webp`, urlHi: `${host}/3x.webp` });
  }
  return map;
}

function parseBttvEmotes(list) {
  const map = new Map();
  for (const item of list || []) {
    if (!item?.code || !item?.id) continue;
    const base = `https://cdn.betterttv.net/emote/${item.id}`;
    map.set(item.code, { url: `${base}/2x`, urlHi: `${base}/3x` });
  }
  return map;
}

function parseFfzSets(sets) {
  const map = new Map();
  for (const set of Object.values(sets || {})) {
    for (const em of set?.emoticons || []) {
      const url = normalizeUrl(em?.urls?.['2'] || em?.urls?.['1'] || em?.urls?.['4']);
      const urlHi = normalizeUrl(em?.urls?.['4'] || em?.urls?.['2'] || url);
      if (em?.name && url) map.set(em.name, { url, urlHi });
    }
  }
  return map;
}

export function createEmoteCatalog({ fetchImpl = (...args) => fetch(...args) } = {}) {
  const store = {
    gFfz: new Map(), gBttv: new Map(), g7tv: new Map(),
    cFfz: new Map(), cBttv: new Map(), c7tv: new Map(),
  };
  let globalLoaded = false;

  async function safeJson(url) {
    try {
      const res = await fetchImpl(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function loadGlobal() {
    if (globalLoaded) return;
    const [d7, db, df] = await Promise.all([
      safeJson(`${ENDPOINTS.SEVENTV_BASE}/emote-sets/global`),
      safeJson(`${ENDPOINTS.BTTV_BASE}/emotes/global`),
      safeJson(`${ENDPOINTS.FFZ_BASE}/set/global`),
    ]);
    if (d7?.emotes) store.g7tv = parse7tvEmotes(d7.emotes);
    if (Array.isArray(db)) store.gBttv = parseBttvEmotes(db);
    if (df?.sets) store.gFfz = parseFfzSets(df.sets);
    globalLoaded = true;
  }

  async function loadChannel(roomId) {
    store.cFfz = new Map();
    store.cBttv = new Map();
    store.c7tv = new Map();
    if (!roomId) return;
    const id = encodeURIComponent(String(roomId));
    const [d7, db, df] = await Promise.all([
      safeJson(`${ENDPOINTS.SEVENTV_BASE}/users/twitch/${id}`),
      safeJson(`${ENDPOINTS.BTTV_BASE}/users/twitch/${id}`),
      safeJson(`${ENDPOINTS.FFZ_BASE}/room/id/${id}`),
    ]);
    if (d7?.emote_set?.emotes) store.c7tv = parse7tvEmotes(d7.emote_set.emotes);
    if (db) store.cBttv = parseBttvEmotes([...(db.channelEmotes || []), ...(db.sharedEmotes || [])]);
    if (df?.sets) store.cFfz = parseFfzSets(df.sets);
  }

  function buildMap({ enable7tv = true, enableBttv = true, enableFfz = true } = {}) {
    const merged = new Map();
    const layers = [];
    if (enableFfz) layers.push(store.gFfz);
    if (enableBttv) layers.push(store.gBttv);
    if (enable7tv) layers.push(store.g7tv);
    if (enableFfz) layers.push(store.cFfz);
    if (enableBttv) layers.push(store.cBttv);
    if (enable7tv) layers.push(store.c7tv);
    for (const layer of layers) {
      for (const [name, urls] of layer) merged.set(name, urls);
    }
    return merged;
  }

  return { loadGlobal, loadChannel, buildMap };
}

function pushTextTokens(str, enableTwemoji, tokens) {
  if (!enableTwemoji) {
    tokens.push({ type: 'text', text: str });
    return { allEmoji: false };
  }
  let buf = '';
  let allEmoji = true;
  for (const { segment } of segmenter.segment(str)) {
    if (EMOJI_RE.test(segment)) {
      if (buf) { tokens.push({ type: 'text', text: buf }); buf = ''; }
      tokens.push({ type: 'emoji', alt: segment, url: codePointToTwemojiUrl(segment) });
    } else {
      allEmoji = false;
      buf += segment;
    }
  }
  if (buf) tokens.push({ type: 'text', text: buf });
  return { allEmoji };
}

export function tokenizeMessage(text, twitchEmotes = [], thirdPartyMap = null, options = {}) {
  const { emoteQuantity = 3, enableTwemoji = true, colorMentions = true } = options;
  const chars = Array.from(String(text || ''));
  const tokens = [];
  let totalWords = 0;
  let emoteWords = 0;

  function processSpan(span) {
    if (!span) return;
    for (const part of span.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        tokens.push({ type: 'text', text: part });
        continue;
      }
      totalWords += 1;
      const thirdParty = thirdPartyMap?.get(part);
      if (thirdParty) {
        emoteWords += 1;
        tokens.push({ type: 'emote', name: part, url: thirdParty.url, urlHi: thirdParty.urlHi });
      } else if (colorMentions && MENTION_RE.test(part)) {
        tokens.push({ type: 'mention', text: part, username: part.slice(1).toLowerCase() });
      } else if (pushTextTokens(part, enableTwemoji, tokens).allEmoji) {
        emoteWords += 1;
      }
    }
  }

  let cursor = 0;
  for (const em of twitchEmotes) {
    if (!em || em.start < cursor || em.end >= chars.length) continue;
    if (em.start > cursor) processSpan(chars.slice(cursor, em.start).join(''));
    const name = chars.slice(em.start, em.end + 1).join('');
    totalWords += 1;
    emoteWords += 1;
    tokens.push({
      type: 'emote',
      name,
      url: `${ENDPOINTS.TWITCH_EMOTE_CDN}/${em.id}/default/dark/2.0`,
      urlHi: `${ENDPOINTS.TWITCH_EMOTE_CDN}/${em.id}/default/dark/3.0`,
    });
    cursor = em.end + 1;
  }
  if (cursor < chars.length) processSpan(chars.slice(cursor).join(''));

  const isSoloEmotes = totalWords > 0 && totalWords <= emoteQuantity && emoteWords === totalWords;
  return { tokens, isSoloEmotes };
}
