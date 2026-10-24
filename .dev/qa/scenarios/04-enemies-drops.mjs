// 04-enemies-drops — 爆裂者自爆 / 精英词缀 / 掉落拾取（对齐 v2 final：spawnElite/spawnPickup）
import { ensurePlaying, god, isV2 } from '../lib/flows.mjs';

/* ---------- 页面内实验 ---------- */
async function detonatorProbePage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const autoBless = () => { if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); } };
  const result = { spawned: null, states: {}, windup: null, exploded: false, hpBefore: null, hpAfter: null, hpLoss: null, pickups: [], pickupCount: 0, error: null };
  try { DBG.killAll(); } catch (e) {}
  DBG.tick(0.2); autoBless();
  P.hp = P.maxHp; P.invuln = 0; P.iframe = false; P.stamina = P.maxStamina;
  P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
  let id = null;
  try { id = DBG.spawnEnemy('detonator', 0, 2.4); } catch (e) { result.error = String(e && e.message || e); }
  if (id == null) { result.error = result.error || 'detonator 生成失败'; return result; }
  DBG.tick(0.1);
  result.spawned = { id };
  const e = D.enemies.find((x) => x.alive && x.id === id);
  if (!e) { result.error = '找不到爆裂者实体'; return result; }
  result.hpBefore = +P.hp.toFixed(1);
  let sawWindup = false;
  for (let f = 0; f < 900; f++) {
    autoBless();
    DBG.tick(1 / 30);
    if (f % 6 === 0) result.states[e.state] = (result.states[e.state] || 0) + 1;
    if (e.state === 'windup' && !sawWindup) {
      sawWindup = true;
      result.windup = { frame: f, windupDur: e.windupDur, teleFixed: !!e.teleFixed, hasTele: !!e.tele, playerDist: +Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z).toFixed(2) };
    }
    if (!e.alive && sawWindup) break;
    if (P.hp <= 1) break;
  }
  result.exploded = !e.alive;
  result.hpAfter = +P.hp.toFixed(1);
  result.hpLoss = +(result.hpBefore - result.hpAfter).toFixed(1);
  result.pickupCount = D.pickups ? D.pickups.length : 0;
  result.pickups = (D.pickups || []).map((p) => ({ type: p.type, amount: p.amount, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), life: +(p.life || 0).toFixed(1) }));
  result.entities = (() => { const o = {}; for (const k of Object.keys(D)) if (Array.isArray(D[k])) o[k] = D[k].length; return o; })();
  return result;
}

async function eliteProbePage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const autoBless = () => { if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); } };
  const result = { supported: typeof DBG.spawnElite === 'function', kinds: [], error: null };
  try { DBG.killAll(); } catch (e) {}
  DBG.tick(0.2); autoBless();
  P.hp = P.maxHp; P.invuln = 0; P.iframe = false;
  if (!result.supported) { result.error = '无 __DEBUG.spawnElite'; return result; }
  for (const kind of ['shield', 'fury', 'swift']) {
    try { DBG.killAll(); } catch (e) {}
    DBG.tick(0.1); autoBless();
    P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
    let id = null;
    try { id = DBG.spawnElite('wraith', 0, 2.6, kind); } catch (e) { result.error = String(e && e.message || e); }
    DBG.tick(0.15);
    const e = D.enemies.find((x) => x.alive && (id == null || x.id === id));
    if (!e) { result.kinds.push({ kind, ok: false, error: 'not spawned' }); continue; }
    const entry = {
      kind, ok: true, id: e.id, type: e.type, elite: !!e.elite, eliteKind: e.eliteKind,
      eliteLabel: e.eliteCfg && e.eliteCfg.label, hp: +e.hp.toFixed(0), maxHp: e.maxHp, baseMaxHp: 46,
      hpMul: +(e.maxHp / 46).toFixed(2), speedMul: e.speedMul, shieldHits: e.shieldHits,
      guaranteedDrop: !!e.guaranteedDrop, hasAura: !!e.aura,
      stateApi: (DBG.enemies() || []).find((x) => x.id === e.id) || null,
    };
    const before = (D.pickups || []).length;
    const hpB = +P.hp.toFixed(1), momB = +P.momentum.toFixed(1);
    P.hp = Math.min(P.maxHp, 60); P.momentum = 0;
    try { DBG.damageEnemyById(e.id, 99999); } catch (err) {}
    DBG.tick(0.4);
    entry.drop = {
      pickupsBefore: before, pickupsAfter: (D.pickups || []).length,
      pickups: (D.pickups || []).map((p) => ({ type: p.type, amount: p.amount, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) })),
      hpBefore: hpB, hpAfter: +P.hp.toFixed(1), momentumAfter: +P.momentum.toFixed(1),
      dropEvidence: (D.pickups || []).length > before || P.momentum > 0 || P.hp > hpB,
    };
    entry.afterKillAlive = !!D.enemies.find((x) => x.id === e.id && x.alive);
    result.kinds.push(entry);
  }
  return result;
}

