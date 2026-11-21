import { t } from '../i18n/index.js';

export const ANNOUNCE_COLORS = {
  BLUE: '#0099ff',
  GREEN: '#00d26a',
  ORANGE: '#ff7f00',
  PURPLE: '#9147ff',
  PRIMARY: '#9147ff',
};

export function extractRoles(tags, badges) {
  const roles = new Set();
  for (const b of badges || []) {
    if (b.type === 'broadcaster') roles.add('role-broadcaster');
    if (b.type === 'moderator') roles.add('role-mod');
    if (b.type === 'vip') roles.add('role-vip');
    if (b.type === 'subscriber' || b.type === 'founder') roles.add('role-sub');
  }
  if (tags.mod === '1') roles.add('role-mod');
  if (tags.subscriber === '1') roles.add('role-sub');
  return [...roles];
}

export function prependPrefixToken(prefixText, messageTokens) {
  const tokens = [{ type: 'text', text: prefixText }];
  if (messageTokens?.length) {
    tokens.push({ type: 'text', text: ' ' }, ...messageTokens);
  }
  return tokens;
}

export function formatSubNoticeText(msgId, tags, lang) {
  const map = {
    sub: () => (tags['msg-param-sub-plan'] === 'Prime' ? t(lang, 'events.subPrime') : t(lang, 'events.sub')),
    resub: () => t(lang, 'events.resub', { months: tags['msg-param-cumulative-months'] || 1 }),
    subgift: () => t(lang, 'events.subGift', { recipient: tags['msg-param-recipient-display-name'] || 'someone' }),
    anonsubgift: () => t(lang, 'events.subGift', { recipient: tags['msg-param-recipient-display-name'] || 'someone' }),
    submysterygift: () => t(lang, 'events.bulkGift', { count: tags['msg-param-mass-gift-count'] || 1 }),
    giftpaidupgrade: () => t(lang, 'events.sub'),
    primepaidupgrade: () => t(lang, 'events.subPrime'),
  };
  return map[msgId] ? map[msgId]() : '';
}

export async function renderEventSubMessage(subType, event, cfg, tokenize, userDirectory, renderer) {
  if (!event) return;
  const uid = event.user_id || String(Date.now());
  const common = {
    userId: uid,
    login: event.user_login || '',
    displayName: event.user_name || event.user_login || 'Viewer',
    avatarUrl: await userDirectory.getAvatarById(uid),
  };
  if (subType === 'channel.channel_points_custom_reward_redemption.add' && cfg.showPoints === 'yes') {
    const reward = event.reward?.title || 'Reward';
    const body = event.user_input ? tokenize(event.user_input, []).tokens : [];
    renderer.addMessage({
      ...common,
      id: `es-${event.id || Date.now()}`,
      tokens: prependPrefixToken(t(cfg.lang, 'events.points', { reward }), body),
      extraClasses: ['points-message'],
    });
  } else if (subType === 'channel.follow' && cfg.showFollows === 'yes') {
    renderer.addMessage({
      ...common,
      id: `follow-${uid}-${Date.now()}`,
      tokens: [{ type: 'text', text: t(cfg.lang, 'events.follow') }],
      extraClasses: ['follow-message'],
    });
  }
}
