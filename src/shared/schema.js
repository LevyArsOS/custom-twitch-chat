import { ANIMATIONS_IN, ANIMATIONS_OUT } from './constants.js';

export const SCHEMA_GROUPS = [
  'channel', 'typography', 'general', 'profile',
  'text', 'block', 'emotes', 'events', 'oauth', 'advanced',
];

const YES_NO = ['yes', 'no'];
const REPEAT_MODES = ['stretch', 'repeat', 'round', 'space'];
const f = (key, type, group, def, extra = {}) => ({ key, type, group, default: def, ...extra });
const toggle = (key, group, def = 'yes', extra = {}) => f(key, 'select', group, def, { options: YES_NO, ...extra });

const box = (prefix, group) => [
  f(`${prefix}BackgroundColor`, 'color', group, 'rgba(0,0,0,0)'),
  f(`${prefix}BackgroundImage`, 'text', group, ''),
  f(`${prefix}BorderColor`, 'color', group, 'rgba(0,0,0,0)'),
  f(`${prefix}BorderRadius`, 'number', group, 20, { min: 0, max: 200 }),
  f(`${prefix}BorderWidth`, 'number', group, 4, { min: 0, max: 64 }),
  f(`${prefix}BorderImage`, 'text', group, ''),
  f(`${prefix}SliceWidth`, 'number', group, 32, { min: 0, max: 256 }),
  f(`${prefix}BorderRepeat`, 'select', group, 'stretch', { options: REPEAT_MODES }),
];

export const SCHEMA_FIELDS = [
  f('channel', 'text', 'channel', ''),
  f('lang', 'select', 'channel', 'pt-BR', { options: ['pt-BR', 'en'] }),

  f('fontName', 'text', 'typography', 'Montserrat'),
  f('fontSize', 'number', 'typography', 24, { min: 8, max: 96 }),
  f('fontWeight', 'select', 'typography', '400', { options: ['100', '300', '400', '500', '700', '900'] }),
  f('fontColor', 'color', 'typography', 'rgba(255,255,255,1)'),
  f('textShadow', 'text', 'typography', 'rgb(0, 0, 0) 1px 1px 1px'),
  f('emoteQuantity', 'number', 'typography', 3, { min: 0, max: 20 }),
  f('emoteSize', 'number', 'typography', 24, { min: 12, max: 128 }),
  f('emoteSoloSize', 'number', 'typography', 48, { min: 16, max: 256 }),

  f('alignMessages', 'select', 'general', 'flex', { options: ['flex', 'block'] }),
  f('messagesLimit', 'number', 'general', 4, { min: 1, max: 100 }),
  f('hideAfter', 'number', 'general', 999, { min: 1, max: 999 }),
  toggle('hideCommands', 'general', 'yes'),
  toggle('mergeMessages', 'general', 'no'),
  f('ignoredUsers', 'text', 'general', 'StreamElements,Nightbot'),
  f('blockedWords', 'text', 'general', ''),
  f('animationIn', 'select', 'general', 'none', { options: ANIMATIONS_IN }),
  f('animationOut', 'select', 'general', 'none', { options: ANIMATIONS_OUT }),

  f('showAvatar', 'select', 'profile', 'inline', { options: ['block', 'inline', 'none'] }),
  f('avatarSize', 'number', 'profile', 36, { min: 12, max: 128 }),
  f('avatarRound', 'select', 'profile', '50', { options: ['0', '25', '50'] }),
  f('nickColor', 'select', 'profile', 'user', { options: ['user', 'messagecolor', 'custom', 'remove'] }),
  f('customNickColor', 'color', 'profile', 'rgba(0,255,0,1)', { showIf: { field: 'nickColor', equals: 'custom' } }),
  f('displayBadges', 'select', 'profile', 'inline', { options: ['inline', 'none'] }),
  f('nameSuffix', 'text', 'profile', ':'),
  ...box('userName', 'profile'),

  f('textInSameLine', 'select', 'text', 'block', { options: ['inline', 'block'] }),
  toggle('colorMentions', 'text', 'yes'),
  ...box('text', 'text'),

  ...box('message', 'block'),

  toggle('enable7tv', 'emotes', 'yes'),
  toggle('enableBttv', 'emotes', 'yes'),
  toggle('enableFfz', 'emotes', 'yes'),
  toggle('enableTwemoji', 'emotes', 'yes'),

  toggle('showSubs', 'events', 'yes'),
  f('subColor', 'color', 'events', 'rgba(255,159,28,1)', { showIf: { field: 'showSubs', equals: 'yes' } }),
  toggle('showCheers', 'events', 'yes'),
  f('cheerColor', 'color', 'events', 'rgba(0,229,255,1)', { showIf: { field: 'showCheers', equals: 'yes' } }),
  toggle('showPoints', 'events', 'yes'),
  f('pointsColor', 'color', 'events', 'rgba(46,196,182,1)', { showIf: { field: 'showPoints', equals: 'yes' } }),
  toggle('showRaids', 'events', 'yes'),
  f('raidColor', 'color', 'events', 'rgba(255,77,109,1)', { showIf: { field: 'showRaids', equals: 'yes' } }),
  toggle('showStreaks', 'events', 'yes'),
  f('streakColor', 'color', 'events', 'rgba(145,71,255,1)', { showIf: { field: 'showStreaks', equals: 'yes' } }),
  toggle('showAnnouncements', 'events', 'yes'),
  toggle('showFollows', 'events', 'yes'),
  f('followColor', 'color', 'events', 'rgba(128,237,153,1)', { showIf: { field: 'showFollows', equals: 'yes' } }),
  toggle('showHighlights', 'events', 'yes'),
  f('highlightColor', 'color', 'events', 'rgba(117,94,188,0.35)', { showIf: { field: 'showHighlights', equals: 'yes' } }),
  toggle('showFirstMsg', 'events', 'yes'),
  f('firstMsgColor', 'color', 'events', 'rgba(145,71,255,0.45)', { showIf: { field: 'showFirstMsg', equals: 'yes' } }),

  toggle('authEnabled', 'oauth', 'no'),
  toggle('authPoints', 'oauth', 'no', { showIf: { field: 'authEnabled', equals: 'yes' } }),
  toggle('authFollows', 'oauth', 'no', { showIf: { field: 'authEnabled', equals: 'yes' } }),
  f('clientId', 'text', 'oauth', '', { showIf: { field: 'authEnabled', equals: 'yes' } }),
  f('authNonce', 'number', 'oauth', 1, { min: 1, max: 999999, hidden: true }),

  f('customCSS', 'textarea', 'advanced', ''),
];

export const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA_FIELDS.map((field) => [field.key, field]));