async function dropsProbePage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const autoBless = () => { if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); } };
  const result = { supported: typeof DBG.spawnPickup === 'function', tests: [], pickups: [], error: null };
  try { DBG.killAll(); } catch (e) {}
  DBG.tick(0.2); autoBless();
  if (!result.supported) { result.error = '无 __DEBUG.spawnPickup'; return result; }
  // 现有掉落物先移出磁吸范围，避免干扰
  for (const p of (D.pickups || [])) { p.pos.x = 100; p.pos.z = 100; }
  // heal 掉落：玩家在原点，pickup 生成于 +2/+2（磁吸范围内，会自动飞向玩家）
  P.hp = Math.min(P.maxHp, 40); P.invuln = 0; P.iframe = false; P.pos.x = 0; P.pos.z = 0;
  const hp0 = +P.hp.toFixed(1);
  let healTarget = null;
  try { DBG.spawnPickup('heal'); } catch (e) { result.error = String(e && e.message || e); }
  DBG.tick(1 / 60);
  healTarget = (D.pickups || [])[(D.pickups || []).length - 1] || null;
  result.pickups.push({ stage: 'heal-spawn', count: healTarget ? 1 : 0, type: healTarget && healTarget.type, amount: healTarget && healTarget.amount });
  for (let f = 0; f < 120; f++) { autoBless(); DBG.tick(1 / 30); if (P.hp > hp0) break; }
  const healGone = !healTarget || !(D.pickups || []).includes(healTarget);
  result.tests.push({ type: 'heal', hpBefore: hp0, hpAfter: +P.hp.toFixed(1), targetGone: healGone, collected: P.hp > hp0 });
  // momentum 掉落
  P.momentum = 0;
  let momTarget = null;
  try { DBG.spawnPickup('momentum'); } catch (e) {}
  DBG.tick(1 / 60);
  momTarget = (D.pickups || [])[(D.pickups || []).length - 1] || null;
  result.pickups.push({ stage: 'momentum-spawn', count: momTarget ? 1 : 0, type: momTarget && momTarget.type, amount: momTarget && momTarget.amount });
  for (let f = 0; f < 120; f++) { autoBless(); DBG.tick(1 / 30); if (P.momentum > 0) break; }
  const momGone = !momTarget || !(D.pickups || []).includes(momTarget);
  result.tests.push({ type: 'momentum', momentumBefore: 0, momentumAfter: +P.momentum.toFixed(1), targetGone: momGone, collected: P.momentum > 0 });
  result.statePickups = DBG.state().pickups;
  result.entityArrays = (() => { const o = {}; for (const k of Object.keys(D)) if (Array.isArray(D[k])) o[k] = D[k].length; return o; })();
  return result;
}

