// .dev/qa/lib/qa.mjs — QA 上下文：断言、证据、DOM/调试接口辅助
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './chrome.mjs';

const STATUS_ORDER = ['FAIL', 'BLOCKED', 'ERROR', 'WARN', 'PASS', 'SKIP', 'INFO'];

function sanitize(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export class QAContext {
  constructor({ page, repoRoot, shotsDir, diagnosticsDir, tag, args = {} }) {
    this.page = page;
    this.repoRoot = repoRoot;
    this.shotsDir = shotsDir;
    this.diagnosticsDir = diagnosticsDir;
    this.tag = tag;
    this.args = args;
    this.checks = [];
    this.current = null;             // 当前套件 { id, title }
    this.scenarioSeq = 0;
    this.screenshots = [];
    this.diagnostics = {};
    this._debugInfo = null;
    this.notes = [];
  }

  /* ---------------- 套件 / 断言 ---------------- */
  beginScenario(meta) {
    this.current = { ...meta, startedAt: Date.now(), startSeq: this.page.lastSeq(), checks: [], consoleAtStart: 0 };
    this.page.getAllLogs(); // 触发缓冲读取
    this.scenarioSeq = this.page.lastSeq();
    return this.current;
  }
  endScenario() {
    const s = this.current;
    if (!s) return null;
    const errors = this.page.errorsSince(s.startSeq);
    const warnings = this.page.warningsSince(s.startSeq);
    s.durationMs = Date.now() - s.startedAt;
    s.consoleErrors = errors.map((e) => ({ kind: e.kind, level: e.level, text: e.text, url: e.url }));
    s.consoleWarnings = warnings.map((e) => ({ kind: e.kind, level: e.level, text: e.text }));
    s.status = this.scenarioStatus(s.checks);
    this.current = null;
    return s;
  }
  scenarioStatus(checks) {
    if (!checks.length) return 'SKIP';
    if (checks.some((c) => c.status === 'ERROR')) return 'ERROR';
    if (checks.some((c) => c.status === 'FAIL')) return 'FAIL';
    if (checks.some((c) => c.status === 'BLOCKED')) return 'BLOCKED';
    if (checks.some((c) => c.status === 'WARN')) return 'WARN';
    if (checks.every((c) => c.status === 'SKIP' || c.status === 'INFO')) return 'SKIP';
    return 'PASS';
  }
  _record(check) {
    const sc = this.current;
    const entry = { ...check, time: new Date().toISOString() };
    if (sc) sc.checks.push(entry);
    this.checks.push(entry);
    return entry;
  }
  info(id, desc, detail) { return this._record({ id, desc, status: 'INFO', detail }); }
  pass(id, desc, detail = '', evidence = '') { return this._record({ id, desc, status: 'PASS', detail, evidence }); }
  fail(id, desc, detail = '', evidence = '') { return this._record({ id, desc, status: 'FAIL', detail, evidence }); }
  warn(id, desc, detail = '', evidence = '') { return this._record({ id, desc, status: 'WARN', detail, evidence }); }
  skip(id, desc, detail = '') { return this._record({ id, desc, status: 'SKIP', detail }); }
  blocked(id, desc, detail = '') { return this._record({ id, desc, status: 'BLOCKED', detail }); }
  error(id, desc, err) { return this._record({ id, desc, status: 'ERROR', detail: String(err && err.stack || err) }); }
  expect(cond, id, desc, detail = '', evidence = '') {
    return cond ? this.pass(id, desc, detail, evidence) : this.fail(id, desc, detail, evidence);
  }

  /* ---------------- 页面求值 ---------------- */
  async eval(expression) { return this.page.evaluate(expression); }
  async call(fnSource, ...args) {
    const json = JSON.stringify(args);
    return this.page.evaluate(`(${fnSource})(...${json})`);
  }
  /* 在页面中携带 G/S/P/C/D/W/A 引用的函数调用（白盒辅助，永远 try/catch 安全） */
  async game(fnSource, ...args) {
    const json = JSON.stringify(args);
    const wrapped = `(function(){
      try {
        const G = window.G || {};
        const S = G.game && G.game.S, P = G.game && G.game.P, C = G.game && G.game.C, D = G.game && G.game.D;
        const W = G.world || {}, A = G.audio || null;
        return (${fnSource})(...${json});
      } catch (e) { return { __qaError: String(e && e.stack || e) }; }
    })()`;
    const r = await this.page.evaluate(wrapped);
    if (r && r.__qaError) throw new Error('game() 异常: ' + r.__qaError);
    return r;
  }
  async waitFor(expression, { timeout = 20000, poll = 120, label = '' } = {}) {
    return this.page.waitFor(expression, { timeout, poll, label });
  }
  async waitGame(expression, opts = {}) {
    return this.waitFor(expression, opts);
  }

  /* ---------------- __DEBUG ---------------- */
  async debugInfo(force = false) {
    if (this._debugInfo && !force) return this._debugInfo;
    this._debugInfo = await this.eval(`(() => {
      const d = window.__DEBUG;
      if (!d) return null;
      const info = { version: d.version || null, keys: Object.keys(d), types: {} };
      for (const k of info.keys) info.types[k] = typeof d[k];
      return info;
    })()`);
    return this._debugInfo;
  }
  async hasDebug(name) {
    const info = await this.debugInfo();
    return !!(info && info.keys.includes(name));
  }
  async dbg(name, ...args) {
    const has = await this.hasDebug(name);
    if (!has) throw new Error(`BLOCKED: window.__DEBUG.${name} 不存在`);
    return this.call(`function(...args){ return window.__DEBUG[${JSON.stringify(name)}](...args); }`, ...args);
  }
  async tryDbg(name, ...args) {
    try { const value = await this.dbg(name, ...args); return { ok: true, value }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  }
  async state() {
    try { return await this.dbg('state'); }
    catch { return this.game(`function(){ const G=window.G||{}; const S=G.game&&G.game.S; return S ? { mode:S.mode, wave:S.wave, waveState:S.waveState, hp:G.game.P&&G.game.P.hp } : null; }`); }
  }
  async player() {
    try { return await this.dbg('player'); } catch { return null; }
  }
  async enemies() {
    try { return await this.dbg('enemies'); } catch { return null; }
  }
  async tick(seconds) {
    try { return await this.dbg('tick', seconds); }
    catch { await sleep(Math.min(3000, seconds * 1000)); return this.state(); }
  }
  async start() {
    if (await this.hasDebug('start')) return this.dbg('start');
    await this.clickSelector('#start-btn');
    return this.state();
  }
  async disableAutoPause() {
    try { return await this.eval(`(() => window.__DEBUG.setAutoPause ? window.__DEBUG.setAutoPause(false) : null)()`); } catch { return null; }
  }
  async reset({ clearStorage = false, timeout = 45000 } = {}) {
    if (clearStorage) await this.clearStorage();
    await this.page.reload({ waitReady: true, timeout });
    await this.debugInfo(true);
    await this.disableAutoPause();
    return this.state();
  }

  /* ---------------- 证据 / 截图 ---------------- */
  async shot(name) {
    const clean = sanitize(name);
    const base = this.current ? sanitize(this.current.id) : 'misc';
    const file = path.join(this.shotsDir, `${this.tag}-${base}-${clean}.png`);
    await this.page.render(2).catch(() => {});
    await this.page.screenshot(file);
    const rel = path.relative(this.repoRoot, file).split(path.sep).join('/');
    this.screenshots.push(rel);
    return rel;
  }
  async snapshotDiag(name, data) {
    fs.mkdirSync(this.diagnosticsDir, { recursive: true });
    const file = path.join(this.diagnosticsDir, `${sanitize(name)}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return path.relative(this.repoRoot, file).split(path.sep).join('/');
  }

  /* ---------------- DOM 辅助 ---------------- */
  async visible(id) {
    return this.eval(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      if (!el) return false;
      if (window.__DEBUG && typeof window.__DEBUG.overlayVisible === 'function') {
        try { return !!window.__DEBUG.overlayVisible(${JSON.stringify(id)}); } catch (e) {}
      }
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const notHidden = !el.classList.contains('hidden') && !el.hidden;
      return notHidden && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.01 && r.width > 1 && r.height > 1;
    })()`);
  }
  /* 等待覆盖层动画完成后再判定可见（end/pause 等有淡入过渡） */
  async waitVisible(id, { timeout = 3000, poll = 100 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.visible(id)) return true;
      await new Promise((r) => setTimeout(r, poll));
    }
    return false;
  }
  async text(selector) {
    return this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.innerText || el.textContent || '').trim() : null; })()`);
  }
  async bodyText() {
    return this.eval(`document.body.innerText || ''`);
  }
  async overlaySnapshot() {
    return this.eval(`(() => {
      const vis = (el) => {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.02 && r.width > 2 && r.height > 2;
      };
      const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
      const rectOf = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
      const overlays = [], clickables = [], inputs = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        const text = ((el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 100);
        const sel = desc(el);
        if (['div', 'section', 'aside', 'main'].includes(el.tagName.toLowerCase())
            && r.width > innerWidth * 0.25 && r.height > innerHeight * 0.25) {
          overlays.push({ sel, text: text.slice(0, 140), rect: rectOf(el), z: +getComputedStyle(el).zIndex || 0 });
        }
        if (el.matches('button, [role=button], .btn, .btn-primary, .btn-ghost, .card, .blessing, .option, .choice, .relic, [data-blessing], [data-index]')
            && (text || el.getAttribute('aria-label'))) {
          clickables.push({ sel, text: (text || el.getAttribute('aria-label') || '').slice(0, 120), rect: rectOf(el), disabled: !!el.disabled });
        }
        if (el.matches('input, select, textarea, [role=switch], [role=checkbox]')) {
          const labelText = (el.labels && el.labels[0] && (el.labels[0].innerText || '')) || '';
          inputs.push({ sel, type: el.type || el.getAttribute('role') || '', id: el.id || '', value: el.value != null ? String(el.value) : '', checked: !!el.checked, label: String(labelText).replace(/\\s+/g, ' ').slice(0, 60), rect: rectOf(el) });
        }
      }
      return { overlays, clickables, inputs, url: location.href, title: document.title };
    })()`);
  }
  async findClickable(reSource, { exact = false } = {}) {
    const snap = await this.overlaySnapshot();
    const re = new RegExp(reSource, 'i');
    return snap.clickables.find((c) => re.test(c.text) && c.rect[2] > 2 && c.rect[3] > 2) || null;
  }
  async clickRect(rect, button = 'left') {
    const [x, y, w, h] = rect;
    await this.page.click(Math.round(x + Math.min(w / 2, Math.max(2, w - 4) / 2)), Math.round(y + h / 2), button);
    await sleep(120);
  }
  async clickSelector(selector) {
    const rect = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return [r.x, r.y, r.width, r.height];
    })()`);
    if (!rect) return false;
    await this.clickRect(rect);
    return true;
  }
  async clickText(reSource) {
    const c = await this.findClickable(reSource);
    if (!c) return null;
    await this.clickRect(c.rect);
    return c;
  }
  async key(code, { holdMs = 60 } = {}) { await this.page.press(code, { holdMs }); }
  async keyDown(code) { await this.page.keyDown(code); }
  async keyUp(code) { await this.page.keyUp(code); }
  async mouseClick(x, y, button = 'left') { await this.page.click(x, y, button); }

  /* 设置面板通用操作 */
  async settingsSnapshot() {
    const snap = await this.overlaySnapshot();
    const text = await this.bodyText();
    return { inputs: snap.inputs, text: text.slice(0, 3000) };
  }
  async setRangeByLabel(labelReSource, value) {
    const res = await this.eval(`(() => {
      const re = new RegExp(${JSON.stringify(labelReSource)}, 'i');
      const inputs = [...document.querySelectorAll('input[type=range]')];
      const info = [];
      for (const el of inputs) {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        if (s.display === 'none' || r.width < 2) continue;
        const label = (el.labels && el.labels[0] && (el.labels[0].innerText || '')) ||
          (el.closest('.slider-row, .setting, .row, .menu-panel')?.innerText || '');
        info.push({ id: el.id || '', label: String(label).replace(/\\s+/g, ' ').slice(0, 80), value: el.value });
      }
      const hit = inputs.find((el) => {
        const label = (el.labels && el.labels[0] && (el.labels[0].innerText || '')) ||
          (el.closest('.slider-row, .setting, .row, .menu-panel')?.innerText || '');
        return re.test(String(label)) && el.getBoundingClientRect().width > 2;
      });
      if (!hit) return { ok: false, all: info };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(hit, String(${JSON.stringify(String(value))}));
      hit.dispatchEvent(new Event('input', { bubbles: true }));
      hit.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, id: hit.id || '', value: hit.value, label: String(hit.labels && hit.labels[0] && hit.labels[0].innerText || '').slice(0, 60), all: info };
    })()`);
    await sleep(120);
    return res;
  }
  async toggleByLabel(labelReSource) {
    const res = await this.eval(`(() => {
      const re = new RegExp(${JSON.stringify(labelReSource)}, 'i');
      const cands = [...document.querySelectorAll('input[type=checkbox], [role=switch], [role=checkbox], button, .toggle, label')];
      const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
      const all = cands.filter(vis).map((el) => {
        const t = ((el.innerText || el.getAttribute('aria-label') || '') + ' ' + (el.closest('label')?.innerText || '')).replace(/\\s+/g, ' ').slice(0, 100);
        return { el, text: t };
      });
      const hit = all.find((x) => re.test(x.text));
      if (!hit) return { ok: false, all: all.map((x) => x.text).slice(0, 30) };
      if (hit.el.tagName === 'LABEL') {
        hit.el.click();
        const input = hit.el.querySelector('input');
        return { ok: true, checked: input ? !!input.checked : null, clicked: 'label' };
      }
      hit.el.click();
      const input = hit.el.tagName === 'INPUT' ? hit.el : null;
      return { ok: true, checked: input ? !!input.checked : null, clicked: hit.el.tagName.toLowerCase() };
    })()`);
    await sleep(120);
    return res;
  }
  async selectByLabel(labelReSource, value) {
    const res = await this.eval(`(() => {
      const re = new RegExp(${JSON.stringify(labelReSource)}, 'i');
      const select = [...document.querySelectorAll('select')].find((el) => {
        const label = (el.labels && el.labels[0] && el.labels[0].innerText || '') + ' ' + (el.closest('.row, .setting, .menu-panel')?.innerText || '');
        const r = el.getBoundingClientRect();
        return r.width > 2 && (re.test(label) || re.test(el.id));
      });
      if (!select) return { ok: false, selects: [...document.querySelectorAll('select')].map((s) => s.id) };
      const opts = [...select.options].map((o) => ({ value: o.value, text: o.text }));
      select.value = ${JSON.stringify(String(value))};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value, options: opts };
    })()`);
    await sleep(120);
    return res;
  }

  /* ---------------- 存储 ---------------- */
  async localStorageAll() {
    return this.eval(`(() => { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); } return out; })()`);
  }
  async clearStorage() { await this.eval(`(() => { try { localStorage.clear(); } catch {} return true; })()`); }
  async setLocalStorage(map) {
    return this.eval(`(() => { const m = ${JSON.stringify(map)}; for (const [k, v] of Object.entries(m)) localStorage.setItem(k, v); return localStorage.length; })()`);
  }

  /* ---------------- 游戏内数据 / 性能 ---------------- */
  async glInfo() {
    return this.game(`function(){
      const W = window.G.world || {};
      const r = W.renderer;
      const info = { hasRenderer: !!r };
      if (r) {
        info.pixelRatio = r.getPixelRatio();
        info.shadowMap = !!(r.shadowMap && r.shadowMap.enabled);
        info.domSize = [r.domElement.width, r.domElement.height];
        info.size = (() => { const v = { x: 0, y: 0 }; try { const s = new THREE.Vector2(); r.getSize(s); v.x = s.x; v.y = s.y; } catch {} return v; })();
        try { info.antialias = r.getContext().getContextAttributes()?.antialias; } catch {}
      }
      return info;
    }`);
  }
  async frameStats(ms = 3000) {
    return this.eval(`new Promise((resolve) => {
      const times = []; let last = performance.now(); const t0 = last;
      const step = (now) => {
        times.push(now - last); last = now;
        if (now - t0 < ${ms}) requestAnimationFrame(step);
        else {
          times.sort((a, b) => a - b);
          const n = times.length; const sum = times.reduce((a, b) => a + b, 0);
          resolve({ frames: n, durationMs: +(now - t0).toFixed(0),
            avgFps: +(n / ((now - t0) / 1000)).toFixed(1),
            avgFrameMs: +(sum / n).toFixed(2),
            p95FrameMs: +times[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(2),
            maxFrameMs: +times[n - 1].toFixed(2) });
        }
      };
      requestAnimationFrame(step);
    })`);
  }
  async entityCounts() {
    return this.game(`function(){
      const D = window.G.game.D || {};
      const S = window.G.game.S || {};
      return {
        enemies: (D.enemies || []).filter(e => e.alive).length,
        enemyTotal: (D.enemies || []).length,
        projectiles: (D.projectiles || []).length,
        boss: D.boss ? { hp: D.boss.hp, maxHp: D.boss.maxHp, state: D.boss.state, attackKind: D.boss.attackKind, phase: D.boss.phase } : null,
        wave: S.wave, waveState: S.waveState, mode: S.mode, score: S.score
      };
    }`);
  }

  /* ---------------- 能力探针（一次性收集，供后续调整用例） ---------------- */
  async probe() {
    const debugInfo = await this.debugInfo(true);
    const dom = await this.eval(`(() => {
      const vis = (el) => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.02 && r.width > 1 && r.height > 1; };
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
      const screens = [...document.querySelectorAll('[id]')].filter((el) => /screen|overlay|panel|menu|hud|bless|style|rank|endless|record|setting|pause|title|end/i.test(el.id))
        .map((el) => ({ id: el.id, visible: vis(el), display: getComputedStyle(el).display, text: ((el.innerText || '').trim().replace(/\\s+/g, ' ')).slice(0, 80) }));
      return { ids, screens, bodyTextHead: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 500) };
    })()`);
    const internal = await this.game(`function(){
      const G = window.G || {};
      const out = { G_keys: Object.keys(G), game_keys: Object.keys(G.game || {}), combat_keys: Object.keys(G.combat || {}), hud_keys: Object.keys(G.hud || {}), audio_keys: Object.keys(G.audio || {}), world_keys: Object.keys(G.world || {}), cfg_keys: Object.keys(G.cfg || {}) };
      const S = G.game && G.game.S;
      if (S) {
        out.S_keys = Object.keys(S);
        out.S_snapshot = {};
        for (const k of Object.keys(S)) {
          const v = S[k];
          if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out.S_snapshot[k] = v;
          else if (Array.isArray(v)) out.S_snapshot[k] = '[array:' + v.length + ']';
          else if (typeof v === 'object') out.S_snapshot[k] = '{' + Object.keys(v).slice(0, 12).join(',') + '}';
        }
        if (S.settings) out.S_settings = JSON.parse(JSON.stringify(S.settings));
        if (S.save) out.S_save = JSON.parse(JSON.stringify(S.save));
      }
      const P = G.game && G.game.P;
      if (P) out.P_keys = Object.keys(P);
      const C = G.game && G.game.C;
      if (C) out.C_snapshot = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(C).filter(([k, v]) => ['string', 'number', 'boolean'].includes(typeof v)))));
      // 扫描关键字路径
      const patterns = /bless|parry|ratio|style|execut|endless|record|drop|elite|detonat|quality|invert|sens|vol|guard|block|save|phase/i;
      const hits = [];
      const walk = (obj, prefix, depth) => {
        if (!obj || depth > 2 || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) { if (patterns.test(k)) hits.push(prefix + '.' + k); }
      };
      for (const k of Object.keys(G)) walk(G[k], 'G.' + k, 0);
      out.keyword_paths = [...new Set(hits)].slice(0, 200);
      return out;
    }`);
    const storage = await this.localStorageAll();
    let source = null;
    try {
      source = await this.eval(`fetch(location.href).then(r => r.text()).then(t => ({ size: t.length, ids: [...new Set([...t.matchAll(/id="([^"]+)"/g)].map(m => m[1]))], debug: (t.slice(t.indexOf('window.__DEBUG'), t.indexOf('window.__DEBUG') + 6000)) }))`);
    } catch (e) { source = { error: String(e.message || e) }; }
    const probe = { at: new Date().toISOString(), debugInfo, dom, internal, storage, source };
    const diagPath = await this.snapshotDiag('probe', probe);
    this.diagnostics.probe = diagPath;
    // 备份完整源码到诊断目录（只读拷贝，便于 QA 分析；不修改）
    try {
      const idx = path.join(this.repoRoot, 'index.html');
      if (fs.existsSync(idx)) fs.copyFileSync(idx, path.join(this.diagnosticsDir, 'index-at-probe.html'));
    } catch {}
    return probe;
  }

  relative(p) { return path.relative(this.repoRoot, p).split(path.sep).join('/'); }
}
