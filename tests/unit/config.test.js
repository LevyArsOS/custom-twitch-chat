import { describe, it, expect } from 'vitest';
import { SCHEMA_FIELDS, SCHEMA_BY_KEY } from '../../src/shared/schema.js';
import {
  getDefaultConfig,
  normalizeConfig,
  diffFromDefaults,
  encodeConfigHash,
  decodeConfigHash,
  importStreamElementsData,
  parseIgnoredUsers,
  parseBlockedWords,
} from '../../src/shared/config.js';
import { t, getCatalog } from '../../src/i18n/index.js';
import { PRESETS, getPreset } from '../../src/presets/index.js';
import enCatalog from '../../src/i18n/en.json';
import ptCatalog from '../../src/i18n/pt-br.json';

describe('schema and i18n completeness', () => {
  it('provides en and pt-BR labels for every non-hidden schema field', () => {
    for (const field of SCHEMA_FIELDS) {
      if (field.hidden) continue;
      expect(enCatalog.fields[field.key], `en missing ${field.key}`).toBeTypeOf('string');
      expect(ptCatalog.fields[field.key], `pt missing ${field.key}`).toBeTypeOf('string');
    }
    expect(Object.keys(enCatalog.groups)).toEqual(Object.keys(ptCatalog.groups));
    expect(Object.keys(enCatalog.events)).toEqual(Object.keys(ptCatalog.events));
    expect(Object.keys(SCHEMA_BY_KEY).length).toBe(SCHEMA_FIELDS.length);
  });

  it('interpolates params and falls back to English or raw key', () => {
    expect(t('pt-br', 'events.resub', { months: 12 })).toContain('12');
    expect(t('fr', 'events.cheer', { amount: 500 })).toBe('cheered 500 bits!');
    expect(t('en', 'events.cheer', {})).toBe('cheered {amount} bits!');
    expect(t('en', 'missing.deep.key')).toBe('missing.deep.key');
    expect(t('en', 'fields')).toBe('fields');
    expect(getCatalog('unknown')).toBe(enCatalog);
  });
});

describe('normalizeConfig and legacy fixes', () => {
  it('returns defaults for invalid root inputs', () => {
    const defaults = getDefaultConfig();
    expect(normalizeConfig(null)).toEqual(defaults);
    expect(normalizeConfig([])).toEqual(defaults);
    expect(normalizeConfig('invalid')).toEqual(defaults);
  });

  it('coerces types, clamps numbers, strips unknown keys, and fixes SE quirks', () => {
    const normalized = normalizeConfig({
      channel: '  #@MyChannel  ',
      textInSameLine: 'no',
      fontSize: '999',
      avatarSize: '-5',
      messagesLimit: 'not-a-number',
      nickColor: 'invalid-option',
      fontName: 123,
      customCSS: { bad: true },
      extraUnknownKey: 'dropped',
      hideAfter: null,
    });

    expect(normalized.channel).toBe('mychannel');
    expect(normalized.textInSameLine).toBe('block');
    expect(normalized.fontSize).toBe(96);
    expect(normalized.avatarSize).toBe(12);
    expect(normalized.messagesLimit).toBe(4);
    expect(normalized.nickColor).toBe('user');
    expect(normalized.fontName).toBe('123');
    expect(normalized.customCSS).toBe('');
    expect(normalized.hideAfter).toBe(999);
    expect('extraUnknownKey' in normalized).toBe(false);
  });

  it('imports StreamElements JSON strings and objects cleanly', () => {
    const seJson = JSON.stringify({
      fontName: 'Permanent Marker',
      textInSameLine: 'no',
      emoteSoloSize: 120,
      avatarSize: '50',
      avatarRound: '50',
      ignoredUsers: 'StreamElements, Nightbot , ',
    });
    const imported = importStreamElementsData(seJson);
    expect(imported.fontName).toBe('Permanent Marker');
    expect(imported.textInSameLine).toBe('block');
    expect(imported.emoteSoloSize).toBe(120);
    expect(imported.avatarSize).toBe(50);
    expect(parseIgnoredUsers(imported.ignoredUsers)).toEqual(['streamelements', 'nightbot']);
    expect(parseBlockedWords(123)).toEqual([]);
  });
});

describe('hash codec, presets, and fault tolerance', () => {
  it('encodes only deltas and falls back on malformed hashes', () => {
    const defaults = getDefaultConfig();
    expect(diffFromDefaults(defaults)).toEqual({});
    expect(encodeConfigHash(defaults)).toBe('#c=1.e30');

    const custom = { ...defaults, channel: 'streamer', fontSize: 32, lang: 'en' };
    const hash = encodeConfigHash(custom);
    expect(decodeConfigHash(hash)).toEqual(custom);
    expect(decodeConfigHash(hash.slice(3))).toEqual(custom);
    expect(decodeConfigHash(`foo=1&c=${hash.slice(3)}`)).toEqual(custom);
    expect(importStreamElementsData({ fontName: 'Inter' }).fontName).toBe('Inter');

    expect(decodeConfigHash('')).toEqual(defaults);
    expect(decodeConfigHash(null)).toEqual(defaults);
    expect(decodeConfigHash('#c=2.abc')).toEqual(defaults);
    expect(decodeConfigHash('#c=1.!!!not-valid-base64!!!')).toEqual(defaults);
  });

  it('returns independent copies for built-in presets', () => {
    const peneku = getPreset('peneku');
    expect(peneku.fontName).toBe('Permanent Marker');
    expect(peneku.emoteSoloSize).toBe(120);
    peneku.fontSize = 10;
    expect(PRESETS.peneku.fontSize).toBe(24);
    expect(getPreset('nonexistent')).toEqual(PRESETS.default);
  });
});
