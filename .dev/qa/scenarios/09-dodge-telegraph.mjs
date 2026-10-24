// 09-dodge-telegraph — v2.0.1 聚焦复验：翻滚位移/不穿地/归位 + 攻击预警（白底白描边+红填充/清理）
import { ensurePlaying, god, isV2 } from '../lib/flows.mjs';

/* ---------- 页面内实验 ---------- */
async function dodgeExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const measure = () => {
    const m = P.model;
    if (!m) return null;
    m.root.updateMatrixWorld(true);
    const wp = (obj) => (obj && obj.getWorldPosition ? obj.getWorldPosition(new THREE.Vector3()) : null);
    const headP = wp(m.head);
    const kneeL = wp(m.legL && m.legL.knee);
    const kneeR = wp(m.legR && m.legR.knee);
    let boxMinY = null;
    try { boxMinY = +new THREE.Box3().setFromObject(m.root).min.y.toFixed(3); } catch (e) {}
    return {
      headY: headP ? +headP.y.toFixed(3) : null,
      kneeLY: kneeL ? +kneeL.y.toFixed(3) : null,
      kneeRY: kneeR ? +kneeR.y.toFixed(3) : null,
      boxMinY,
      state: P.state, iframe: !!P.iframe,
      x: +P.pos.x.toFixed(3), z: +P.pos.z.toFixed(3),
      visRotX: +m.visual.rotation.x.toFixed(4), visRotY: +m.visual.rotation.y.toFixed(4),
      visPosY: +m.visual.position.y.toFixed(4),
      visScaleX: +m.visual.scale.x.toFixed(4), visScaleY: +m.visual.scale.y.toFixed(4),
    };
  };
  const parkEnemies = () => { for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; } };
  const results = [];
  const dirs = [{ name: 'facing+z', yaw: 0 }, { name: 'facing+x', yaw: Math.PI / 2 }, { name: 'facing-z', yaw: Math.PI }, { name: 'diagonal', yaw: Math.PI / 4 }];
  for (const dir of dirs) {
    ensurePlay(); parkEnemies();
    P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.dodgeCd = 0; P._dodgeF = 0;
    P.pos.x = 0; P.pos.z = 0; P.yaw = dir.yaw;
    const start = { x: P.pos.x, z: P.pos.z };
    const before = measure();
    DBG.dodge();
    const samples = [];
    let endT = null;
    for (let i = 0; i < 90; i++) {
      DBG.tick(1 / 60);
      const s = measure();
      s.t = +(i / 60).toFixed(3);
      s.dist = +Math.hypot(P.pos.x - start.x, P.pos.z - start.z).toFixed(3);
      samples.push(s);
      if (P.state !== 'dodge' && endT == null) endT = s.t;
      if (P.state !== 'dodge' && i > 10) break;
    }
    const afterRoll = samples[samples.length - 1];
    const afterSamples = [];
    for (let k = 0; k < 30; k++) {
      DBG.tick(1 / 60);
      const s = measure();
      s.t = +((samples.length + k) / 60).toFixed(3);
      s.dist = +Math.hypot(P.pos.x - start.x, P.pos.z - start.z).toFixed(3);
      afterSamples.push(s);
    }
    const all = samples.concat(afterSamples);
    const minHeadY = Math.min(...all.filter((s) => s.headY != null).map((s) => s.headY));
    const minKneeY = Math.min(...all.filter((s) => s.kneeLY != null).map((s) => Math.min(s.kneeLY, s.kneeRY)));
    const iframeSamples = all.filter((s) => s.iframe);
    const end = all[all.length - 1];
    results.push({
      dir: dir.name, yaw: +dir.yaw.toFixed(3), before, endT, finalDist: end.dist,
      during: { minHeadY: +minHeadY.toFixed(3), minKneeY: +minKneeY.toFixed(3), minBoxY: Math.min(...all.map((s) => s.boxMinY)) },
      iframe: { frames: iframeSamples.length, firstT: iframeSamples.length ? iframeSamples[0].t : null, lastT: iframeSamples.length ? iframeSamples[iframeSamples.length - 1].t : null },
      after: afterRoll, final: end,
      samples: all.filter((s, i) => i % 4 === 0 || s.state !== 'dodge').slice(0, 60),
    });
  }
  return { version: DBG.version, results };
}

