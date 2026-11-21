export function parseRgba(str) {
  const s = String(str || '').trim();
  const hexMatch = s.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) return { hex: `#${hexMatch[1].toLowerCase()}`, alpha: 1 };

  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    const toHex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    const hex = `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
    const alpha = rgbMatch[4] !== undefined ? Math.max(0, Math.min(1, Number(rgbMatch[4]))) : 1;
    return { hex, alpha: Number.isFinite(alpha) ? alpha : 1 };
  }
  return { hex: '#000000', alpha: 0 };
}

export function formatRgba(hex, alpha) {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  const a = Math.round(Math.max(0, Math.min(1, Number(alpha))) * 100) / 100;
  return `rgba(${r},${g},${b},${a})`;
}

export function createColorInput({ doc, value, onChange }) {
  const wrap = doc.createElement('div');
  wrap.className = 'ctc-color-wrap';

  const picker = doc.createElement('input');
  picker.type = 'color';

  const alphaInput = doc.createElement('input');
  alphaInput.type = 'range';
  alphaInput.min = '0';
  alphaInput.max = '1';
  alphaInput.step = '0.01';

  const textInput = doc.createElement('input');
  textInput.type = 'text';
  textInput.className = 'ctc-color-text';

  function setValue(val) {
    const parsed = parseRgba(val);
    picker.value = parsed.hex;
    alphaInput.value = String(parsed.alpha);
    textInput.value = String(val || formatRgba(parsed.hex, parsed.alpha));
  }

  function emitFromControls() {
    const next = formatRgba(picker.value, alphaInput.value);
    textInput.value = next;
    onChange(next);
  }

  picker.addEventListener('input', emitFromControls);
  alphaInput.addEventListener('input', emitFromControls);
  textInput.addEventListener('change', () => {
    const parsed = parseRgba(textInput.value);
    picker.value = parsed.hex;
    alphaInput.value = String(parsed.alpha);
    onChange(textInput.value.trim());
  });

  setValue(value);
  wrap.append(picker, alphaInput, textInput);
  return { element: wrap, setValue };
}
