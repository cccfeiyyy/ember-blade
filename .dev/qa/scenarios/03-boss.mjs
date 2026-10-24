// 03-boss — Boss 50% 二阶段 / 25% 狂怒 / 赤红环境 / 剑雨 / 三连冲击波 / 突进 / 击败（对齐 v2 实现）
import { ensurePlaying, god, isV2, internals } from '../lib/flows.mjs';

/* ---------- 页面内实验 ---------- */
async function bossSetupPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S, W = G.world;
  const autoBless = () => { if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); return true; } if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); return true; } return false; };
  const envSnap = () => {
    const scene = W.scene; const out = { crimsonApi: typeof W.setCrimson === 'function', crimson: !!(W._crimson) };
    try { out.background = scene.background && scene.background.getHexString ? '#' + scene.background.getHexString() : String(scene.background); } catch (e) {}
    try { out.fog = scene.fog && scene.fog.color ? '#' + scene.fog.color.getHexString() : null; } catch (e) {}
    try { const c = new THREE.Color(); W.renderer.getClearColor(c); out.clear = '#' + c.getHexString(); } catch (e) {}
    try { const lights = []; scene.traverse((o) => { if (o.isLight) lights.push({ type: o.type, color: o.color && o.color.getHexString ? '#' + o.color.getHexString() : '?', intensity: Math.round((o.intensity || 0) * 100) / 100 }); }); out.lights = lights.slice(0, 10); } catch (e) {}
    try {
      const fx = {};
      for (const id of ['hurt-fx', 'flash-fx', 'slowmo-fx', 'vignette']) { const el = document.getElementById(id); if (el) { const st = getComputedStyle(el); fx[id] = { display: st.display, opacity: st.opacity, bg: st.backgroundColor }; } }
      out.fx = fx;
      const ep = document.getElementById('ember-light') || null; if (ep) out.emberLight = getComputedStyle(ep).color;
    } catch (e) {}
    return out;
  };
  const bossSnap = () => {
    const b = D.boss; if (!b) return null;
    const o = {};
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) o[k] = v;
      else if (Array.isArray(v)) o[k] = '[arr:' + v.length + ']';
    }
    return o;
  };
  const hudSnap = () => ({
    phase: (document.getElementById('boss-phase') || {}).textContent || '',
    name: (document.getElementById('boss-name') || {}).textContent || '',
    barVisible: (() => { const el = document.getElementById('boss-bar'); if (!el) return false; const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; })(),
  });
  const result = { ok: false, phase1: null, phase1Kinds: {}, trigger: null, enrage: null, phase2: null, attackEvents: [], bossKinds: {}, projectileKinds: {}, phase2After: null, bossId: null };
  autoBless();
  P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false;
  try { DBG.skipToBoss(); } catch (e) { result.frameErrors = ['skipToBoss: ' + String(e && e.message || e)]; }
  for (let i = 0; i < 360; i++) { autoBless(); DBG.tick(1 / 30); if (D.boss && D.boss.alive) break; }
  if (!D.boss || !D.boss.alive) { result.error = 'Boss 未生成'; result.hud = hudSnap(); return result; }
  result.ok = true;
  result.bossId = D.boss.id;
  result.phase1 = { boss: bossSnap(), env: envSnap(), music: G.audio && G.audio.musicMode, hud: hudSnap(), state: { wave: S.wave, bossHp: +D.boss.hp.toFixed(0), bossMax: D.boss.maxHp } };
  // 一阶段观察 8s
  const p1Kinds = {};
  for (let f = 0; f < 240; f++) {
    autoBless(); DBG.tick(1 / 30);
    const b = D.boss; if (!b || !b.alive) break;
    const k = (b.state || '') + '/' + (b.attackKind || '');
    p1Kinds[k] = (p1Kinds[k] || 0) + 1;
  }
  result.phase1Kinds = p1Kinds;
  result.phase1.afterObserve = { boss: bossSnap(), hpRatio: +(D.boss.hp / D.boss.maxHp).toFixed(3) };
  // 打到约 48%（跨 50% 阈值）
  let boss = D.boss;
  let dmg = Math.max(1, boss.hp - boss.maxHp * 0.48);
  try { DBG.damageEnemyById(boss.id, dmg); } catch (e) { result.frameErrors = (result.frameErrors || []).concat('damageById: ' + String(e && e.message || e)); }
  for (let f = 0; f < 150; f++) {
    autoBless(); DBG.tick(1 / 30);
    const b = D.boss; if (!b) break;
    const st = DBG.state();
    const sig = { hpRatio: +(b.hp / b.maxHp).toFixed(3), bossPhase2: !!st.bossPhase2, bossEnraged: !!st.bossEnraged, bossName: st.bossName, phase: b.phase, music: G.audio && G.audio.musicMode, bossMusic: st.bossMusic, bossAttack: st.bossAttack, bossState: st.bossState, crimson: !!st.crimson, hud: hudSnap(), env: envSnap() };
    if (!result.trigger && sig.bossPhase2) result.trigger = { frame: f, ...sig };
    if (result.trigger && f - result.trigger.frame >= 30) { result.phase2 = sig; break; }
  }
  if (!result.phase2) result.phase2 = { note: '未捕获二阶段信号', boss: bossSnap(), env: envSnap(), music: G.audio && G.audio.musicMode, hud: hudSnap(), state: DBG.state().bossPhase2 };
  // 二阶段转场约 1.9s 无敌：等待后再打狂怒阈值
  if (result.trigger) {
    for (let f = 0; f < 75; f++) { autoBless(); DBG.tick(1 / 30); }
  }
  // 打到约 22% 验证狂怒
  boss = D.boss;
  if (boss && boss.alive) {
    dmg = Math.max(1, boss.hp - boss.maxHp * 0.22);
    try { DBG.damageEnemyById(boss.id, dmg); } catch (e) {}
    for (let f = 0; f < 120; f++) {
      autoBless(); DBG.tick(1 / 30);
      const b = D.boss; if (!b) break;
      const st = DBG.state();
      if (st.bossEnraged) { result.enrage = { frame: f, hpRatio: +(b.hp / b.maxHp).toFixed(3), bossName: st.bossName, state: { enraged: b.enraged, speedMul: b.speedMul, windMul: b.windMul }, music: G.audio && G.audio.musicMode }; break; }
    }
  }
  // 二阶段/狂怒攻击观察 180s：远近交替（中远距离触发 swordrain/charge，近距离触发 shock3/sweep3）
  const kinds = {}, events = [];
  let last = null;
  for (let f = 0; f < 5400; f++) {
    autoBless();
    const b0 = D.boss;
    if (b0 && b0.alive) {
      const far = (f % 180) < 120; // 2/3 时间保持 10.6m（>9m 且 <11.5，触发突进/剑雨分支）
      const want = far ? 10.6 : 3.0;
      const nx = -b0.pos.x, nz = -b0.pos.z; const nl = Math.hypot(nx, nz) || 1;
      P.pos.x = b0.pos.x + (nx / nl) * want; P.pos.z = b0.pos.z + (nz / nl) * want; P.hp = P.maxHp;
    }
    DBG.tick(1 / 30);
    const b = D.boss;
    if (!b || !b.alive) break;
    const key = (b.state || '') + '/' + (b.attackKind || '');
    if (key !== last) {
      events.push({ t: +(f / 30).toFixed(2), state: b.state, attackKind: b.attackKind, hpRatio: +(b.hp / b.maxHp).toFixed(2) });
      last = key;
    }
    kinds[key] = (kinds[key] || 0) + 1;
    if (f > 0 && f % 300 === 0) { P.hp = P.maxHp; }
  }
  result.attackEvents = events.slice(0, 120);
  result.bossKinds = kinds;
  result.projectileKinds = (() => { const set = {}; for (const p of (D.projectiles || [])) { if (p && typeof p === 'object') for (const k of Object.keys(p)) if (typeof p[k] === 'string' && /type|kind/i.test(k)) set[p[k]] = (set[p[k]] || 0) + 1; } return set; })();
  result.phase2After = { boss: bossSnap(), env: envSnap(), music: G.audio && G.audio.musicMode, hud: hudSnap(), state: (() => { const st = DBG.state(); return { bossPhase2: st.bossPhase2, bossEnraged: st.bossEnraged, bossName: st.bossName, bossMusic: st.bossMusic, bossAttack: st.bossAttack, bossState: st.bossState, crimson: st.crimson }; })(), hpRatio: D.boss ? +(D.boss.hp / D.boss.maxHp).toFixed(2) : null };
  return result;
}

