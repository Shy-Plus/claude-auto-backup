# Claude Chat Auto Backup

[English](#english) | [中文](#中文)

---

<a id="english"></a>

> Automatically backup your Claude.ai conversations to local Markdown files — zero cloud, zero hassle.

A Tampermonkey userscript that saves your [Claude.ai](https://claude.ai) chat history as `.md` files directly to a local folder. Runs silently in the background with a minimal, elegant UI.

## ✨ Features

- **Auto-save every 15 minutes** — also triggers on conversation switch
- **Direct local file writing** — uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API), no downloads dialog
- **Persistent directory** — folder handle cached in IndexedDB, survives browser restarts
- **One file per conversation** — named `{title}_{id}.md`, overwrites on update
- **Full Markdown export** — metadata table + all messages with timestamps
- **Backup all conversations** — one-click batch export (up to 80 recent chats)
- **Glassmorphism UI** — minimal floating bubble + expandable panel
- **Dark mode support** — auto-adapts to system / Claude theme
- **Backup index** — tracks all backed-up conversations with message counts

## 📸 UI

The floating bubble sits in the bottom-right corner:

- 🟢 Green dot — running normally
- 🟡 Yellow dot — backup in progress
- 🟠 Orange dot — directory not set / needs re-auth
- 🔴 Red dot — error

Click the bubble to expand the control panel (glassmorphism style, auto dark mode).

## 🚀 Installation

### Prerequisites

- **Chrome / Edge / Brave** (or any Chromium-based browser)
- **[Tampermonkey](https://www.tampermonkey.net/)** extension installed

> ⚠️ Firefox is **not** supported — the File System Access API is Chromium-only.

### Steps

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Create a new script in Tampermonkey and paste the contents of [`claude-auto-backup.user.js`](claude-auto-backup.user.js)
3. Open [claude.ai](https://claude.ai)
4. Click the floating bubble (bottom-right) → **Select Directory** → pick a local folder
5. Done! Chats auto-backup every 15 minutes from now on

## 📁 Output

```
~/Claude_Backups/
├── React_hooks_deep_dive_a1b2c3d4.md
├── Python_async_patterns_e5f6g7h8.md
├── Travel_planning_i9j0k1l2.md
└── ...
```

Each `.md` file:

```markdown
# Conversation Title

| Property | Value |
|----------|-------|
| ID       | `a1b2c3d4-...` |
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
| `INITIAL_DELAY_MS` | `5000` | Delay before first backup |
| `DATE_LOCALE` | `'zh-CN'` | Date format locale |

## 🔧 How It Works

1. **File System Access API** — `showDirectoryPicker()` gets a writable directory handle, persisted in IndexedDB
2. **Claude Internal API** — reads conversations via `/api/organizations/{org}/chat_conversations/` using your existing session cookies
3. **MutationObserver** — detects URL changes (conversation switches) to trigger immediate backup
4. **Tampermonkey GM APIs** — `GM_setValue` / `GM_getValue` for backup index, `GM_registerMenuCommand` for quick access

## 🔒 Privacy & Security

- **100% local** — all data stays on your machine
- **No external requests** — only talks to `claude.ai` using your existing session
- **No tracking** — zero analytics, zero telemetry
- **Open source** — read every line yourself

## 🤔 FAQ

**Q: Chrome says "site wants to edit files" — is this safe?**
A: Yes. Standard File System Access API prompt. The script only writes `.md` files to the folder you chose.

**Q: What happens after Chrome restarts?**
A: Directory handle is cached in IndexedDB. If permission expired, the bubble turns orange — click and confirm re-auth.

**Q: Does it work with Claude Pro / Team / Enterprise?**
A: Yes, any Claude.ai plan with web access.

**Q: Why not Firefox?**
A: `showDirectoryPicker` is Chromium-only. No Firefox support yet.

---

<a id="中文"></a>

# Claude 聊天自动备份

> 自动将 Claude.ai 对话保存为本地 Markdown 文件 — 零云端、零弹窗。

一个 Tampermonkey 油猴脚本，每 15 分钟自动将 [Claude.ai](https://claude.ai) 聊天记录以 `.md` 格式直接写入本地文件夹。后台静默运行，配有极简毛玻璃 UI。

## ✨ 功能

- **每 15 分钟自动保存** — 切换对话时也会立即触发
- **直接写入本地文件** — 使用 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)，无下载弹窗
- **目录持久化** — 文件夹句柄缓存在 IndexedDB，重启浏览器不丢失
- **一个对话一个文件** — 文件名 `{标题}_{ID前8位}.md`，同名直接覆盖更新
- **完整 Markdown 导出** — 元数据表格 + 所有消息带时间戳
- **一键备份全部对话** — 批量导出最近 80 个对话
- **毛玻璃 UI** — 右下角悬浮气泡 + 展开面板
- **深色模式** — 自动适配系统 / Claude 主题
- **备份索引** — 追踪所有已备份对话及消息数量

## 📸 界面

右下角悬浮气泡状态指示：

- 🟢 绿色 — 正常运行
- 🟡 黄色 — 备份中
- 🟠 橙色 — 未选目录 / 需重新授权
- 🔴 红色 — 出错

点击气泡展开控制面板（毛玻璃风格，自动深色模式）。

## 🚀 安装

### 前置条件

- **Chrome / Edge / Brave**（或任何 Chromium 内核浏览器）
- 已安装 **[Tampermonkey](https://www.tampermonkey.net/)** 扩展

> ⚠️ 不支持 Firefox — File System Access API 仅限 Chromium 浏览器。

### 步骤

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 在 Tampermonkey 中新建脚本，粘贴 [`claude-auto-backup.user.js`](claude-auto-backup.user.js) 的内容
3. 打开 [claude.ai](https://claude.ai)
4. 点击右下角悬浮气泡 → **选择目录** → 选一个本地文件夹
5. 搞定！之后每 15 分钟自动备份

## 📁 输出格式

```
~/Claude_Backups/
├── React_Hooks深入讨论_a1b2c3d4.md
├── Python异步模式_e5f6g7h8.md
├── 旅行规划_i9j0k1l2.md
└── ...
```

每个 `.md` 文件包含：

```markdown
# 对话标题

| 属性 | 值 |
|------|-----|
| 对话 ID | `a1b2c3d4-...` |
| 创建时间 | 2026/03/31 20:00:00 |
| 最后更新 | 2026/03/31 20:15:00 |
| 备份时间 | 2026/03/31 20:15:05 |
| 模型 | claude-opus-4-6 |

---

## Human (2026/03/31 20:00:00)

你的消息...

---

## Claude (2026/03/31 20:00:05)

Claude 的回复...
```

## ⚙️ 配置

修改脚本顶部的常量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `INTERVAL_MS` | `15 * 60 * 1000` | 自动备份间隔（15 分钟） |
| `INITIAL_DELAY_MS` | `5000` | 页面加载后首次备份延迟 |
| `DATE_LOCALE` | `'zh-CN'` | 日期格式 |

## 🔧 工作原理

1. **File System Access API** — `showDirectoryPicker()` 获取可写目录句柄，持久化到 IndexedDB
2. **Claude 内部 API** — 通过 `/api/organizations/{org}/chat_conversations/` 读取对话，使用你现有的登录 Cookie
3. **MutationObserver** — 监听 URL 变化（切换对话）立即触发备份
4. **Tampermonkey GM API** — `GM_setValue` / `GM_getValue` 管理备份索引，`GM_registerMenuCommand` 提供快捷菜单

## 🔒 隐私与安全

- **100% 本地** — 所有数据留在你的电脑上
- **无外部请求** — 仅与 `claude.ai` 通信，使用你现有的会话
- **无追踪** — 零分析、零遥测
- **开源** — 每一行代码都可以自己审查

## 🤔 常见问题

**Q: Chrome 提示"网站想要编辑文件"，安全吗？**
A: 安全。这是 File System Access API 的标准权限提示，脚本只会往你选的文件夹写 `.md` 文件。

**Q: 重启 Chrome 后怎么办？**
A: 目录句柄缓存在 IndexedDB 中。如果权限过期，气泡变橙色，点一下确认重新授权即可，不需要重新选目录。

**Q: 支持 Claude Pro / Team / Enterprise 吗？**
A: 支持，只要能用网页版 Claude.ai 就行。

**Q: 为什么不支持 Firefox？**
A: `showDirectoryPicker` 是 Chromium 独有 API，Firefox 暂不支持。

## 📄 License

[MIT](LICENSE)

## 🙏 Credits

Built with [Manus](https://manus.im) + human iteration.

---

如果这个脚本帮你避免了丢失对话，考虑给个 ⭐
