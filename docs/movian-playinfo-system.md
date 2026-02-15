# Movian Playinfo System

This document describes how Movian stores and retrieves playback position (`restartposition`), and how plugins can leverage or work alongside this system.

---

## 1. Overview

Movian has a built-in system for:
- **Saving playback position** when video stops
- **Resume popup** ("Resume from X:XX?") when restarting
- **playcount** and **lastplayed** tracking per URL

All data is stored in **kvstore** (SQLite database) keyed by `canonical_url`.

---

## 2. Storage Details

### Location
```
${persistent_path}/kvstore/kvstore.db
```

### Keys per URL

| Key | Domain | Type | Unit | Description |
|-----|--------|------|------|-------------|
| `restartposition` | SYS (1) | int64 | milliseconds | Last playback position |
| `playcount` | SYS (1) | int | count | Times played to completion |
| `lastplayed` | SYS (1) | int | unix timestamp | When last played |

### Domain Constants (C code)
```c
#define KVSTORE_DOMAIN_SYS     1   // System data (playinfo)
#define KVSTORE_DOMAIN_PROP    2   // Property bindings
#define KVSTORE_DOMAIN_PLUGIN  3   // Plugin settings
#define KVSTORE_DOMAIN_SETTING 4   // User settings
```

**Important**: JavaScript plugins can only access `KVSTORE_DOMAIN_PLUGIN`!

---

## 3. When Position is Saved

### HLS Backend (`src/backend/hls/hls.c`)

Position is saved **only when playback ends** (not during playback):

```c
if(mp->mp_flags & MP_CAN_SEEK) {
    int spp = mp->mp_duration ? mp->mp_seek_base * 100 / mp->mp_duration : 0;

    if(spp >= video_settings.played_threshold || event_is_type(e, EVENT_EOF)) {
        // Reached threshold (90%) or EOF → CLEAR position, increment playcount
        playinfo_set_restartpos(canonical_url, -1, 0);
        playinfo_register_play(canonical_url, 1);
    } else if(h->h_last_timestamp_presented != PTS_UNSET) {
        // Stopped early → SAVE position
        playinfo_set_restartpos(canonical_url,
                                h->h_last_timestamp_presented / 1000, 0);
    }
}
```

### Trigger Events
- **User stops playback** (back button, exit)
- **Skip forward/backward** to another video
- **EOF** (video ends naturally)

### NOT Saved During Playback
The periodic save code is **commented out** in Movian source:
```c
// In hls_event_callback():
//  playinfo_set_restartpos(canonical_url, ets->ts / 1000, 1);  // COMMENTED!
```

**Implication**: If Movian crashes during playback, position is lost.

---

## 4. Resume Popup

### Flow

1. User starts video with stored `restartposition > 0`
2. `playinfo_get_restartpos()` checks `resume_mode` setting
3. If `VIDEO_RESUME_ASK` (default), shows popup
4. User chooses "Yes" (resume) or "No, Start over"

### Resume Modes

| Mode | Value | Behavior |
|------|-------|----------|
| `VIDEO_RESUME_NO` | 0 | Never resume |
| `VIDEO_RESUME_YES` | 1 | Always resume (silent) |
| `VIDEO_RESUME_ASK` | 2 | Show popup (default) |

### Settings Location
- Settings → Video playback → "Resume video playback"
- Settings → Video playback → "Count video as played when reaching" (default: 90%)

---

## 5. Prop Tree Integration

### bindPlayInfo()

When a page creates a video item, Movian automatically binds playinfo:

```javascript
// In page.js (internal)
page.appendItem(url, 'video', metadata);
// Internally calls:
require('native/metadata').bindPlayInfo(root, url);
```

This creates reactive props on the item:

| Prop | Type | Unit | Description |
|------|------|------|-------------|
| `playcount` | int | count | Times played |
| `lastplayed` | int | unix timestamp | Last played time |
| `restartpos` | float | **seconds** | Resume position |

### Prop Path
```
prop/global/navigators/current/currentpage/model/nodes/*/restartpos
```

### Auto-Update
When `playinfo_set_restartpos()` is called, all bound props for that URL are automatically updated via `update_by_url()`.

---

## 6. JavaScript Access

### What Plugins CAN Do

#### Read `restartpos` via Prop subscription
```javascript
var prop = require('movian/prop');

// If you have access to an item's root prop:
prop.subscribeValue(item.root.restartpos, function(seconds) {
    console.log('Restart position: ' + seconds);
});
```

#### Read `currenttime` via Prop subscription
```javascript
prop.subscribeValue(prop.global.media.current.currenttime, function(seconds) {
    console.log('Current time: ' + seconds);
});
```

#### Call `bindPlayInfo()` on custom props
```javascript
var metadata = require('native/metadata');
var prop = require('movian/prop');

var tempProp = prop.createRoot();
metadata.bindPlayInfo(tempProp, 'videoparams:...');

prop.subscribeValue(tempProp.restartpos, function(seconds) {
    console.log('Restart position: ' + seconds);
    // Remember to destroy tempProp when done
});
```

### What Plugins CANNOT Do

#### Read kvstore with domain SYS
```javascript
// ERROR: es_kvstore.c only allows "plugin" domain
var kv = require('native/kvstore');
kv.getInteger(url, 'sys', 'restartposition', 0);  // Throws error!
```

#### Write `restartpos`
Props bound via `bindPlayInfo()` are read-only from JavaScript.

#### Show resume popup
The popup is C-level (`popup_display()`) and not exposed to JavaScript.

---

## 7. canonical_url

The key used for storing/retrieving playinfo.

### How It's Determined

