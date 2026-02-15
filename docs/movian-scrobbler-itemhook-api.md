# Movian VideoScrobbler & ItemHook API

> **NOTE:** This document describes APIs that are **not used** by the current plugin implementation. VideoScrobbler does not work with HLS streams; ItemHook was replaced by `currentpage.bookmarked` subscription in `bookmark-observer.js`. This document is retained as a Movian API reference.

This document describes the VideoScrobbler and ItemHook APIs available in Movian for tracking video playback and adding context menu actions.

**See also:** [Movian Playinfo System](./movian-playinfo-system.md) - How Movian stores/retrieves playback position

---

## 1. VideoScrobbler API

### Overview

The VideoScrobbler API allows plugins to receive notifications about video playback events from **any** plugin. This is useful for:
- Watch history tracking
- Scrobbling to external services (Trakt, Last.fm, etc.)
- Resume playback functionality

### Requirements

- Movian version >= 5.0.241 (`Core.currentVersionInt >= 50000241`)

### Initialization

```javascript
var videoscrobbler = require('movian/videoscrobbler');

var vs = new videoscrobbler.VideoScrobbler();

vs.onstart = function(data, prop, origin) { /* ... */ };
vs.onstop = function(data, prop, origin) { /* ... */ };
vs.onpause = function(data, prop, origin) { /* ... */ };
vs.onresume = function(data, prop, origin) { /* ... */ };
```

### Callbacks

#### `onstart(data, prop, origin)`

Called when playback starts.

#### `onstop(data, prop, origin)`

Called when playback stops.

#### `onpause(data, prop, origin)`

Called when playback is paused.

#### `onresume(data, prop, origin)`

Called when playback resumes from pause.

---

### Callback Arguments

#### `data` Object (Plain JavaScript Object)

Contains metadata about the playback session:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique session ID. Use to correlate events. |
| `canonical_url` | string | Movian's canonical URL for the video |
| `url` | string | Actual playback URL |
| `title` | string | Video title (from metadata system) |
| `season` | number | Season number (TV series only) |
| `episode` | number | Episode number (TV series only) |
| `year` | number | Release year (movies only) |
| `duration` | number | Video length in seconds (not set for live) |
| `framerate` | number | Video framerate |
| `width` | number | Video width in pixels |
| `height` | number | Video height in pixels |
| `resumeposition` | number | Position where user resumed (seconds) |
| `stopposition` | number | **Only in onstop()** - stop position (seconds) |

#### `prop` Object (Movian Prop Proxy)

The media player property tree. Common fields:

| Field | Type | Description |
|-------|------|-------------|
| `currenttime` | number | Current playback position (seconds) |
| `playstatus` | string | `"play"`, `"pause"`, or `"stop"` |
| `duration` | number | Video duration (seconds) |

#### `origin` Object (Movian Prop Proxy)

The source item that started playback (the item on the "previous page"):

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Item URL |
| `filename` | string | Filename if applicable |
| `metadata.*` | various | Item metadata (title, icon, etc.) |

---

### Debugging with prop.print()

To dump the full property tree for debugging:

```javascript
var P = require('movian/prop');

vs.onstart = function(data, prop, origin) {
    print("=== PROP TREE ===");
    P.print(prop);
    
    print("=== ORIGIN TREE ===");
    P.print(origin);
};
```

This outputs the entire property hierarchy to the console.

---

### Cleanup

```javascript
vs.destroy();  // Unregister the scrobbler
```

---

## 2. ItemHook API

### Overview

ItemHook allows plugins to add actions to the context menu of **any** item in Movian. When the user selects the action, your handler is called with the item's properties.

### Initialization

```javascript
var itemhook = require('movian/itemhook');

var hook = itemhook.create({
    title: 'Add to Favorites',
    icon: Plugin.path + 'icon.png',
    itemtype: 'video',  // 'video', 'audio', or omit for all
    handler: function(obj, nav) {
        // Handle the action
    }
});
```

### Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Menu item text |
| `icon` | string | No | Icon URL |
| `itemtype` | string | No | Filter: `"video"`, `"audio"`, or omit for all types |
| `handler` | function | Yes | Callback function |

### Handler Arguments

#### `obj` Object (Movian Prop Proxy)

The item that was selected:

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Item URL |
| `type` | string | Item type (`"video"`, `"audio"`, etc.) |
| `metadata.title` | string | Item title |
| `metadata.icon` | string | Item icon URL |
| `metadata.duration` | number | Duration (if applicable) |

#### `nav` Object

Navigation helper:

