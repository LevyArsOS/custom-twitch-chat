import { SCHEMA_GROUPS, SCHEMA_FIELDS } from '../shared/schema.js';
import { t } from '../i18n/index.js';
import { createColorInput } from './color-input.js';

const DEFAULT_OPEN = new Set(['channel', 'typography', 'general']);

export function createConfigForm({ doc, container, config, onChange }) {
  let cfg = { ...config };
  let lang = cfg.lang || 'pt-BR';
  const controls = new Map();
  const summaries = new Map();

  function refreshVisibility() {
    for (const field of SCHEMA_FIELDS) {
      const entry = controls.get(field.key);
      if (!entry || !field.showIf) continue;
      entry.row.hidden = cfg[field.showIf.field] !== field.showIf.equals;
    }
  }

  function emitChange(key, value) {
    cfg = { ...cfg, [key]: value };
    refreshVisibility();
    onChange(key, value, cfg);
  }

  function buildControl(field) {
    if (field.type === 'color') {
      const ctrl = createColorInput({
        doc,
        value: cfg[field.key],
        onChange: (val) => emitChange(field.key, val),
      });
      return { el: ctrl.element, setValue: ctrl.setValue };
    }
    if (field.type === 'select') {
      const select = doc.createElement('select');
      for (const optVal of field.options) {
        const opt = doc.createElement('option');
        opt.value = optVal;
        opt.textContent = t(lang, `options.${optVal}`) === `options.${optVal}` ? optVal : t(lang, `options.${optVal}`);
        select.appendChild(opt);
      }
      select.value = String(cfg[field.key]);
      select.addEventListener('change', () => emitChange(field.key, select.value));
      return {
        el: select,
        setValue: (v) => { select.value = String(v); },
        refreshLabels: (nextLang) => {
          for (const opt of select.options) {
            const label = t(nextLang, `options.${opt.value}`);
            opt.textContent = label === `options.${opt.value}` ? opt.value : label;
          }
        },
      };
    }
    if (field.type === 'textarea') {
      const area = doc.createElement('textarea');
      area.rows = 4;
      area.value = String(cfg[field.key] ?? '');
      area.addEventListener('input', () => emitChange(field.key, area.value));
      return { el: area, setValue: (v) => { area.value = String(v ?? ''); } };
    }
    const input = doc.createElement('input');
    input.type = field.type === 'number' ? 'number' : 'text';
    if (field.type === 'number') {
      input.min = String(field.min);
      input.max = String(field.max);
    }
    input.value = String(cfg[field.key] ?? '');
    input.addEventListener('input', () => {
      emitChange(field.key, field.type === 'number' ? Number(input.value) : input.value);
    });
    return { el: input, setValue: (v) => { input.value = String(v ?? ''); } };
  }

  for (const group of SCHEMA_GROUPS) {
    const fields = SCHEMA_FIELDS.filter((f) => f.group === group && !f.hidden);
    if (!fields.length) continue;

    const details = doc.createElement('details');
    details.className = 'ctc-group';
    details.open = DEFAULT_OPEN.has(group);

    const summary = doc.createElement('summary');
    summary.textContent = t(lang, `groups.${group}`);
    summaries.set(group, summary);
    details.appendChild(summary);

    const body = doc.createElement('div');
    body.className = 'ctc-group-body';

    for (const field of fields) {
      const row = doc.createElement('div');
      row.className = 'ctc-field';
      row.dataset.field = field.key;

      const label = doc.createElement('label');
      label.textContent = t(lang, `fields.${field.key}`);
      const ctrl = buildControl(field);
      row.append(label, ctrl.el);
      body.appendChild(row);
      controls.set(field.key, { row, label, ...ctrl });
    }

    details.appendChild(body);
    container.appendChild(details);
  }

  refreshVisibility();

  return {
    setConfig(next) {
      cfg = { ...next };
      for (const [key, entry] of controls) entry.setValue(cfg[key]);
      refreshVisibility();
    },
    setLang(nextLang) {
      lang = nextLang;
      for (const [group, summary] of summaries) summary.textContent = t(lang, `groups.${group}`);
      for (const [key, entry] of controls) {
        entry.label.textContent = t(lang, `fields.${key}`);
        entry.refreshLabels?.(lang);
      }
    },
  };
}
