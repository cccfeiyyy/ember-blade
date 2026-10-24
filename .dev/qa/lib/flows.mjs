// .dev/qa/lib/flows.mjs — 可复用的游戏流程操作（祝福选择 / 开局 / 清波 / 状态读取）
import { sleep } from './chrome.mjs';

/* 检查 __DEBUG 版本是否为 v2.x（非 2.x 时 v2 用例应标 BLOCKED） */
export async function isV2(ctx) {
  const info = await ctx.debugInfo();
  return !!(info && /^2\./.test(String(info.version || '')));
}
export async function buildNote(ctx) {
  const info = await ctx.debugInfo();
  return info ? `__DEBUG.version=${info.version || '(none)'}; keys=${info.keys.length}` : '无 __DEBUG';
}

/* 标题页 → 进入游戏（点击开始按钮） */
export async function enterGame(ctx) {
  const mode = (await ctx.state())?.mode;
  if (mode === 'title' || !mode) {
    const clicked = await ctx.clickSelector('#start-btn');
    if (!clicked) {
      const c = await ctx.clickText('开\\s*始|start|开始战斗');
      if (!c) throw new Error('找不到开始按钮');
    }
  }
  await ctx.waitFor(`(() => { const m = window.__DEBUG && window.__DEBUG.state && window.__DEBUG.state().mode; return m && m !== 'title' && m !== 'boot'; })()`, { timeout: 15000, label: '进入游戏' }).catch(() => {});
  return ctx.state();
}

/* 检测是否出现祝福选择界面；v2 事实：mode==='blessing'，state().blessingOptions 为 id 数组 */
export async function detectBlessing(ctx) {
  const st = await ctx.state();
  // 1) v2 权威信号：mode === 'blessing'
  if (st && st.mode === 'blessing') {
    const opts = Array.isArray(st.blessingOptions) ? st.blessingOptions : [];
    const debugOpts = await ctx.tryDbg('blessingOptions');
    return {
      found: true, source: 'state.mode=blessing', state: st,
      options: (debugOpts.ok && Array.isArray(debugOpts.value) ? debugOpts.value : opts),
      optionsFromDebug: debugOpts.ok,
    };
  }
  // 2) 调试钩子非空（部分构建 mode 未切也能读到候选）
  for (const name of ['blessingOptions', 'getBlessingOptions', 'blessingChoices', 'pendingBlessings']) {
    if (await ctx.hasDebug(name)) {
      const r = await ctx.tryDbg(name);
      if (r.ok && Array.isArray(r.value) && r.value.length) {
        return { found: true, source: 'debug:' + name, options: r.value, state: st };
      }
    }
  }
  // 3) DOM：#blessing-screen 可见
  if (await ctx.visible('blessing-screen')) {
    const cards = await ctx.eval(`(() => {
      const box = document.getElementById('blessing-cards');
      if (!box) return [];
      const out = [];
      for (const el of box.querySelectorAll('button,[role=button],.blessing-card,.card,[data-index]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 5 || r.height < 5) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        out.push({ text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 80), rect: [r.x, r.y, r.width, r.height], cls: typeof el.className === 'string' ? el.className : '' });
      }
      return out;
    })()`).catch(() => []);
    return { found: true, source: 'dom:#blessing-screen', cards, options: null, state: st };
  }
  // 4) 其他：不再用通用 DOM 启发式（v2 以 mode 为权威信号，避免误报）
  return { found: false, state: st };
}

/* 选择第 index 个祝福（默认 0）。优先 v2 调试钩子 chooseBlessing，其次 DOM 点击 */
export async function solveBlessing(ctx, { index = 0, limit = 6, pickLog = [] } = {}) {
  for (let i = 0; i < limit; i++) {
    const flow = await detectBlessing(ctx);
    if (!flow.found) return { done: true, picked: pickLog, lastFlow: flow };
    let picked = null;
    let pickedIndex = index;
    // a) v2 调试选择器（chooseBlessing 内部做模式校验）；选择后先播放 ~0.45s 卡牌动画
    for (const name of ['chooseBlessing', 'pickBlessing', 'selectBlessing', 'applyBlessing']) {
      if (await ctx.hasDebug(name)) {
        const r = await ctx.tryDbg(name, pickedIndex);
        if (r.ok) {
          await ctx.tick(1.2);
          await ctx.waitFor(`window.__DEBUG.state().mode !== 'blessing'`, { timeout: 5000, poll: 80 }).catch(() => {});
          picked = { via: 'debug:' + name, index: pickedIndex, options: flow.options };
          break;
        }
      }
    }
    // b) DOM 3 张卡（#blessing-cards）
    if (!picked) {
      const snap = await ctx.eval(`(() => {
        const box = document.getElementById('blessing-cards');
        if (!box) return null;
        const els = [...box.querySelectorAll('button,[role=button],.blessing-card,.card,[data-index]')].filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
          return r.width > 5 && r.height > 5 && s.display !== 'none' && s.visibility !== 'hidden';
        });
        const hits = els.map((el) => { const r = el.getBoundingClientRect(); return { text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 90), rect: [r.x, r.y, r.width, r.height] }; });
        return hits.length ? hits : null;
      })()`).catch(() => null);
      const cards = (flow.cards && flow.cards.length ? flow.cards : snap) || [];
      if (cards.length) {
        const card = cards[Math.min(pickedIndex, cards.length - 1)];
        await ctx.clickRect(card.rect);
        picked = { via: 'dom-click', text: card.text, index: pickedIndex };
      }
    }
    if (!picked) {
      // 兜底：键盘 1/2/3
      await ctx.key('Digit' + (pickedIndex + 1));
      picked = { via: 'keyboard-digit' + (pickedIndex + 1), index: pickedIndex };
    }
    await sleep(180);
    await ctx.tick(1.2);
    await ctx.waitFor(`window.__DEBUG.state().mode !== 'blessing'`, { timeout: 5000, poll: 80 }).catch(() => {});
    pickLog.push(picked);
    const after = await detectBlessing(ctx);
    if (!after.found) return { done: true, picked: pickLog, lastFlow: after };
    // 界面仍在：换一张卡再试
    pickedIndex = (pickedIndex + 1) % 3;
  }
  return { done: false, picked: pickLog };
}