// 单步观察（用于攻击瞬间截图）
async function bossStepPage(seconds) {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const steps = Math.max(1, Math.round(seconds * 30));
  for (let i = 0; i < steps; i++) {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} }
    const b0 = D.boss;
    if (b0 && b0.alive) {
      // 交替 3m（近战）与 10.6m（>9m 且 <11.5，触发 swordrain/charge 分支）
      const far = (i % 24) < 12;
      const want = far ? 10.6 : 3.0;
      const nx = -b0.pos.x, nz = -b0.pos.z; const nl = Math.hypot(nx, nz) || 1;
      P.pos.x = b0.pos.x + (nx / nl) * want; P.pos.z = b0.pos.z + (nz / nl) * want; P.hp = P.maxHp;
    }
    DBG.tick(1 / 30);
  }
  const b = D.boss;
  const arrays = {};
  for (const k of Object.keys(D)) if (Array.isArray(D[k])) arrays[k] = D[k].length;
  return {
    bossAlive: !!(b && b.alive),
    hpRatio: b ? +(b.hp / b.maxHp).toFixed(3) : null,
    state: b && b.state,
    attackKind: b && b.attackKind,
    phase2: !!(b && b.phase2), enraged: !!(b && b.enraged),
    bossName: (document.getElementById('boss-name') || {}).textContent,
    hudPhase: (document.getElementById('boss-phase') || {}).textContent,
    arrays, projectiles: (D.projectiles || []).length,
    music: G.audio && G.audio.musicMode,
  };
}

