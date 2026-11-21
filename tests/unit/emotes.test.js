import { describe, it, expect, vi } from 'vitest';
import { ENDPOINTS } from '../../src/shared/constants.js';
import { createEmoteCatalog, tokenizeMessage, codePointToTwemojiUrl } from '../../src/overlay/emotes.js';
import { createUserDirectory, pickDefaultColor } from '../../src/overlay/users.js';
import { createBadgeResolver } from '../../src/overlay/badges.js';

describe('emote catalog and tokenizer', () => {
  it('merges global and channel catalogs with precedence Channel > Global and 7TV > BTTV > FFZ', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('7tv.io/v3/emote-sets/global')) {
        return { ok: true, json: async () => ({ emotes: [{ id: 'g7', name: 'Shared' }, { name: 'Bad7' }] }) };
      }
      if (url.includes('betterttv.net/3/cached/emotes/global')) {
        return { ok: true, json: async () => [{ id: 'gb', code: 'Shared' }, { id: 'gb2', code: 'CatJam' }, { id: 'x' }] };
      }
      if (url.includes('frankerfacez.com/v1/set/global')) {
        return { ok: true, json: async () => ({ sets: { 1: { emoticons: [{ name: 'CatJam', urls: { 2: '//cdn.ffz.example.com/1' } }, { name: 'Tiny', urls: { 1: 'https://cdn.ffz.example.com/t1' } }] }, 2: {} } }) };
      }
      if (url.includes('7tv.io/v3/users/twitch/999')) {
        return { ok: true, json: async () => ({ emote_set: { emotes: [{ id: 'c7', name: 'CatJam', data: { host: { url: '//cdn.7tv.app/emote/c7' } } }] } }) };
      }
      if (url.includes('betterttv.net/3/cached/users/twitch/999')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes('frankerfacez.com/v1/room/id/999')) {
        return { ok: false };
      }
      throw new Error('network down');
    });

    const catalog = createEmoteCatalog({ fetchImpl: fetchMock });
    await catalog.loadGlobal();
    await catalog.loadGlobal();
    await catalog.loadChannel('');
    await catalog.loadChannel('999');

    const map = catalog.buildMap();
    expect(map.get('Shared').url).toContain('cdn.7tv.app/emote/g7');
    expect(map.get('CatJam').url).toContain('cdn.7tv.app/emote/c7');
    expect(map.get('Tiny').url).toBe('https://cdn.ffz.example.com/t1');

    const bttvOnly = catalog.buildMap({ enable7tv: false, enableBttv: true, enableFfz: false });
    expect(bttvOnly.get('CatJam').url).toContain('cdn.betterttv.net/emote/gb2');
    await catalog.loadChannel('fail');
  });

  it('aligns Twitch emotes on Unicode code points, handles mentions, Twemoji, and solo limits', () => {
    const map = new Map([['KEKW', { url: 'https://7tv.example/kekw/2x', urlHi: 'https://7tv.example/kekw/3x' }]]);
    const msg = tokenizeMessage('😀 Kappa @Alice KEKW', [{ id: '25', start: 2, end: 6 }], map, { emoteQuantity: 3 });

    expect(msg.isSoloEmotes).toBe(false);
    expect(msg.tokens.find((t) => t.type === 'emoji').url).toBe(codePointToTwemojiUrl('😀'));
    expect(msg.tokens.find((t) => t.type === 'emote' && t.name === 'Kappa').url).toContain('/25/default/dark/2.0');
    expect(msg.tokens.find((t) => t.type === 'mention')).toEqual({ type: 'mention', text: '@Alice', username: 'alice' });

    const plainEmoji = tokenizeMessage('😀 hi', [], null, { enableTwemoji: false });
    expect(plainEmoji.tokens[0]).toEqual({ type: 'text', text: '😀' });

    const solo = tokenizeMessage('KEKW 🔥', [], map, { emoteQuantity: 2 });
    expect(solo.isSoloEmotes).toBe(true);
    const notSolo = tokenizeMessage('KEKW 🔥 😂', [], map, { emoteQuantity: 2 });
    expect(notSolo.isSoloEmotes).toBe(false);
  });
});

describe('user directory and badge resolver', () => {
  it('deduplicates concurrent lookups and falls back on HTTP/network failure', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (url) => {
      calls += 1;
      if (url.includes('id=123')) {
        return { ok: true, json: async () => [{ id: '123', login: 'alice', logo: 'https://img.example/a.png', chatColor: '#123456' }] };
      }
      if (url.includes('login=minimal')) {
        return { ok: true, json: async () => [{}] };
      }
      if (url.includes('login=empty')) {
        return { ok: true, json: async () => [] };
      }
      if (url.includes('login=http500')) {
        return { ok: false, status: 500 };
      }
      throw new Error('offline');
    });

    const users = createUserDirectory({ fetchImpl: fetchMock });
    const [a1, a2] = await Promise.all([users.getAvatarById('123'), users.getAvatarById('123')]);
    expect(a1).toBe('https://img.example/a.png');
    expect(a2).toBe(a1);
    expect(calls).toBe(1);
    expect(await users.getUserColor('alice')).toBe('#123456');

    expect(await users.getAvatarByLogin('minimal')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getUserColor('minimal')).toBe(pickDefaultColor('minimal'));
    expect(await users.getAvatarByLogin('empty')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getAvatarByLogin('http500')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getAvatarByLogin('nobody')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getUserColor('nobody')).toBe(pickDefaultColor('nobody'));
    expect(await users.getAvatarById('')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getAvatarByLogin('')).toBe(ENDPOINTS.DEFAULT_AVATAR);
    expect(await users.getUserColor('')).toBe('#FFFFFF');
  });

  it('resolves channel badges over global badges and survives IVR failures', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('global')) {
        return { ok: true, json: async () => [{ set_id: 'moderator', versions: [{ id: '1', image_url_2x: 'https://b.example/gmod' }] }] };
      }
      if (url.includes('login=ok')) {
        return { ok: true, json: async () => [{ set_id: 'subscriber', versions: [{ id: '0', image_url_1x: 'https://b.example/csub' }] }] };
      }
      return { ok: false };
    });

    const resolver = createBadgeResolver({ fetchImpl: fetchMock });
    await resolver.loadGlobal();
    await resolver.loadGlobal();
    await resolver.loadChannel('ok');
    expect(resolver.resolve([{ type: 'moderator', version: '1' }, { type: 'subscriber', version: '0' }, { type: 'missing', version: '9' }])).toEqual([
      { type: 'moderator', version: '1', url: 'https://b.example/gmod' },
      { type: 'subscriber', version: '0', url: 'https://b.example/csub' },
    ]);

    await resolver.loadChannel('');
    await resolver.loadChannel('broken');
    expect(resolver.resolve([{ type: 'subscriber', version: '0' }])).toEqual([]);
    expect(resolver.resolve(null)).toEqual([]);

    const brokenResolver = createBadgeResolver({ fetchImpl: async () => { throw new Error('down'); } });
    await brokenResolver.loadGlobal();
    await brokenResolver.loadChannel('any');
  });
});
