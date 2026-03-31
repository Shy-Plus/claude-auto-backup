// ==UserScript==
// @name         Claude Chat Auto Backup
// @namespace    https://github.com/Shy-Plus/claude-auto-backup
// @version      1.0.0
// @description  每15分钟自动备份 Claude.ai 聊天记录，通过 File System Access API 直接写入本地指定文件夹
// @author       Shy
// @match        https://claude.ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ======================== CONFIG ========================
  var INTERVAL_MS = 15 * 60 * 1000;
  var INITIAL_DELAY_MS = 5000;
  var DATE_LOCALE = 'zh-CN';
  var VERSION = '1.0.0';
  var IDB_NAME = 'claude_backup_fs';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'dirHandle';

  // ======================== File System Access + IndexedDB ========================

  var dirHandle = null;

  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveDirHandle(handle) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function loadDirHandle() {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function pickDirectory() {
    return W.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
      dirHandle = handle;
      return saveDirHandle(handle).then(function () {
        console.log('[CB] Dir selected:', handle.name);
        return true;
      });
    }).catch(function (e) {
      console.warn('[CB] Pick dir failed:', e);
      return false;
    });
  }

  function restoreDirectory() {
    return loadDirHandle().then(function (handle) {
      if (!handle) return false;
      return handle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm === 'granted') {
          dirHandle = handle;
          console.log('[CB] Dir restored:', handle.name);
          return true;
        }
        dirHandle = handle;
        return 'needs-reauth';
      });
    }).catch(function () { return false; });
  }

  function reauthDirectory() {
    if (!dirHandle) return Promise.resolve(false);
    return dirHandle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      return p === 'granted';
    }).catch(function () { return false; });
  }

  function writeFileToDir(filename, content) {
    if (!dirHandle) return Promise.reject(new Error('No dir'));
    return dirHandle.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') throw new Error('Permission expired');
      return dirHandle.getFileHandle(filename, { create: true });
    }).then(function (fh) {
      return fh.createWritable();
    }).then(function (wr) {
      return wr.write(content).then(function () { return wr.close(); });
    });
  }

  // ======================== Util ========================

  function getOrgId() {
    var m = document.cookie.match(/lastActiveOrg=([^;]+)/);
    return m ? m[1] : null;
  }

  function getConversationId() {
    var m = W.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
    return m ? m[1] : null;
  }

  function fmt(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(DATE_LOCALE, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function sanitize(s) {
    return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '').substring(0, 120);
  }

  // ======================== API ========================

  function fetchConv(orgId, convId) {
    return fetch('/api/organizations/' + orgId + '/chat_conversations/' + convId + '?tree=true&rendering_mode=messages&render_all_tools=true', {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    });
  }

  function fetchConvList(orgId) {
    return fetch('/api/organizations/' + orgId + '/chat_conversations?limit=80', {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('List ' + r.status);
      return r.json();
    });
  }

  // ======================== Markdown ========================

  function extractText(blocks) {
    if (!blocks || !Array.isArray(blocks)) return '';
    var parts = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (typeof b === 'string') { parts.push(b); continue; }
      if (b.type === 'text') { parts.push(b.text || ''); continue; }
      if (b.type === 'tool_use') { parts.push('```json\n// Tool: ' + b.name + '\n' + JSON.stringify(b.input, null, 2) + '\n```'); continue; }
      if (b.type === 'tool_result') {
        var c = b.content;
        if (typeof c === 'string') { parts.push('> Tool Result:\n> ' + c); continue; }
        if (Array.isArray(c)) { parts.push(c.map(function (x) { return x.text || ''; }).join('\n')); continue; }
      }
    }
    return parts.filter(Boolean).join('\n\n');
  }

  function flattenMsgs(msgs) {
    var out = [];
    function walk(arr) {
      if (!arr) return;
      for (var i = 0; i < arr.length; i++) {
        out.push(arr[i]);
        if (arr[i].children && arr[i].children.length) walk(arr[i].children);
      }
    }
    walk(msgs);
    out.sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    return out;
  }

  function toMarkdown(data) {
    var title = data.name || 'Untitled Conversation';
    var md = '# ' + title + '\n\n';
    md += '| \u5c5e\u6027 | \u503c |\n|------|----|\n';
    md += '| \u5bf9\u8bdd ID | `' + (data.uuid || '') + '` |\n';
    md += '| \u521b\u5efa\u65f6\u95f4 | ' + fmt(data.created_at) + ' |\n';
    md += '| \u6700\u540e\u66f4\u65b0 | ' + fmt(data.updated_at) + ' |\n';
    md += '| \u5907\u4efd\u65f6\u95f4 | ' + fmt(new Date().toISOString()) + ' |\n';
    md += '| \u6a21\u578b | ' + (data.model || 'N/A') + ' |\n\n---\n\n';

    var msgs = flattenMsgs(data.chat_messages);
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var text = extractText(m.content);
      if (!text.trim()) continue;
      var who = m.sender === 'human' ? 'Human' : 'Claude';
      var ts = fmt(m.created_at);
      md += '## ' + who + (ts ? ' (' + ts + ')' : '') + '\n\n' + text + '\n\n---\n\n';
    }
    return md;
  }

  // ======================== Index (GM storage) ========================

  function loadIndex() { return GM_getValue('cb_index', {}); }
  function saveIndex(idx) { GM_setValue('cb_index', idx); }

  function updateIndex(convId, data) {
    var idx = loadIndex();
    var msgs = flattenMsgs(data.chat_messages);
    var cnt = 0;
    for (var i = 0; i < msgs.length; i++) { if (extractText(msgs[i].content).trim()) cnt++; }
    idx[convId] = {
      title: data.name || 'Untitled',
      updated_at: data.updated_at,
      backup_at: new Date().toISOString(),
      msg_count: cnt
    };
    saveIndex(idx);
  }

  // ======================== UI ========================

  var bubbleEl, panelEl, statusEl, lastEl, nextEl, dirNameEl;
  var isExpanded = false;
  var needsReauth = false;
  var countdownTimer = null;
  var nextTime = 0;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(e.style, attrs[k]);
        } else if (k === 'textContent') {
          e.textContent = attrs[k];
        } else if (k === 'onclick') {
          e.addEventListener('click', attrs[k]);
        } else {
          e.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      });
    }
    return e;
  }

  function injectStyles() {
    var css = document.createElement('style');
    css.textContent = [
      '#cb-bubble{position:fixed;bottom:24px;right:24px;z-index:99999;width:44px;height:44px;border-radius:50%;',
      'background:rgba(255,255,255,0.45);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);',
      'border:1px solid rgba(255,255,255,0.5);box-shadow:0 4px 24px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);',
      'cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .35s cubic-bezier(.4,0,.2,1);user-select:none}',
      '#cb-bubble:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(0,0,0,0.12);background:rgba(255,255,255,0.6)}',
      '#cb-bubble.hidden{opacity:0;pointer-events:none;transform:scale(0.6)}',
      '#cb-bubble svg{width:22px;height:22px;opacity:0.7;transition:opacity .2s}',
      '#cb-bubble:hover svg{opacity:0.9}',
      '#cb-dot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;',
      'background:#34d399;border:1.5px solid rgba(255,255,255,0.8);transition:background .3s}',
      '#cb-dot.busy{background:#fbbf24;animation:cbp 1.2s ease-in-out infinite}',
      '#cb-dot.err{background:#f87171}',
      '#cb-dot.nodir{background:#fb923c;animation:cbp 2s ease-in-out infinite}',
      '@keyframes cbp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}',
      '#cb-panel{position:fixed;bottom:24px;right:24px;z-index:99999;width:290px;border-radius:18px;',
      'background:rgba(255,255,255,0.42);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);',
      'border:1px solid rgba(255,255,255,0.5);box-shadow:0 8px 40px rgba(0,0,0,0.1),0 2px 8px rgba(0,0,0,0.04);',
      'font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,Segoe UI,Roboto,sans-serif;',
      'font-size:13px;color:rgba(0,0,0,0.75);overflow:hidden;',
      'opacity:0;pointer-events:none;transform:translateY(12px) scale(0.95);transition:all .35s cubic-bezier(.4,0,.2,1);user-select:none}',
      '#cb-panel.show{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}',
      '.cb-hdr{display:flex;align-items:center;padding:14px 16px 10px;gap:8px}',
      '.cb-hdr svg{width:18px;height:18px;opacity:0.6}',
      '.cb-hdr-t{flex:1;font-weight:600;font-size:14px;color:rgba(0,0,0,0.8);letter-spacing:-0.2px}',
      '.cb-x{width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,0.06);color:rgba(0,0,0,0.4);',
      'font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;padding:0;line-height:1}',
      '.cb-x:hover{background:rgba(0,0,0,0.1);color:rgba(0,0,0,0.7)}',
      '.cb-info{padding:0 16px 12px;display:flex;flex-direction:column;gap:4px}',
      '.cb-s{font-weight:500;font-size:13px;color:rgba(0,0,0,0.7)}',
      '.cb-m{font-size:11.5px;color:rgba(0,0,0,0.4);letter-spacing:0.1px}',
      '.cb-dir{font-size:11px;color:rgba(0,0,0,0.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.cb-div{height:1px;background:rgba(0,0,0,0.06);margin:0 16px}',
      '.cb-acts{padding:12px 16px 14px;display:flex;gap:8px;flex-wrap:wrap}',
      '.cb-b{flex:1;min-width:55px;padding:7px 0;border:none;border-radius:10px;font-size:12px;font-weight:500;',
      'cursor:pointer;transition:all .2s;letter-spacing:0.1px;white-space:nowrap}',
      '.cb-bp{background:rgba(0,0,0,0.7);color:rgba(255,255,255,0.95)}',
      '.cb-bp:hover{background:rgba(0,0,0,0.85)}',
      '.cb-bs{background:rgba(0,0,0,0.06);color:rgba(0,0,0,0.6)}',
      '.cb-bs:hover{background:rgba(0,0,0,0.1);color:rgba(0,0,0,0.8)}',
      '.cb-b:active{transform:scale(.96)}',
      '@media(prefers-color-scheme:dark){',
      '#cb-bubble{background:rgba(40,40,50,0.55);border-color:rgba(255,255,255,0.12);box-shadow:0 4px 24px rgba(0,0,0,0.25)}',
      '#cb-bubble:hover{background:rgba(50,50,60,0.7)}',
      '#cb-panel{background:rgba(30,30,40,0.55);border-color:rgba(255,255,255,0.1);box-shadow:0 8px 40px rgba(0,0,0,0.3);color:rgba(255,255,255,0.8)}',
      '.cb-hdr-t{color:rgba(255,255,255,0.9)} .cb-s{color:rgba(255,255,255,0.8)}',
      '.cb-m{color:rgba(255,255,255,0.4)} .cb-dir{color:rgba(255,255,255,0.3)}',
      '.cb-div{background:rgba(255,255,255,0.08)}',
      '.cb-x{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)}',
      '.cb-x:hover{background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7)}',
      '.cb-bp{background:rgba(255,255,255,0.85);color:rgba(0,0,0,0.85)}',
      '.cb-bp:hover{background:rgba(255,255,255,0.95)}',
      '.cb-bs{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5)}',
      '.cb-bs:hover{background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.8)}',
      '#cb-bubble svg,.cb-hdr svg{filter:invert(1)}',
      '}',
      'html[data-theme=dark] #cb-bubble,body.dark #cb-bubble{background:rgba(40,40,50,0.55);border-color:rgba(255,255,255,0.12)}',
      'html[data-theme=dark] #cb-panel,body.dark #cb-panel{background:rgba(30,30,40,0.55);border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8)}',
      'html[data-theme=dark] .cb-hdr-t,body.dark .cb-hdr-t{color:rgba(255,255,255,0.9)}',
      'html[data-theme=dark] .cb-s,body.dark .cb-s{color:rgba(255,255,255,0.8)}',
      'html[data-theme=dark] .cb-m,body.dark .cb-m{color:rgba(255,255,255,0.4)}',
      'html[data-theme=dark] .cb-dir,body.dark .cb-dir{color:rgba(255,255,255,0.3)}',
      'html[data-theme=dark] .cb-div,body.dark .cb-div{background:rgba(255,255,255,0.08)}',
      'html[data-theme=dark] .cb-x,body.dark .cb-x{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4)}',
      'html[data-theme=dark] .cb-bp,body.dark .cb-bp{background:rgba(255,255,255,0.85);color:rgba(0,0,0,0.85)}',
      'html[data-theme=dark] .cb-bs,body.dark .cb-bs{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5)}',
      'html[data-theme=dark] #cb-bubble svg,html[data-theme=dark] .cb-hdr svg,',
      'body.dark #cb-bubble svg,body.dark .cb-hdr svg{filter:invert(1)}'
    ].join('\n');
    document.head.appendChild(css);
  }

  function makeSVG() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M12 16v-8');
    var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M8 12l4 4 4-4');
    var p3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p3.setAttribute('d', 'M20 16.7A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25');
    s.appendChild(p1);
    s.appendChild(p2);
    s.appendChild(p3);
    return s;
  }

  function createUI() {
    if (bubbleEl) return;

    // Bubble
    bubbleEl = el('div', { id: 'cb-bubble' });
    bubbleEl.appendChild(makeSVG());
    var dot = el('div', { id: 'cb-dot' });
    bubbleEl.appendChild(dot);
    bubbleEl.addEventListener('click', function () { togglePanel(true); });
    document.body.appendChild(bubbleEl);

    // Panel
    panelEl = el('div', { id: 'cb-panel' });

    // Header
    var hdr = el('div', { class: 'cb-hdr' });
    hdr.appendChild(makeSVG());
    hdr.appendChild(el('div', { class: 'cb-hdr-t', textContent: 'Chat Backup' }));
    var closeBtn = el('button', { class: 'cb-x', textContent: '\u00d7', onclick: function () { togglePanel(false); } });
    hdr.appendChild(closeBtn);
    panelEl.appendChild(hdr);

    // Info
    var info = el('div', { class: 'cb-info' });
    statusEl = el('div', { class: 'cb-s', textContent: '\u521d\u59cb\u5316\u4e2d...' });
    lastEl = el('div', { class: 'cb-m', textContent: '\u4e0a\u6b21\u5907\u4efd: --' });
    nextEl = el('div', { class: 'cb-m', textContent: '\u4e0b\u6b21\u5907\u4efd: --' });
    dirNameEl = el('div', { class: 'cb-dir', textContent: '\u672a\u9009\u62e9\u5907\u4efd\u76ee\u5f55' });
    info.appendChild(statusEl);
    info.appendChild(lastEl);
    info.appendChild(nextEl);
    info.appendChild(dirNameEl);
    panelEl.appendChild(info);

    // Divider
    panelEl.appendChild(el('div', { class: 'cb-div' }));

    // Actions
    var acts = el('div', { class: 'cb-acts' });
    acts.appendChild(el('button', { class: 'cb-b cb-bp', textContent: '\u5907\u4efd\u5f53\u524d', onclick: function () { backupCurrent(); } }));
    acts.appendChild(el('button', { class: 'cb-b cb-bs', textContent: '\u5907\u4efd\u5168\u90e8', onclick: function () { backupAll(); } }));
    acts.appendChild(el('button', { class: 'cb-b cb-bs', id: 'cb-btn-dir', textContent: '\u9009\u62e9\u76ee\u5f55', onclick: handleDirBtn }));
    panelEl.appendChild(acts);

    document.body.appendChild(panelEl);

    // Click outside to close
    document.addEventListener('click', function (e) {
      if (isExpanded && !panelEl.contains(e.target) && !bubbleEl.contains(e.target)) {
        togglePanel(false);
      }
    });

    updateDirDisplay();
  }

  function togglePanel(show) {
    isExpanded = show;
    if (show) {
      bubbleEl.classList.add('hidden');
      panelEl.classList.add('show');
    } else {
      panelEl.classList.remove('show');
      setTimeout(function () { bubbleEl.classList.remove('hidden'); }, 150);
    }
  }

  function setStatus(text, type) {
    var d = document.getElementById('cb-dot');
    if (d) d.className = type === 'busy' ? 'busy' : type === 'err' ? 'err' : type === 'nodir' ? 'nodir' : '';
    if (statusEl) statusEl.textContent = text;
  }

  function setLast() {
    if (lastEl) lastEl.textContent = '\u4e0a\u6b21\u5907\u4efd: ' + fmt(new Date().toISOString());
  }

  function updateDirDisplay() {
    if (!dirNameEl) return;
    dirNameEl.textContent = dirHandle ? ('\u76ee\u5f55: ' + dirHandle.name + '/') : '\u672a\u9009\u62e9\u5907\u4efd\u76ee\u5f55';
  }

  function startCountdown() {
    nextTime = Date.now() + INTERVAL_MS;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      if (!nextEl) return;
      var r = Math.max(0, nextTime - Date.now());
      var m = Math.floor(r / 60000);
      var s = Math.floor((r % 60000) / 1000);
      nextEl.textContent = '\u4e0b\u6b21\u5907\u4efd: ' + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function handleDirBtn() {
    if (needsReauth && dirHandle) {
      reauthDirectory().then(function (ok) {
        if (ok) {
          needsReauth = false;
          setStatus('\u6743\u9650\u5df2\u6062\u590d', '');
          updateDirDisplay();
          var btn = document.getElementById('cb-btn-dir');
          if (btn) btn.textContent = '\u9009\u62e9\u76ee\u5f55';
          if (getConversationId()) backupCurrent();
        } else {
          setStatus('\u6388\u6743\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', 'err');
        }
      });
    } else {
      pickDirectory().then(function (ok) {
        if (ok) {
          needsReauth = false;
          setStatus('\u76ee\u5f55\u5df2\u8bbe\u7f6e', '');
          updateDirDisplay();
          if (getConversationId()) backupCurrent();
        }
      });
    }
  }

  // ======================== Backup ========================

  function backupCurrent() {
    var orgId = getOrgId();
    var convId = getConversationId();
    if (!orgId) { setStatus('\u672a\u767b\u5f55', 'err'); return Promise.resolve(); }
    if (!convId) { setStatus('\u8bf7\u6253\u5f00\u4e00\u4e2a\u5bf9\u8bdd', ''); return Promise.resolve(); }
    if (!dirHandle) { setStatus('\u8bf7\u5148\u9009\u62e9\u5907\u4efd\u76ee\u5f55', 'nodir'); return Promise.resolve(); }

    return dirHandle.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') {
        needsReauth = true;
        setStatus('\u76ee\u5f55\u6743\u9650\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u6388\u6743', 'nodir');
        var btn = document.getElementById('cb-btn-dir');
        if (btn) btn.textContent = '\u91cd\u65b0\u6388\u6743';
        return;
      }

      setStatus('\u5907\u4efd\u4e2d...', 'busy');
      return fetchConv(orgId, convId).then(function (data) {
        var md = toMarkdown(data);
        var fn = sanitize(data.name || 'untitled') + '_' + convId.slice(0, 8) + '.md';
        return writeFileToDir(fn, md).then(function () {
          updateIndex(convId, data);
          var msgs = flattenMsgs(data.chat_messages);
          var cnt = 0;
          for (var i = 0; i < msgs.length; i++) { if (extractText(msgs[i].content).trim()) cnt++; }
          setStatus('\u5df2\u4fdd\u5b58 ' + cnt + ' \u6761\u6d88\u606f', '');
          setLast();
          console.log('[CB] OK: ' + fn + ' (' + cnt + ')');
        });
      });
    }).catch(function (e) {
      setStatus('\u5931\u8d25: ' + e.message, 'err');
      console.error('[CB]', e);
    });
  }

  function backupAll() {
    var orgId = getOrgId();
    if (!orgId) { setStatus('\u672a\u767b\u5f55', 'err'); return; }
    if (!dirHandle) { setStatus('\u8bf7\u5148\u9009\u62e9\u76ee\u5f55', 'nodir'); return; }

    dirHandle.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') { needsReauth = true; setStatus('\u6743\u9650\u5df2\u5931\u6548', 'nodir'); return; }

      setStatus('\u83b7\u53d6\u5217\u8868...', 'busy');
      return fetchConvList(orgId).then(function (raw) {
        var list = Array.isArray(raw) ? raw : (raw.data || raw.chat_conversations || []);
        if (!list.length) { setStatus('\u65e0\u5bf9\u8bdd', ''); return; }

        var ok = 0, fail = 0, i = 0;
        function next() {
          if (i >= list.length) {
            setStatus('\u5b8c\u6210: ' + ok + ' \u6210\u529f' + (fail ? ', ' + fail + ' \u5931\u8d25' : ''), '');
            setLast();
            return;
          }
          var c = list[i];
          var id = c.uuid || c.id;
          setStatus('(' + (i + 1) + '/' + list.length + ') ' + (c.name || 'Untitled').slice(0, 20), 'busy');
          fetchConv(orgId, id).then(function (data) {
            var md = toMarkdown(data);
            var fn = sanitize(data.name || 'untitled') + '_' + id.slice(0, 8) + '.md';
            return writeFileToDir(fn, md).then(function () { updateIndex(id, data); ok++; });
          }).catch(function () { fail++; }).then(function () {
            i++;
            setTimeout(next, 400);
          });
        }
        next();
      });
    }).catch(function (e) { setStatus('\u5931\u8d25: ' + e.message, 'err'); });
  }

  // ======================== Schedule & Route ========================

  var timer = null;

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      console.log('[CB] Auto backup');
      backupCurrent();
      startCountdown();
    }, INTERVAL_MS);
    startCountdown();
  }

  var lastHref = W.location.href;
  new MutationObserver(function () {
    if (W.location.href !== lastHref) {
      lastHref = W.location.href;
      if (getConversationId()) {
        setTimeout(function () { backupCurrent(); }, 2000);
        startCountdown();
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ======================== Menu ========================

  GM_registerMenuCommand('\u9009\u62e9\u5907\u4efd\u76ee\u5f55', function () { pickDirectory().then(updateDirDisplay); });
  GM_registerMenuCommand('\u5907\u4efd\u5f53\u524d\u5bf9\u8bdd', backupCurrent);
  GM_registerMenuCommand('\u5907\u4efd\u5168\u90e8\u5bf9\u8bdd', backupAll);
  GM_registerMenuCommand('\u67e5\u770b\u5907\u4efd\u7edf\u8ba1', function () {
    var idx = loadIndex();
    var keys = Object.keys(idx);
    var entries = [];
    keys.forEach(function (k) { entries.push([k, idx[k]]); });
    entries.sort(function (a, b) { return new Date(b[1].backup_at) - new Date(a[1].backup_at); });
    entries = entries.slice(0, 30);
    var info = '\u5171 ' + keys.length + ' \u4e2a\u5bf9\u8bdd\u5907\u4efd\n';
    info += '\u76ee\u5f55: ' + (dirHandle ? dirHandle.name + '/' : '\u672a\u8bbe\u7f6e') + '\n';
    for (var i = 0; i < entries.length; i++) {
      var m = entries[i][1];
      info += m.title + '  |  ' + m.msg_count + '\u6761  |  ' + fmt(m.backup_at) + '\n';
    }
    alert(info);
  });

  // ======================== Init ========================

  function init() {
    console.log('[CB] v' + VERSION + ' loaded');
    injectStyles();
    createUI();

    restoreDirectory().then(function (result) {
      if (result === true) {
        updateDirDisplay();
        setStatus('\u7b49\u5f85\u9996\u6b21\u5907\u4efd...');
      } else if (result === 'needs-reauth') {
        needsReauth = true;
        updateDirDisplay();
        setStatus('\u70b9\u51fb\u5706\u5708 \u2192 \u91cd\u65b0\u6388\u6743\u76ee\u5f55', 'nodir');
        var btn = document.getElementById('cb-btn-dir');
        if (btn) btn.textContent = '\u91cd\u65b0\u6388\u6743';
      } else {
        setStatus('\u8bf7\u5148\u9009\u62e9\u5907\u4efd\u76ee\u5f55', 'nodir');
      }

      setTimeout(function () {
        if (dirHandle && !needsReauth && getConversationId()) {
          backupCurrent();
        }
        schedule();
      }, INITIAL_DELAY_MS);
    });
  }

  if (document.readyState === 'complete') init();
  else W.addEventListener('load', init);
})();