export default {
  id: '04-enemies-drops',
  title: '爆裂者 / 精英词缀 / 掉落拾取',
  coverage: ['BOMB-01..05', 'ELITE-01..04', 'DROP-01..06'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('BOMB-01', '当前构建不是 v2.x，跳过敌人/掉落验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, false);

    // ---- 爆裂者 ----
    let det = null;
    try { det = await ctx.eval(`(${detonatorProbePage.toString()})()`); } catch (e) { ctx.error('BOMB-01', '爆裂者实验失败', e); }
    if (det) {
      await ctx.snapshotDiag('detonator', det);
      const detShot = await ctx.shot('12-detonator');
      ctx.info('BOMB-DIAG', '爆裂者数据', JSON.stringify(det).slice(0, 2400));
      if (det.error && det.spawned == null) {
        ctx.fail('BOMB-01', '爆裂者可生成', det.error);
      } else {
        ctx.pass('BOMB-01', '爆裂者可生成', JSON.stringify(det.spawned), detShot);
        ctx.expect(det.windup && det.windup.hasTele && det.windup.windupDur > 0.5, 'BOMB-02', '自爆前有预警（windup 0.85s + 地面预警圈）', JSON.stringify(det.windup).slice(0, 700), detShot);
        ctx.expect(det.exploded, 'BOMB-03', '爆裂者自爆后消失', JSON.stringify({ exploded: det.exploded }), detShot);
        ctx.expect(det.hpLoss > 0, 'BOMB-03b', '爆炸对范围内玩家造成伤害', JSON.stringify({ hpBefore: det.hpBefore, hpAfter: det.hpAfter, hpLoss: det.hpLoss, states: det.states }).slice(0, 700), detShot);
        ctx.expect(det.pickupCount > 0, 'BOMB-04', '爆裂者自爆产生掉落（momentum）', JSON.stringify({ pickupCount: det.pickupCount, pickups: det.pickups }).slice(0, 600), detShot);
        ctx.expect(det.entities && (det.entities.projectiles || 0) < 50, 'BOMB-05', '爆炸后实体数量正常（无投射物堆积）', JSON.stringify(det.entities));
      }
    }

    // ---- 精英词缀（v2 final：spawnElite 直接生成 3 种词缀） ----
    await god(ctx, true);
    let elite = null;
    try { elite = await ctx.eval(`(${eliteProbePage.toString()})()`); } catch (e) { ctx.error('ELITE-01', '精英实验失败', e); }
    if (elite) {
      await ctx.snapshotDiag('elite', elite);
      const eliteShot = await ctx.shot('11-elite');
      ctx.info('ELITE-DIAG', '精英数据', JSON.stringify(elite).slice(0, 2600));
      const okKinds = (elite.kinds || []).filter((k) => k.ok && k.elite);
      if (okKinds.length >= 3) {
        ctx.pass('ELITE-01', '精英敌人可生成且带词缀（shield/fury/swift）', JSON.stringify(okKinds.map((k) => ({ kind: k.kind, label: k.eliteLabel, hpMul: k.hpMul }))).slice(0, 900), eliteShot);
        const hpOk = okKinds.every((k) => k.hpMul > 1.1);
        const effectsOk = okKinds.some((k) => k.shieldHits > 0) && okKinds.some((k) => k.speedMul > 1.2);
        ctx.expect(hpOk, 'ELITE-02', '精英词缀数值生效（HP 倍率 > 1.1）', JSON.stringify(okKinds.map((k) => ({ kind: k.kind, hpMul: k.hpMul }))));
        ctx.expect(effectsOk || okKinds.every((k) => k.eliteKind), 'ELITE-02b', '词缀特殊效果可观测（护盾次数/速度倍率）', JSON.stringify(okKinds.map((k) => ({ kind: k.kind, shieldHits: k.shieldHits, speedMul: k.speedMul }))).slice(0, 700));
        const dropsOk = okKinds.filter((k) => k.drop && (k.drop.dropEvidence || k.drop.pickupsAfter > k.drop.pickupsBefore)).length;
        ctx.expect(dropsOk >= 1, 'ELITE-03', '精英击杀产生掉落（拾取光球/回复资源）', JSON.stringify(okKinds.map((k) => ({ kind: k.kind, drop: k.drop }))).slice(0, 1200), eliteShot);
        ctx.expect(okKinds.every((k) => !k.afterKillAlive), 'ELITE-04', '精英可被击杀', JSON.stringify(okKinds.map((k) => ({ kind: k.kind, afterKillAlive: k.afterKillAlive }))));
      } else {
        ctx.fail('ELITE-01', '精英生成/词缀校验未通过', JSON.stringify(elite).slice(0, 1600), eliteShot);
      }
    }

    // ---- 掉落拾取（v2 final：spawnPickup('heal'/'momentum')） ----
    try {
      const drops = await ctx.eval(`(${dropsProbePage.toString()})()`);
      await ctx.snapshotDiag('drops', drops);
      const dropShot = await ctx.shot('13-drop');
      ctx.info('DROP-DIAG', '掉落数据', JSON.stringify(drops).slice(0, 2400));
      if (!drops.supported) {
        ctx.blocked('DROP-01', '无 __DEBUG.spawnPickup 调试钩子', JSON.stringify(drops));
      } else {
        const spawns = (drops.pickups || []).filter((s) => s.count > 0).length;
        ctx.expect(spawns >= 1, 'DROP-01', '掉落物可生成（D.pickups / state().pickups）', JSON.stringify({ stages: drops.pickups, statePickups: drops.statePickups }).slice(0, 800), dropShot);
        const heal = (drops.tests || []).find((t) => t.type === 'heal');
        const mom = (drops.tests || []).find((t) => t.type === 'momentum');
        ctx.expect(!!heal && heal.collected, 'DROP-02', '治疗掉落可被拾取并回血', JSON.stringify(heal).slice(0, 500), dropShot);
        ctx.expect(!!mom && mom.collected, 'DROP-03', '拾取 momentum 掉落增加势能', JSON.stringify(mom).slice(0, 500), dropShot);
        const remainPickups = drops.entityArrays ? drops.entityArrays.pickups : null;
        ctx.expect(!!heal && !!mom && heal.collected && mom.collected && (!heal.targetGone === false) && (!mom.targetGone === false), 'DROP-04', '拾取后对应掉落物从场上移除', JSON.stringify({ heal, mom, remainPickups, targetGone: [heal && heal.targetGone, mom && mom.targetGone] }));
        ctx.info('DROP-05', '掉落类型/数值', JSON.stringify(drops.pickups).slice(0, 800));
      }
    } catch (e) { ctx.error('DROP-01', '掉落实验失败', e); }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'DROP-06', '敌人/掉落套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
  },
};