async function telegraphExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S, W = G.world;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const settle = async (ms) => { await new Promise((r) => setTimeout(r, ms == null ? 280 : ms)); };
  const redLike = (hex) => { if (!hex) return false; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return r >= 150 && g <= 150 && b <= 150; };
  const whiteLike = (hex) => { if (!hex) return false; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return r >= 210 && g >= 205 && b >= 195; };
  const collect = (expectRadius) => {
    const groups = [];
    W.scene.traverse((o) => {
      if (!o || o.name !== 'telegraph') return;
      o.updateMatrixWorld(true);
      const meshes = [];
      o.traverse((c) => {
        if (!c || !c.isMesh) return;
        const mat = c.material;
        meshes.push({
          geo: c.geometry && c.geometry.type,
          color: mat && mat.color ? '#' + mat.color.getHexString() : null,
          opacity: mat ? +((mat.opacity != null ? mat.opacity : 1)).toFixed(2) : null,
          sx: +c.scale.x.toFixed(3), sy: +c.scale.y.toFixed(3), sz: +c.scale.z.toFixed(3),
          y: +c.position.y.toFixed(3),
        });
      });
      const whites = meshes.filter((m) => whiteLike(m.color));
      const reds = meshes.filter((m) => redLike(m.color));
      const radius = Math.max(0, ...meshes.map((m) => Math.max(m.sx, m.sz)));
      const fill = reds.slice().sort((a, b) => (b.sx * b.sz) - (a.sx * a.sz))[0] || null;
      groups.push({ pos: [+o.position.x.toFixed(2), +o.position.z.toFixed(2)], meshCount: meshes.length, whiteCount: whites.length, redCount: reds.length, radius: +radius.toFixed(2), fillScale: fill ? +Math.max(fill.sx, fill.sz).toFixed(3) : 0, fillOpacity: fill ? fill.opacity : null, fillProgress: fill && radius ? +(Math.max(fill.sx, fill.sz) / radius).toFixed(3) : null, colors: meshes.map((m) => m.color), opacities: meshes.map((m) => m.opacity) });
    });
    const matching = expectRadius == null ? groups : groups.filter((g) => Math.abs(g.radius - expectRadius) <= 0.25);
    return { totalCount: groups.length, count: matching.length, groups: matching };
  };
  const wipe = async () => { try { G.combat.clearAll(); } catch (e) {} DBG.tick(0.2); await settle(320); };
  const result = { version: DBG.version, baseline: null, golem: null, wraith: null, clearAllCleanup: null, bossSwordRain: null, errors: [] };

  ensurePlay();
  await wipe();
  result.baseline = collect();

  // ---- 石卫（golem）圆环预警：半径 4.0，白底白描边+红填充 ----
  const runGolem = async () => {
    ensurePlay();
    for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
    P.hp = P.maxHp; P.invuln = 0; P.iframe = false; P.state = 'idle';
    P.pos.x = 0; P.pos.z = 0;
    let id = null;
    try { id = DBG.spawnEnemy('golem', 0, 3.5); } catch (e) {}
    if (id == null) return { error: 'golem 生成失败' };
    DBG.tick(0.1);
    let atWindup = null, later = null, endCount = null;
    for (let f = 0; f < 900; f++) {
      ensurePlay(); DBG.tick(1 / 60);
      const e = D.enemies.find((x) => x.id === id);
      if (!e) break;
      const snap = collect(4.0);
      if (!atWindup && e.state === 'windup' && snap.count > 0) {
        atWindup = { t: +(f / 60).toFixed(2), state: e.state, windupDur: e.windupDur, ...snap };
      } else if (atWindup && !later && e.state === 'windup' && f / 60 > atWindup.t + 0.3) {
        later = { t: +(f / 60).toFixed(2), state: e.state, ...snap };
      } else if (atWindup && (e.state === 'recover' || e.state === 'chase')) {
        await settle(320);
        endCount = collect(4.0);
        break;
      }
    }
    await settle(320);
    return { atWindup, later, endCount: endCount || collect(4.0), afterExtra: collect(4.0).count };
  };
  result.golem = await runGolem();
  await wipe();

  // ---- 蚀影（wraith）扇形预警：半径 3.0 ----
  const runWraith = async () => {
    ensurePlay();
    for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
    P.hp = P.maxHp; P.invuln = 0; P.iframe = false; P.state = 'idle';
    P.pos.x = 0; P.pos.z = 0;
    let id = null;
    try { id = DBG.spawnEnemy('wraith', 0, 2.3); } catch (e) {}
    if (id == null) return { error: 'wraith 生成失败' };
    DBG.tick(0.1);
    let atWindup = null, endCount = null;
    for (let f = 0; f < 900; f++) {
      ensurePlay(); DBG.tick(1 / 60);
      const e = D.enemies.find((x) => x.id === id);
      if (!e) break;
      const snap = collect(3.0);
      if (!atWindup && e.state === 'windup' && snap.count > 0) {
        atWindup = { t: +(f / 60).toFixed(2), state: e.state, enemyStateApi: DBG.enemies().find((x) => x.id === id), windupDur: e.windupDur, ...snap };
      } else if (atWindup && (e.state === 'recover' || e.state === 'chase')) {
        await settle(320);
        endCount = collect(3.0);
        break;
      }
    }
    await settle(320);
    return { atWindup, endCount: endCount || collect(3.0), afterExtra: collect(3.0).count };
  };
  result.wraith = await runWraith();
  await wipe();

  // ---- clearAll() 清理未结束预警 ----
  try {
    ensurePlay();
    for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
    P.hp = P.maxHp; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.pos.x = 0; P.pos.z = 0;
    const id = DBG.spawnEnemy('golem', 0, 3.3);
    DBG.tick(0.1);
    let before = null;
    for (let f = 0; f < 900; f++) {
      ensurePlay(); DBG.tick(1 / 60);
      const e = D.enemies.find((x) => x.id === id);
      if (!e) break;
      if (e.state === 'windup') { const snap = collect(4.0); if (snap.count > 0) { before = snap; break; } }
    }
    G.combat.clearAll();
    DBG.tick(0.2);
    await settle(320);
    const after = collect(4.0);
    result.clearAllCleanup = { beforeCount: before ? before.count : null, before, afterCount: after.count, after };
  } catch (e) { result.errors.push('clearAll: ' + String(e && e.message || e)); }
  await wipe();

  result.finalTelegraphCount = collect().totalCount;
  return result;
}

