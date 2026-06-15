# Agent Development Guide - Movian Watch History

This document provides critical instructions for AI agents (and developers) working on the Movian Watch History plugin.

## ⚠️ Critical Runtime Constraints (The Golden Rules)

The plugin runs on Movian's **Duktape engine**, which is strictly **ECMAScript 5.1**.
- **NO ES6+ Features:** No `let`, `const`, `=>` (arrow functions), `class`, `...` (spread), or `` ` `` (template literals).
- **NO Destructuring:** Do not use `var { x } = require(...)`.
- **NO Promises/Async/Await:** All operations must be synchronous or use callbacks/setTimeout.
- **Module System:** Standard CommonJS (`require` / `exports`).

## 🛠 Build, Lint, and Test Commands

### Syntax & Linting
Always run a syntax check before committing. If the optional local development
helpers are installed, use:

```bash
./dev/syntax-check.sh
```

Otherwise run `node --check` for tracked JavaScript files and use the installed
Movian plugin testing skill for runtime validation.

### Running the Plugin
Launch Movian in debug mode with the current directory as the plugin path:
```bash
showtime -d -p .
```

### Testing Suite
The `./dev/run-tests.sh` script handles various test scenarios.
- **Run Full Playback Test:** `./dev/run-tests.sh full local`
- **Run Quick Cache Test:** `./dev/run-tests.sh quick upnp`
- **Run Duration Detection Test:** `./dev/run-tests.sh duration torrent`
- **Run Syntax Check:** `./dev/run-tests.sh syntax`

### Run a Single Test File Directly
For debugging specific functionality without the test runner:
```bash
# Run specific test file with a video source
showtime -d --ecmascript dev/test-playback-observer.js "file:///path/to/video.mp4"
showtime -d --ecmascript dev/quick-test-v2.js "upnp:uuid:..."
showtime -d --ecmascript dev/test-duration-observer.js "torrentfile://..."
```

### Debugging Tools
- **Monitor Props in Real-time:** `./dev/monitor_props.sh`
- **Dump All Current Props:** `./dev/debug-props.sh`
- **Manual Prop Query:** `curl http://localhost:42000/api/prop/global/media/current/url`

## 📝 Code Style Guidelines

### Naming Conventions
- **Files:** kebab-case (e.g., `src/global-observer.js`).
- **Variables/Functions:** camelCase (e.g., `var currentSession`).
- **Constants:** UPPER_SNAKE_CASE (e.g., `var MAX_HISTORY = 200`).

### Imports & Exports
- Use `var` for imports: `var P = require('movian/prop');`
- Use `exports.functionName = ...` for public APIs.

### Variable Declarations
- **Always use `var`.** Never use `let` or `const`.
- Declare variables at the top of their scope where possible to avoid hoisting confusion.

### Comments
- Use `/* */` for multi-line comments.
- Use `//` for single-line comments.
- Start files with a header comment describing the purpose.

### Error Handling
- Use `try/catch` around native Movian/Duktape calls that might fail (e.g., `P.createRoot()`, `metadata.bindPlayInfo()`).
- Use the built-in logger: `var log = require('./log'); log.d('message');`.
- Always include error context in log messages.

Example:
```javascript
try {
    var tempProp = P.createRoot();
    metadata.bindPlayInfo(tempProp, canonicalUrl);
} catch (e) {
    log.e('[global-observer] ERROR creating tempProp: ' + e);
    callback(0);
    return;
}
```

### Testing Patterns
When creating new tests:
1. Follow existing test file patterns in `dev/`
2. Use `/* eslint-disable no-var */` at the top
3. Use console.log for test output
4. Include timeout handlers to prevent hanging

## 🤖 Advanced Testing

Use the installed Movian plugin testing skill for HTTP prop inspection,
screenshots, playback smoke, and repeatable runtime diagnostics. Keep external
tool locations in user-local configuration rather than tracked documentation.

## 🧠 Session Recovery

At the start of a new session:

```bash
./support/codex/context.sh check
project-knowledge status
```

After a Git state change or merge:

```bash
./support/codex/context.sh refresh
```

The refresh command updates ignored project state and creates a local knowledge
commit. It does not push either repository. Use `project-knowledge sync` only
after an explicit request to push the project knowledge vault.

## 🏗 Architectural Patterns

### The Metadata Timing Problem
When playback starts, `currentpage.url` is cleared by Movian. 
- **Rule:** Always retrieve metadata from the `navigation-observer` cache rather than assuming `currentpage` is populated.
- **Flow:** `navigation-observer` caches metadata on navigation -> `global-observer` retrieves it via `getLastVideoParams()`.

### Reactive Prop System
- Use `P.subscribe(prop, callback, { autoDestroy: false })` for long-lived subscriptions.
- Use `P.subscribeValue(prop, callback)` for simple value changes.
- **Cleanup:** Always `P.destroy(tempProp)` if you created a temporary root.

### Data Serialization
Movian `Prop` objects are proxies and cannot be directly stringified.
- **Rule:** Use `require('./src/storage').set(key, value)` or `require('./src/utils').safeStringify(obj)` for persistence.

### Position Reading
To read the saved playback position:
1. Wait ~150ms after playback stops (Movian needs time to write to its own kvstore).
2. Use `metadata.bindPlayInfo(tempProp, canonicalUrl)`.
3. Subscribe to `tempProp.restartpos`.

## 📂 Project Structure

| Path | Purpose |
|------|---------|
| `src/` | Core logic and observers. |
| `pages/` | UI route handlers (directory listings). |
| `dev/` | Testing, monitoring, and validation scripts. |
| `docs/` | Deep technical documentation. |
| `watchhistory.js` | Plugin entry point and initialization. |

## 🔄 Git Workflow

Before committing:
1. Run `./dev/syntax-check.sh` to verify ES5.1 compliance
2. Test your changes with `./dev/run-tests.sh quick local`
3. Write clear commit messages describing what and why

## 📚 Additional Resources

- `docs/ARCHITECTURE.md` - Complete system architecture
- `docs/TESTING.md` - Detailed testing guide
- `docs/PROPSYSTEM_COMPLETE_GUIDE.md` - Movian prop system reference
