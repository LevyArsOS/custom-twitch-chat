import JSZip from 'jszip';
import { encodeConfigHash, normalizeConfig } from '../shared/config.js';

const CONNECT_DOMAINS = [
  'wss://irc-ws.chat.twitch.tv',
  'wss://eventsub.wss.twitch.tv',
  'https://id.twitch.tv',
  'https://api.twitch.tv',
  'https://api.ivr.fi',
  'https://7tv.io',
  'https://api.betterttv.net',
  'https://api.frankerfacez.com',
].join(' ');

export function escapeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function computeSha256Base64(text, subtleCrypto = globalThis.crypto.subtle) {
  const bytes = new TextEncoder().encode(text);
  const digest = await subtleCrypto.digest('SHA-256', bytes);
  let bin = '';
  for (const byte of new Uint8Array(digest)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export function buildHostedOverlayUrl(pageUrl, config) {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/(index\.html)?$/, '/overlay.html');
  return `${url.toString()}${encodeConfigHash(config)}`;
}

export async function buildSingleFileHtml(config, { cssText, jsText, subtleCrypto } = {}) {
  const normalized = normalizeConfig(config);
  const safeCss = String(cssText || '').replace(/<\/style/gi, '<\\/style');
  const safeJs = String(jsText || '').replace(/<\/script/gi, '<\\/script');
  const cfgScript = `window.__CTC_CONFIG__ = ${escapeInlineJson(normalized)};`;

  const [cfgHash, jsHash] = await Promise.all([
    computeSha256Base64(cfgScript, subtleCrypto),
    computeSha256Base64(safeJs, subtleCrypto),
  ]);

  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${cfgHash}' 'sha256-${jsHash}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    'font-src https://fonts.gstatic.com https://fonts.googleapis.com',
    'img-src https: data:',
    `connect-src ${CONNECT_DOMAINS}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '  <title>Custom Twitch Chat</title>',
    `  <style>${safeCss}</style>`,
    '</head>',
    '<body>',
    '  <div id="ctc-auth-root"></div>',
    '  <div id="chat-container" class="main-container"></div>',
    `  <script>${cfgScript}</script>`,
    `  <script>${safeJs}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export async function buildZipBundle(config, { cssText, jsText } = {}) {
  const normalized = normalizeConfig(config);
  const zip = new JSZip();
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    'font-src https://fonts.gstatic.com https://fonts.googleapis.com',
    'img-src https: data:',
    `connect-src ${CONNECT_DOMAINS}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '  <title>Custom Twitch Chat</title>',
    '  <link rel="stylesheet" href="chat.css">',
    '</head>',
    '<body>',
    '  <div id="ctc-auth-root"></div>',
    '  <div id="chat-container" class="main-container"></div>',
    '  <script src="config.js"></script>',
    '  <script src="chat.js"></script>',
    '</body>',
    '</html>',
  ].join('\n');

  zip.file('chat.html', html);
  zip.file('chat.css', String(cssText || ''));
  zip.file('chat.js', String(jsText || ''));
  zip.file('config.js', `window.__CTC_CONFIG__ = ${escapeInlineJson(normalized)};\n`);
  zip.file('config.json', `${JSON.stringify(normalized, null, 2)}\n`);
  zip.file('README.txt', 'Add chat.html as a Local File in OBS Browser Source (recommended 500x800).\n');

  return zip.generateAsync({ type: 'uint8array' });
}
