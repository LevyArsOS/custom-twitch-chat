import en from './en.json';
import ptBr from './pt-br.json';

const CATALOGS = {
  en,
  'pt-BR': ptBr,
  'pt-br': ptBr,
};

function lookup(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function getCatalog(lang) {
  return CATALOGS[lang] || en;
}

export function t(lang, key, params = {}) {
  const raw = lookup(getCatalog(lang), key) ?? lookup(en, key) ?? key;
  return raw.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}
