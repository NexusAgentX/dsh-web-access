# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-14

### Added

- Official `card: 'web'` presentation for search and fetch results.
- Web UI overlay with activity, curator, config, and status tabs.
- Keyboard shortcuts `Ctrl+Shift+W` (activity) and `Ctrl+Shift+S` (curator).
- Background `includeContent` completion injects a plugin notice into the agent.
- Image/video frames are saved through `ctx.attachments` when available.
- Summary/answer generation uses `ctx.llm` when a harness model is configured.
- Session-scoped search/fetch cache that restores from disk when the same dsh session comes back.
- Saving keys in the Web UI invalidates provider caches so new credentials work without restart.
- Curator now mounts at `/dsh-web-access/curator` on the dsh web server (same origin, no extra port).
- Ships a `dsh.client` bundle that registers the overlay into `shell.overlay`.

## [0.1.0] - 2026-08-14

### Added

- Ported the pi-web-access search/fetch/PDF/GitHub/YouTube stack onto DeepSeek Harness.
- Registered `web_search` / `web_access_search`, `fetch_content`, `get_search_content`, and `source_check`.
- Registered optional `ctx.web` providers under id `web-access`.
- Added `/websearch`, `/curator`, `/search`, `/google-account`, and `/webaccess`.
- Kept compatibility with existing `~/.pi/web-search.json` configs.

## [0.0.1] - 2026-08-14

### Added

- Reserved the `dsh-web-access` npm name.
- Shipped an installable DeepSeek Harness bundle stub (`dsh.bundle`).
