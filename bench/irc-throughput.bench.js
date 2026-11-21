import { bench, describe } from 'vitest';
import { parseIrcLine } from '../src/overlay/irc-parser.js';
import { tokenizeMessage } from '../src/overlay/emotes.js';

const SAMPLE_LINE =
  '@badge-info=subscriber/12;badges=moderator/1,subscriber/12;color=#5B99FF;display-name=BenchUser;emotes=25:6-10;id=bench-1;mod=1;user-id=1001 :bench!bench@bench.example.com PRIVMSG #demo :Hello Kappa @friend KEKW 🔥';
const THIRD_PARTY = new Map([['KEKW', { url: 'https://cdn.7tv.app/emote/1/2x.webp', urlHi: 'https://cdn.7tv.app/emote/1/3x.webp' }]]);

describe('IRC parse and tokenize throughput', () => {
  bench('parseIrcLine + tokenizeMessage', () => {
    const msg = parseIrcLine(SAMPLE_LINE);
    tokenizeMessage(msg.text, msg.emotes, THIRD_PARTY, { emoteQuantity: 3 });
  });
});
