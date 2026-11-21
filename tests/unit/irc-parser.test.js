import { describe, it, expect, vi } from 'vitest';
import {
  unescapeIrcTagValue,
  parseBadgeTag,
  parseEmoteTag,
  parseIrcLine,
  parseIrcFrame,
} from '../../src/overlay/irc-parser.js';
import { createIrcClient } from '../../src/overlay/irc-client.js';

describe('irc-parser', () => {
  it('unescapes IRCv3 tag values in a single pass', () => {
    expect(unescapeIrcTagValue('')).toBe('');
    expect(unescapeIrcTagValue('Hello\\sworld\\:\\\\n\\r\\n')).toBe('Hello world;\\n\r\n');
  });

  it('parses badges and emote ranges safely', () => {
    expect(parseBadgeTag('moderator/1,subscriber/12,bad')).toEqual([
      { type: 'moderator', version: '1' },
      { type: 'subscriber', version: '12' },
    ]);
    expect(parseEmoteTag('25:10-14,0-4/1902:16-20/bad:1-0')).toEqual([
      { id: '25', start: 0, end: 4 },
      { id: '25', start: 10, end: 14 },
      { id: '1902', start: 16, end: 20 },
    ]);
  });

  it('parses PRIVMSG, ACTION, USERNOTICE, PING, and malformed lines', () => {
    const action = parseIrcLine(
      '@badges=vip/1;flag-only;emotes=25:0-4 :alice!alice@alice.example.com PRIVMSG #demo :\x01ACTION waves Kappa\x01'
    );
    expect(action.command).toBe('PRIVMSG');
    expect(action.isAction).toBe(true);
    expect(action.text).toBe('waves Kappa');
    expect(action.channel).toBe('demo');
    expect(action.tags['flag-only']).toBe('');

    const streak = parseIrcLine(
      '@msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-value=9 :tmi.twitch.tv USERNOTICE #demo :yay'
    );
    expect(streak.command).toBe('USERNOTICE');
    expect(streak.tags['msg-param-value']).toBe('9');

    expect(parseIrcFrame('PING :tmi.twitch.tv\r\n\r\n:tmi.twitch.tv RECONNECT\r\n')).toHaveLength(2);
    expect(parseIrcLine(null)).toBeNull();
    expect(parseIrcLine('   ')).toBeNull();
    expect(parseIrcLine('@onlytag')).toBeNull();
    expect(parseIrcLine(':onlyprefix')).toBeNull();
    expect(parseIrcLine(':server :justtrailing')).toBeNull();
    expect(parseIrcFrame('')).toEqual([]);
  });
});

describe('irc-client', () => {
  it('handles handshake, PING/PONG, RECONNECT, backoff, and setChannel', () => {
    vi.useFakeTimers();
    const sockets = [];
    const statuses = [];
    const messages = [];

    const wsFactory = () => {
      const sock = {
        readyState: 0,
        sent: [],
        send(data) { this.sent.push(data); },
        close() { this.readyState = 3; this.onclose?.(); },
      };
      sockets.push(sock);
      return sock;
    };

    const idleClient = createIrcClient({ channel: '' });
    idleClient.connect();
    idleClient.disconnect();

    const client = createIrcClient({
      channel: '  #MyChan ',
      wsFactory,
      onMessage: (m) => messages.push(m),
      onStatus: (s) => statuses.push(s),
      backoffBaseMs: 100,
      maxBackoffMs: 400,
    });

    client.connect();
    expect(client.getChannel()).toBe('mychan');
    const s0 = sockets[0];
    s0.readyState = 1;
    s0.onopen();
    s0.onerror();
    expect(s0.sent[0]).toBe('CAP REQ :twitch.tv/tags twitch.tv/commands');
    expect(s0.sent[3]).toBe('JOIN #mychan');

    s0.onmessage({ data: 'PING\r\n:u!u@u.example.com PRIVMSG #mychan :hi\r\n' });
    expect(s0.sent.at(-1)).toBe('PONG :tmi.twitch.tv');
    expect(messages).toHaveLength(1);

    client.setChannel('mychan');
    client.setChannel('other');
    expect(s0.sent).toContain('PART #mychan');
    expect(s0.sent).toContain('JOIN #other');

    s0.onmessage({ data: ':tmi.twitch.tv RECONNECT\r\n' });
    expect(statuses).toContain('reconnecting');
    client.connect();
    vi.advanceTimersByTime(100);
    expect(sockets.length).toBeGreaterThanOrEqual(2);

    client.disconnect();
    expect(statuses.at(-1)).toBe('disconnected');
    client.setChannel('again');
    client.setChannel('');
    vi.useRealTimers();
  });
});
