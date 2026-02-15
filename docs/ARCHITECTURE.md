# Watch History Plugin - Complete Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Data Flow](#data-flow)
4. [Core Components](#core-components)
5. [How History Recording Works](#how-history-recording-works)
6. [Storage System](#storage-system)
7. [UI Pages](#ui-pages)
8. [Key Design Decisions](#key-design-decisions)

---

## Overview

Watch History is a global plugin for Movian that tracks video playback across all plugins and sources. It provides:
- **Continue Watching** - Resume unfinished content
- **Watch History** - Full history of watched content
- **Favorites** - Manually saved items
- **Auto-resume** - Automatic position restoration

**Supported Stream Types:** HLS, MP4, UPNP, Torrent, Local files

---

## File Structure

```
watchhistory.js              # Entry point - initializes all components
├── src/
│   ├── log.js               # Logging utility with debug mode
│   ├── storage.js           # Persistent storage wrapper (Movian store)
│   ├── history.js           # History management (record, list, find)
│   ├── favorites.js         # Favorites management (add, remove, toggle)
│   ├── navigation-observer.js  # Tracks page navigation, caches videoparams
│   ├── global-observer.js   # Main playback tracker (media.current.url)
│   └── bookmark-observer.js # Subscribes to currentpage.bookmarked for favorites
├── pages/
│   ├── home.js              # Main page with sections
│   ├── continue.js          # "Continue Watching" page
│   ├── history.js           # Full history page
│   └── favorites.js         # Favorites page
└── docs/
    ├── ARCHITECTURE.md              # This file — full system architecture
    ├── TESTING.md                   # Testing guide with debugging tools
    ├── PROPSYSTEM_COMPLETE_GUIDE.md # Movian prop system reference
    ├── movian-playinfo-system.md    # How Movian stores/retrieves playback position
    ├── movian-event-types.md        # Movian event types reference
    └── movian-scrobbler-itemhook-api.md # Movian API reference (not used by plugin)
```

---

## Data Flow

### Complete Recording Flow

```
User clicks video in any plugin
    ↓
[navigation-observer.js]
    - Detects currentpage.url change
    - Parses videoparams from url/source
    - Caches: title, canonicalUrl, duration, icon
    ↓
[global-observer.js]
    - Detects media.current.url change (video started)
    - Calls onPlaybackStart(url)
    ↓
[onPlaybackStart]
    1. Checks for duplicate session (race condition protection)
    2. Reads cached videoparams from navigation-observer
    3. Sets pendingDurationUpdate flag if duration unknown
    4. Creates session object
    5. Records to history: position=0, duration
    ↓
User watches video...
    ↓
Video stops (user exits or switches)
    ↓
[global-observer.js]
    - Detects media.current.url = null
    - Calls onPlaybackStop()
    ↓
[onPlaybackStop]
    1. Clears pending flags and global metadata
    2. Waits 150ms for Movian to save restartpos
    3. Reads position via bindPlayInfo → kvstore
    4. Calculates final duration
    5. Records to history: final position, duration
    ↓
[history.js]
    - Removes old entry if exists
    - Calculates progress %
    - Adds entry to beginning of list
    - Trims to MAX_HISTORY limit
    - Saves via storage.js
    ↓
[storage.js]
    - Serializes with safeStringify (handles Prop objects)
    - Saves to Movian store
    ↓
Data available in UI (Home, Continue, History pages)
```

---

## Core Components

### 1. navigation-observer.js

**Purpose:** Track page navigation and cache videoparams metadata.

**Key Functions:**
```javascript
init()                          // Subscribe to currentpage.url changes
getLastUrl()                    // Get parent/details page URL
getLastVideoParams(caller)      // Get cached videoparams (not cleared)
getLastCachedDuration(caller)   // Get cached duration
parseVideoParams(url)           // Parse videoparams: JSON from URL
```

**Caching Strategy:**
- Caches videoparams when navigating to video page
- Cache persists until replaced by new video (not cleared on read)
- Priority: source URL > page URL (for UPNP sources)

**Navigation Stack:**
- Internal to navigation-observer for tracking page URLs
- Used to determine parentUrl (last non-player page)
- Not exported to sessions or history entries
- Max 15 entries

### 2. global-observer.js

**Purpose:** Main playback tracking for all stream types.

**Key Functions:**
```javascript
init()                          // Subscribe to media.current.url
onPlaybackStart(url)            // Handle video start
onPlaybackStop()                // Handle video stop
readRestartPos(url, callback)   // Read position from kvstore
createSession(data)             // Create tracking session
```

**Duration Detection:**
1. First check: cached duration from videoparams (if known upfront)
2. Second: Global subscription to `metadata.duration` via `P.subscribe()` with `autoDestroy: false` — fires when duration becomes available after probe

**Race Condition Protection:**
```javascript
if (currentSession && currentSession.url === url) {
    return; // Skip if already tracking this URL
}
```

**Session Object:**
```javascript
{
    canonicalUrl: string,       // Unique video ID
    url: string,               // Stream URL
    title: string,             // Video title
    icon: string,              // Thumbnail/icon URL
    parentUrl: string,         // Details page URL
    startTime: number,         // Session start timestamp
    duration: number           // Video duration in seconds
}
```

### 3. history.js

**Purpose:** Manage watch history data.

**Key Functions:**
```javascript
record(data, position, duration)    // Add/update entry
list(limit)                         // Get all history
getContinue(limit)                  // Get unfinished items
find(canonicalUrl)                  // Find specific entry
remove(canonicalUrl)                // Delete entry
markFinished(canonicalUrl)          // Mark as 100%
```

**History Entry Structure:**
```javascript
{
    canonicalUrl: string,       // Unique ID
    url: string,              // Stream URL
    parentUrl: string,        // Navigation URL
    title: string,
    icon: string,
    position: number,         // Seconds watched
    duration: number,         // Total seconds
    progress: number,         // Percentage 0-100
    source: string,           // Plugin name
    watchedAt: number         // Timestamp
}
```

**Logic:**
- Removes old entry if exists (moves to top)
- Calculates progress: `(position / duration) * 100`
- Limits list to 200 entries (MAX_HISTORY)
- "Continue Watching" filter: `position > 0 && progress < 90%`

### 4. storage.js

**Purpose:** Persistent storage wrapper with Movian Prop object handling.

**Key Functions:**
```javascript
get(key, defaultValue)      // Retrieve and parse JSON
set(key, value)             // Serialize and store
remove(key)                 // Delete key
```

**Safe Serialization:**
```javascript
function safeStringify(obj) {
    return JSON.stringify(obj, function(key, val) {
        // Convert Movian Prop objects to strings
        if (val && val.valueOf && String(val.valueOf()).includes('[prop')) {
            return String(val);
        }
        // Handle circular references
        if (seen.includes(val)) return '[Circular]';
        return val;
    });
}
```

**Storage Format:**
```javascript
// Movian store creates 'watchhistory' namespace
db['history'] = '[{...}, {...}]'     // JSON string
db['favorites'] = '[{...}, {...}]'
```

### 5. favorites.js

**Purpose:** Manage user favorites.

**Key Functions:**
```javascript
add(item)           // Add to favorites
remove(url)         // Remove from favorites
toggle(item)        // Add if not exists, remove if exists
has(url)            // Check if favorite
list(limit)         // Get favorites
```

**Favorites Entry:**
```javascript
{
    url: string,
    title: string,
    icon: string,
    source: string,
    addedAt: number
}
```

### 6. bookmark-observer.js

**Purpose:** Add/remove favorites when user toggles Movian's bookmark star.

**Approach:** Subscribes to `currentpage.bookmarked` prop, which reflects the bookmark state of the current page. When the user bookmarks a page (via Movian's native UI), the observer detects the state change and adds/removes the item from Watch History favorites.

**Subscriptions (4 total, all with default options):**
1. `currentpage.url` — tracks page changes, resets cached state
2. `currentpage.model.metadata.title` — caches current page title
3. `currentpage.model.metadata.icon` — caches current page icon
4. `currentpage.bookmarked` — detects bookmark toggle (0→1 = add, 1→0 = remove)

**Initial-state detection:**
Uses `lastBookmarked === null` to distinguish the initial subscription callback (which fires with the current bookmarked value) from actual user toggles. Only acts on real state changes after the initial value is received.

---

## How History Recording Works

### Step-by-Step Recording Process

#### 1. Initial Recording (Video Start)

**When:** `media.current.url` changes from null to URL

**Actions:**
```javascript
// global-observer.js:onPlaybackStart
1. Check for duplicate session
2. Get videoparams from navigation-observer cache
3. Determine duration:
   - If videoparams.duration > 0: use it (known upfront)
   - Else: set pendingDurationUpdate flag; global duration subscription handles update
4. Record to history with position=0
```

**Why position=0:**
- Marks video as "started watching"
- Allows "Continue Watching" to show it
- Real position will be updated on stop

#### 2. Duration Detection

**Method A - Known upfront (e.g., Anilibria):**
```javascript
// videoparams contains duration from API
duration = videoParams.duration;  // 1425 seconds
```

**Method B - Global subscription (e.g., hdrezka, UPNP, torrent, local):**
```javascript
// Global subscription set up once at module load (not per-session)
P.subscribe(P.global.media.current.metadata.duration, function(type, v1) {
    if (type === 'set' && v1 > 0 && currentSession && pendingDurationUpdate) {
        currentSession.duration = safeNumber(v1, 0);
        pendingDurationUpdate = false;
        // Also updates title/icon from parallel subscriptions
        history.record(currentSession, 0, currentSession.duration);
    }
}, { autoDestroy: false });
```

#### 3. Final Recording (Video Stop)

**When:** `media.current.url` changes to null

**Actions:**
```javascript
// global-observer.js:onPlaybackStop
1. Clear pending flags and global metadata
2. Wait 150ms (Movian saves restartpos asynchronously)
3. Read position via bindPlayInfo:
   - Create temp prop
   - Call metadata.bindPlayInfo(prop, canonicalUrl)
   - Subscribe to prop.restartpos
4. Get final duration from session or metadata
5. Calculate progress: (position / duration) * 100
6. Record to history
```

**Why 150ms delay:**
- Movian saves `restartposition` to kvstore asynchronously
- Without delay, read returns stale value
- 150ms is sufficient for Movian backend to complete write

**bindPlayInfo mechanism:**
```javascript
// Movian API: binds playinfo from kvstore to prop
metadata.bindPlayInfo(tempProp, canonicalUrl);
// Now tempProp.restartpos contains saved position
tempProp.restartpos.valueOf();  // e.g., 1250 (seconds)
```

### 4. History Update Logic

```javascript
// history.js:record
function record(data, position, duration) {
    var list = storage.get('history', []);
    
    // Remove old entry (will re-add at top)
    var idx = findIndex(list, data.canonicalUrl);
    if (idx !== -1) list.splice(idx, 1);
    
    // Calculate progress
    var progress = duration > 0 
        ? Math.round((position / duration) * 100) 
        : 0;
    
    // Create entry
    var entry = {
        canonicalUrl: data.canonicalUrl,
        url: data.url,
        parentUrl: data.parentUrl,
        title: data.title,
        icon: data.icon,
        position: Math.round(position),
        duration: Math.round(duration),
        progress: progress,
        source: data.source,
        watchedAt: Date.now()
    };
    
    // Add to beginning (newest first)
    list.unshift(entry);
    
    // Enforce limit
    if (list.length > MAX_HISTORY) {
        list = list.slice(0, MAX_HISTORY);
    }
    
    storage.set('history', list);
}
```

---

## Storage System

### Movian Store API

```javascript
var store = require('movian/store');
var db = store.create('watchhistory');  // Creates namespace
```

### Data Persistence

**History:**
- Key: `'history'`
- Value: JSON string of array
- Limit: 200 entries
- Format: `[{entry1}, {entry2}, ...]`

**Favorites:**
- Key: `'favorites'`
- Value: JSON string of array
- Limit: 500 entries

### Safe Serialization

Movian Prop objects cannot be directly serialized. Solution:

```javascript
function safeStringify(obj) {
    var seen = [];
    return JSON.stringify(obj, function(key, val) {
        // Detect Movian Prop: [prop ...]
        if (val && typeof val === 'object' && val.valueOf) {
            var str = String(val.valueOf());
            if (str.indexOf('[prop') === 0) {
                return String(val);  // Convert to primitive
            }
        }
        // Prevent circular reference errors
        if (seen.indexOf(val) !== -1) return '[Circular]';
        if (typeof val === 'object') seen.push(val);
        return val;
    });
}
```

---

## UI Pages

### Home Page (`pages/home.js`)

**Sections:**
1. **Continue Watching** (max 5 items)
   - Shows entries with progress < 90%
   - Displays: `Title (45%)`
2. **Recently Watched** (max 5 items)
   - Latest history entries
3. **Favorites** (max 5 items)
4. **Browse** - Navigation links
   - Continue Watching (count)
   - Full History (count)
   - Favorites (count)

**Navigation URL Logic:**
```javascript
function getNavUrl(item) {
    // Prefer details page, fallback to video URL
    return item.parentUrl || item.canonicalUrl || item.url || '';
}
```

### Continue Page (`pages/continue.js`)

**Purpose:** Show unfinished content for easy resume.

**Filter:**
```javascript
// history.js:getContinue
list.filter(item => item.position > 0 && item.progress < 90)
```

**Display Format:**
```javascript
// Title with progress
title = item.title;
if (item.progress > 0 && item.progress < 100) {
    title += ' (' + item.progress + '%)';
}

// Time remaining
if (item.position > 0 && item.duration > 0) {
    var remaining = Math.round((item.duration - item.position) / 60);
    title += ' - ' + remaining + ' min left';
}

// Result: "Movie Title (45%) - 45 min left"
```

### History Page (`pages/history.js`)

**Purpose:** Show all watched content.

**Features:**
- Full list (sorted by watchedAt, newest first)
- Click to navigate to content
- Progress indicator

### Favorites Page (`pages/favorites.js`)

**Purpose:** Show manually saved items.

**Features:**
- Add/remove favorites
- Persistent across sessions

---

## Key Design Decisions

### 1. Unified Tracking System

**Problem:** Different stream types use different APIs.

**Solution:** Use `media.current.url` + `bindPlayInfo` which works for all types.
- **HLS:** backend/hls/hls.c updates restartpos
- **MP4:** File playback saves position
- **UPNP:** Media server streaming
- **Torrent:** Piece-based playback

### 2. videoparams Caching

**Problem:** Metadata not available in media.current during playback.

**Solution:** Cache videoparams from page navigation, read during playback start.

**Why not clear cache immediately:**
- Multiple consumers may need the data
- Race conditions with debug code
- Cache stays active until new video replaces it

### 3. Subscription for Duration

**Problem:** Duration not available at playback start, appears after probe (1-3s).

**Solution:** Global `P.subscribe()` on `metadata.duration` with `autoDestroy: false`.
- Subscription fires reactively when duration becomes available
- No polling needed — simpler and more reliable
- `pendingDurationUpdate` flag gates whether the callback should update history

### 4. Position Reading Strategy

**Problem:** Cannot read `currentposition` directly during stop.

**Solution:** Use `bindPlayInfo` + delay.
- Movian saves to kvstore asynchronously
- 150ms delay ensures write completes
- `restartpos` contains accurate position

### 5. canonicalUrl as Unique ID

**Problem:** Stream URLs change (different qualities, redirects).

**Solution:** Use `videoparams.canonicalUrl` as stable identifier.
- Same video = same canonicalUrl
- Different sources = different URLs, same canonicalUrl
- Enables accurate "Continue Watching"

### 6. Navigation Stack

**Problem:** Need to return to details page, not video URL.

**Solution:** Track parentUrl via navigation stack.
- User clicks from details page → video plays
- parentUrl = details page URL
- Clicking history item returns to details, not dead video URL

### 7. Duplicate Protection

**Problem:** onPlaybackStart may be called multiple times rapidly.

**Solution:** Check for existing session.
```javascript
if (currentSession && currentSession.url === url) return;
```

### 8. Progress Calculation

**Logic:**
```javascript
progress = (position / duration) * 100;
```

**Continue Watching Filter:**
```javascript
position > 0 && progress < 90
```

- `position > 0`: User actually watched something
- `progress < 90%`: Not finished (10% buffer for credits)

### 9. Storage Limits

**Reasoning:**
- History: 200 entries (balance between utility and performance)
- Favorites: 500 entries (user-curated, can be larger)

**Trimming:**
- New entries added to beginning
- Old entries fall off the end
- Keeps most recent content

### 10. Metadata Extraction Safety

**Problem:** Movian Prop objects cause serialization errors.

**Solution:** safeStringify with valueOf() checks.
- Detects Prop objects by `[prop` signature
- Converts to primitives before JSON.stringify
- Handles circular references

### 11. Subscription Options — autoDestroy

**Problem:** Movian subscriptions persist by default. The `autoDestroy` option controls whether a subscription is cleaned up when the subscribed prop is destroyed. Need to decide per-subscription whether `autoDestroy: false` is appropriate.

**Solution:** Use `autoDestroy: false` only for global subscriptions that must persist across playback sessions.

**Rationale:**
- Global subscriptions on `media.current.metadata.*` (duration, title, icon) subscribe to a path that becomes void between playback sessions. With default `autoDestroy` (effectively false for `subscribe`), the subscription object persists and fires again when the next video starts.
- The main URL subscription (`media.current.url`) uses `subscribeValue` with defaults — this is sufficient because the subscription path (`media.current`) never gets destroyed.
- Per-session subscriptions (like `readRestartPos` → `tempProp.restartpos`) use defaults and are manually cleaned up after use.

**Current subscription inventory (10 total):**

| Location | Prop Path | Method | autoDestroy | Reason |
|----------|-----------|--------|-------------|--------|
| global-observer | `media.current.metadata.duration` | `subscribe` | `false` | Persist across sessions |
| global-observer | `media.current.metadata.title` | `subscribe` | `false` | Persist across sessions |
| global-observer | `media.current.metadata.icon` | `subscribe` | `false` | Persist across sessions |
| global-observer | `media.current.url` | `subscribeValue` | default | Path never destroyed |
| global-observer | `tempProp.restartpos` | `subscribeValue` | default | Manual cleanup |
| navigation-observer | `currentpage.url` | `subscribeValue` | default | Path never destroyed |
| bookmark-observer | `currentpage.url` | `subscribeValue` | default | Path never destroyed |
| bookmark-observer | `currentpage.model.metadata.title` | `subscribeValue` | default | Path never destroyed |
| bookmark-observer | `currentpage.model.metadata.icon` | `subscribeValue` | default | Path never destroyed |
| bookmark-observer | `currentpage.bookmarked` | `subscribeValue` | default | Path never destroyed |

### 12. Bookmark-based Favorites

**Problem:** The ItemHook API (`movian/itemhook`) adds context menu actions but does not work reliably with HLS streams and has limited metadata available in the handler.

**Solution:** Subscribe to `currentpage.bookmarked` via `bookmark-observer.js`.
- Uses Movian's native bookmark star UI (already present in every page)
- Detects state changes (0→1 = add favorite, 1→0 = remove favorite)
- Caches title/icon via separate subscriptions before acting on state changes
- No additional UI elements needed — leverages existing Movian UX

---

## Implementation Notes

### Prop Reference Table

| Data | Prop Path | Method | Notes |
|------|-----------|--------|-------|
| `canonicalUrl` | `media.current.url` | subscribeValue | Appears on playback start |
| `duration` | `media.current.metadata.duration` | subscribe | Main method - after probe (1-3s) |
| `duration` | `videoparams.duration` | cached | Already known (e.g., Anilibria) |
| `title` | `media.current.metadata.title` | subscribe | Global subscription |
| `icon` | `media.current.metadata.icon` | subscribe | Global subscription |
| `restartpos` | via `bindPlayInfo()` | callback | From kvstore after 150ms delay |
| `parentUrl` | `navigators.current.currentpage.url` | subscribeValue | Cached on navigation |

### Stream Type Characteristics

| Type | URL | Duration Source | Metadata Timing |
|------|-----|-----------------|-----------------|
| **HLS (preset)** | videoparams | In videoparams | Immediate |
| **HLS (probe)** | videoparams | After probe | 1-3s delay |
| **UPNP** | upnp:uuid... | After probe | 1-3s delay |
| **Torrent** | torrentfile://... | After probe | 1-3s delay |
| **Local** | file:///... | After probe | 1-3s delay |

### Subscription Options Reference

Options for `P.subscribe()` (3rd argument):

| Option | Default | Description |
|--------|---------|-------------|
| `autoDestroy` | `false` | Destroy subscription when prop destroyed |
| `ignoreVoid` | `false` | Skip void value callbacks |
| `debug` | `false` | Enable debug output |
| `noInitialUpdate` | `false` | Skip initial value callback |

**Global Subscriptions** (duration, title, icon) use `autoDestroy: false` to persist across playback sessions.

---

## Technical Challenges & Solutions

### Challenge 1: HLS Stream Tracking

**Issue:** VideoScrobbler only works for file-based videos, not HLS.

**Solution:** Use global media.current.url approach which works for all backend types.

### Challenge 2: Race Conditions

**Issue:** Multiple events fire simultaneously, cache cleared too early.

**Solution:** 
- Don't clear cache on read (navigation-observer)
- Protect against duplicate sessions (global-observer)
- Comment out debug subscriptions (watchhistory.js)

### Challenge 3: Duration Detection Timing

**Issue:** Duration unknown at start, appears after probe.

**Solution:**
- Cache upfront duration from videoparams if available
- Global `P.subscribe()` on `metadata.duration` as primary detection method
- `pendingDurationUpdate` flag controls when history is updated with complete metadata

### Challenge 4: Position Accuracy

**Issue:** Reading position immediately on stop gives stale value.

**Solution:**
- 150ms delay before reading
- Use bindPlayInfo to access kvstore
- Subscribe to restartpos prop

### Challenge 5: URL Changes During Playback

**Issue:** HLS redirects, quality switching change URL.

**Solution:**
- Use canonicalUrl for identification
- Track original URL separately
- canonicalUrl remains stable

---

## Integration Points

### For Plugin Developers

**To ensure best compatibility:**

1. **Provide videoparams with canonicalUrl:**
```javascript
page.appendItem(
    'videoparams:' + JSON.stringify({
        canonicalUrl: 'plugin://myplugin/video/123',
        title: 'Video Title',
        icon: 'http://...',
        duration: 1425  // Optional, avoids waiting for probe
    }),
    'video',
    { ... }
);
```

2. **Set parentUrl for navigation:**
- Watch History uses `parentUrl` to return users to details page
- If videoparams contains parentUrl, navigation works better

3. **Avoid duplicate canonicalUrls:**
- Each unique video should have unique canonicalUrl
- Same canonicalUrl = same video (resumes from saved position)

---

## Testing Checklist

### Stream Types
- [ ] HLS with duration in videoparams (Anilibria)
- [ ] HLS without duration (hdrezka)
- [ ] UPNP sources
- [ ] Torrent files
- [ ] Local MP4 files
- [ ] DASH streams

### Features
- [ ] Record on start (position=0)
- [ ] Update on stop (final position)
- [ ] Continue Watching shows unfinished
- [ ] Progress calculation accurate
- [ ] Resume works (auto or manual)
- [ ] Favorites add/remove
- [ ] Navigation to parentUrl works
- [ ] No duplicate entries

### Edge Cases
- [ ] Very short videos (< 30 sec)
- [ ] Videos without duration
- [ ] Rapid stop/start
- [ ] Switching videos without stopping
- [ ] Network errors during playback
- [ ] Empty videoparams
- [ ] Missing canonicalUrl

---

## Future Improvements

1. **Multiple User Profiles**
   - Separate history per profile
   - Currently global for all users

2. **Sync Across Devices**
   - Cloud sync option
   - Export/import functionality

3. **Smart Recommendations**
   - Based on watch history
   - Similar content suggestions

4. **Series Tracking**
   - Track TV series progress
   - Next episode suggestions
   - Season completion status

5. **Advanced Filtering**
   - Filter by date, source, type
   - Search history
   - Sort options

6. **Statistics**
   - Total watch time
   - Most watched sources
   - Daily/weekly stats

---

## Conclusion

This architecture provides robust, universal video tracking across all Movian plugins. The key innovations are:

1. **Unified API** - Works with all stream types via media.current.url
2. **Smart Caching** - videoparams cached during navigation, used during playback
3. **Reliable Position Reading** - bindPlayInfo + delay pattern
4. **Race Condition Protection** - Multiple layers of duplicate prevention
5. **Safe Storage** - Handles Movian Prop objects gracefully

The plugin is production-ready and handles edge cases like HLS streams, UPNP sources, and rapid user interactions.
