import { decodeConfigHash, importStreamElementsData, normalizeConfig } from '../shared/config.js';

export function importConfigFromInput(rawInput) {
  const text = String(rawInput || '').trim();
  if (!text) throw new Error('Empty configuration input');

  const hashMatch = text.match(/#?(?:c=)?(1\.[A-Za-z0-9_-]+)/);
  if (hashMatch && (text.includes('overlay.html') || text.startsWith('#') || text.startsWith('c=') || text.startsWith('1.'))) {
    return decodeConfigHash(`#c=${hashMatch[1]}`);
  }

  const htmlMatch = text.match(/window\.__CTC_CONFIG__\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (htmlMatch) {
    return normalizeConfig(JSON.parse(htmlMatch[1]));
  }

  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configuration must be a JSON object');
  }
  return importStreamElementsData(parsed);
}
