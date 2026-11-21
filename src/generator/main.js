import { getDefaultConfig, normalizeConfig } from '../shared/config.js';
import { t } from '../i18n/index.js';
import { getPreset } from '../presets/index.js';
import { createConfigForm } from './form.js';
import { createPreviewPane } from './preview.js';
import { buildHostedOverlayUrl, buildSingleFileHtml, buildZipBundle } from './export.js';
import { importConfigFromInput } from './import.js';

const STORAGE_KEY = 'ctc.generator.v1';

export function createConfiguratorApp({
  win = window,
  doc = document,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchImpl = (...args) => fetch(...args),
  subtleCrypto = globalThis.crypto?.subtle,
} = {}) {
  let config = loadSaved();

  function loadSaved() {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? normalizeConfig(JSON.parse(raw)) : getDefaultConfig();
    } catch {
      return getDefaultConfig();
    }
  }

  function save() {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }

  const byId = (id) => doc.getElementById(id);

  function setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'ctc-status error' : 'ctc-status';
  }

  function triggerDownload(filename, bytesOrText, mime) {
    const blob = new Blob([bytesOrText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fetchRuntimeAssets() {
    const [cssRes, jsRes] = await Promise.all([
      fetchImpl('runtime/overlay.css'),
      fetchImpl('runtime/overlay.js'),
    ]);
    if (!cssRes.ok || !jsRes.ok) throw new Error('Failed to load overlay runtime assets');
    return { cssText: await cssRes.text(), jsText: await jsRes.text() };
  }

  function applyStaticLabels(lang) {
    const map = {
      'ctc-title': 'ui.title', 'ctc-subtitle': 'ui.subtitle',
      'ctc-preset-label': 'ui.presetLabel', 'ctc-reset-btn': 'ui.resetBtn',
      'ctc-relogin-btn': 'ui.forceRelogin', 'ctc-export-title': 'ui.exportTitle',
      'ctc-copy-url': 'ui.copyUrl', 'ctc-dl-html': 'ui.downloadHtml',
      'ctc-dl-zip': 'ui.downloadZip', 'ctc-dl-json': 'ui.downloadJson',
      'ctc-obs-title': 'ui.obsGuideTitle', 'ctc-obs-body': 'ui.obsGuideBody',
      'ctc-import-title': 'ui.importTitle', 'ctc-import-btn': 'ui.importBtn',
      'ctc-import-file-btn': 'ui.importFileBtn',
    };
    for (const [id, key] of Object.entries(map)) {
      const el = byId(id);
      if (el) el.textContent = t(lang, key);
    }
    const importText = byId('ctc-import-text');
    if (importText) importText.placeholder = t(lang, 'ui.importPlaceholder');
  }

  const preview = createPreviewPane({ doc, win, container: byId('ctc-preview-root'), config });
  const form = createConfigForm({
    doc,
    container: byId('ctc-form-root'),
    config,
    onChange(key, _val, next) {
      config = normalizeConfig(next);
      save();
      preview.updateConfig(config);
      if (key === 'lang') {
        applyStaticLabels(config.lang);
        form.setLang(config.lang);
        preview.setLang(config.lang);
      }
    },
  });

  function applyFullConfig(next) {
    config = normalizeConfig(next);
    save();
    form.setConfig(config);
    form.setLang(config.lang);
    preview.setLang(config.lang);
    preview.updateConfig(config);
    applyStaticLabels(config.lang);
  }

  byId('ctc-preset-select')?.addEventListener('change', (e) => applyFullConfig(getPreset(e.target.value)));
  byId('ctc-reset-btn')?.addEventListener('click', () => applyFullConfig(getDefaultConfig()));
  byId('ctc-relogin-btn')?.addEventListener('click', () => {
    applyFullConfig({ ...config, authNonce: (config.authNonce || 1) + 1 });
  });

  const exportStatus = byId('ctc-export-status');
  byId('ctc-copy-url')?.addEventListener('click', async () => {
    const url = buildHostedOverlayUrl(win.location.href, config);
    try { await win.navigator?.clipboard?.writeText(url); } catch { /* ignore */ }
    setStatus(exportStatus, `${t(config.lang, 'ui.copied')} (${url.slice(0, 64)}...)`);
  });

  byId('ctc-dl-html')?.addEventListener('click', async () => {
    try {
      const assets = await fetchRuntimeAssets();
      const html = await buildSingleFileHtml(config, { ...assets, subtleCrypto });
      triggerDownload('chat.html', html, 'text/html');
    } catch (err) {
      setStatus(exportStatus, err.message, true);
    }
  });

  byId('ctc-dl-zip')?.addEventListener('click', async () => {
    try {
      const assets = await fetchRuntimeAssets();
      const zipBytes = await buildZipBundle(config, assets);
      triggerDownload('custom-twitch-chat.zip', zipBytes, 'application/zip');
    } catch (err) {
      setStatus(exportStatus, err.message, true);
    }
  });

  byId('ctc-dl-json')?.addEventListener('click', () => {
    triggerDownload('config.json', `${JSON.stringify(config, null, 2)}\n`, 'application/json');
  });

  const importStatus = byId('ctc-import-status');
  function runImport(raw) {
    try {
      applyFullConfig(importConfigFromInput(raw));
      setStatus(importStatus, t(config.lang, 'ui.importSuccess'));
    } catch {
      setStatus(importStatus, t(config.lang, 'ui.importError'), true);
    }
  }

  byId('ctc-import-btn')?.addEventListener('click', () => runImport(byId('ctc-import-text')?.value));
  const fileInput = byId('ctc-import-file');
  byId('ctc-import-file-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) runImport(await file.text());
  });

  applyStaticLabels(config.lang);
  return { getConfig: () => config, applyFullConfig };
}

/* v8 ignore start */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !import.meta.vitest) {
  if (document.getElementById('ctc-form-root')) {
    createConfiguratorApp();
  }
}
/* v8 ignore stop */
