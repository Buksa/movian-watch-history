# Testing and Debugging Guide

This document describes how to test the watch-history plugin with different stream types and debug issues.

## Test Tools

The plugin includes several testing utilities in `dev/`:

### Running Tests

Use the unified test runner:
```bash
./dev/run-tests.sh
```

### Available Test Modes

- `full` - Complete prop system test suite (60s timeout)
- `quick` - Cache state debugging (10s timeout)
- `duration` - Duration detection comparison
- `syntax` - ES5 compatibility check
- `http` - HTTP API prop dump
- `monitor` - Live prop monitoring

### Syntax Check

Always run before committing:
```bash
./dev/syntax-check.sh
```

Verifies:
- No arrow functions
- No template literals
- No ES6+ methods (padEnd, repeat, etc.)
- No let/const declarations

### What to Look For

1. **Title availability timeline:**
   ```json
   {
     "event": "subscribe_callback",
     "prop": "media.current.metadata.title",
     "v1": "Actual Video Title"
   }
   ```

2. **Videoparams in source:**
   ```json
   {
     "prop": "navigators.current.currentpage.source",
     "v1": "videoparams:{\"title\":\"...\"...}"
   }
   ```

3. **Timing differences:**
   - Local files: title appears immediately via metadata
   - UPNP: videoparams in source, then metadata title
   - Torrent: metadata title arrives ~100-500ms after playback starts
   - HLS: title in videoparams from the start

## Key Findings from Testing

### Metadata Sources by Stream Type

| Stream Type | videoparams | metadata.title | Source Timing |
|-------------|-------------|----------------|---------------|
| **Local files** | ❌ No | ✅ Yes | Immediate |
| **UPNP** | ✅ In source | ✅ Yes | Source first, then metadata |
| **Torrent** | ✅ In source | ✅ Yes | Async (after playback) |
| **HLS** | ✅ In URL | ✅ Yes | Immediate in videoparams |

### Critical Discovery

**For ALL stream types**, `prop.global.media.current.metadata.title` eventually contains the correct title. The difference is timing:
- HLS: Available immediately (from videoparams)
- Local: Available immediately (from filename probe)
- UPNP: Available after ~100ms (from server response)
- Torrent: Available after ~100-500ms (from metadata probe)

### Solution Implemented

Three-tier fallback in `global-observer.js`:

```javascript
if (videoParams && videoParams.title) {
    title = videoParams.title;  // 1. From videoparams (HLS, cached UPNP)
} else if (globalMediaTitle) {
    title = globalMediaTitle;   // 2. From metadata subscription
} else if (url.indexOf('file://') === 0) {
    title = extractFromFilename(url);  // 3. From filename
}
```

Plus async update when metadata arrives later (for torrents).

## Debugging Commands

### Check HTTP API Props

```bash
# Get current URL
curl http://localhost:42000/api/prop/global/media/current/url

# Get metadata
curl http://localhost:42000/api/prop/global/media/current/metadata/title
curl http://localhost:42000/api/prop/global/media/current/metadata/duration

# Get navigator source (contains videoparams)
curl http://localhost:42000/api/prop/global/navigators/current/currentpage/source

# Get playstatus
curl http://localhost:42000/api/prop/global/media/current/playstatus
```

### Test Specific Stream Types

```bash
# Local file with debug
showtime -d -p /path/to/watch-history \
  "file:///path/to/video.mp4" 2>&1 | grep -E "(PLAYBACK START|Title from|history.*title=)"

# UPNP with debug
showtime -d -p /path/to/watch-history \
  "upnp:uuid:..." 2>&1 | grep -E "(PLAYBACK START|Title from|history.*title=)"

# Torrent with debug
showtime -d -p /path/to/watch-history \
  "torrentfile://..." 2>&1 | grep -E "(PLAYBACK START|Title from|history.*title=)"
```

## Common Issues and Solutions

### Issue: "Unknown" title for local files
**Cause:** No videoparams metadata available
**Solution:** Extract title from filename (now implemented)

### Issue: "Unknown" title for torrents initially
**Cause:** Metadata arrives asynchronously after playback starts
**Solution:** Subscribe to metadata.title and update history entry async (now implemented)

### Issue: Title from previous video shown for current
**Cause:** Global variables not cleared between sessions
**Solution:** Clear globalMediaTitle/globalMediaIcon on playback stop (now implemented)

## Testing Checklist

- [ ] Local file: Title extracted from filename
- [ ] UPNP: Title from metadata
- [ ] Torrent: Async title update
- [ ] HLS: Title from videoparams
- [ ] Duration detected for all types
- [ ] Position saved correctly on stop
- [ ] Icon preserved (UPNP/HLS only)
- [ ] No cross-contamination between sequential videos
- [ ] Rapid play/stop/play doesn't break tracking

## Performance Notes

- Metadata subscription: Lightweight, only triggers on changes
- Filename extraction: Instant, no I/O
- Async update: Only for torrents (which already have latency)
- No polling for title or duration — both use global subscriptions
- Memory: 2 global strings (title, icon) + 1 boolean flag (pendingDurationUpdate)

## Advanced Testing

Use an installed Movian testing toolkit for:
- WebSocket STPP client for real-time prop monitoring
- Automated test runners
- Mock VFS providers
- Bitcode performance modules

## Future Improvements

1. **Extract metadata from more sources:**
   - ID3 tags for music files
   - NFO files for movies
   - Online metadata lookup

2. **Better torrent support:**
   - Parse magnet links for title
   - Extract from announce URL

3. **Icon support:**
   - Generate thumbnails for local files
   - Cache icons from URLs

4. **Testing automation:**
   - Unit tests for filename extraction
   - Mock prop system for CI/CD
