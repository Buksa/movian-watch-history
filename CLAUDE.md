# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Movian media player plugin that provides **global watch history tracking** across all video plugins. Tracks playback from any source (HLS, local files, UPNP/DLNA, torrents) and provides Continue Watching, Watch History, and Favorites features.

- **Runtime:** Movian's Duktape engine (ECMAScript 5.1 only — no ES6+, no arrow functions, no let/const, no template literals)
- **Module system:** CommonJS (require/exports)
- **No build step** — pure JS, no transpilation or bundling

## Running and Testing

```bash
# Run Movian with plugin loaded (debug mode)
showtime -d -p .

# Test with a specific video file
showtime -d -p . "file:///path/to/video.mp4"

# Syntax check all JS files
./dev/syntax-check.sh

# Monitor Movian props in real-time during playback
./dev/monitor_props.sh

# Query Movian HTTP API for debugging
curl http://localhost:42000/api/prop/global/media/current/url
curl http://localhost:42000/api/prop/global/media/current/metadata/duration
curl http://localhost:42000/api/prop/global/media/current/playstatus
```

Enable debug logging: Movian Settings → Watch History → Debug Mode.

## Architecture

### Entry Point and Initialization

`watchhistory.js` is the entry point (declared in `plugin.json`). It initializes modules in this order:
1. `navigation-observer.init()` — start tracking page navigation
2. `global-observer.init()` — start tracking playback
3. `bookmark-observer.init()` — subscribe to `currentpage.bookmarked` for favorites
4. Register page routes (`watchhistory:start`, `watchhistory:continue`, etc.)

### Core Data Flow

```
User navigates to video page
  → navigation-observer caches metadata (title, icon, canonicalUrl, duration)
    from currentpage.url or currentpage.source videoparams

Playback starts (prop.global.media.current.url becomes non-null)
  → global-observer.onPlaybackStart() retrieves cached metadata
  → Global subscriptions to metadata.title/duration/icon update session reactively
  → Records initial entry via history.record()

Playback stops (url becomes null)
  → global-observer.onPlaybackStop() waits 150ms for Movian to save position
  → Reads final position via metadata.bindPlayInfo() → kvstore
  → Records final entry with position/duration to history
```

### Key Modules

| File | Role |
|------|------|
| `src/global-observer.js` | Subscribes to `prop.global.media.current.url`; handles start/stop; global subscriptions to `metadata.title/duration/icon`; reads position via `bindPlayInfo` |
| `src/navigation-observer.js` | Caches videoparams from `currentpage.url` and `currentpage.source` before playback clears them |
| `src/history.js` | CRUD for history entries; `getContinue()` filters entries with progress < 90% |
| `src/storage.js` | Wraps Movian kvstore; `safeStringify()` handles Movian Prop objects that can't be directly JSON-serialized |
| `src/favorites.js` | Add/remove/toggle favorites |
| `src/bookmark-observer.js` | Subscribes to `currentpage.bookmarked`; adds/removes favorites when user toggles Movian's bookmark star |
| `src/log.js` | Debug logging with caller detection; toggled by settings |
| `pages/home.js` | Dashboard showing top 5 from continue/history/favorites |
| `pages/continue.js` | Full list of unfinished videos |
| `pages/history.js` | Full watch history |
| `pages/favorites.js` | Full favorites list |

### Critical Implementation Details

**Metadata timing problem:** By the time playback starts, `currentpage.url` is already cleared. The navigation-observer caches metadata when it first appears so global-observer can retrieve it later via `getLastVideoParams()`.

**Duration detection:** Two-tier approach: (1) cached from videoparams if available, (2) global `P.subscribe()` on `metadata.duration` with `autoDestroy: false` fires when duration becomes available after probe.

**Title resolution:** Global `P.subscribe()` on `metadata.title` resolves titles for UPNP, torrents, and local files when videoparams don't contain a title. The duration subscription callback also updates the history entry with the resolved title/icon, since duration arrives last in Movian's initialization sequence.

**Position reading:** On playback stop, waits 150ms then reads position from Movian's kvstore via `metadata.bindPlayInfo()` on a temporary prop, subscribing to `restartpos`.

**Prop serialization:** Movian Prop objects are proxies that break `JSON.stringify()`. `storage.js` has `safeStringify()` that detects them via `valueOf()` signature (`[prop ...]`) and converts to primitives.

**Cache race condition:** Navigation-observer cache is NOT cleared on `get` to prevent race conditions when multiple consumers read the cache.

## Constraints

- **ES5.1 only** — Duktape does not support ES6+. Use `var`, function expressions, string concatenation with `+`.
- All Movian APIs are synchronous prop subscriptions or callbacks — no Promises or async/await.
- History limited to 200 entries, favorites to 500 (configurable in settings).
- Plugin persists data to Movian's kvstore under namespace `watchhistory`.

## Documentation

Detailed technical docs are in `docs/`:
- `ARCHITECTURE.md` — full system architecture
- `implementation-notes.md` — technical findings and debugging notes
- `TESTING.md` — testing guide with debugging tools
- `PROPSYSTEM_COMPLETE_GUIDE.md` — Movian prop system reference
- `movian-playinfo-system.md` — how Movian stores/retrieves playback position
- `movian-event-types.md` — Movian event types reference
- `movian-scrobbler-itemhook-api.md` — Movian API reference (not used by plugin)
