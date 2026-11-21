import { t } from '../i18n/index.js';
import { parseIgnoredUsers, parseBlockedWords } from '../shared/config.js';
import { tokenizeMessage } from './emotes.js';
import {
  ANNOUNCE_COLORS,
  extractRoles,
  prependPrefixToken,
  formatSubNoticeText,
  renderEventSubMessage,
} from './events-format.js';

export function createEventRouter({
  config,
  renderer,
  userDirectory,
  badgeResolver,
  emoteCatalog,
  onRoomId = () => {},
} = {}) {
  let cfg = config;
  let ignored = new Set(parseIgnoredUsers(cfg.ignoredUsers));
  let blocked = parseBlockedWords(cfg.blockedWords);
  let thirdPartyMap = new Map();
  let eventsubPointsActive = false;

  function refreshEmoteMap() {
    thirdPartyMap = emoteCatalog?.buildMap({
      enable7tv: cfg.enable7tv === 'yes',
      enableBttv: cfg.enableBttv === 'yes',
      enableFfz: cfg.enableFfz === 'yes',
    }) || new Map();
  }
  refreshEmoteMap();

  const tokenize = (text, emotes) => tokenizeMessage(text, emotes, thirdPartyMap, {
    emoteQuantity: cfg.emoteQuantity,
    enableTwemoji: cfg.enableTwemoji === 'yes',
    colorMentions: cfg.colorMentions === 'yes',
  });

  async function renderFromIrc(msg, overrides = {}) {
    const uid = msg.tags['user-id'] || msg.nick || String(Date.now());
    const sourceRoomId = msg.tags['source-room-id'];
    const [avatarUrl, originUrl] = await Promise.all([
      userDirectory.getAvatarById(uid),
      sourceRoomId ? userDirectory.getAvatarById(sourceRoomId) : Promise.resolve(null),
    ]);
    renderer.addMessage({
      id: msg.tags.id || `msg-${Date.now()}`,
      userId: uid,
      login: msg.nick || (msg.tags['display-name'] || '').toLowerCase(),
      displayName: overrides.displayName || msg.tags['display-name'] || msg.nick || 'User',
      displayColor: msg.tags.color || '',
      badges: badgeResolver.resolve(msg.badges),
      roles: extractRoles(msg.tags, msg.badges),
      isAction: msg.isAction,
      avatarUrl,
      originUrl,
      ...overrides,
    });
  }

  async function handleUserNotice(msg) {
    const type = msg.tags['msg-id'] || '';
    const lang = cfg.lang;
    if (type === 'viewermilestone' && msg.tags['msg-param-category'] === 'watch-streak') {
      if (cfg.showStreaks !== 'yes') return;
      const streak = msg.tags['msg-param-value'] || '?';
      const base = msg.tags['display-name'] || msg.nick || 'Viewer';
      const body = msg.text ? tokenize(msg.text, msg.emotes).tokens : [];
      await renderFromIrc(msg, {
        displayName: `${base} • ${streak}`,
        tokens: prependPrefixToken(t(lang, 'events.streak', { streak }), body),
        extraClasses: ['streak'],
      });
      return;
    }
    if (type === 'raid') {
      if (cfg.showRaids !== 'yes') return;
      const viewers = msg.tags['msg-param-viewerCount'] || '1';
      await renderFromIrc(msg, {
        tokens: [{ type: 'text', text: t(lang, 'events.raid', { viewers }) }],
        extraClasses: ['raid-message'],
      });
      return;
    }
    if (type === 'announcement') {
      if (cfg.showAnnouncements !== 'yes') return;
      const tok = tokenize(msg.text, msg.emotes);
      await renderFromIrc(msg, {
        tokens: tok.tokens,
        isSoloEmotes: tok.isSoloEmotes,
        extraClasses: ['announcement'],
        announceColor: ANNOUNCE_COLORS[msg.tags['msg-param-color']] || ANNOUNCE_COLORS.PURPLE,
      });
      return;
    }
    const subText = formatSubNoticeText(type, msg.tags, lang);
    if (subText && cfg.showSubs === 'yes') {
      const body = msg.text ? tokenize(msg.text, msg.emotes).tokens : [];
      await renderFromIrc(msg, {
        tokens: prependPrefixToken(subText, body),
        extraClasses: ['sub-message'],
      });
    }
  }

  async function handleIrcMessage(msg) {
    if (!msg) return;
    if (msg.command === 'ROOMSTATE' && msg.tags['room-id']) {
      onRoomId(msg.tags['room-id']);
      await emoteCatalog?.loadChannel(msg.tags['room-id']);
      refreshEmoteMap();
      return;
    }
    if (msg.command === 'CLEARMSG') {
      renderer.deleteMessage(msg.tags['target-msg-id']);
      return;
    }
    if (msg.command === 'CLEARCHAT') {
      if (msg.tags['target-user-id']) renderer.deleteUserMessages(msg.tags['target-user-id']);
      else renderer.clearAll();
      return;
    }
    if (msg.command === 'USERNOTICE') return handleUserNotice(msg);
    if (msg.command !== 'PRIVMSG') return;

    const login = (msg.nick || '').toLowerCase();
    if (cfg.hideCommands === 'yes' && msg.text.startsWith('!')) return;
    if (ignored.has(login)) return;
    if (blocked.some((word) => msg.text.toLowerCase().includes(word))) return;

    const tok = tokenize(msg.text, msg.emotes);
    const bits = Number(msg.tags.bits || 0);
    if (bits > 0) {
      if (cfg.showCheers !== 'yes') return;
      await renderFromIrc(msg, {
        tokens: prependPrefixToken(t(cfg.lang, 'events.cheer', { amount: bits }), tok.tokens),
        extraClasses: ['cheer-message'],
      });
      return;
    }
    if (msg.tags['custom-reward-id']) {
      if (eventsubPointsActive || cfg.showPoints !== 'yes') return;
      await renderFromIrc(msg, {
        tokens: prependPrefixToken(t(cfg.lang, 'events.pointsFallback'), tok.tokens),
        extraClasses: ['points-message'],
      });
      return;
    }

    const extraClasses = [];
    if (msg.tags['msg-id'] === 'highlighted-message') extraClasses.push('highlighted');
    if (msg.tags['first-msg'] === '1') extraClasses.push('first-message');
    await renderFromIrc(msg, {
      tokens: tok.tokens,
      isSoloEmotes: tok.isSoloEmotes,
      extraClasses,
      isFirstMsg: msg.tags['first-msg'] === '1',
      replyTo: msg.tags['reply-parent-display-name'] || msg.tags['reply-parent-user-login'] || '',
    });
  }

  const handleEventSub = (subType, event) =>
    renderEventSubMessage(subType, event, cfg, tokenize, userDirectory, renderer);

  return {
    handleIrcMessage,
    handleEventSub,
    refreshEmoteMap,
    setEventSubPointsActive(active) { eventsubPointsActive = Boolean(active); },
    setConfig(next) {
      cfg = next;
      ignored = new Set(parseIgnoredUsers(cfg.ignoredUsers));
      blocked = parseBlockedWords(cfg.blockedWords);
      refreshEmoteMap();
    },
  };
}
