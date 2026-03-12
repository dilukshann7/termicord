<div align="center">

<img src="public/termicord.png" alt="termicord logo">
<br />
<h2>A beautiful, terminal-native Discord attachment downloader</h2>
<p>Built with TypeScript · Powered by Bun · UI rendered by OpenTUI</p>

---

[![Bun](https://img.shields.io/badge/Runtime-Bun-f9a8d4?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-8b5cf6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![OpenTUI](https://img.shields.io/badge/UI-OpenTUI-e879f9?style=for-the-badge&logo=zig&logoColor=white)](https://github.com/anomalyco/opentui)
[![Discord API](https://img.shields.io/badge/Discord-API%20v10-c4b5fd?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/developers/docs/intro)

</div>

---

## Overview

`termicord` is a sleek, fully terminal-native tool to **bulk-download all attachments from any Discord channel** you have access to. It talks directly to the Discord REST API v10, handles rate-limiting gracefully, and wraps everything in a gorgeous animated TUI — no browser, no Electron, no nonsense.

The interface is powered by **[OpenTUI](https://github.com/anomalyco/opentui)**, a Zig-native terminal UI library exposed to the JavaScript ecosystem via `@opentui/core`. This means pixel-perfect box rendering, smooth animations, mouse support, and focus management — all at near-native speed.

---

## Features

| Feature | Details |
|---|---|
| **Animated TUI** | Staggered banner + cascading panel reveal on startup |
| **Bulk Attachment Download** | Fetches every attachment from an entire channel history |
| **Auto Rate-Limit Handling** | Detects Discord 429 responses and backs off automatically |
| **Per-Message Folders** | Optional mode to create one folder per message, named by date + author + snippet |
| **Extension Filtering** | Skip specific file types (e.g. `.jpg .png .gif`) before any download begins |
| **Abort Support** | Press `Esc` at any time to cleanly cancel an in-flight download |
| **Live Log Tab** | Real-time timestamped log output in a scrollable panel |
| **Responsive Layout** | Full-width banner on wide terminals, compact mode on narrow ones |
| **Mouse Support** | Click the Download button directly |
| **Duplicate Detection** | Skips files that already exist on disk |

---

## UI Powered by OpenTUI + Zig

The entire terminal interface is driven by **`@opentui/core`**, which is built on top of a **Zig**-native rendering engine. This gives the TUI:

- **Sub-millisecond render cycles** via Zig's zero-overhead abstractions
- **True-color (24-bit) support** — every hex color you see (`#c4b5fd`, `#f0abfc`, etc.) is rendered natively
- **Composable renderables** — `BoxRenderable`, `TextRenderable`, `InputRenderable` — each a self-contained layout node
- **Event-driven input** — keyboard and mouse events propagate through a typed event bus backed by native I/O
- **Flex-style layout engine** — `flexDirection`, `justifyContent`, `alignItems`, `overflow: scroll` — a real layout system, not ASCII hacks

> Zig's `comptime` and manual memory model allow OpenTUI to avoid GC pauses entirely, making the UI feel instant even on low-spec hardware.

---

## Architecture

```
termicord/
├── index.ts        # TUI shell — all UI logic, layout, key bindings, animation
├── middleware.ts   # Thin adapter — bridges raw config from the UI to the backend
├── backend.ts      # Core engine — Discord API calls, download logic, abort support
├── package.json    # Bun project manifest
└── tsconfig.json   # TypeScript config
```

### Data Flow

```
[ User Input (TUI) ]
        │
        ▼
[ middleware.ts: startDownloadTask() ]
   ↳ Parses raw string config (extensions, paths)
   ↳ Creates AbortController
        │
        ▼
[ backend.ts: runDownload() ]
   ↳ Authenticates with Discord API v10
   ↳ Paginates all messages (100/page, cursor-based)
   ↳ Filters attachments by extension
   ↳ Downloads binaries with timeout + retry
   ↳ Emits typed DownloadProgress events
        │
        ▼
[ index.ts: addLog() → logsText.content ]
   ↳ Timestamped lines rendered live in the Logs tab
```

---

## Requirements

| Dependency | Version |
|---|---|
| [Bun](https://bun.sh) | `>= 1.3.10` |
| [TypeScript](https://www.typescriptlang.org) | `^5.x` |
| [`@opentui/core`](https://www.npmjs.com/package/@opentui/core) | `^0.1.87` |

> **Node.js is not required.** This project runs exclusively on Bun.

---

## Installation

```
# 1. Clone the repository
git clone https://github.com/dilukshann7/termicord.git
cd termicord

# 2. Install dependencies
bun install

# 3. Launch
bun run index.ts
```

---

## Usage

When the TUI launches, you will see four input fields and a checkbox:

| Field | Description |
|---|---|
| **Discord Token** | Your user or bot token (`Authorization` header value) |
| **Channel ID** | The numeric ID of the target channel |
| **Download Location** | Local path where files will be saved (default: `./downloads`) |
| **Extensions to Skip** | Space or comma-separated extensions to ignore (e.g. `.jpg .gif`) |
| **Folder per message** | When checked, each message gets its own named subfolder |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Tab` | Focus next field |
| `Shift + Tab` | Focus previous field |
| `Space` | Toggle the folder-per-message checkbox |
| `Enter` | Start download (from any field) |
| `Ctrl + E` | Switch to Logs tab |
| `Ctrl + Q` | Switch to Config tab |
| `Esc` | Abort an in-progress download |
| `Ctrl + C` | Exit the application |

---

## How It Works

### Message Pagination

Discord's API returns a maximum of **100 messages per request**. The backend uses a cursor-based pagination loop — each batch uses the snowflake ID of the last message as the `before` parameter — until an empty page signals the end of history.

### Rate Limiting

When Discord returns a `429 Too Many Requests` response, the backend parses the `retry_after` field from the JSON body and sleeps for exactly that duration before retrying the same request. A 500ms inter-page sleep is also applied proactively.

### Abort / Cancellation

Every download task receives a standard [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). The inner loop checks `signal.aborted` before each message and before each file download, so cancellation is clean and immediate.

### File Safety

Before writing any file, the engine checks `fs.existsSync(destPath)`. If the file already exists, it is skipped with a `↩ Already exists` log line, preventing duplicate downloads across multiple runs.

---

## Security Notes

> ⚠️ **Your Discord token is sensitive.** Treat it like a password.

- Your token is **never written to disk** by this tool.
- It is held only in the in-memory TUI input field for the duration of the session.
- It is transmitted exclusively to `discord.com` over HTTPS.
- The token field displays characters as-entered (not masked) — run this tool in a private terminal session.

**Do not share your token.** Account tokens grant full access to your Discord account. Bot tokens should be scoped to only the required permissions.

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

```
# Fork → clone your fork → create a branch
git checkout -b feat/my-improvement

# Make changes, then push
git push origin feat/my-improvement

# Open a PR on GitHub
```

---

## License

Released under the [MIT License](./LICENSE).  
Developed & maintained with ♡ by **[@dilukshann7](https://github.com/dilukshann7)**

---

<div align="center">

*Built with* ♡ *using* **TypeScript** · **Bun** · **OpenTUI** · **Zig**

</div>
