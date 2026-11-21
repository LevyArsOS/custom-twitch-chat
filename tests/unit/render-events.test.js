import { describe, it, expect, vi } from 'vitest';
import { getDefaultConfig } from '../../src/shared/config.js';
import { applyOverlayStyles } from '../../src/overlay/style.js';
import { createRenderer } from '../../src/overlay/render.js';
import { createEventRouter } from '../../src/overlay/events.js';
import { createSimulator } from '../../src/overlay/simulator.js';
import { parseIrcLine } from '../../src/overlay/irc-parser.js';

function makeHarness(overrides = {}) {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="chat"></div>';
  const container = document.getElementById('chat');
  const config = { ...getDefaultConfig(), lang: 'en', ...overrides };
  const userDirectory = {
    getAvatarById: vi.fn(async (id) => `https://img.example/${id}.png`),
    getUserColor: vi.fn(async () => '#ABCDEF'),
  };
  const badgeResolver = { resolve: vi.fn((list) => list.map((b) => ({ ...b, url: `https://b.example/${b.type}` }))) };
  const emoteCatalog = { loadChannel: vi.fn(async () => {}), buildMap: vi.fn(() => new Map()) };

  const renderer = createRenderer({ container, config, userDirectory });
  const router = createEventRouter({ config, renderer, userDirectory, badgeResolver, emoteCatalog, onRoomId: vi.fn() });
  const simulator = createSimulator({ onIrcMessage: router.handleIrcMessage, onEventSub: router.handleEventSub });
  return { container, config, renderer, router, simulator, userDirectory };
}

