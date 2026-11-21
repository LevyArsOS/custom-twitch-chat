import { t } from '../i18n/index.js';

const SIM_ACTIONS = [
  ['simMessage', 'testMessage'],
  ['simSolo', 'testSolo'],
  ['simSub', 'testSub'],
  ['simGift', 'testGift'],
  ['simCheer', 'testCheer'],
  ['simPoints', 'testPoints'],
  ['simRaid', 'testRaid'],
  ['simStreak', 'testWatchStreak'],
  ['simFollow', 'testFollow'],
  ['simHighlight', 'testHighlight'],
  ['simFirstMsg', 'testFirstMsg'],
  ['simDelete', 'testDelete'],
  ['simClear', 'testClear'],
];

const BG_OPTIONS = ['bgChecker', 'bgDark', 'bgLight', 'bgChroma'];

export function createPreviewPane({ doc, win = window, container, config }) {
  let cfg = { ...config };
  let lang = cfg.lang || 'pt-BR';
  let liveConnected = false;

  const header = doc.createElement('div');
  header.className = 'ctc-preview-bar';

  const title = doc.createElement('h2');
  title.textContent = t(lang, 'ui.previewTitle');

  const bgSelect = doc.createElement('select');
  bgSelect.className = 'ctc-bg-select';
  for (const key of BG_OPTIONS) {
    const opt = doc.createElement('option');
    opt.value = key;
    opt.textContent = t(lang, `ui.${key}`);
    bgSelect.appendChild(opt);
  }

  const liveBtn = doc.createElement('button');
  liveBtn.type = 'button';
  liveBtn.className = 'ctc-btn ctc-live-btn';
  liveBtn.textContent = t(lang, 'ui.connectLive');

  header.append(title, bgSelect, liveBtn);

  const stage = doc.createElement('div');
  stage.className = 'ctc-preview-stage bgChecker';

  const iframe = doc.createElement('iframe');
  iframe.src = 'overlay.html?preview=1';
  iframe.title = 'Chat Preview';
  stage.appendChild(iframe);

  const simBar = doc.createElement('div');
  simBar.className = 'ctc-sim-bar';
  const simButtons = [];
  for (const [labelKey, action] of SIM_ACTIONS) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ctc-btn ctc-sim-btn';
    btn.dataset.action = action;
    btn.textContent = t(lang, `ui.${labelKey}`);
    btn.addEventListener('click', () => post({ type: 'ctc:sim', action }));
    simBar.appendChild(btn);
    simButtons.push({ btn, labelKey });
  }

  function post(payload) {
    iframe.contentWindow?.postMessage(payload, win.location.origin);
  }

  bgSelect.addEventListener('change', () => {
    stage.className = `ctc-preview-stage ${bgSelect.value}`;
  });

  liveBtn.addEventListener('click', () => {
    liveConnected = !liveConnected;
    liveBtn.textContent = t(lang, liveConnected ? 'ui.disconnectLive' : 'ui.connectLive');
    post({ type: 'ctc:live', connect: liveConnected });
  });

  iframe.addEventListener('load', () => post({ type: 'ctc:config', config: cfg }));
  container.append(header, stage, simBar);

  return {
    updateConfig(next) {
      cfg = { ...next };
      post({ type: 'ctc:config', config: cfg });
    },
    setLang(nextLang) {
      lang = nextLang;
      title.textContent = t(lang, 'ui.previewTitle');
      for (const opt of bgSelect.options) opt.textContent = t(lang, `ui.${opt.value}`);
      liveBtn.textContent = t(lang, liveConnected ? 'ui.disconnectLive' : 'ui.connectLive');
      for (const item of simButtons) item.btn.textContent = t(lang, `ui.${item.labelKey}`);
    },
    getIframe: () => iframe,
  };
}
