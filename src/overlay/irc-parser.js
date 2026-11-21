const TAG_ESCAPES = { ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' };

export function unescapeIrcTagValue(value) {
  if (!value) return '';
  return value.replace(/\\([:s\\rn])/g, (_, ch) => TAG_ESCAPES[ch] ?? ch);
}

export function parseTags(rawTags) {
  const tags = {};
  if (!rawTags) return tags;
  for (const part of rawTags.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      tags[part] = '';
    } else {
      tags[part.slice(0, eq)] = unescapeIrcTagValue(part.slice(eq + 1));
    }
  }
  return tags;
}

export function parseBadgeTag(rawBadges) {
  if (!rawBadges) return [];
  const badges = [];
  for (const entry of rawBadges.split(',')) {
    const slash = entry.indexOf('/');
    if (slash > 0) {
      badges.push({ type: entry.slice(0, slash), version: entry.slice(slash + 1) });
    }
  }
  return badges;
}

export function parseEmoteTag(rawEmotes) {
  if (!rawEmotes) return [];
  const emotes = [];
  for (const group of rawEmotes.split('/')) {
    const colon = group.indexOf(':');
    if (colon <= 0) continue;
    const id = group.slice(0, colon);
    for (const range of group.slice(colon + 1).split(',')) {
      const dash = range.indexOf('-');
      if (dash <= 0) continue;
      const start = Number(range.slice(0, dash));
      const end = Number(range.slice(dash + 1));
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start) {
        emotes.push({ id, start, end });
      }
    }
  }
  return emotes.sort((a, b) => a.start - b.start);
}

export function parseIrcLine(rawLine) {
  if (typeof rawLine !== 'string') return null;
  const line = rawLine.replace(/\r?\n$/, '');
  if (!line.trim()) return null;

  let pos = 0;
  let tags = {};
  if (line[0] === '@') {
    const sp = line.indexOf(' ');
    if (sp === -1) return null;
    tags = parseTags(line.slice(1, sp));
    pos = sp + 1;
  }

  while (line[pos] === ' ') pos += 1;
  let prefix = '';
  if (line[pos] === ':') {
    const sp = line.indexOf(' ', pos);
    if (sp === -1) return null;
    prefix = line.slice(pos + 1, sp);
    pos = sp + 1;
  }

  while (line[pos] === ' ') pos += 1;
  let trailing = '';
  let head = line.slice(pos);
  if (head.startsWith(':')) {
    trailing = head.slice(1);
    head = '';
  } else {
    const trIdx = head.indexOf(' :');
    if (trIdx !== -1) {
      trailing = head.slice(trIdx + 2);
      head = head.slice(0, trIdx);
    }
  }

  const parts = head.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const command = parts[0].toUpperCase();
  const params = parts.slice(1);
  const channel = params[0]?.startsWith('#') ? params[0].slice(1).toLowerCase() : '';
  const nick = prefix.split('!')[0].toLowerCase();

  let text = trailing;
  let isAction = false;
  if (command === 'PRIVMSG' && text.startsWith('\x01ACTION ') && text.endsWith('\x01')) {
    isAction = true;
    text = text.slice(8, -1);
  }

  return {
    tags,
    prefix,
    nick,
    command,
    params,
    channel,
    text,
    isAction,
    badges: parseBadgeTag(tags.badges),
    emotes: parseEmoteTag(tags.emotes),
  };
}

export function parseIrcFrame(frame) {
  if (typeof frame !== 'string' || !frame) return [];
  const results = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    const parsed = parseIrcLine(rawLine);
    if (parsed) results.push(parsed);
  }
  return results;
}
