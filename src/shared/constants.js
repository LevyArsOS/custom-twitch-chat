export const TWITCH_DEFAULT_COLORS = [
  '#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50',
  '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
  '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
];

export const ENDPOINTS = {
  TWITCH_IRC_WS: 'wss://irc-ws.chat.twitch.tv:443',
  TWITCH_EVENTSUB_WS: 'wss://eventsub.wss.twitch.tv/ws',
  TWITCH_AUTH_BASE: 'https://id.twitch.tv/oauth2',
  TWITCH_HELIX_BASE: 'https://api.twitch.tv/helix',
  IVR_BASE: 'https://api.ivr.fi/v2/twitch',
  SEVENTV_BASE: 'https://7tv.io/v3',
  BTTV_BASE: 'https://api.betterttv.net/3/cached',
  FFZ_BASE: 'https://api.frankerfacez.com/v1',
  TWEMOJI_BASE: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/',
  TWITCH_EMOTE_CDN: 'https://static-cdn.jtvnw.net/emoticons/v2',
  DEFAULT_AVATAR: 'https://static-cdn.jtvnw.net/user-default-pictures-uv/294c98b6-e9f0-4b74-8d43-a1c58b3b6d3b-profile_image-70x70.png',
};

export const OAUTH_SCOPES = {
  POINTS: 'channel:read:redemptions',
  FOLLOWS: 'moderator:read:followers',
};

export const ANIMATE_V4_MAP = {
  lightSpeedIn: 'lightSpeedInRight',
  lightSpeedOut: 'lightSpeedOutRight',
};

export const ANIMATIONS_IN = [
  'none', 'bounceIn', 'bounceInDown', 'bounceInLeft', 'bounceInRight', 'bounceInUp',
  'fadeIn', 'fadeInDown', 'fadeInDownBig', 'fadeInLeft', 'fadeInLeftBig',
  'fadeInRight', 'fadeInRightBig', 'fadeInUp', 'fadeInUpBig', 'flipInX', 'flipInY',
  'lightSpeedIn', 'rotateIn', 'rotateInDownLeft', 'rotateInDownRight',
  'rotateInUpLeft', 'rotateInUpRight', 'slideInUp', 'slideInDown',
  'slideInLeft', 'slideInRight', 'zoomIn', 'zoomInDown', 'zoomInLeft',
  'zoomInRight', 'zoomInUp', 'jackInTheBox', 'rollIn',
];

export const ANIMATIONS_OUT = [
  'none', 'bounceOut', 'bounceOutDown', 'bounceOutLeft', 'bounceOutRight', 'bounceOutUp',
  'fadeOut', 'fadeOutDown', 'fadeOutDownBig', 'fadeOutLeft', 'fadeOutLeftBig',
  'fadeOutRight', 'fadeOutRightBig', 'fadeOutUp', 'fadeOutUpBig', 'flipOutX', 'flipOutY',
  'lightSpeedOut', 'rotateOut', 'rotateOutDownLeft', 'rotateOutDownRight',
  'rotateOutUpLeft', 'rotateOutUpRight', 'slideOutUp', 'slideOutDown',
  'slideOutLeft', 'slideOutRight', 'zoomOut', 'zoomOutDown', 'zoomOutLeft',
  'zoomOutRight', 'zoomOutUp', 'rollOut',
];
