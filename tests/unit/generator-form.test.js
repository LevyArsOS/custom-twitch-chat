import { describe, it, expect, vi } from 'vitest';
import { getDefaultConfig } from '../../src/shared/config.js';
import { parseRgba, formatRgba, createColorInput } from '../../src/generator/color-input.js';
import { createConfigForm } from '../../src/generator/form.js';
import { createPreviewPane } from '../../src/generator/preview.js';

describe('color-input', () => {
  it('parses hex, rgb, rgba, and malformed values cleanly', () => {
    expect(parseRgba('#ff8800')).toEqual({ hex: '#ff8800', alpha: 1 });
    expect(parseRgba('rgb(10, 20, 30)')).toEqual({ hex: '#0a141e', alpha: 1 });
    expect(parseRgba('rgba(255, 0, 128, 0.5)')).toEqual({ hex: '#ff0080', alpha: 0.5 });
    expect(parseRgba('not-a-color')).toEqual({ hex: '#000000', alpha: 0 });
    expect(formatRgba('#00ff00', 0.25)).toBe('rgba(0,255,0,0.25)');
    expect(formatRgba('bad', 2)).toBe('rgba(0,0,0,1)');
  });

  it('synchronizes picker, alpha slider, and text input', () => {
    const onChange = vi.fn();
    const ctrl = createColorInput({ doc: document, value: 'rgba(255,0,0,0.5)', onChange });
    const [picker, alpha, text] = ctrl.element.querySelectorAll('input');

    expect(picker.value).toBe('#ff0000');
    expect(alpha.value).toBe('0.5');

    picker.value = '#00ff00';
    picker.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('rgba(0,255,0,0.5)');

    alpha.value = '0.25';
    alpha.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('rgba(0,255,0,0.25)');

    text.value = 'rgba(10,20,30,0.8)';
    text.dispatchEvent(new Event('change'));
    expect(picker.value).toBe('#0a141e');
    expect(alpha.value).toBe('0.8');

    ctrl.setValue('');
    expect(text.value).toBe('rgba(0,0,0,0)');
  });
});

describe('config form and live preview pane', () => {
  it('renders schema groups, evaluates showIf rules, and updates language dynamically', () => {
    document.body.innerHTML = '<div id="form"></div>';
    const onChange = vi.fn();
    const cfg = { ...getDefaultConfig(), lang: 'en' };
    const form = createConfigForm({ doc: document, container: document.getElementById('form'), config: cfg, onChange });

    const customNickRow = document.querySelector('[data-field="customNickColor"]');
    expect(customNickRow.hidden).toBe(true);

    const nickSelect = document.querySelector('[data-field="nickColor"] select');
    nickSelect.value = 'custom';
    nickSelect.dispatchEvent(new Event('change'));
    expect(customNickRow.hidden).toBe(false);
    expect(onChange).toHaveBeenCalledWith('nickColor', 'custom', expect.objectContaining({ nickColor: 'custom' }));

    const fontSizeInput = document.querySelector('[data-field="fontSize"] input');
    fontSizeInput.value = '30';
    fontSizeInput.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('fontSize', 30, expect.any(Object));

    const cssArea = document.querySelector('[data-field="customCSS"] textarea');
    cssArea.value = 'body { color: red; }';
    cssArea.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('customCSS', 'body { color: red; }', expect.any(Object));

    const chanInput = document.querySelector('[data-field="channel"] input');
    chanInput.value = 'mychan';
    chanInput.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('channel', 'mychan', expect.any(Object));

    const fontColorPicker = document.querySelector('[data-field="fontColor"] input[type="color"]');
    fontColorPicker.value = '#ff0000';
    fontColorPicker.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('fontColor', 'rgba(255,0,0,1)', expect.any(Object));

    form.setLang('pt-BR');
    expect(document.querySelector('[data-field="channel"] label').textContent).toBe('Canal da Twitch');

    form.setConfig({ ...cfg, lang: '', nickColor: 'custom', customCSS: null, channel: null });
    expect(customNickRow.hidden).toBe(false);
  });

  it('posts same-origin messages on load, config update, live toggle, and simulator clicks', () => {
    document.body.innerHTML = '<div id="preview"></div>';
    const fakeWin = { location: { origin: 'https://app.example.com' } };
    const pane = createPreviewPane({ doc: document, win: fakeWin, container: document.getElementById('preview'), config: {} });

    document.querySelector('[data-action="testSub"]').click();

    const postMessage = vi.fn();
    Object.defineProperty(pane.getIframe(), 'contentWindow', { value: { postMessage }, configurable: true });

    pane.getIframe().dispatchEvent(new Event('load'));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'ctc:config' }), 'https://app.example.com');

    document.querySelector('[data-action="testSub"]').click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'ctc:sim', action: 'testSub' }, 'https://app.example.com');

    const liveBtn = document.querySelector('.ctc-live-btn');
    liveBtn.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'ctc:live', connect: true }, 'https://app.example.com');
    liveBtn.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'ctc:live', connect: false }, 'https://app.example.com');
    liveBtn.click();

    const bgSelect = document.querySelector('.ctc-bg-select');
    bgSelect.value = 'bgChroma';
    bgSelect.dispatchEvent(new Event('change'));
    expect(document.querySelector('.ctc-preview-stage').className).toContain('bgChroma');

    pane.updateConfig({ ...getDefaultConfig(), fontSize: 40 });
    pane.setLang('pt-BR');
    liveBtn.click();
    pane.setLang('en');
    expect(document.querySelector('.ctc-preview-bar h2').textContent).toBe('Live Preview');
  });
});
