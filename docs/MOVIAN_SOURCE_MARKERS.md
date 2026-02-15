# Movian Source Code Markers (ECMAScript & Internals)

This guide provides pointers to critical sections of the Movian C source code responsible for ECMAScript execution, navigation, and networking.

## 🚀 ECMAScript Runtime & Initialization

| Feature | Location | Description |
|---------|----------|-------------|
| **Flag Parsing** | `src/main.c` | Handling of `--ecmascript` and `-p`. |
| **Context Creation** | `src/ecmascript/ecmascript.c` | `ecmascript_init()`: Creates Duktape contexts and sets security flags. |
| **Execution Loop** | `src/ecmascript/ecmascript.c` | `es_exec()`: Loads, compiles, and executes JS files via `duk_pcall`. |
| **Error Handling** | `src/ecmascript/ecmascript.c` | `es_dump_err_ex()`: Extracts file, line, and full stack trace from Duktape. |
| **Module Registration** | `src/ecmascript/ecmascript.h` | `ES_MODULE()` macro used to register C functions to JS. |

## 🧭 Navigator & Routing (movian/page)

Movian's navigation system bridges C-level URL handling with JS-level route callbacks.

| Feature | Location | Description |
|---------|----------|-------------|
| **Core Navigator** | `src/navigator.c` | Manages the page stack and history. |
| **URL Dispatcher** | `src/navigator.c` | `nav_open_url()`: Decides which handler (C or JS) opens a URL. |
| **JS Route Bridge** | `src/ecmascript/es_route.c` | `ecmascript_openuri()`: The bridge that calls JS `Route` callbacks. |
| **Regex Matching** | `src/ecmascript/es_route.c` | `es_route_create()`: Compiles JS route patterns into C regex. |

## 🌐 Networking & WebSockets

| Feature | Location | Description |
|---------|----------|-------------|
| **HTTP Client** | `src/ecmascript/es_io.c` | Implementation of the `movian/http` module. |
| **WebSocket Bridge** | `src/ecmascript/es_websocket.c` | Bridges `movian/websocket` to the internal networking stack. |
| **WS Server** | `src/ecmascript/es_websocket.c` | `es_websocket_server_create()`: Registers WS handlers on the internal HTTP server. |
| **WS Data Flow** | `src/ecmascript/es_websocket.c` | `ews_input()`: Receives frames from C and pushes them to JS `onInput`. |
| **Internal Server** | `src/networking/http_server.c` | The engine's built-in server (used for `/api/prop` and WS). |

## 🛠 State & Debugging Tools

| Feature | Location | Description |
|---------|----------|-------------|
| **Prop System Bridge** | `src/ecmascript/es_prop.c` | Bridges JS `movian/prop` to the C property system. |
| **Prop HTTP API** | `src/prop/prop_http.c` | Implements the `/api/prop` endpoints for real-time inspection. |
| **Console Bridge** | `src/ecmascript/es_console.c` | Redirects `console.log` to the C `TRACE` system. |
| **Trace System** | `src/trace.c` | Handles log rotation, file writing, and optional UDP networking. |
| **KVStore Bridge** | `src/ecmascript/es_kvstore.c` | Bridges `movian/store` to the persistent sqlite/file storage. |

## 📦 Low-Level Dependencies

- **Duktape Engine:** `ext/duktape/duktape.c`
- **Regex Engine:** `src/misc/regex.c`
- **HTTP/TLS Stack:** `src/networking/`
