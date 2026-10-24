// Minimal Chrome DevTools Protocol harness (no npm deps; Node 24 global WebSocket/fetch)
// Usage: node cdp.mjs <url> <outDir> [evalFile] [waitMs]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const url = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, 'shots');
const evalFile = process.argv[4] || '';
const waitMs = Number(process.argv[5] || 5000);

fs.mkdirSync(outDir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cdp-'));
const logs = [];

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--mute-audio',
  '--hide-scrollbars',
  '--window-size=1280,720',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--allow-file-access-from-files',
  url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.url !== 'about:blank') || list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome CDP target not found');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach(h => h(msg.params));
      }
    };
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

let exitCode = 0;
try {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);

  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map(a => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[console.${p.type}] ${text}`);
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    const text = (d.exception && (d.exception.description || d.exception.value)) || d.text;
    logs.push(`[EXCEPTION] ${text}`);
    exitCode = 2;
  });
  cdp.on('Log.entryAdded', (p) => {
    logs.push(`[log.${p.entry.level}] ${p.entry.text}`);
    if (p.entry.level === 'error') exitCode = 2;
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  // wait for page readiness if game exposes it
  await sleep(waitMs);

  let evalResult = null;
  if (evalFile) {
    const expr = fs.readFileSync(evalFile, 'utf8');
    const r = await cdp.send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      evalResult = { error: r.exceptionDetails.text, detail: r.exceptionDetails.exception?.description };
      exitCode = 3;
    } else {
      evalResult = r.result?.value;
    }
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'shot.png'), Buffer.from(shot.data, 'base64'));

  console.log('=== LOGS ===');
  console.log(logs.join('\n') || '(no logs)');
  console.log('=== EVAL RESULT ===');
  console.log(JSON.stringify(evalResult, null, 2));
  console.log('=== SCREENSHOT ===');
  console.log(path.join(outDir, 'shot.png'));
  ws.close();
} catch (e) {
  console.error('HARNESS ERROR:', e);
  exitCode = 1;
} finally {
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(exitCode);
}
