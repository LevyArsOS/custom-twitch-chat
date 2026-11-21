# Glossary

Shared vocabulary of this project. Specs, code names, commits and discussions use these terms
exactly; a concept that needs a sentence to explain gets an entry here instead.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Overlay | Standalone browser view (`overlay.html` or exported `chat.html`) rendered inside OBS Browser Source | Configurator |
| Configurator | Web UI (`index.html`) used to edit settings, preview messages, and export OBS overlays | Overlay |
| Solo Emote | Message containing only emotes/emojis up to `emoteQuantity`, rendered at `emoteSoloSize` | Inline emote |
| Config Hash | Versioned URL fragment (`#c=1.<base64url>`) encoding config deltas from defaults | OAuth token |
| Device Code Flow | Public-client Twitch OAuth flow (`POST /oauth2/device`) authorized via user code and QR | Implicit grant |
| Shared Chat | Cross-channel Twitch session identified by IRC tag `source-room-id` showing origin avatar | Raid |
| Watch Streak | Twitch viewer milestone (`USERNOTICE viewermilestone`, `watch-streak`) rendered as highlighted row | Resubscription |
| Seam | Public interface where automated tests observe behavior without coupling to internals | Internal helper |
