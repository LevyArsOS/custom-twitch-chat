import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseIrcFrame } from '../../src/overlay/irc-parser.js';
import { tokenizeMessage } from '../../src/overlay/emotes.js';

describe('irc parser and emote tokenizer properties', () => {
  it('never throws when parsing arbitrary UTF-8 IRC frames', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (raw) => {
        const res = parseIrcFrame(raw);
        expect(Array.isArray(res)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it('never produces raw HTML tokens and keeps text lossless across arbitrary inputs', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.constantFrom('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'plain'),
        (prefix, payload) => {
          const input = `${prefix} ${payload}`;
          const { tokens } = tokenizeMessage(input, [], null, { enableTwemoji: true });
          for (const tok of tokens) {
            expect(['text', 'emote', 'emoji', 'mention']).toContain(tok.type);
            if (tok.type === 'emote') {
              expect(tok.url.startsWith('https://')).toBe(true);
            }
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
