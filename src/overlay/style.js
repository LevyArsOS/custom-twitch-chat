function safeCssUrl(value) {
  const str = String(value || '').trim();
  if (!str) return 'none';
  if (/^(https?:|data:image\/)/i.test(str)) {
    const escaped = str.replace(/["\\\r\n]/g, '');
    return `url("${escaped}")`;
  }
  return 'none';
}

function setBoxVars(style, prefix, cfgPrefix, config) {
  style.setProperty(`${prefix}-bg-color`, config[`${cfgPrefix}BackgroundColor`]);
  style.setProperty(`${prefix}-bg-image`, safeCssUrl(config[`${cfgPrefix}BackgroundImage`]));
  style.setProperty(`${prefix}-border-color`, config[`${cfgPrefix}BorderColor`]);
  style.setProperty(`${prefix}-border-radius`, `${config[`${cfgPrefix}BorderRadius`]}px`);
  style.setProperty(`${prefix}-border-width`, `${config[`${cfgPrefix}BorderWidth`]}px`);
  style.setProperty(`${prefix}-border-image`, safeCssUrl(config[`${cfgPrefix}BorderImage`]));
  style.setProperty(`${prefix}-slice`, String(config[`${cfgPrefix}SliceWidth`]));
  style.setProperty(`${prefix}-border-repeat`, config[`${cfgPrefix}BorderRepeat`]);
}

function ensureLink(doc, id, href) {
  if (!href) return;
  let link = doc.getElementById(id);
  if (!link) {
    link = doc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    doc.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

export function applyOverlayStyles(doc, config) {
  const root = doc.documentElement.style;
  const font = config.fontName || 'Montserrat';

  root.setProperty('--ctc-font-name', `'${font.replace(/['\\\r\n]/g, '')}', sans-serif`);
  root.setProperty('--ctc-font-color', config.fontColor);
  root.setProperty('--ctc-font-weight', config.fontWeight);
  root.setProperty('--ctc-text-shadow', config.textShadow);
  root.setProperty('--ctc-font-size', `${config.fontSize}px`);
  root.setProperty('--ctc-emote-size', `${config.emoteSize}px`);
  root.setProperty('--ctc-emote-solo-size', `${config.emoteSoloSize}px`);
  root.setProperty('--ctc-avatar-size', `${config.avatarSize}px`);
  root.setProperty('--ctc-avatar-round', `${config.avatarRound}%`);
  root.setProperty('--ctc-show-avatar', config.showAvatar);
  root.setProperty('--ctc-display-badges', config.displayBadges);
  root.setProperty('--ctc-align-messages', config.alignMessages);
  root.setProperty('--ctc-text-same-line', config.textInSameLine);

  setBoxVars(root, '--ctc-msg', 'message', config);
  setBoxVars(root, '--ctc-user', 'userName', config);
  setBoxVars(root, '--ctc-text', 'text', config);

  ensureLink(
    doc,
    'ctc-google-font',
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@100;300;400;500;700;900&display=swap`
  );

  if (config.animationIn !== 'none' || config.animationOut !== 'none') {
    ensureLink(doc, 'ctc-animate-css', 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css');
  }

  let customStyle = doc.getElementById('ctc-custom-css');
  if (!customStyle) {
    customStyle = doc.createElement('style');
    customStyle.id = 'ctc-custom-css';
    doc.head.appendChild(customStyle);
  }
  customStyle.textContent = config.customCSS || '';
}
