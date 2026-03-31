# Claude Chat Auto Backup

> Automatically backup your Claude.ai conversations to local files — zero cloud, zero hassle.

A Tampermonkey userscript that saves your [Claude.ai](https://claude.ai) chat history as Markdown files directly to a local folder. Runs silently in the background with a minimal, elegant UI.

## ✨ Features

- **Auto-save every 15 minutes** — also triggers on conversation switch
- **Direct local file writing** — uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), no downloads dialog
- **Persistent directory** — folder handle cached in IndexedDB, survives browser restarts
- **One file per conversation** — named `{title}_{id}.md`, overwrites on update
- **Full Markdown export** — metadata table + all messages with timestamps
- **Backup all conversations** — one-click batch export (up to 80 recent chats)
- **Glassmorphism UI** — minimal floating bubble + expandable panel
- **Dark mode support** — auto-adapts to system/Claude theme
- **Backup index** — tracks all backed-up conversations with message counts

## 📸 Preview

| Light Mode | Dark Mode |
|:---:|:---:|
| Floating bubble with status indicator | Glassmorphism panel with controls |

The floating bubble sits in the bottom-right corner:
- 🟢 Green dot = running normally
- 🟡 Yellow dot = backup in progress
- 🟠 Orange dot = directory not set / needs re-auth
- 🔴 Red dot = error

## 🚀 Installation

### Prerequisites

- **Chrome / Edge / Brave** (or any Chromium browser)
- **[Tampermonkey](https://www.tampermonkey.net/)** extension installed

> ⚠️ Firefox is not supported — the File System Access API is Chromium-only.

### Steps

1. Install [Tampermonkey](https://www.tampermonkey.net/) if you haven't already
2. Click the link below to install the script:

   **[Install claude-auto-backup.user.js](claude-auto-backup.user.js)** (or create a new script in Tampermonkey and paste the code)

3. Open [claude.ai](https://claude.ai)
4. Click the floating bubble (bottom-right) → **Select Directory** → pick a local folder
5. Done! Your chats will auto-backup every 15 minutes

## 📁 Output Format

```
~/Documents/Claude_Backups/
├── Amazon_Agent架构讨论_2a0d836e.md
├── MCP协议研究_f3b21c4a.md
├── 港股分析_8e08477b.md
└── ...
```

Each `.md` file contains:

```markdown
# Conversation Title

| Property | Value |
|----------|-------|
| ID       | `uuid-here` |
| Created  | 2026/03/31 20:00:00 |
| Updated  | 2026/03/31 20:15:00 |
| Backup   | 2026/03/31 20:15:05 |
| Model    | claude-opus-4-6 |

---

## Human (2026/03/31 20:00:00)

Your message here...

---

## Claude (2026/03/31 20:00:05)

Claude's response here...
```

## ⚙️ Configuration

Edit these constants at the top of the script:

| Variable | Default | Description |
|----------|---------|-------------|
| `INTERVAL_MS` | `15 * 60 * 1000` | Auto-backup interval (15 min) |
| `INITIAL_DELAY_MS` | `5000` | Delay before first backup after page load |
| `DATE_LOCALE` | `'zh-CN'` | Date format locale |

## 🔧 How It Works

1. **File System Access API** — the script uses `showDirectoryPicker()` to get a writable directory handle, stored in IndexedDB for persistence
2. **Claude API** — reads conversations via Claude's internal API (`/api/organizations/{org}/chat_conversations/`) using your existing session cookies
3. **MutationObserver** — detects URL changes (conversation switches) to trigger immediate backup
4. **Tampermonkey GM APIs** — `GM_setValue`/`GM_getValue` for backup index tracking, `GM_registerMenuCommand` for quick access

## 🔒 Privacy & Security

- **100% local** — all data stays on your machine, nothing is sent anywhere
- **No external requests** — only talks to `claude.ai` APIs using your existing session
- **No tracking** — zero analytics, zero telemetry
- **Open source** — read every line of code yourself

## 🤔 FAQ

**Q: Chrome says "site wants to edit files" — is this safe?**
A: Yes. This is the standard File System Access API permission prompt. The script only writes `.md` files to the folder you explicitly chose.

**Q: What happens after Chrome restarts?**
A: The directory handle is cached in IndexedDB. If the permission expired, the bubble turns orange — just click it and confirm "re-authorize".

**Q: Does it work with Claude Pro / Team / Enterprise?**
A: Yes, it works with any Claude.ai plan that has web access.

**Q: Can I change the backup folder?**
A: Click the bubble → "Select Directory" to pick a new folder anytime.

**Q: Why not Firefox?**
A: The File System Access API (`showDirectoryPicker`) is only available in Chromium browsers. Firefox doesn't support it yet.

## 📄 License

[MIT](LICENSE) — do whatever you want with it.

## 🙏 Credits

Built with [Manus](https://manus.im) + human iteration.

---

If this saves you from losing a conversation, consider giving it a ⭐