describe('style, renderer, events, and simulator', () => {
  it('applies CSS custom properties, safe image URLs, and animate.css only when enabled', () => {
    document.head.innerHTML = '';
    const cfg = { ...getDefaultConfig(), fontName: 'Inter', customCSS: '.x { opacity: 1; }', textBackgroundImage: 'https://img.example/bg.png', messageBackgroundImage: 'javascript:alert(1)' };
    applyOverlayStyles(document, cfg);
    expect(document.documentElement.style.getPropertyValue('--ctc-text-bg-image')).toBe('url("https://img.example/bg.png")');
    expect(document.documentElement.style.getPropertyValue('--ctc-msg-bg-image')).toBe('none');
    expect(document.getElementById('ctc-animate-css')).toBeNull();
    expect(document.getElementById('ctc-custom-css').textContent).toBe('.x { opacity: 1; }');

    applyOverlayStyles(document, { ...cfg, animationIn: 'lightSpeedIn' });
    expect(document.getElementById('ctc-animate-css')).not.toBeNull();
  });

  it('blocks XSS payloads in chat and rewards, merges consecutive messages, and prunes limits', async () => {
    const { container, router, simulator } = makeHarness({ mergeMessages: 'yes', messagesLimit: 2 });

    await router.handleIrcMessage(parseIrcLine('@id=m1;user-id=42;display-name=Alice :alice!alice@alice.example.com PRIVMSG #c :<script>alert(1)</script> @bob'));
    await router.handleIrcMessage(parseIrcLine('@id=m2;user-id=42;display-name=Alice :alice!alice@alice.example.com PRIVMSG #c :second line'));
    expect(container.children).toHaveLength(1);
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelector('.user-message').textContent).toContain('<script>alert(1)</script>');

    await router.handleEventSub('channel.channel_points_custom_reward_redemption.add', {
      id: 'p1', user_id: '77', user_name: 'Bad', reward: { title: '<img src=x onerror=alert(1)>' }, user_input: '<b>hi</b>',
    });
    expect(container.querySelectorAll('b')).toHaveLength(0);
    expect(container.querySelector('.points-message .user-message').textContent).toContain('<img src=x onerror=alert(1)>');

    await simulator.testWatchStreak('demo');
    expect(container.children).toHaveLength(2);
    expect(container.querySelector('.streak')).not.toBeNull();
  });

  it('handles simulator events, filters, deletions, shared chat, and hideAfter timers', async () => {
    vi.useFakeTimers();
    const { container, router, simulator } = makeHarness({
      alignMessages: 'block',
      hideAfter: 5,
      animationIn: 'lightSpeedIn',
      animationOut: 'fadeOut',
      nickColor: 'custom',
      customNickColor: '#112233',
      blockedWords: 'badword',
    });

    await router.handleIrcMessage(parseIrcLine(':tmi.twitch.tv ROOMSTATE #demo'));
    await router.handleIrcMessage(parseIrcLine('@room-id=555 :tmi.twitch.tv ROOMSTATE #demo'));
    await router.handleIrcMessage(parseIrcLine('@id=cmd;user-id=1 :u!u@u.example.com PRIVMSG #demo :!ping'));
    await router.handleIrcMessage(parseIrcLine('@id=ign;user-id=2 :nightbot!n@n.example.com PRIVMSG #demo :ignored'));
    await router.handleIrcMessage(parseIrcLine('@id=blk;user-id=3 :u!u@u.example.com PRIVMSG #demo :contains BADWORD'));
    expect(container.children).toHaveLength(0);

    await simulator.testMessage('demo');
    await simulator.testSolo('demo');
    await simulator.testSub('demo');
    await simulator.testGift('demo');
    await simulator.testCheer('demo');
    await simulator.testRaid('demo');
    await simulator.testPoints();
    await simulator.testFollow();
    await router.handleIrcMessage(parseIrcLine('@id=sc1;user-id=9;source-room-id=88;first-msg=1;msg-id=highlighted-message;reply-parent-display-name=Mod :u!u@u.example.com PRIVMSG #demo :hi'));
    await router.handleIrcMessage(parseIrcLine('@id=ann1;user-id=10;msg-id=announcement;msg-param-color=BLUE :tmi.twitch.tv USERNOTICE #demo :News'));

    expect(container.querySelector('.avatar.origin')).not.toBeNull();
    expect(container.querySelector('.reply-context')).not.toBeNull();
    expect(container.querySelector('.announcement')).not.toBeNull();

    await simulator.testDelete('demo');
    await router.handleIrcMessage(parseIrcLine('@target-user-id=9 :tmi.twitch.tv CLEARCHAT #demo'));
    vi.advanceTimersByTime(6500);
    expect(container.children).toHaveLength(0);

    await simulator.testClear('demo');
    vi.useRealTimers();
  });

  it('deduplicates IRC custom-reward-id when EventSub points is active and handles emoji image errors', async () => {
    const { container, router } = makeHarness();
    await router.handleIrcMessage(parseIrcLine('@id=cp1;user-id=11;custom-reward-id=r1 :u!u@u.example.com PRIVMSG #demo :🔥'));
    expect(container.querySelectorAll('.points-message')).toHaveLength(1);
    const emojiImg = container.querySelector('.points-message img.emote');
    emojiImg.dispatchEvent(new Event('error'));
    expect(container.querySelector('.points-message .user-message').textContent).toContain('🔥');

    router.setEventSubPointsActive(true);
    await router.handleIrcMessage(parseIrcLine('@id=cp2;user-id=12;custom-reward-id=r1 :u!u@u.example.com PRIVMSG #demo :ignored irc'));
    expect(container.querySelectorAll('.points-message')).toHaveLength(1);
  });

  it('covers all sub notice variants, nickColor modes, animationOut none, and setConfig', async () => {
    vi.useFakeTimers();
    const { container, renderer, router } = makeHarness({
      hideAfter: 2, animationOut: 'none', nickColor: 'remove', alignMessages: 'block', mergeMessages: 'yes', messagesLimit: 20,
    });
    await router.handleIrcMessage(parseIrcLine('@id=m1;user-id=99 :u!u@u.example.com PRIVMSG #demo :first'));
    await router.handleIrcMessage(parseIrcLine('@id=m2;user-id=99 :u!u@u.example.com PRIVMSG #demo :merged'));
    renderer.deleteMessage('missing');
    renderer.deleteUserMessages('missing');
    expect(container.children).toHaveLength(1);

    for (const tags of [
      'msg-id=sub;msg-param-sub-plan=Prime',
      'msg-id=sub;msg-param-sub-plan=1000',
      'msg-id=resub',
      'msg-id=subgift;msg-param-recipient-display-name=Bob',
      'msg-id=anonsubgift',
      'msg-id=submysterygift',
      'msg-id=giftpaidupgrade',
      'msg-id=primepaidupgrade',
      'msg-id=viewermilestone;msg-param-category=watch-streak',
      'msg-id=raid',
      'msg-id=announcement',
    ]) {
      await router.handleIrcMessage(parseIrcLine(`@id=${tags};${tags};badges=founder/0,vip/1 :tmi.twitch.tv USERNOTICE #demo`));
    }
    expect(container.querySelectorAll('.sub-message').length).toBeGreaterThanOrEqual(6);

    vi.advanceTimersByTime(3000);
    expect(container.children).toHaveLength(0);

    const updated = {
      ...getDefaultConfig(),
      lang: 'en',
      showSubs: 'no',
      showRaids: 'no',
      showStreaks: 'no',
      showCheers: 'no',
      showAnnouncements: 'no',
      showPoints: 'no',
      showFollows: 'no',
      nickColor: 'messagecolor',
    };
    renderer.setConfig(updated);
    router.setConfig(updated);
    await router.handleIrcMessage(null);
    await router.handleIrcMessage(parseIrcLine(':tmi.twitch.tv NOTICE #demo :ignored'));
    await router.handleIrcMessage(parseIrcLine('@id=s;msg-id=sub :tmi.twitch.tv USERNOTICE #demo'));
    await router.handleIrcMessage(parseIrcLine('@id=r;msg-id=raid :tmi.twitch.tv USERNOTICE #demo'));
    await router.handleIrcMessage(parseIrcLine('@id=st;msg-id=viewermilestone;msg-param-category=watch-streak :tmi.twitch.tv USERNOTICE #demo'));
    await router.handleIrcMessage(parseIrcLine('@id=a;msg-id=announcement :tmi.twitch.tv USERNOTICE #demo :x'));
    await router.handleIrcMessage(parseIrcLine('@id=b;bits=10 :u!u@u.example.com PRIVMSG #demo :x'));
    await router.handleIrcMessage(parseIrcLine('@id=p;custom-reward-id=1 :u!u@u.example.com PRIVMSG #demo :x'));
    await router.handleEventSub('channel.channel_points_custom_reward_redemption.add', null);
    await router.handleEventSub('channel.channel_points_custom_reward_redemption.add', { user_id: '1' });
    await router.handleEventSub('channel.follow', { user_id: '1' });
    await router.handleIrcMessage(parseIrcLine('@id=act1;user-id=50 :u!u@u.example.com PRIVMSG #demo :\x01ACTION dances\x01'));
    expect(container.querySelectorAll('.sub-message')).toHaveLength(0);
    expect(container.querySelector('.action')).not.toBeNull();
    vi.useRealTimers();
  });
});