/* Boss 剑雨单独实验：必须在干净 playing 状态直接 skipToBoss（避免前置 clearAll 触发波次祝福覆盖） */
async function bossSwordRainExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S, W = G.world;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const settle = async (ms) => { await new Promise((r) => setTimeout(r, ms == null ? 300 : ms)); };
  const redLike = (hex) => { if (!hex) return false; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return r >= 150 && g <= 150 && b <= 150; };
  const whiteLike = (hex) => { if (!hex) return false; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return r >= 210 && g >= 205 && b >= 195; };
  const collect = () => {
    const groups = [];
    W.scene.traverse((o) => {
      if (!o || o.name !== 'telegraph') return;
      o.updateMatrixWorld(true);
      const meshes = [];
      o.traverse((c) => {
        if (!c || !c.isMesh) return;
        const mat = c.material;
        meshes.push({
          geo: c.geometry && c.geometry.type,
          color: mat && mat.color ? '#' + mat.color.getHexString() : null,
          opacity: mat ? +((mat.opacity != null ? mat.opacity : 1)).toFixed(2) : null,
          sx: +c.scale.x.toFixed(3), sz: +c.scale.z.toFixed(3),
        });
      });
      const radius = Math.max(0, ...meshes.map((m) => Math.max(m.sx, m.sz)));
      const whites = meshes.filter((m) => whiteLike(m.color));
      const reds = meshes.filter((m) => redLike(m.color));
      groups.push({ pos: [+o.position.x.toFixed(2), +o.position.z.toFixed(2)], meshCount: meshes.length, whiteCount: whites.length, redCount: reds.length, radius: +radius.toFixed(2), colors: meshes.map((m) => m.color) });
    });
    const matching = groups.filter((g) => Math.abs(g.radius - 2.9) <= 0.08);
    return { totalCount: groups.length, count: matching.length, groups: matching };
  };
  const result = { sampled: null, after: null, afterExtra: null, kinds: {}, error: null };
  try {
    ensurePlay();
    try { DBG.god(true); } catch (e) {}
    P.hp = P.maxHp; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.pos.x = 0; P.pos.z = 0;
    try { DBG.skipToBoss(); } catch (e) {}
    for (let f = 0; f < 600; f++) { ensurePlay(); DBG.tick(1 / 30); P.hp = P.maxHp; if (D.boss && D.boss.alive) break; }
    if (!D.boss || !D.boss.alive) { result.error = 'Boss 未生成'; return result; }
    // 等 Boss 出生动画结束（spawn 状态内不可伤害），否则打不到 50% 阈值
    for (let f = 0; f < 400; f++) { ensurePlay(); DBG.tick(1 / 30); P.hp = P.maxHp; if (!D.boss || !D.boss.alive) break; if (D.boss.state !== 'spawn') break; }
    for (let f = 0; f < 30; f++) { ensurePlay(); DBG.tick(1 / 30); P.hp = P.maxHp; }
    if (!D.boss || !D.boss.alive) { result.error = 'Boss 未存活'; return result; }
    const bossId = D.boss.id;
    result.damageAttempts = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const before = { hp: +D.boss.hp.toFixed(0), state: D.boss.state };
      try { DBG.damageEnemyById(bossId, Math.max(1, D.boss.hp - D.boss.maxHp * 0.48)); } catch (e) {}
      for (let i = 0; i < 8; i++) { ensurePlay(); DBG.tick(1 / 30); }
      if (!D.boss || !D.boss.alive) break;
      result.damageAttempts.push({ before, after: { hp: +D.boss.hp.toFixed(0), state: D.boss.state, phase2: !!D.boss.phase2 } });
      if (D.boss.hp / D.boss.maxHp <= 0.5) break;
    }
    for (let f = 0; f < 300; f++) { ensurePlay(); DBG.tick(1 / 30); P.hp = P.maxHp; if (D.boss && D.boss.phase2) break; }
    result.phase2AtStart = !!(D.boss && D.boss.phase2);
    for (let f = 0; f < 4500; f++) {
      ensurePlay();
      const b = D.boss;
      if (!b || !b.alive) break;
      // 朝竞技场中心方向摆放玩家，避免 arena 半径 clamp 把距离压到近战分支
      const want = (f % 150 < 90) ? 10.6 : 3.0;
      const nx = -b.pos.x, nz = -b.pos.z; const nl = Math.hypot(nx, nz) || 1;
      P.pos.x = b.pos.x + (nx / nl) * want; P.pos.z = b.pos.z + (nz / nl) * want; P.hp = P.maxHp;
      DBG.tick(1 / 30);
      const b2 = D.boss;
      if (!b2 || !b2.alive) break;
      const k = String(b2.attackKind || 'none');
      result.kinds[k] = (result.kinds[k] || 0) + 1;
      const st = DBG.state();
      if (!result.sampled && b2.attackKind === 'swordrain' && b2.state === 'windup') {
        const snap = collect();
        if (snap.count > 0) result.sampled = { t: +(f / 30).toFixed(2), bossAttack: st.bossAttack, bossState: st.bossState, hpRatio: +(b2.hp / b2.maxHp).toFixed(2), phase2: !!b2.phase2, ...snap };
      } else if (result.sampled && b2.attackKind === 'swordrain' && (b2.state === 'chase' || b2.state === 'recover')) {
        await settle(350);
        result.after = { t: +(f / 30).toFixed(2), bossAttack: st.bossAttack, bossState: st.bossState, ...collect() };
        break;
      }
    }
    await settle(320);
    if (!result.after) result.after = collect();
    result.afterExtra = collect().count;
  } catch (e) { result.error = String(e && e.stack || e); }
  return result;
}