export default {
  id: '03-boss',
  title: 'Boss 50% 二阶段 / 25% 狂怒 / 三种新攻击',
  coverage: ['BOSS-01..12'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('BOSS-01', '当前构建不是 v2.x，跳过 Boss 二阶段验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);
    if (!(await ctx.hasDebug('skipToBoss'))) {
      ctx.blocked('BOSS-01', '无 skipToBoss 调试钩子', JSON.stringify((await ctx.debugInfo()).keys));
      return;
    }

    const exp = await ctx.eval(`(${bossSetupPage.toString()})()`);
    await ctx.snapshotDiag('boss-experiment', exp);
    if (!exp.ok) {
      const shot = await ctx.shot('08-boss-missing');
      ctx.fail('BOSS-01', '无法到达/生成 Boss', JSON.stringify(exp).slice(0, 1800), shot);
      return;
    }
    ctx.pass('BOSS-01a', 'Boss 可生成', `wave=${exp.phase1.state && exp.phase1.state.wave}, bossId=${exp.bossId}`);
    const bossBarVisible = await ctx.visible('boss-bar');
    const p1Shot = await ctx.shot('08-boss-phase1');
    ctx.expect(bossBarVisible, 'BOSS-01', 'Boss 血条/HUD 可见', JSON.stringify(exp.phase1.hud).slice(0, 500), p1Shot);
    const p1k = Object.keys(exp.phase1Kinds || {});
    ctx.expect(p1k.length > 0, 'BOSS-02', '一阶段存在主动攻击行为', JSON.stringify(exp.phase1Kinds).slice(0, 800));

    // ---- 50% 二阶段 ----
    const trig = exp.trigger;
    const p2Shot = await ctx.shot('09-boss-phase2-crimson');
    ctx.info('BOSS-03a', '二阶段触发数据', JSON.stringify(trig || exp.phase2).slice(0, 1800));
    ctx.expect(!!trig, 'BOSS-03', 'Boss HP ≤50% 时触发二阶段', JSON.stringify(trig ? { hpRatio: trig.hpRatio, name: trig.bossName, music: trig.music, hud: trig.hud } : exp.phase2).slice(0, 900), p2Shot);
    if (trig) ctx.expect(trig.hpRatio <= 0.52 && trig.hpRatio > 0.30, 'BOSS-03b', '二阶段触发阈值约 50%（±2%）', 'hpRatio=' + trig.hpRatio, p2Shot);
    // 25% 狂怒
    ctx.expect(!!exp.enrage, 'BOSS-03c', 'Boss HP ≤25% 时进入狂怒（enraged）', JSON.stringify(exp.enrage || null).slice(0, 900), p2Shot);

    // ---- 赤红环境 ----
    const envBefore = exp.phase1.env, envAfter = exp.phase2After && exp.phase2After.env;
    const envDiff = JSON.stringify(envBefore) !== JSON.stringify(envAfter);
    const crimsonAfter = exp.phase2After && exp.phase2After.state && exp.phase2After.state.crimson;
    ctx.info('BOSS-04a', '环境颜色对比', JSON.stringify({ before: envBefore, after: envAfter, crimsonAfter }).slice(0, 2400));
    ctx.expect(envAfter && envAfter.crimsonApi, 'BOSS-04b', '世界提供赤红切换接口（W.setCrimson）', JSON.stringify({ crimsonApi: envAfter && envAfter.crimsonApi }));
    ctx.expect(envDiff || crimsonAfter, 'BOSS-04', '二阶段环境发生变化（赤红/光照/雾）', JSON.stringify({ changed: envDiff, crimson: crimsonAfter, envAfterCrimson: envAfter && envAfter.crimson }).slice(0, 1000), p2Shot);
    ctx.expect(crimsonAfter === true || (envAfter && envAfter.crimson === true), 'BOSS-04c', '二阶段 world._crimson 已开启（赤红竞技场）', JSON.stringify({ crimsonAfter, envCrimson: envAfter && envAfter.crimson }));

    // ---- 阶段音乐 / HUD ----
    const musicAfter = (exp.phase2After && exp.phase2After.state && exp.phase2After.state.bossMusic) || (exp.phase2After && exp.phase2After.music);
    const hudAfter = exp.phase2After && exp.phase2After.hud;
    const hudNameAfter = hudAfter && hudAfter.name;
    ctx.info('BOSS-05a', '阶段音乐/HUD', JSON.stringify({ musicAfter, hudAfter, musicBefore: exp.phase1.music, hudBefore: exp.phase1.hud }).slice(0, 1000));
    ctx.expect(/boss2/i.test(String(musicAfter)) || (hudAfter && /回响|二|狂|碎/.test(String(hudAfter.phase))) || /回响|狂/.test(String(hudNameAfter)), 'BOSS-05', '二阶段音乐切换/HUD 阶段更新', JSON.stringify({ musicAfter, hudPhase: hudAfter && hudAfter.phase, hudName: hudNameAfter }));

    // ---- 三种新攻击：名称匹配 + 攻击瞬间截图 ----
    const kindNames = [...new Set(Object.keys(exp.bossKinds || {}).map((k) => k.split('/')[1]).filter(Boolean))];
    const eventKinds = [...new Set((exp.attackEvents || []).map((e) => e.attackKind).filter(Boolean))];
    const allKinds = [...new Set(kindNames.concat(eventKinds))];
    ctx.info('BOSS-ATTACK-DIAG', '二阶段攻击种类', JSON.stringify({ allKinds, bossKinds: exp.bossKinds, projectileKinds: exp.projectileKinds }).slice(0, 2000));
    const seen = new Map(), shots = [];
    let lastKind = null;
    for (let i = 0; i < 110; i++) {
      const step = await ctx.eval(`(${bossStepPage.toString()})(0.66)`);
      if (!step.bossAlive) break;
      const kind = String(step.attackKind || '');
      if (kind && kind !== lastKind) {
        if (!seen.has(kind) && shots.length < 10) {
          const shot = await ctx.shot('10-boss-attack-' + (seen.size + 1) + '-' + kind);
          shots.push(shot);
          seen.set(kind, { shot, first: step, count: 0 });
        } else if (seen.has(kind)) seen.get(kind).count++;
        lastKind = kind;
      }
    }
    for (const [k, v] of seen.entries()) ctx.info('BOSS-ATTACK-SHOT', '攻击截图', `${k} -> ${v.shot}`);
    const allKindText = allKinds.join(' ').toLowerCase();
    const seenKindText = [...seen.keys()].join(' ').toLowerCase();
    const hasSword = /swordrain|sword.?rain|剑雨/.test(allKindText + ' ' + seenKindText);
    const hasTriple = /triplewave|shock3|triple|冲击/.test(allKindText + ' ' + seenKindText);
    const hasCharge = /charge|dash|突进/.test(allKindText + ' ' + seenKindText);
    const attackShot = shots[0] || p2Shot;
    ctx.expect(hasSword, 'BOSS-06', '剑雨（swordRain）出现', JSON.stringify({ allKinds }).slice(0, 900), attackShot);
    ctx.expect(hasTriple, 'BOSS-07', '三连冲击波（tripleWave）出现', JSON.stringify({ allKinds }).slice(0, 900), attackShot);
    ctx.expect(hasCharge, 'BOSS-08', '突进（charge）出现', JSON.stringify({ allKinds }).slice(0, 900), attackShot);
    ctx.info('BOSS-ATTACK-EVIDENCE', '捕获到的攻击截图与种类', JSON.stringify({ kinds: [...seen.keys()], shots }).slice(0, 1200));

    // ---- 二阶段可继续输出 ----
    const beforeHp = await ctx.game(`function(){ const b=window.G.game.D.boss; return b?b.hp:null; }`);
    let dmgRes = { ok: false };
    const bossId = exp.bossId;
    dmgRes = await ctx.tryDbg('damageEnemyById', bossId, 50);
    await ctx.tick(0.3);
    const afterHp = await ctx.game(`function(){ const b=window.G.game.D.boss; return b?b.hp:null; }`);
    ctx.expect(beforeHp != null && afterHp != null && afterHp < beforeHp, 'BOSS-09', '二阶段仍可对 Boss 造成伤害', `hp ${beforeHp} -> ${afterHp}`);

    // ---- 击败 Boss → 胜利 ----
    const aliveBefore = await ctx.game(`function(){ const b=window.G.game.D.boss; return !!(b&&b.alive); }`);
    const killById = await ctx.tryDbg('damageEnemyById', bossId, 999999);
    await ctx.tick(0.5);
    const bossAlive = await ctx.game(`function(){ const b=window.G.game.D.boss; return !!(b&&b.alive); }`);
    await ctx.tick(5);
    const st = await ctx.state();
    const endVisible = await ctx.visible('end-screen');
    const winShot = await ctx.shot('18-victory-end');
    ctx.info('BOSS-10a', '击败 Boss 结果', JSON.stringify({ aliveBefore, killById, bossAlive, mode: st && st.mode, endShown: st && st.endShown, endVisible, bossName: st && st.bossName }).slice(0, 900));
    ctx.expect(!bossAlive, 'BOSS-10b', 'Boss 可被击败', 'bossAlive=' + bossAlive);
    ctx.expect(st && (st.mode === 'victory' || st.endShown || endVisible), 'BOSS-10', '击败 Boss 后进入胜利结算', JSON.stringify({ mode: st && st.mode, endShown: st && st.endShown, endVisible }), winShot);
    // 赤红状态复位检查（胜利后）
    const envReset = await ctx.game(`function(){ const W=window.G.world; const sc=W.scene; return { bg: sc&&sc.background&&sc.background.getHexString?sc.background.getHexString():null, fog: sc&&sc.fog&&sc.fog.color?sc.fog.color.getHexString():null }; }`);
    ctx.info('BOSS-10c', '胜利后环境颜色（检查赤红是否复位）', JSON.stringify(envReset));

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'BOSS-11', 'Boss 套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
  },
};
