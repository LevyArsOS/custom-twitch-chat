# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versioning: [SemVer](https://semver.org).

## [0.2.0] - 2026-11-21

### Added
- **events:** add per-event color/toggle settings (`subColor`, `cheerColor`, `pointsColor`, `raidColor`, `streakColor`, `followColor`, `showHighlights`, `highlightColor`, `showFirstMsg`, `firstMsgColor`) and simulator actions (`testHighlight`, `testFirstMsg`) [#9] (e37dd11)
- **community:** add MIT `LICENSE`, `.github/FUNDING.yml`, `.github/ISSUE_TEMPLATE/*`, and README badges [#10] (37df6ce)
- **branding:** add repository icon, 1280x640 social preview, favicon, and OpenGraph metadata [#11] (4037351)

### Changed
- **layout:** lock desktop configurator layout to `100vh` with matched sidebar/main heights and no right-panel scrolling [#9] (e37dd11)

### Fixed
- **ci:** fallback to `secrets.TWITCH_CLIENT_ID` in GitHub Pages workflow [#8] (c9fe206)

## [0.1.0] - 2026-11-21

### Added
- **generator:** add configurator controller with autosave and presets [#5] (bee6aca)
- **generator:** add configurator HTML shell and styles [#4] (b22f656)
- **overlay:** add overlay runtime bootstrap and preview bridge [#3] (7897d14)
- **events:** add IRC and EventSub message router [#2] (8147962)
- **i18n:** add translator and theme presets [#1] (c34ae0f)

### Fixed
- **irc:** trim channel names and isolate test CSS loading [#2] (50482ec)
- **config:** make channel normalization idempotent [#1] (935e237)

### Documentation
- add English and Portuguese setup guides [#6] (ea13ba3)