```javascript
nav.openURL(url);  // Navigate to a URL
```

### Cleanup

```javascript
hook.destroy();  // Remove the menu item
```

---

## 3. Critical: Working with Prop Objects

### The Problem

Both `prop`, `origin` (from VideoScrobbler) and `obj` (from ItemHook) are **Proxy objects**, not plain JavaScript objects.

When you access a property like `prop.currenttime`, you get **another Prop object**, not a primitive value!

### Symptoms of Incorrect Usage

```javascript
// This will NOT work as expected:
var session = {
    url: data.url,           // url is a Prop object!
    title: prop.title        // title is a Prop object!
};

JSON.stringify(session);     // ERROR: Maximum call stack size exceeded
```

### Solution: Extract Primitives

Always convert Prop values to primitives before storing:

```javascript
// CORRECT: Extract primitive values
var url = String(obj.url);
var title = String(obj.metadata.title);
var time = Number(prop.currenttime);

// Now safe to store
var session = {
    url: url,
    title: title,
    position: time
};
```

### Safe Patterns

```javascript
// Pattern 1: String() for strings
var title = obj.metadata && obj.metadata.title 
    ? String(obj.metadata.title) 
    : 'Unknown';

// Pattern 2: Number() for numbers
var duration = Number(data.duration) || 0;

// Pattern 3: Ternary with null check
var icon = obj.metadata && obj.metadata.icon 
    ? String(obj.metadata.icon) 
    : null;

// Pattern 4: prop.print() for debugging (don't store output)
var P = require('movian/prop');
P.print(prop);  // Outputs to console only
```

### Why JSON.stringify Fails

Prop objects have:
1. Circular references (parent ↔ child)
2. Dynamic property creation on access
3. Internal `toJSON` that creates infinite loops

**Never use `JSON.stringify()` on Prop objects!**

---

## 4. Complete Examples

### VideoScrobbler Example

```javascript
/* scrobbler.js */
var videoscrobbler = require('movian/videoscrobbler');
var P = require('movian/prop');

var vs = new videoscrobbler.VideoScrobbler();

vs.onstart = function(data, prop, origin) {
    // Debug output
    print("Playback started: " + data.title);
    P.print(prop);
    
    // Extract primitives for storage
    var session = {
        id: String(data.id),
        url: String(data.canonical_url || data.url || ''),
        title: String(data.title || 'Unknown'),
        duration: Number(data.duration) || 0,
        source: String(origin.url || ''),
        startTime: Date.now()
    };
    
    // Now safe to JSON.stringify(session)
};

vs.onstop = function(data, prop, origin) {
    var position = Number(data.stopposition || prop.currenttime) || 0;
    print("Stopped at: " + position + " seconds");
};
```

### ItemHook Example

```javascript
/* itemhooks.js */
var itemhook = require('movian/itemhook');
var popup = require('movian/popup');

itemhook.create({
    title: 'Add to Favorites',
    itemtype: 'video',
    handler: function(obj, nav) {
        // Extract primitives
        var url = obj.url ? String(obj.url) : null;
        var title = (obj.metadata && obj.metadata.title) 
            ? String(obj.metadata.title) 
            : 'Unknown';
        var icon = (obj.metadata && obj.metadata.icon) 
            ? String(obj.metadata.icon) 
            : null;
        
        if (!url) {
            popup.notify('Cannot add: no URL', 2);
            return;
        }
        
        // Now url, title, icon are safe strings
        saveFavorite({ url: url, title: title, icon: icon });
        popup.notify('Added: ' + title, 2);
    }
});
```

---

## 5. API Reference Summary

### VideoScrobbler

| Method/Property | Description |
|-----------------|-------------|
| `new VideoScrobbler()` | Create scrobbler instance |
| `vs.onstart` | Callback for playback start |
| `vs.onstop` | Callback for playback stop |
| `vs.onpause` | Callback for pause |
| `vs.onresume` | Callback for resume |
| `vs.destroy()` | Cleanup |

### ItemHook

| Method | Description |
|--------|-------------|
| `itemhook.create(config)` | Create hook, returns handle |
| `handle.destroy()` | Remove hook |

### Prop Utilities

| Method | Description |
|--------|-------------|
| `require('movian/prop').print(prop)` | Dump prop tree to console |
| `String(prop.field)` | Extract string value |
| `Number(prop.field)` | Extract number value |
| `prop.field.toString()` | Extract string value |
| `prop.field.valueOf()` | Extract primitive value |

---

*Documentation generated for movian-watch-history plugin | Feb 2026*
