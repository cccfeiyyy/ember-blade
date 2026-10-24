// 10-dodge-v202 — v2.0.2 聚焦复验：翻滚位移 / 可见 Mesh 不穿地 / 中段收剑与恢复 / 归位
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
  const isVisibleChain = (m, root) => {
    let p = m;
    while (p && p !== root.parent) { if (!p.visible) return false; p = p.parent; }
    return true;
  };
  const measure = () => {
    const m = P.model;
    if (!m) return null;
    m.root.updateMatrixWorld(true);
    const wp = (obj) => (obj && obj.getWorldPosition ? obj.getWorldPosition(new THREE.Vector3()) : null);
    const headP = wp(m.head);
    const kneeL = wp(m.legL && m.legL.knee);
    const kneeR = wp(m.legR && m.legR.knee);
    /* 只统计可见 Mesh（自身+祖先可见），跳过隐藏的剑与阴影等不可见对象 */
    let visMinY = null, visCount = 0;
    const offenders = [];
    m.root.traverse((o) => {
      if (!o || !o.isMesh || !o.geometry) return;
      if (!isVisibleChain(o, m.root)) return;
      visCount++;
      const geo = o.geometry;
      if (!geo.boundingBox) { try { geo.computeBoundingBox(); } catch (e) { return; } }
      if (!geo.boundingBox) return;
      const box = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const y = box.min.y;
      if (visMinY == null || y < visMinY) visMinY = y;
      if (y < -0.005 && offenders.length < 12) offenders.push({ geo: geo.type, minY: +y.toFixed(3), name: o.name || '', parent: o.parent && (o.parent.name || o.parent.type) });
    });
    return {
      headY: headP ? +headP.y.toFixed(3) : null,
      kneeLY: kneeL ? +kneeL.y.toFixed(3) : null,
      kneeRY: kneeR ? +kneeR.y.toFixed(3) : null,
      visMinY: visMinY == null ? null : +visMinY.toFixed(3),
      visCount, offenders,
      state: P.state, iframe: !!P.iframe,
      swordVisible: !!(m.sword && m.sword.visible),
      x: +P.pos.x.toFixed(3), z: +P.pos.z.toFixed(3),
      visRotX: +m.visual.rotation.x.toFixed(4), visRotY: +m.visual.rotation.y.toFixed(4),
      visPosY: +m.visual.position.y.toFixed(4),
      visScaleX: +m.visual.scale.x.toFixed(4), visScaleZ: +m.visual.scale.z.toFixed(4),
    };
  };
  const parkEnemies = () => { for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; } };
  const fresh = () => {
    ensurePlay(); parkEnemies();
    P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.dodgeCd = 0;
    P.pos.x = 0; P.pos.z = 0;
    if (P.model && P.model.sword) P.model.sword.visible = true;
  };
  const results = [];
  const dirs = [{ name: 'facing+z', yaw: 0 }, { name: 'facing+x', yaw: Math.PI / 2 }, { name: 'facing-z', yaw: Math.PI }, { name: 'diagonal', yaw: Math.PI / 4 }];
  let blessingDodgeMul = null;
  for (const dir of dirs) {
    fresh();
    // 隔离祝福影响：祝福可能提供 dodgeDistMul（如「疾风」×1.12），记录后归 1，验证基础位移 3.00m
    blessingDodgeMul = P.mods && P.mods.dodgeDistMul != null ? P.mods.dodgeDistMul : null;
    if (P.mods) P.mods.dodgeDistMul = 1;
    P.yaw = dir.yaw;
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
    const afterSamples = [];
    for (let k = 0; k < 30; k++) {
      DBG.tick(1 / 60);
      const s = measure();
      s.t = +((samples.length + k) / 60).toFixed(3);
      s.dist = +Math.hypot(P.pos.x - start.x, P.pos.z - start.z).toFixed(3);
      afterSamples.push(s);
    }
    const all = samples.concat(afterSamples);
    const rollSamples = all.filter((s) => s.state === 'dodge');
    const final = all[all.length - 1];
    const minVis = Math.min(...all.filter((s) => s.visMinY != null).map((s) => s.visMinY));
    const minHead = Math.min(...all.filter((s) => s.headY != null).map((s) => s.headY));
    const minKnee = Math.min(...all.filter((s) => s.kneeLY != null).map((s) => Math.min(s.kneeLY, s.kneeRY)));
    const offenders = [];
    for (const s of all) for (const o of (s.offenders || [])) if (offenders.length < 20) offenders.push({ t: s.t, ...o });
    const iframeSamples = all.filter((s) => s.iframe);
    results.push({
      dir: dir.name, yaw: +dir.yaw.toFixed(3), before, endT, finalDist: final.dist,
      during: { minVisibleMeshY: +minVis.toFixed(3), minHeadY: +minHead.toFixed(3), minKneeY: +minKnee.toFixed(3) },
      offenders: offenders.slice(0, 20),
      sword: {
        before: before && before.swordVisible,
        hiddenMidRoll: rollSamples.some((s) => !s.swordVisible),
        hiddenSamples: rollSamples.filter((s) => !s.swordVisible).length,
        rollSamples: rollSamples.length,
        after: final.swordVisible,
      },
      iframe: { frames: iframeSamples.length, firstT: iframeSamples.length ? iframeSamples[0].t : null, lastT: iframeSamples.length ? iframeSamples[iframeSamples.length - 1].t : null },
      final,
      samples: all.filter((s, i) => i % 4 === 0 || s.state !== 'dodge').slice(0, 60),
    });
  }
  return { version: DBG.version, blessingDodgeMul, results };
}

