import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { getDefaultConfig } from '../../src/shared/config.js';
import { t } from '../../src/i18n/index.js';
import {
  escapeInlineJson,
  buildHostedOverlayUrl,
  buildSingleFileHtml,
  buildZipBundle,
} from '../../src/generator/export.js';
import { importConfigFromInput } from '../../src/generator/import.js';
import { createConfiguratorApp } from '../../src/generator/main.js';

const INDEX_HTML = fs.readFileSync(path.resolve('index.html'), 'utf8');

describe('exporter and importer', () => {
  it('escapes inline JSON, generates exact SHA-256 CSP hashes, and round-trips HTML/URL/SE', async () => {
    const cfg = { ...getDefaultConfig(), channel: 'streamer', nameSuffix: '</script><script>alert(1)</script>', customCSS: '/* </style> */' };
    expect(escapeInlineJson({ x: '</script>' })).not.toContain('</script>');

    const html = await buildSingleFileHtml(cfg, { cssText: 'body{}</style>', jsText: 'console.log("</script>");' });
    expect(html).not.toContain('console.log("</script>");');

    const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scriptMatches).toHaveLength(2);
    for (const [, scriptBody] of scriptMatches) {
      const digest = crypto.createHash('sha256').update(scriptBody, 'utf8').digest('base64');
      expect(html).toContain(`'sha256-${digest}'`);
    }

    expect(importConfigFromInput(html).channel).toBe('streamer');
    expect(importConfigFromInput(html).nameSuffix).toBe('</script><script>alert(1)</script>');

    const hostedUrl = buildHostedOverlayUrl('https://user.github.io/custom-twitch-chat/index.html', cfg);
    expect(hostedUrl).toContain('/overlay.html#c=1.');
    expect(importConfigFromInput(hostedUrl).channel).toBe('streamer');

    const seImported = importConfigFromInput(JSON.stringify({ fontName: 'Permanent Marker', textInSameLine: 'no', emoteSoloSize: 120 }));
    expect(seImported.textInSameLine).toBe('block');
    expect(seImported.emoteSoloSize).toBe(120);

    expect(() => importConfigFromInput('')).toThrow();
    expect(() => importConfigFromInput(null)).toThrow();
    expect(() => importConfigFromInput('[]')).toThrow();
    expect(() => importConfigFromInput('not json')).toThrow();

    const emptyHtml = await buildSingleFileHtml(cfg);
    expect(emptyHtml).toContain('window.__CTC_CONFIG__');
    const emptyZip = await buildZipBundle(cfg);
    expect(emptyZip.length).toBeGreaterThan(0);
    expect(importConfigFromInput('1.e30').fontSize).toBe(24);
  });

  it('builds a valid ZIP archive containing all overlay files', async () => {
    const cfg = { ...getDefaultConfig(), channel: 'zipchan' };
    const bytes = await buildZipBundle(cfg, { cssText: '.a{}', jsText: '/* js */' });
    const zip = await JSZip.loadAsync(bytes);

    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'chat.css', 'chat.html', 'chat.js', 'config.js', 'config.json']);
    expect(await zip.file('chat.css').async('string')).toBe('.a{}');
    expect(await zip.file('chat.js').async('string')).toBe('/* js */');
    expect(JSON.parse(await zip.file('config.json').async('string')).channel).toBe('zipchan');
  });
});

describe('configurator controller integration', () => {
  it('wires autosave, presets, re-login nonce, exports, and imports', async () => {
    const bodyMatch = INDEX_HTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    document.body.innerHTML = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '');

    const map = new Map([['ctc.generator.v1', JSON.stringify({ channel: 'savedchan', lang: 'en' })]]);
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
    const clipboard = { writeText: vi.fn(async () => {}) };
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    let assetOk = true;
    const app = createConfiguratorApp({
      win: { location: { href: 'https://host.example.com/index.html', origin: 'https://host.example.com' }, navigator: { clipboard } },
      doc: document,
      storage,
      fetchImpl: async () => (assetOk ? { ok: true, text: async () => 'asset' } : { ok: false }),
    });

    expect(app.getConfig().channel).toBe('savedchan');

    const langSelect = document.querySelector('[data-field="lang"] select');
    langSelect.value = 'pt-BR';
    langSelect.dispatchEvent(new Event('change'));
    expect(document.getElementById('ctc-reset-btn').textContent).toBe(t('pt-BR', 'ui.resetBtn'));

    const preset = document.getElementById('ctc-preset-select');
    preset.value = 'peneku';
    preset.dispatchEvent(new Event('change'));
    expect(app.getConfig().fontName).toBe('Permanent Marker');

    document.getElementById('ctc-relogin-btn').click();
    expect(app.getConfig().authNonce).toBe(2);

    document.getElementById('ctc-reset-btn').click();
    expect(app.getConfig().fontName).toBe('Montserrat');

    document.getElementById('ctc-copy-url').click();
    await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalled());

    document.getElementById('ctc-dl-json').click();
    document.getElementById('ctc-dl-html').click();
    document.getElementById('ctc-dl-zip').click();
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));

    assetOk = false;
    document.getElementById('ctc-dl-html').click();
    document.getElementById('ctc-dl-zip').click();
    await vi.waitFor(() => expect(document.getElementById('ctc-export-status').className).toContain('error'));

    document.getElementById('ctc-import-text').value = JSON.stringify({ channel: 'imported', lang: 'en' });
    document.getElementById('ctc-import-btn').click();
    expect(app.getConfig().channel).toBe('imported');

    document.getElementById('ctc-import-text').value = 'bad';
    document.getElementById('ctc-import-btn').click();
    expect(document.getElementById('ctc-import-status').className).toContain('error');

    const chanInput = document.querySelector('[data-field="channel"] input');
    chanInput.value = 'edited';
    chanInput.dispatchEvent(new Event('input'));
    expect(app.getConfig().channel).toBe('edited');

    document.getElementById('ctc-import-file-btn').click();
    const fileInput = document.getElementById('ctc-import-file');
    Object.defineProperty(fileInput, 'files', { value: [{ text: async () => JSON.stringify({ channel: 'fromfile' }) }], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(app.getConfig().channel).toBe('fromfile'));

    Object.defineProperty(fileInput, 'files', { value: [], configurable: true });
    fileInput.dispatchEvent(new Event('change'));

    const corruptApp = createConfiguratorApp({
      win: { location: { href: 'https://host.example.com/', origin: 'https://host.example.com' } },
      doc: document,
      storage: { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } },
    });
    expect(corruptApp.getConfig().channel).toBe('');

    document.body.innerHTML = '<div id="ctc-form-root"></div><div id="ctc-preview-root"></div>';
    const bareApp = createConfiguratorApp({
      win: { location: { href: 'https://host.example.com/', origin: 'https://host.example.com' } },
      doc: document,
      storage: null,
    });
    expect(bareApp.getConfig().authNonce).toBe(1);
  });
});