1. **For `videoparams:` URLs**: Extracted from JSON field `canonicalUrl`
2. **For direct URLs**: The URL itself
3. **Fallback**: First source URL from `sources` array

### Example
```javascript
// Plugin sends:
var url = 'videoparams:' + JSON.stringify({
    canonicalUrl: 'myplugin:video:12345',  // ← This is used for playinfo
    title: 'My Video',
    sources: [{ url: 'https://...' }]
});
```

### Best Practice
Always set `canonicalUrl` to a stable, unique identifier for your content. This ensures:
- Resume works across sessions
- playcount is tracked correctly
- No collision with other plugins

---

## 8. Hybrid Approach for Watch History Plugin

Since we cannot read kvstore directly, we use a hybrid approach:

### Strategy

1. **Track playback start/stop** via `prop.global.media.current.url`
2. **On playback stop** (URL becomes null):
   - Wait 100ms for Movian to save `restartpos`
   - Use `bindPlayInfo()` on a temp prop to read `restartpos`
   - Save to our history with the position
3. **During playback**: Don't track `currenttime` (Movian handles it)

### Advantages
- No overhead from `currenttime` subscription (~24 calls/sec)
- Uses Movian's accurate position from HLS backend
- Less code, fewer bugs

### Disadvantages
- If Movian crashes, we don't have the last position
- Slight delay (100ms) to read position after stop

### Implementation Pattern

```javascript
var prop = require('movian/prop');
var metadata = require('native/metadata');

var currentUrl = null;

prop.subscribeValue(prop.global.media.current.url, function(url) {
    var urlStr = url ? String(url) : null;
    
    if (!urlStr && currentUrl) {
        // Playback stopped - read restartpos after Movian saves it
        var stoppedUrl = currentUrl;
        currentUrl = null;
        
        setTimeout(function() {
            readRestartPosAndSave(stoppedUrl);
        }, 100);
    } else if (urlStr) {
        // Playback started
        currentUrl = urlStr;
        // Record start in history (position = 0)
    }
});

function readRestartPosAndSave(url) {
    var tempProp = prop.createRoot();
    
    metadata.bindPlayInfo(tempProp, url);
    
    // Give it a moment to populate
    setTimeout(function() {
        prop.subscribeValue(tempProp.restartpos, function(seconds) {
            var position = seconds ? Number(seconds) : 0;
            
            // Save to history
            history.record({
                canonicalUrl: url,
                // ... other fields
            }, position, duration);
            
            // Cleanup
            prop.destroy(tempProp);
        });
    }, 50);
}
```

---

## 9. Source Files Reference

| File | Description |
|------|-------------|
| `src/metadata/playinfo.c` | playinfo_set/get_restartpos, bindPlayInfo |
| `src/backend/hls/hls.c` | HLS playback, position save on stop |
| `src/video/video_playback.c` | video_args_t, canonical_url handling |
| `src/video/video_settings.c` | resume_mode, played_threshold settings |
| `src/db/kvstore.c` | kvstore read/write functions |
| `src/ecmascript/es_kvstore.c` | JS kvstore API (plugin domain only) |
| `src/ecmascript/es_metadata.c` | JS bindPlayInfo binding |
| `res/ecmascript/modules/movian/page.js` | appendItem calls bindPlayInfo |

---

## 10. Key Takeaways

1. **Movian saves position only on stop** - not during playback
2. **kvstore SYS domain is inaccessible** from JavaScript
3. **Use `bindPlayInfo()`** to read `restartpos` via props
4. **`restartpos` is in seconds** (float), kvstore stores milliseconds
5. **`canonical_url` is the key** - set it consistently in your plugin
6. **Hybrid approach works** - let Movian track position, read it after stop

---

## 11. HLS Implementation Notes (from real testing)

Based on extensive testing with HLS streams (hdrezka, etc.):

### 11.1 VideoScrobbler Limitations
- **VideoScrobbler** only works with file-based videos (MP4, etc.)
- **HLS streams** are handled by `backend/hls/hls.c` which does NOT call `video_playback_info_invoke()`
- **Solution:** Use `prop.global.media.current.url` for all stream types

### 11.2 Correct Duration Path
**WRONG:**
```javascript
P.global.media.current.metadata.duration  // Returns 0 or undefined
```

**CORRECT:**
```javascript
P.global.navigators.current.currentpage.media.metadata.duration
// Appears after probe (≈1-3 seconds after start)
```

### 11.3 Metadata Caching Required
By the time playback starts, `currentpage.url` is already empty.
**Solution:** Cache videoparams when they appear in `currentpage.url`:

```javascript
// In navigation-observer.js
if (url.indexOf('videoparams:') === 0) {
    lastVideoParams = parseVideoParams(url);
}
```

### 11.4 Duration Detection Strategy
Polling is more reliable than subscription:
```javascript
var interval = setInterval(function() {
    var dur = safeNumber(P.global.media.current.metadata.duration, 0);
    if (dur > 0) {
        session.duration = dur;
        clearInterval(interval);
    }
}, 200);
```

### 11.5 Position Reading
Always use 150ms delay for Movian to save position:
```javascript
setTimeout(function() {
    readRestartPos(canonicalUrl, function(position) {
        // position is accurate
    });
}, 150);
```

### 11.6 Key Differences
| Aspect | File Video | HLS Stream |
|--------|------------|------------|
| VideoScrobbler | ✅ Works | ❌ Not called |
| Duration path | `media.current.metadata` | `currentpage.media.metadata` |
| Probe time | Instant | 1-3 seconds |
| Position save | Via VideoScrobbler | Via bindPlayInfo |

---

*Documentation for movian-watch-history plugin | Feb 2026*  
*HLS notes added after real-world testing | kimi_dev branch*
