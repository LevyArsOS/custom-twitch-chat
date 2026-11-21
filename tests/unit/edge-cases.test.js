import { describe, it, expect, vi } from 'vitest';
import { getDefaultConfig } from '../../src/shared/config.js';
import { applyOverlayStyles } from '../../src/overlay/style.js';
import { createBadgeResolver } from '../../src/overlay/badges.js';
import { createRenderer } from '../../src/overlay/render.js';
import { createEventRouter } from '../../src/overlay/events.js';
import { parseIrcLine } from '../../src/overlay/irc-parser.js';

describe('overlay edge cases and fallbacks', () => {
  it('handles style defaults and reuses existing head elements', () => {
    document.head.innerHTML = '';
    const cfg = { ...getDefaultConfig(), fontName: '', customCSS: undefined, animationOut: 'fadeOut' };
    applyOverlayStyles(document, cfg);
    applyOverlayStyles(document, { ...cfg, fontName: 'Roboto', customCSS: 'body{}' });
    expect(document.getElementById('ctc-google-font').href).toContain('Roboto');
    expect(document.getElementById('ctc-custom-css').textContent).toBe('body{}');
  });

  it('handles badge 4x fallback and incomplete badge payloads', async () => {
    const resolver = createBadgeResolver({
      fetchImpl: async () => ({
        ok: true,
        json: async () => [null, { set_id: 'vip', versions: [{ id: '1', image_url_4x: 'https://b.example/4x' }, {}] }],
      }),
    });
    await resolver.loadGlobal();
    expect(resolver.resolve([{ type: 'vip', version: '1' }])[0].url).toBe('https://b.example/4x');
  });

  it('handles merged message deletion, clearAll with active timers, and unknown notice types', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="c"></div>';
    const container = document.getElementById('c');
    const config = { ...getDefaultConfig(), lang: 'en', mergeMessages: 'yes', hideAfter: 10 };
    const userDirectory = {
      getAvatarById: vi.fn(async () => 'https://img.example/u.png'),
      getUserColor: vi.fn(async () => ''),
    };
    const badgeResolver = { resolve: () => [] };
    const emoteCatalog = { loadChannel: vi.fn(async () => {}), buildMap: () => new Map() };

    const renderer = createRenderer({ container, config, userDirectory });
    const router = createEventRouter({ config, renderer, userDirectory, badgeResolver, emoteCatalog });

    await router.handleIrcMessage(parseIrcLine('@id=a1;user-id=7 :u!u@u.example.com PRIVMSG #d :hi @someone'));
    await router.handleIrcMessage(parseIrcLine('@id=a2;user-id=7 :u!u@u.example.com PRIVMSG #d :more'));
    await router.handleIrcMessage(parseIrcLine('@id=s1;msg-id=resub;msg-param-cumulative-months=2 :tmi.twitch.tv USERNOTICE #d :woo'));
    await router.handleIrcMessage(parseIrcLine(':tmi.twitch.tv PRIVMSG #d :anonymous sender'));
    await router.handleIrcMessage(parseIrcLine('@id=ws2;msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-value=4 :tmi.twitch.tv USERNOTICE #d'));
    router.handleIrcMessage(parseIrcLine('@id=ign1;msg-id=viewermilestone;msg-param-category=other :tmi.twitch.tv USERNOTICE #d'));
    router.handleIrcMessage(parseIrcLine('@id=ign2;msg-id=unknownnotice :tmi.twitch.tv USERNOTICE #d'));
    await router.handleIrcMessage(parseIrcLine('@id=ann2;msg-id=announcement;msg-param-color=UNKNOWN :tmi.twitch.tv USERNOTICE #d :hello'));
    await router.handleEventSub('channel.follow', { user_id: '8', user_login: 'logonly' });

    renderer.setConfig({ ...config, nameSuffix: undefined, alignMessages: 'block', messagesLimit: 2 });
    renderer.addMessage({ id: 'x1', userId: 'u1', displayName: 'One', tokens: [{ type: 'emoji', alt: '🔥', url: 'https://e/1.png' }], isSoloEmotes: true, roles: ['role-mod'] });
    renderer.addMessage({ id: 'x2', userId: 'u1', displayName: 'One', tokens: [{ type: 'text', text: '2' }] });
    renderer.addMessage({ id: 'x3', userId: 'u2', displayName: 'Two', tokens: [{ type: 'text', text: '3' }] });
    renderer.addMessage({ id: 'x4', userId: 'u3', displayName: 'Three', tokens: [{ type: 'text', text: '4' }] });
    await router.handleIrcMessage(parseIrcLine('@badges=broadcaster/1;mod=1;subscriber=1;id=bc1 :bc!bc@bc.example.com PRIVMSG #d :hey'));
    await router.handleEventSub('channel.channel_points_custom_reward_redemption.add', { user_login: 'p2' });
    await router.handleEventSub('channel.follow', { user_login: 'f2' });

    renderer.deleteMessage('a2');
    expect(container.querySelectorAll('[data-msgid="a2"]')).toHaveLength(0);
    renderer.clearAll();
    expect(container.children).toHaveLength(0);
    vi.advanceTimersByTime(15000);
    vi.useRealTimers();
  });
});
