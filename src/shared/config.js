import { SCHEMA_FIELDS, SCHEMA_BY_KEY } from './schema.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getDefaultConfig() {
  const out = {};
  for (const field of SCHEMA_FIELDS) {
    out[field.key] = field.default;
  }
  return out;
}

function coerceFieldValue(field, value) {
  if (value === undefined || value === null) return field.default;

  if (field.key === 'textInSameLine' && value === 'no') {
    return 'block';
  }

  if (field.type === 'number') {
    const num = Number(value);
    if (!Number.isFinite(num)) return field.default;
    let clamped = num;
    if (typeof field.min === 'number') clamped = Math.max(field.min, clamped);
    if (typeof field.max === 'number') clamped = Math.min(field.max, clamped);
    return clamped;
  }

  if (field.type === 'select') {
    const str = String(value);
    return field.options.includes(str) ? str : field.default;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const str = String(value);
    return field.key === 'channel' ? str.replace(/^[\s#@]+/, '').trim().toLowerCase() : str;
  }

  return field.default;
}

export function normalizeConfig(raw) {
  const out = getDefaultConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  for (const field of SCHEMA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field.key)) {
      out[field.key] = coerceFieldValue(field, raw[field.key]);
    }
  }
  return out;
}

export function diffFromDefaults(config) {
  const normalized = normalizeConfig(config);
  const defaults = getDefaultConfig();
  const delta = {};
  for (const key of Object.keys(SCHEMA_BY_KEY)) {
    if (normalized[key] !== defaults[key]) {
      delta[key] = normalized[key];
    }
  }
  return delta;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeConfigHash(config) {
  const delta = diffFromDefaults(config);
  const payload = toBase64Url(encoder.encode(JSON.stringify(delta)));
  return `#c=1.${payload}`;
}

export function decodeConfigHash(hash) {
  if (typeof hash !== 'string' || !hash.trim()) {
    return getDefaultConfig();
  }
  const clean = hash.replace(/^#/, '');
  const match = clean.match(/(?:^|&)c=([^&]+)/);
  const rawToken = match ? match[1] : clean;
  if (!rawToken.startsWith('1.')) {
    return getDefaultConfig();
  }
  try {
    const json = decoder.decode(fromBase64Url(rawToken.slice(2)));
    return normalizeConfig(JSON.parse(json));
  } catch {
    return getDefaultConfig();
  }
}

export function importStreamElementsData(rawInput) {
  let obj = rawInput;
  if (typeof rawInput === 'string') {
    obj = JSON.parse(rawInput);
  }
  return normalizeConfig(obj);
}

export function parseCsvList(value) {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export const parseIgnoredUsers = parseCsvList;
export const parseBlockedWords = parseCsvList;
