import qrcode from 'qrcode-generator';
import { t } from '../i18n/index.js';

export function createAuthPanel({
  container,
  doc = container?.ownerDocument,
  lang = 'en',
} = {}) {
  let card = null;
  let statusEl = null;

  function renderQrSvg(url) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${count} ${count}`);
    let d = '';
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
      }
    }
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#000');
    svg.appendChild(path);
    return svg;
  }

  function show({ userCode, verificationUri }) {
    if (!container || !doc) return;
    hide();
    card = doc.createElement('div');
    card.className = 'ctc-auth-card';

    const title = doc.createElement('div');
    title.style.fontWeight = '700';
    title.textContent = t(lang, 'auth.title');

    const inst = doc.createElement('div');
    inst.textContent = t(lang, 'auth.instructions');

    const urlEl = doc.createElement('div');
    urlEl.style.wordBreak = 'break-all';
    urlEl.textContent = verificationUri;

    const codeEl = doc.createElement('div');
    codeEl.className = 'ctc-auth-code';
    codeEl.textContent = userCode;

    const qrWrap = doc.createElement('div');
    qrWrap.className = 'ctc-auth-qr';
    qrWrap.appendChild(renderQrSvg(verificationUri));

    statusEl = doc.createElement('div');
    statusEl.textContent = t(lang, 'auth.waiting');

    card.append(title, inst, urlEl, codeEl, qrWrap, statusEl);
    container.appendChild(card);
  }

  function setStatus(key) {
    if (statusEl) {
      statusEl.textContent = t(lang, `auth.${key}`);
    }
  }

  function hide() {
    if (card?.parentNode) card.remove();
    card = null;
    statusEl = null;
  }

  return { show, setStatus, hide, setLang(next) { lang = next; } };
}
