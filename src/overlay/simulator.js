import { parseIrcLine } from './irc-parser.js';

let seq = 1;

function nextId() {
  seq += 1;
  return `sim-${seq}`;
}

export function createSimulator({ onIrcMessage, onEventSub }) {
  function emitIrc(rawLine) {
    const parsed = parseIrcLine(rawLine);
    if (parsed) return onIrcMessage(parsed);
    return Promise.resolve();
  }

  return {
    testMessage(channel = 'demo') {
      return emitIrc(
        `@badge-info=;badges=moderator/1;color=#5B99FF;display-name=ChatMod;emotes=25:21-25;id=${nextId()};mod=1;user-id=1001 :chatmod!chatmod@chatmod.example.com PRIVMSG #${channel} :Hello everyone! Kappa`
      );
    },
    testSolo(channel = 'demo') {
      return emitIrc(
        `@badges=subscriber/12;color=#FF69B4;display-name=ViewerOne;emotes=25:0-4/25:6-10;id=${nextId()};subscriber=1;user-id=1002 :viewerone!viewerone@viewerone.example.com PRIVMSG #${channel} :Kappa Kappa`
      );
    },
    testSub(channel = 'demo') {
      return emitIrc(
        `@badges=subscriber/1;color=#FF9F1C;display-name=NewSub;id=${nextId()};msg-id=resub;msg-param-cumulative-months=6;user-id=1003 :tmi.twitch.tv USERNOTICE #${channel} :Happy to be here!`
      );
    },
    testGift(channel = 'demo') {
      return emitIrc(
        `@badges=vip/1;color=#9147FF;display-name=Generous;id=${nextId()};msg-id=submysterygift;msg-param-mass-gift-count=5;user-id=1004 :tmi.twitch.tv USERNOTICE #${channel}`
      );
    },
    testCheer(channel = 'demo') {
      return emitIrc(
        `@badges=bits/100;bits=500;color=#00E5FF;display-name=BitSender;id=${nextId()};user-id=1005 :bitsender!bitsender@bitsender.example.com PRIVMSG #${channel} :Keep it up!`
      );
    },
    testRaid(channel = 'demo') {
      return emitIrc(
        `@badges=broadcaster/1;color=#FF4D6D;display-name=Raider;id=${nextId()};msg-id=raid;msg-param-viewerCount=42;user-id=1006 :tmi.twitch.tv USERNOTICE #${channel}`
      );
    },
    testWatchStreak(channel = 'demo') {
      return emitIrc(
        `@badges=subscriber/3;color=#BF94FF;display-name=LoyalFan;id=${nextId()};msg-id=viewermilestone;msg-param-category=watch-streak;msg-param-value=7;user-id=1007 :tmi.twitch.tv USERNOTICE #${channel} :Never missing a stream!`
      );
    },
    testPoints() {
      return onEventSub('channel.channel_points_custom_reward_redemption.add', {
        id: nextId(),
        user_id: '1008',
        user_login: 'redeemer',
        user_name: 'Redeemer',
        reward: { title: 'Hydrate' },
        user_input: 'Drink water!',
      });
    },
    testFollow() {
      return onEventSub('channel.follow', {
        user_id: '1009',
        user_login: 'newfollower',
        user_name: 'NewFollower',
      });
    },
    testDelete(channel = 'demo') {
      return emitIrc(`@target-msg-id=sim-${seq} :tmi.twitch.tv CLEARMSG #${channel} :deleted`);
    },
    testClear(channel = 'demo') {
      return emitIrc(`:tmi.twitch.tv CLEARCHAT #${channel}`);
    },
  };
}