/* 翻滚中途单帧（用于截图取证：可见 Mesh 不穿地 + 长剑隐藏） */
async function dodgeMidFramePage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
  for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
  P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.dodgeCd = 0; P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
  if (P.model && P.model.sword) P.model.sword.visible = true;
  DBG.dodge();
  for (let i = 0; i < 12; i++) DBG.tick(1 / 60); // t≈0.20s，翻转中段
  const m = P.model;
  m.root.updateMatrixWorld(true);
  let visMinY = null, visCount = 0;
  const isVisibleChain = (o, root) => { let p = o; while (p && p !== root.parent) { if (!p.visible) return false; p = p.parent; } return true; };
  m.root.traverse((o) => {
    if (!o || !o.isMesh || !o.geometry) return;
    if (!isVisibleChain(o, m.root)) return;
    visCount++;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const y = geo.boundingBox.clone().applyMatrix4(o.matrixWorld).min.y;
    if (visMinY == null || y < visMinY) visMinY = y;
  });
  return { t: +P.t.toFixed(3), state: P.state, swordVisible: !!(m.sword && m.sword.visible), visMinY: visMinY == null ? null : +visMinY.toFixed(3), visCount, headY: +m.head.getWorldPosition(new THREE.Vector3()).y.toFixed(3), pos: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)] };
}

