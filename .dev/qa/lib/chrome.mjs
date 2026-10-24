// .dev/qa/lib/chrome.mjs — 无头 Chrome + CDP 客户端（零 npm 依赖，参考 .dev/cdp.mjs 思路重写，不修改原文件）
// 用法：const b = await launchBrowser({ url }); const page = await b.newPage(); ...
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHROME = process.env.QA_CHROME
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- CDP 连接 ---------------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error('CDP ' + JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const h of (this.handlers.get(msg.method) || [])) {
          try { h(msg.params); } catch (e) { /* ignore handler errors */ }
        }
      }
    };
    ws.onclose = () => { this.closed = true; };
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP socket closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { this.pending.delete(id); reject(e); }
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

/* ---------------- 浏览器进程 ---------------- */
export async function launchBrowser(opts = {}) {
  const width = opts.width || 1280;
  const height = opts.height || 720;
  const headless = opts.headless !== false;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-cdp-'));
  const port = opts.port || (9300 + Math.floor(Math.random() * 600));
  const args = [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=CalculateNativeWinOcclusion',
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore', windowsHide: true });
  const browser = {
    port, profile, proc, width, height,
    async dispose() {
      try { if (proc.pid) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {}
      try { proc.kill(); } catch {}
      await sleep(250);
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
    },
  };

  // 等待调试端口就绪
  let version = null;
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch {}
    await sleep(200);
  }
  if (!version) { await browser.dispose(); throw new Error(`Chrome CDP 未就绪（port=${port}）`); }
  browser.version = version;

  // 找 about:blank 页面目标
  let target = null;
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(150);
  }
  if (!target) { await browser.dispose(); throw new Error('未找到可用的页面 target'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('WebSocket 连接失败')); });
  const cdp = new CDP(ws);
  browser._cdp = cdp;

  /* 控制台/异常日志缓冲 */
  const log = [];
  let seq = 0;
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map((a) => (a.value !== undefined ? a.value
      : (a.description || a.type))).join(' ');
    log.push({ seq: ++seq, kind: 'console', level: p.type, text, time: Date.now() });
    if (p.type === 'error') { /* 由调用方统计 */ }
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    const text = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown exception';
    log.push({ seq: ++seq, kind: 'exception', level: 'error', text, url: d.url, line: d.lineNumber, time: Date.now() });
  });
  cdp.on('Log.entryAdded', (p) => {
    const e = p.entry || {};
    log.push({ seq: ++seq, kind: 'log', level: e.level || 'info', text: e.text || '', source: e.source, url: e.url, time: Date.now() });
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  /* ---------------- Page 封装 ---------------- */
  const KEYMAP = (code) => {
    if (/^Key[A-Z]$/.test(code)) return { key: code[3].toLowerCase(), vk: code.charCodeAt(3) };
    if (/^Digit[0-9]$/.test(code)) return { key: code[5], vk: 48 + Number(code[5]) };
    const fixed = {
      Space: [' ', 32], Escape: ['Escape', 27], Tab: ['Tab', 9], Enter: ['Enter', 13],
      ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16], KeyM: ['m', 77],
      ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
      Backspace: ['Backspace', 8], Delete: ['Delete', 46],
    }[code];
    return fixed ? { key: fixed[0], vk: fixed[1] } : { key: code, vk: 0 };
  };

  const page = {
    cdp,
    async evaluate(expression, { awaitPromise = true, userGesture = true, returnByValue = true } = {}) {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue, userGesture });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        const err = new Error('页面内异常: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
        err.exception = d;
        throw err;
      }
      return r.result ? r.result.value : undefined;
    },
    async waitFor(expression, { timeout = 20000, poll = 120, label = '' } = {}) {
      const t0 = Date.now();
      let lastErr = null;
      while (Date.now() - t0 < timeout) {
        try {
          if (await page.evaluate(`(() => { try { return !!(${expression}); } catch (e) { return false; } })()`)) return true;
        } catch (e) { lastErr = e; }
        await sleep(poll);
      }
      throw new Error(`waitFor 超时(${timeout}ms)${label ? ' ' + label : ''}: ${expression}${lastErr ? ' / ' + lastErr.message : ''}`);
    },
    sleep,
    async screenshot(filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      let lastErr = null;
      for (let i = 0; i < 3; i++) {
        try {
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
          fs.writeFileSync(filePath, Buffer.from(shot.data, 'base64'));
          return filePath;
        } catch (e) { lastErr = e; await sleep(250); }
      }
      throw lastErr;
    },
    async reload({ waitReady = true, timeout = 45000 } = {}) {
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(120);
      if (waitReady) await page.waitReady({ timeout });
      try { await page.evaluate(`(() => window.__DEBUG && window.__DEBUG.setAutoPause ? window.__DEBUG.setAutoPause(false) : null)()`); } catch {}
    },
    async waitReady({ timeout = 45000 } = {}) {
      await page.waitFor(`window.__READY === true && !!window.__DEBUG`, { timeout, poll: 150, label: '游戏就绪' });
      return true;
    },
    async navigate(url, { waitReady = true, timeout = 45000 } = {}) {
      await cdp.send('Page.navigate', { url });
      if (waitReady) await page.waitReady({ timeout });
    },
    async render(frames = 2) {
      // 等待 rAF 使画面渲染当前状态（截图前调用）
      await page.evaluate(`new Promise((resolve) => {
        let n = 0; const step = () => { if (++n >= ${frames}) resolve(1); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
      })`);
    },
    async keyDown(code, { modifiers = 0 } = {}) {
      const k = KEYMAP(code);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers,
      });
    },
    async keyUp(code, { modifiers = 0 } = {}) {
      const k = KEYMAP(code);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers,
      });
    },
    async press(code, { holdMs = 60, modifiers = 0 } = {}) {
      await page.keyDown(code, { modifiers });
      await sleep(holdMs);
      await page.keyUp(code, { modifiers });
    },
    async mouseMove(x, y) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    },
    async mouseDown(x, y, button = 'left') {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : button === 'right' ? 2 : 4, clickCount: 1,
      });
    },
    async mouseUp(x, y, button = 'left') {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1,
      });
    },
    async click(x, y, button = 'left') {
      await page.mouseMove(x, y);
      await sleep(30);
      await page.mouseDown(x, y, button);
      await sleep(45);
      await page.mouseUp(x, y, button);
    },
    /* 日志访问 */
    logsSince(sinceSeq) { return log.filter((l) => l.seq > sinceSeq); },
    lastSeq() { return seq; },
    errorsSince(sinceSeq) {
      return log.filter((l) => l.seq > sinceSeq
        && (l.kind === 'exception' || (l.kind === 'console' && l.level === 'error')
          || (l.kind === 'log' && l.level === 'error')));
    },
    warningsSince(sinceSeq) {
      return log.filter((l) => l.seq > sinceSeq
        && ((l.kind === 'console' && (l.level === 'warning' || l.level === 'warn')) || (l.kind === 'log' && l.level === 'warning')));
    },
    allErrors() { return log.filter((l) => l.kind === 'exception' || (l.kind === 'console' && l.level === 'error') || (l.kind === 'log' && l.level === 'error')); },
    allWarnings() { return log.filter((l) => (l.kind === 'console' && (l.level === 'warning' || l.level === 'warn')) || (l.kind === 'log' && l.level === 'warning')); },
    getAllLogs() { return log.slice(); },
    async dispose() {
      try { cdp.close(); } catch {}
    },
  };
  browser.newPage = async () => page;
  browser.page = page;
  return browser;
}

export { sleep };