export default {
  id: '09-dodge-telegraph',
  title: 'v2.0.1 聚焦复验：翻滚 + 攻击预警',
  coverage: ['DODGE-01', 'TELE-01'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('DODGE-01', '当前构建不是 v2.x', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    const info = await ctx.debugInfo(true);
    ctx.expect(info && info.version === '2.0.1', 'VER-01', '__DEBUG.version 为 2.0.1（本轮修复构建）', 'actual=' + (info && info.version));
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);
    ctx.info('BUILD', '构建信息', JSON.stringify({ version: info.version, keys: info.keys.length }));

    // ---- DODGE-01 ----
    let dodge = null;
    try { dodge = await ctx.eval(`(${dodgeExperimentPage.toString()})()`); } catch (e) { ctx.error('DODGE-01', '翻滚实验执行失败', e); }
    if (dodge) {
      await ctx.snapshotDiag('dodge-experiment', dodge);
      const dShot = await ctx.shot('20-dodge');
      ctx.info('DODGE-DIAG', '翻滚数据', JSON.stringify(dodge).slice(0, 3200));
      const results = dodge.results || [];
      const distOk = results.length === 4 && results.filter((r) => Math.abs(r.finalDist - 3.0) <= 0.08).length === results.length;
      ctx.expect(distOk, 'DODGE-01a', '无祝福时翻滚位移 ≈3.00m（四方向）', JSON.stringify(results.map((r) => ({ dir: r.dir, finalDist: r.finalDist }))));
      const headOk = results.length === 4 && results.every((r) => r.during.minHeadY >= -0.005);
      const kneeOk = results.length === 4 && results.every((r) => r.during.minKneeY >= -0.005);
      ctx.expect(headOk && kneeOk, 'DODGE-01', '翻滚全程及结束后 0.5s 头部/膝部世界 Y ≥ 0（不穿地）', JSON.stringify(results.map((r) => ({ dir: r.dir, minHeadY: r.during.minHeadY, minKneeY: r.during.minKneeY }))).slice(0, 1200), dShot);
      ctx.expect(results.every((r) => r.iframe.frames > 0), 'DODGE-01b', '翻滚无敌帧存在（0.02~0.28s）', JSON.stringify(results.map((r) => ({ dir: r.dir, iframe: r.iframe }))));
      const resetOk = results.every((r) => r.final.state === 'idle' && Math.abs(r.final.visRotX) < 0.01 && Math.abs(r.final.visPosY) < 0.001 && Math.abs(r.final.visScaleX - 1) < 0.01 && Math.abs(r.final.visScaleY - 1) < 0.01 && Math.abs(r.final.visRotY) < 0.01);
      ctx.expect(resetOk, 'DODGE-01c', '翻滚结束回到 idle 且无残留旋转/缩放/抬升', JSON.stringify(results.map((r) => ({ dir: r.dir, final: { state: r.final.state, rotX: r.final.visRotX, rotY: r.final.visRotY, posY: r.final.visPosY, scaleX: r.final.visScaleX, scaleY: r.final.visScaleY } }))).slice(0, 1200));
      ctx.expect(results.every((r) => r.before && r.before.headY > 1.0 && r.before.kneeLY > 0), 'DODGE-01d', '站立基准姿态头部/膝部高于地面（对照）', JSON.stringify(results.map((r) => ({ dir: r.dir, before: r.before }))).slice(0, 800));
    }

    // ---- TELE-01 前置：Boss 剑雨预警（在干净 playing 状态直接 skipToBoss） ----
    let bsr = null;
    try {
      await ensurePlaying(ctx);
      await god(ctx, true);
      bsr = await ctx.eval(`(${bossSwordRainExperimentPage.toString()})()`);
      await ctx.snapshotDiag('boss-swordrain-telegraph', bsr);
      await ctx.shot('21-boss-swordrain-telegraph');
      // 随机出招未命中时重试一次（Boss 每轮 150s 观察窗口）
      if (bsr && !bsr.sampled && !bsr.error) {
        const retry = await ctx.eval(`(${bossSwordRainExperimentPage.toString()})()`).catch(() => null);
        if (retry && retry.sampled) bsr = retry;
      }
    } catch (e) { ctx.error('TELE-01m', '剑雨预警实验执行失败', e); }
    ctx.info('BSR-DIAG', 'Boss 剑雨预警数据', JSON.stringify(bsr || {}).slice(0, 3000));

    // ---- TELE-01 ----
    let tele = null;
    try { tele = await ctx.eval(`(${telegraphExperimentPage.toString()})()`); } catch (e) { ctx.error('TELE-01', '预警实验执行失败', e); }
    if (tele) {
      await ctx.snapshotDiag('telegraph-experiment', tele);
      const teleShot = await ctx.shot('21-telegraph');
      ctx.info('TELE-DIAG', '预警数据', JSON.stringify(tele).slice(0, 4000));
      const g = tele.golem || {};
      const gw = g.atWindup;
      ctx.expect(tele.baseline && tele.baseline.totalCount === 0, 'TELE-01a', '基线状态无残留 telegraph 组', JSON.stringify(tele.baseline).slice(0, 500));
      ctx.expect(gw && gw.count > 0, 'TELE-01', '石卫 windup 时场景存在 telegraph 组', JSON.stringify({ baseline: tele.baseline, atWindup: gw }).slice(0, 900), teleShot);
      if (gw) {
        const grp = (gw.groups && gw.groups[0]) || {};
        ctx.expect(gw.groups.every((x) => x.whiteCount >= 1), 'TELE-01b', '预警含白色范围底/描边', JSON.stringify({ radius: grp.radius, whiteCount: grp.whiteCount, colors: grp.colors }).slice(0, 700));
        ctx.expect(gw.groups.every((x) => x.redCount >= 1), 'TELE-01c', '预警含红色蓄力填充', JSON.stringify({ radius: grp.radius, redCount: grp.redCount, colors: grp.colors }).slice(0, 700));
        ctx.expect(Math.abs((grp.radius || 0) - 4.0) <= 0.25, 'TELE-01d', '石卫预警半径 ≈4.0m（与实际判定范围一致）', 'radius=' + grp.radius);
        const later = g.later && g.later.groups && g.later.groups[0];
        ctx.expect(!!later && grp.fillProgress != null && later.fillProgress != null && later.fillProgress > grp.fillProgress, 'TELE-01e', '红色填充随蓄力扩大（进度递增）', JSON.stringify({ start: grp.fillProgress, later: later && later.fillProgress }).slice(0, 500));
        ctx.expect(g.endCount && g.endCount.count === 0 && g.afterExtra === 0, 'TELE-01f', '石卫攻击结束后预警清理为 0（无残留）', JSON.stringify(g.endCount).slice(0, 600));
      } else {
        ctx.skip('TELE-01b', '未捕获石卫 windup 预警', '');
      }
      const w = tele.wraith || {};
      const wa = w.atWindup;
      ctx.expect(!!wa && wa.count > 0, 'TELE-01g', '蚀影 windup 时存在扇形 telegraph', JSON.stringify({ atWindup: wa }).slice(0, 800));
      if (wa) {
        const grp = (wa.groups && wa.groups[0]) || {};
        ctx.expect(grp.whiteCount >= 1 && grp.redCount >= 1, 'TELE-01h', '蚀影预警白底+红填充', JSON.stringify({ radius: grp.radius, whiteCount: grp.whiteCount, redCount: grp.redCount, colors: grp.colors }).slice(0, 700));
        ctx.expect(Math.abs((grp.radius || 0) - 3.0) <= 0.25, 'TELE-01i', '蚀影预警半径 ≈3.0m', 'radius=' + grp.radius);
        ctx.expect(wa.enemyStateApi && wa.enemyStateApi.state === 'windup', 'TELE-01j', 'state().enemies 的 windup 与预警出现一致', JSON.stringify(wa.enemyStateApi));
        ctx.expect(w.endCount && w.endCount.count === 0 && w.afterExtra === 0, 'TELE-01k', '蚀影攻击结束后预警清理为 0', JSON.stringify(w.endCount).slice(0, 600));
      }
      const c = tele.clearAllCleanup || {};
      ctx.expect(c.beforeCount > 0 && c.afterCount === 0, 'TELE-01l', 'clearAll() 清理未结束预警（无残留）', JSON.stringify(c).slice(0, 700));
      const bsrData = bsr || {};
      ctx.expect(!!bsrData.sampled, 'TELE-01m', 'Boss 剑雨 windup 时存在 telegraph 圆环（≈2.9m）', JSON.stringify({ sampled: bsrData.sampled, error: bsrData.error, kinds: bsrData.kinds }).slice(0, 1400), teleShot);
      if (bsrData.sampled) {
        const groups = bsrData.sampled.groups || [];
        ctx.expect(groups.length >= 3 && groups.every((x) => Math.abs(x.radius - 2.9) <= 0.08), 'TELE-01n', '剑雨每个落点预警半径 ≈2.9m', JSON.stringify(groups.map((x) => x.radius)));
        ctx.expect(bsrData.sampled.bossAttack === 'swordrain' && bsrData.sampled.bossState === 'windup', 'TELE-01o', 'state().bossAttack/敌人状态与预警一致（swordrain/windup）', JSON.stringify({ bossAttack: bsrData.sampled.bossAttack, bossState: bsrData.sampled.bossState }));
        ctx.expect(bsrData.after && bsrData.after.count === 0 && bsrData.afterExtra === 0, 'TELE-01p', '剑雨结束后预警清理为 0（无残留）', JSON.stringify({ after: bsrData.after, afterExtra: bsrData.afterExtra }).slice(0, 800));
      } else {
        ctx.skip('TELE-01n', '未捕获剑雨 windup（随机出招）', '');
        ctx.skip('TELE-01o', '未捕获剑雨 windup', '');
        ctx.skip('TELE-01p', '未捕获剑雨 windup', '');
      }
      ctx.expect(tele.finalTelegraphCount === 0, 'TELE-01q', '收尾 clearAll 后 telegraph 组数为 0', 'count=' + tele.finalTelegraphCount);
    }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'ERR-01', '聚焦复验全程控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
    const internalErrors = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 10); }`);
    ctx.expect(!internalErrors || internalErrors.length === 0, 'ERR-02', 'window.__ERRORS 为空', JSON.stringify(internalErrors));
  },
};