export default {
  id: '10-dodge-v202',
  title: 'v2.0.2 聚焦复验：翻滚（可见 Mesh / 收剑 / 归位）',
  coverage: ['DODGE-01a..g'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('DODGE-01a', '当前构建不是 v2.x', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    const info = await ctx.debugInfo(true);
    ctx.expect(info && info.version === '2.0.2', 'VER-01', '__DEBUG.version 为 2.0.2（本轮修复构建）', 'actual=' + (info && info.version));
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);

    // 中途单帧截图（可见 Mesh + 收剑）
    let mid = null;
    try { mid = await ctx.eval(`(${dodgeMidFramePage.toString()})()`); } catch (e) { ctx.warn('DODGE-01b', '中途帧采集失败', String(e.message || e)); }
    if (mid) {
      await ctx.snapshotDiag('dodge-midframe', mid);
      const midShot = await ctx.shot('20-dodge-midroll');
      ctx.info('DODGE-MID', '翻滚中段单帧', JSON.stringify(mid), midShot);
      ctx.expect(mid.t > 0.1 && mid.t < 0.39, 'DODGE-01e', '翻滚中段（t≈0.2）采集成功', JSON.stringify({ t: mid.t }));
      ctx.expect(mid.swordVisible === false, 'DODGE-01f', '翻滚中段长剑隐藏（收剑）', JSON.stringify({ t: mid.t, swordVisible: mid.swordVisible }), midShot);
      ctx.expect(mid.visMinY != null && mid.visMinY >= -0.005, 'DODGE-01b-mid', '翻滚中段可见 Mesh 不穿地', JSON.stringify({ t: mid.t, visMinY: mid.visMinY, visCount: mid.visCount }), midShot);
    }
    // 结束翻滚，恢复站姿
    await ctx.tick(1.0);

    let dodge = null;
    try { dodge = await ctx.eval(`(${dodgeExperimentPage.toString()})()`); } catch (e) { ctx.error('DODGE-01a', '翻滚实验执行失败', e); }
    if (dodge) {
      await ctx.snapshotDiag('dodge-v202-experiment', dodge);
      const dShot = await ctx.shot('20-dodge-v202');
      ctx.info('DODGE-DIAG', '翻滚数据（可见 Mesh 口径）', JSON.stringify(dodge).slice(0, 3200));
      const results = dodge.results || [];
      ctx.info('DODGE-BLESSING', '初始祝福的翻滚距离倍率（已归一验证基础值）', JSON.stringify({ dodgeDistMul: dodge.blessingDodgeMul }));
      const distOk = results.length === 4 && results.every((r) => Math.abs(r.finalDist - 3.0) <= 0.01);
      ctx.expect(distOk, 'DODGE-01a', '无祝福加成时翻滚基础位移 = 3.00m（四方向；祝福倍率已归一）', JSON.stringify({ blessingDodgeMul: dodge.blessingDodgeMul, results: results.map((r) => ({ dir: r.dir, finalDist: r.finalDist })) }));
      const visOk = results.length === 4 && results.every((r) => r.during.minVisibleMeshY >= -0.005);
      ctx.expect(visOk, 'DODGE-01b', '翻滚全程及结束后 0.5s 可见 Mesh 世界 Y ≥ 0（不穿地）', JSON.stringify(results.map((r) => ({ dir: r.dir, minVisibleMeshY: r.during.minVisibleMeshY, offenders: r.offenders }))).slice(0, 1600), dShot);
      const bodyOk = results.length === 4 && results.every((r) => r.during.minHeadY >= -0.005 && r.during.minKneeY >= -0.005);
      ctx.expect(bodyOk, 'DODGE-01g', '头部/膝部世界 Y ≥ 0', JSON.stringify(results.map((r) => ({ dir: r.dir, minHeadY: r.during.minHeadY, minKneeY: r.during.minKneeY }))));
      const swordOk = results.length === 4 && results.every((r) => r.sword.before === true && r.sword.hiddenMidRoll === true && r.sword.after === true);
      ctx.expect(swordOk, 'DODGE-01e', '长剑：翻滚前可见 → 中段隐藏 → 结束立即恢复', JSON.stringify(results.map((r) => ({ dir: r.dir, sword: r.sword }))).slice(0, 900));
      const resetOk = results.length === 4 && results.every((r) => r.final.state === 'idle' && Math.abs(r.final.visRotX) < 0.01 && Math.abs(r.final.visRotY) < 0.01 && Math.abs(r.final.visPosY) < 0.001 && Math.abs(r.final.visScaleX - 1) < 0.01 && Math.abs(r.final.visScaleZ - 1) < 0.01);
      ctx.expect(resetOk, 'DODGE-01c', '翻滚结束回到 idle，无残留旋转/缩放/抬升', JSON.stringify(results.map((r) => ({ dir: r.dir, final: { state: r.final.state, rotX: r.final.visRotX, rotY: r.final.visRotY, posY: r.final.visPosY, scaleX: r.final.visScaleX, scaleZ: r.final.visScaleZ } }))).slice(0, 1200));
      const baseOk = results.length === 4 && results.every((r) => r.before && r.before.visMinY > 0 && r.before.headY > 1.0 && r.before.kneeLY > 0);
      ctx.expect(baseOk, 'DODGE-01d', '站立基准：可见 Mesh/头/膝均高于地面（对照）', JSON.stringify(results.map((r) => ({ dir: r.dir, before: { visMinY: r.before.visMinY, headY: r.before.headY, kneeLY: r.before.kneeLY } }))).slice(0, 800));
      ctx.expect(results.every((r) => r.iframe.frames > 0), 'DODGE-01h', '翻滚无敌帧存在（0.02~0.28s）', JSON.stringify(results.map((r) => ({ dir: r.dir, iframe: r.iframe }))));
      const anyOffenders = results.flatMap((r) => r.offenders || []);
      ctx.info('DODGE-OFFENDERS', '可见 Mesh 穿地统计（应为空）', JSON.stringify(anyOffenders).slice(0, 800));
    }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'ERR-01', '聚焦复验全程控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
    const internalErrors = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 10); }`);
    ctx.expect(!internalErrors || internalErrors.length === 0, 'ERR-02', 'window.__ERRORS 为空', JSON.stringify(internalErrors));
  },
};