/* 确保处于可战斗状态：若在标题则开始；若出现祝福则选择 */
export async function ensurePlaying(ctx, { maxRounds = 5, pickIndex = 0 } = {}) {
  let st = await ctx.state();
  if (!st || st.mode === 'title' || st.mode === 'boot') {
    await enterGame(ctx);
    st = await ctx.state();
  }
  const flow = await solveBlessing(ctx, { index: pickIndex, limit: maxRounds });
  await sleep(150);
  st = await ctx.state();
  return { state: st, blessing: flow };
}

/* 清空当前波（优先 killAll 调试钩子） */
export async function clearWave(ctx, { maxWait = 20 } = {}) {
  if (await ctx.hasDebug('killAll')) await ctx.tryDbg('killAll');
  else if (await ctx.hasDebug('damageEnemy')) await ctx.tryDbg('damageEnemy', 99999);
  else throw new Error('无清怪调试钩子，无法推进波次');
  const t0 = Date.now();
  let st = await ctx.state();
  while (Date.now() - t0 < maxWait * 1000) {
    const before = st;
    st = await ctx.tick(0.5);
    const flow = await detectBlessing(ctx);
    if (flow.found) return { state: st, blessing: flow, waveCleared: true };
    if (st && before && st.wave > before.wave) return { state: st, waveCleared: true };
    if (st && (st.mode === 'dead' || st.mode === 'victory')) return { state: st, waveCleared: false, ended: st.mode };
  }
  return { state: st, waveCleared: false };
}

/* 危险：确保玩家存活（god 模式） */
export async function god(ctx, on = true) {
  if (await ctx.hasDebug('god')) return ctx.tryDbg('god', on);
  return { ok: false, error: 'no god()' };
}

/* 读取内部游戏对象快照（白盒辅助） */
export async function internals(ctx) {
  return ctx.game(`function(){
    const G = window.G || {};
    const S = G.game && G.game.S, P = G.game && G.game.P, D = G.game && G.game.D, C = G.game && G.game.C;
    const safe = (o, keys) => { const out = {}; if (!o) return out; for (const k of keys) { const v = o[k]; if (v == null || typeof ['string','number','boolean'].includes(v)) out[k] = v; else if (typeof v === 'function') out[k] = '[fn]'; else if (Array.isArray(v)) out[k] = '[array:' + v.length + ']'; } return out; };
    return {
      mode: S && S.mode,
      S: safe(S, ['wave','waveState','score','kills','combo','comboMult','maxCombo','elapsed','timeScale','endShown','victory','bossActive','quality','styleRank','style','styleScore','styleMeter','endless']),
      P: safe(P, ['hp','maxHp','stamina','maxStamina','potions','momentum','state','invuln','blocking','guard','parryWindow','staminaDelay']),
      style: S && (S.style || S.rank || S.styleRank || null),
      blessing: S && (S.blessings || S.blessing || null),
      settings: S && (S.settings || null),
      settingsAlt: (G.game && (G.game.settings || G.settings)) || null,
      combatStats: P && P.stats ? JSON.parse(JSON.stringify(P.stats)) : null,
      boss: D && D.boss ? safe(D.boss, ['id','type','hp','maxHp','state','attackKind','attackT','phase','phase2','enraged','cooldown','affixes']) : null,
      enemies: D && D.enemies ? D.enemies.filter(e => e.alive).map(e => safe(e, ['id','type','hp','maxHp','state','attackKind','affix','affixes','elite','isElite'])) : [],
      drops: (D && (D.drops || D.pickups || D.items)) || (G.combat && (G.combat.drops || G.combat.pickups)) || null,
      projectiles: D && D.projectiles ? D.projectiles.length : null,
      musicMode: G.audio && G.audio.musicMode,
      audio: G.audio ? { ready: !!G.audio.ready, muted: !!G.audio.muted, volume: G.audio.volume, masterVolume: G.audio.masterVolume } : null,
      settingsKeys: G.game ? Object.keys(G.game).filter(k => /setting|save|config|pref/i.test(k)) : [],
      styleKeys: S ? Object.keys(S).filter(k => /style|rank|grade/i.test(k)) : [],
      parryKeys: (G.combat ? Object.keys(G.combat) : []).concat(P ? Object.keys(P) : []).filter(k => /parry|block|guard|perfect/i.test(k)),
      executeKeys: (G.combat ? Object.keys(G.combat) : []).filter(k => /execut|finish|execute/i.test(k)),
      endlessKeys: (S ? Object.keys(S) : []).concat(G.game ? Object.keys(G.game) : []).filter(k => /endless|record|best|high/i.test(k)),
    };
  }`);
}

/* 按键映射探测：返回 v2 构建中可能存在的操作键（从标签/提示文本里提取） */
export async function keyHints(ctx) {
  const text = await ctx.bodyText();
  const found = [];
  for (const k of ['Q', 'E', 'F', 'R', 'TAB', 'SPACE', 'SHIFT', 'ESC']) {
    if (new RegExp(`(^|\\s)${k}(\\s|$)`, 'i').test(text)) found.push(k);
  }
  return { text: text.slice(0, 1200), keys: found };
}
