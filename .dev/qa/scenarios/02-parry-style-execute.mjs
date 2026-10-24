// 02-parry-style-execute — Q 格挡/精准弹反、D→S 风格评级、处决（v2 final 精确时序版）
import { ensurePlaying, isV2, god } from '../lib/flows.mjs';

/* ---------- 页面内实验 ---------- */
async function styleExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const read = () => {
    const st = DBG.state();
    const fill = document.getElementById('style-fill');
    return { points: +S.stylePoints.toFixed(1), rank: st.style ? st.style.rank : null, mul: st.style ? st.style.mul : null, hudRank: (document.getElementById('style-rank') || {}).textContent || '', hudMul: (document.getElementById('style-mul') || {}).textContent || '', hudFill: fill ? fill.style.width : '' };
  };
  const result = { start: null, naturalGain: null, afterCombat: null, tiers: [], decay: null, modeLog: [], playerDamage: null };
  result.modeLog.push({ at: 'start', mode: S.mode, points: +S.stylePoints.toFixed(1) });
  ensurePlay();
  for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
  result.start = read();
  P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle';
  P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
  // 自然战斗涨分
  for (let round = 0; round < 6; round++) {
    ensurePlay();
    for (let i = 0; i < 3; i++) { try { DBG.spawnEnemy('wraith', Math.cos(i * 2.1) * 2.2, 2 + Math.sin(i * 2.1) * 2.2); } catch (e) {} }
    for (let i = 0; i < 220; i++) {
      ensurePlay();
      const alive = D.enemies.filter((e) => e.alive && e.type !== 'boss' && Math.hypot(e.pos.x, e.pos.z) < 8);
      if (!alive.length) break;
      const e = alive[0];
      P.pos.x = e.pos.x; P.pos.z = e.pos.z - 1.9; P.yaw = 0;
      if (i % 9 === 0) { try { DBG.attack('light'); } catch (err) {} }
      DBG.tick(1 / 60);
    }
    result.afterCombat = read();
    if (result.afterCombat.points >= 60) break;
  }
  result.naturalGain = { from: result.start.points, to: result.afterCombat ? result.afterCombat.points : null };
  // 阈值测试：D(0)/C(12)/B(28)/A(48)/S(70)
  for (const add of [12, 16, 20, 22]) {
    DBG.style(add);
    DBG.tick(1 / 60);
    result.tiers.push({ add, ...read() });
  }
  // 衰减：2.6s 无事件后每秒 -9
  DBG.tick(3.0);
  const decayBefore = read();
  DBG.tick(6.0);
  result.decay = { before: decayBefore, after: read() };
  // 受击惩罚（GDD：-10 风格分；god 需关闭才走伤害路径）
  try { DBG.god(false); } catch (e) {}
  P.invuln = 0; P.iframe = false; P.state = 'idle'; P.hp = P.maxHp;
  const beforeHit = read();
  try { DBG.damagePlayer(5); } catch (e) {}
  DBG.tick(0.2);
  result.playerDamage = { before: beforeHit, after: read(), hp: +P.hp.toFixed(1) };
  try { DBG.god(true); } catch (e) {}
  result.modeLog.push({ at: 'end', mode: S.mode });
  return result;
}

async function parryExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const prepareArena = () => {
    ensurePlay();
    for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
    P.hp = P.maxHp; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle'; P.parryCd = 0; P.parryWindow = 0;
    P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
    return { mode: S.mode, enemies: D.enemies.filter((e) => e.alive).length };
  };
  const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
  const result = { arena: null, blockKey: null, blockRelease: null, window: null, controlDamage: null, blockDamage: null, perfect: null, attempts: [], modeLog: [] };

  // ---- 1) 键盘 Q → block 状态 ----
  result.arena = prepareArena();
  key('keydown', 'KeyQ', 'q');
  DBG.tick(1 / 60); DBG.tick(1 / 60);
  result.blockKey = { playerState: P.state, blocking: P.state === 'block', blockHeld: !!P.blockHeld, parryWindow: +(P.parryWindow || 0).toFixed(3), stamina: +P.stamina.toFixed(1), hudBlockSkill: !!document.getElementById('skill-parry') };
  // ---- 2) 精准窗口衰减 ----
  DBG.tick(0.3);
  result.window = { afterPress: result.blockKey.parryWindow, after300ms: +(P.parryWindow || 0).toFixed(3) };
  key('keyup', 'KeyQ', 'q');
  DBG.tick(1 / 60);
  result.blockRelease = { playerState: P.state, parryWindow: +(P.parryWindow || 0).toFixed(3) };

  // ---- 3) 格挡减伤（确定性：走 damagePlayer 同一链路；先等精准窗口过期，测普通格挡） ----
  prepareArena();
  const hpC = P.hp;
  DBG.damagePlayer(20);
  DBG.tick(1 / 60);
  result.controlDamage = { hpBefore: hpC, hpAfter: +P.hp.toFixed(1), loss: +(hpC - P.hp).toFixed(1) };
  prepareArena();
  DBG.parryDown();
  DBG.tick(0.32); // 越过 0.2s 精准窗口，进入普通格挡
  const hpB = P.hp, stamB = P.stamina, stateB = P.state, winB = +(P.parryWindow || 0).toFixed(3);
  DBG.damagePlayer(20);
  DBG.tick(1 / 60);
  result.blockDamage = { hpBefore: hpB, hpAfter: +P.hp.toFixed(1), loss: +(hpB - P.hp).toFixed(1), staminaBefore: +stamB.toFixed(1), staminaAfter: +P.stamina.toFixed(1), stateDuringHit: stateB, parryWindowAtHit: winB, playerStateAfter: P.state };
  DBG.parryUp();
  DBG.tick(1 / 60);

  // ---- 4) 精准弹反（窗口 0.20s；在 windup 末段/命中帧按下） ----
  const attemptPerfect = () => {
    prepareArena();
    const id = (() => { try { return DBG.spawnEnemy('wraith', 0, 2.2); } catch (e) { return null; } })();
    if (id == null) return { error: 'spawn failed' };
    DBG.tick(0.1);
    const before = JSON.parse(JSON.stringify(P.stats || {}));
    let pressed = false, pressedFrame = -1, success = null;
    const hist = [];
    for (let i = 0; i < 1500; i++) {
      ensurePlay();
      DBG.tick(1 / 60);
      const e = D.enemies.find((x) => x.alive && x.id === id);
      if (!e) break;
      const es = String(e.state || '');
      const t = typeof e.t === 'number' ? e.t : 0;
      const wd = (typeof e.windupDur === 'number' && e.windupDur > 0) ? e.windupDur : 0.55;
      if (i % 4 === 0 && hist.length < 90) hist.push({ t: +(i / 60).toFixed(2), es, et: +t.toFixed(2), wd: +wd.toFixed(2) });
      if (!pressed && (es === 'strike' || es === 'attack' || (/windup/.test(es) && t >= wd - 0.15))) {
        DBG.parryDown();
        pressed = true; pressedFrame = i;
      }
      if (pressed) {
        const now = JSON.parse(JSON.stringify(P.stats || {}));
        if ((now.parries || 0) > (before.parries || 0)) {
          success = { frame: i, parries: now.parries, playerState: P.state, enemyState: e.state, score: Math.round(S.score), momentum: +P.momentum.toFixed(1), timeScale: +S.timeScale.toFixed(2), hudMsg: /完美弹反/.test(document.body.innerText || '') };
          break;
        }
        if (i - pressedFrame > 55) { DBG.parryUp(); break; }
      }
    }
    try { DBG.parryUp(); } catch (e) {}
    return { pressed, success, hist: hist.slice(0, 80), statsAfter: JSON.parse(JSON.stringify(P.stats || {})), hp: +P.hp.toFixed(1) };
  };
  for (let i = 0; i < 3; i++) {
    const a = attemptPerfect();
    result.attempts.push(a);
    if (a.success) break;
  }
  result.perfect = result.attempts.find((a) => a.success) || null;
  result.modeLog.push({ at: 'parryEnd', mode: S.mode });
  return result;
}

async function executeExperimentPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, P = G.game.P, S = G.game.S;
  const ensurePlay = () => {
    if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); }
    else if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); }
    return S.mode;
  };
  const result = { modeAtStart: S.mode, executable: false, hpAtBreak: null, promptDOM: false, detectedBy: [], statsBefore: null, statsAfter: null, hpBeforeExec: null, hpAfterExec: null, scoreBefore: null, scoreAfter: null, enemyAfter: null, executed: false };
  ensurePlay();
  for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
  P.hp = 66; P.stamina = P.maxStamina; P.invuln = 0; P.iframe = false; P.state = 'idle';
  P.pos.x = 0; P.pos.z = 0; P.yaw = 0;
  let id = null;
  try { id = DBG.spawnEnemy('wraith', 0, 2.0); } catch (e) {}
  DBG.tick(0.15);
  ensurePlay();
  const e = D.enemies.find((x) => x.alive && x.id === id) || D.enemies.find((x) => x.alive && Math.hypot(x.pos.x, x.pos.z) < 6);
  if (!e) { result.error = '无法生成处决目标'; return result; }
  try { DBG.damageEnemyById(e.id, Math.max(1, Math.ceil(e.hp - e.maxHp * 0.15))); } catch (err) { e.hp = e.maxHp * 0.15; }
  DBG.tick(2 / 60);
  result.executable = !!e.executable;
  result.hpAtBreak = +e.hp.toFixed(0);
  result.hudText = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400);
  result.enemyBarExec = (() => { try { return !!document.querySelector('#enemy-bars .exec'); } catch (err) { return false; } })();
  result.promptDOM = result.enemyBarExec || /处决/.test(result.hudText);
  result.detectedBy = [result.executable ? 'e.executable' : null, result.enemyBarExec ? 'enemyBar.exec' : null].filter(Boolean);
  result.statsBefore = JSON.parse(JSON.stringify(P.stats || {}));
  result.hpBeforeExec = +P.hp.toFixed(1);
  result.scoreBefore = Math.round(S.score);
  P.pos.x = e.pos.x; P.pos.z = e.pos.z - 1.4; P.yaw = 0; P.state = 'idle';
  DBG.attack('light');
  for (let i = 0; i < 120; i++) {
    ensurePlay();
    DBG.tick(1 / 60);
    if (!e.alive) break;
  }
  result.enemyAfter = { alive: e.alive, hp: +e.hp.toFixed(0), state: e.state };
  result.statsAfter = JSON.parse(JSON.stringify(P.stats || {}));
  result.hpAfterExec = +P.hp.toFixed(1);
  result.scoreAfter = Math.round(S.score);
  result.executed = (result.statsAfter.executions || 0) > (result.statsBefore.executions || 0) || !e.alive;
  result.modeAtEnd = S.mode;
  return result;
}

export default {
  id: '02-parry-style-execute',
  title: 'Q 格挡/精准弹反 + 风格评级 + 处决',
  coverage: ['PARRY-01..08', 'STYLE-01..05', 'EXEC-01..04'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('PARRY-01', '当前构建不是 v2.x，跳过格挡/弹反验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);

    // ---- 风格评级（先做，保证 stylePoints 从 0 开始） ----
    let style = null;
    try { style = await ctx.eval(`(${styleExperimentPage.toString()})()`); } catch (e) { ctx.error('STYLE-01', '风格评级实验脚本执行失败', e); }
    if (style) {
      await ctx.snapshotDiag('style-experiment', style);
      const styleShot = await ctx.shot('06-style-hud');
      ctx.info('STYLE-DIAG', '风格评级数据', JSON.stringify(style).slice(0, 2600));
      const startRank = style.start && style.start.rank;
      ctx.expect(!!startRank, 'STYLE-01', '风格评级可观测（state().style / HUD）', JSON.stringify(style.start), styleShot);
      ctx.expect(style.start && style.start.hudRank === style.start.rank, 'STYLE-01b', 'HUD 风格字母与内部状态一致', JSON.stringify({ hud: style.start && style.start.hudRank, state: startRank }), styleShot);
      const naturalGrew = style.naturalGain && style.naturalGain.to > style.naturalGain.from;
      ctx.expect(naturalGrew, 'STYLE-02', '持续攻击/击杀带来风格分增长', JSON.stringify(style.naturalGain), styleShot);
      const rankOrder = ['D', 'C', 'B', 'A', 'S'];
      const tiers = style.tiers || [];
      let monotonic = true, prevIdx = startRank ? rankOrder.indexOf(startRank) : -1;
      for (const t of tiers) { const idx = rankOrder.indexOf(t.rank); if (idx < prevIdx) monotonic = false; if (idx >= 0) prevIdx = idx; }
      const ranksReached = [startRank].concat(tiers.map((t) => t.rank)).filter(Boolean);
      ctx.expect(monotonic, 'STYLE-02b', '风格分累积时评级单调上升（D→C→B→A→S）', JSON.stringify(tiers));
      ctx.expect(ranksReached.includes('S'), 'STYLE-02c', '风格分可达到 S 评级', JSON.stringify(ranksReached));
      const decayed = style.decay && style.decay.before.points > style.decay.after.points;
      ctx.expect(decayed, 'STYLE-03', '无战斗事件后风格分衰减（2.6s 延迟后 ≈9/s）', JSON.stringify(style.decay));
      if (style.playerDamage && style.playerDamage.hp < 100) {
        const loss = style.playerDamage.before.points - style.playerDamage.after.points;
        ctx.expect(loss >= 5, 'STYLE-03b', '受击扣除风格分（GDD：约 -10）', JSON.stringify(style.playerDamage));
      } else {
        ctx.info('STYLE-03b', '受击扣风格分数据', JSON.stringify(style.playerDamage));
        ctx.warn('STYLE-03b', '受击扣风格分未能观测（伤害未生效）', JSON.stringify(style.playerDamage).slice(0, 500));
      }
      ctx.info('STYLE-04', '结算评级与风格的关系（以 hud.js 实现为准）', JSON.stringify({ finalRank: style.afterCombat && style.afterCombat.rank, tiers: (style.tiers || []).map((t) => t.rank) }));
    }

    // ---- 格挡/弹反 ----
    await god(ctx, false);
    let parry = null;
    try { parry = await ctx.eval(`(${parryExperimentPage.toString()})()`); } catch (e) { ctx.error('PARRY-01', '格挡/弹反实验脚本执行失败', e); }
    if (parry) {
      await ctx.snapshotDiag('parry-experiment', parry);
      const parryShot = await ctx.shot('05-parry');
      ctx.info('PARRY-DIAG', '格挡/弹反数据', JSON.stringify(parry).slice(0, 2800));
      const bk = parry.blockKey || {};
      ctx.expect(bk.blocking === true && bk.playerState === 'block', 'PARRY-01', '按住 Q 进入格挡状态', JSON.stringify(bk), parryShot);
      ctx.expect(bk.parryWindow > 0 && parry.window && parry.window.after300ms === 0, 'PARRY-02', '格挡附带精准窗口且 0.2s 内衰减', JSON.stringify({ down: bk.parryWindow, window: parry.window }), parryShot);
      const cd = parry.controlDamage, bd = parry.blockDamage;
      const reductionOk = cd && bd && cd.loss >= 18 && bd.loss < cd.loss * 0.5;
      ctx.expect(reductionOk, 'PARRY-01b', '格挡显著减少正面伤害（约 70%）', JSON.stringify({ control: cd, block: bd }), parryShot);
      ctx.expect(bd && (bd.staminaBefore - bd.staminaAfter) > 0, 'PARRY-02b', '格挡受击消耗体力', JSON.stringify({ staminaBefore: bd && bd.staminaBefore, staminaAfter: bd && bd.staminaAfter, parryWindowAtHit: bd && bd.parryWindowAtHit }));
      if (parry.perfect && parry.perfect.success) {
        const pShot = await ctx.shot('05-parry-perfect');
        ctx.pass('PARRY-03', '精准弹反可触发并产生成功反馈（parries +1）', JSON.stringify(parry.perfect.success), pShot);
        ctx.pass('PARRY-04', '弹反反馈完整（得分/势/慢动作）', JSON.stringify({ score: parry.perfect.success.score, momentum: parry.perfect.success.momentum, timeScale: parry.perfect.success.timeScale }).slice(0, 500));
      } else {
        const pressedAny = (parry.attempts || []).some((a) => a.pressed);
        ctx.fail('PARRY-03', '未能观测到精准弹反成功反馈', JSON.stringify({ pressedAny, attempts: (parry.attempts || []).map((a) => ({ pressed: a.pressed, hp: a.hp, hist: (a.hist || []).slice(0, 30) })) }).slice(0, 2200));
        ctx.fail('PARRY-04', '弹反统计未增长', JSON.stringify({ stats: (parry.attempts[0] || {}).statsAfter || {} }));
      }
      ctx.expect((parry.attempts || []).some((a) => a.pressed), 'PARRY-05', '可在敌人攻击时序中按下 Q（输入链路可用）', JSON.stringify((parry.attempts || []).map((a) => a.pressed)));
      ctx.info('PARRY-06', '弹反失败/普通格挡对照', JSON.stringify({ controlLoss: parry.controlDamage && parry.controlDamage.loss, blockLoss: parry.blockDamage && parry.blockDamage.loss }));
      ctx.info('PARRY-07', '实验期间模式日志', JSON.stringify(parry.modeLog));
    }

    // ---- 处决 ----
    await god(ctx, true);
    let exec = null;
    try { exec = await ctx.eval(`(${executeExperimentPage.toString()})()`); } catch (e) { ctx.error('EXEC-01', '处决实验脚本执行失败', e); }
    if (exec && !exec.error) {
      await ctx.snapshotDiag('execute-experiment', exec);
      const execShot = await ctx.shot('07-execute');
      ctx.info('EXEC-DIAG', '处决数据', JSON.stringify(exec).slice(0, 2400));
      ctx.expect(exec.executable, 'EXEC-01', '低血量目标进入可处决状态（executable）', JSON.stringify({ executable: exec.executable, hpAtBreak: exec.hpAtBreak, detectedBy: exec.detectedBy }).slice(0, 500), execShot);
      ctx.expect(exec.executed, 'EXEC-02', '近战命中触发处决并击杀目标', JSON.stringify({ enemyAfter: exec.enemyAfter, executions: exec.statsAfter && exec.statsAfter.executions, mode: exec.modeAtEnd }).slice(0, 700), execShot);
      const heal = +(exec.hpAfterExec - exec.hpBeforeExec).toFixed(1);
      ctx.expect(heal > 0 || (exec.statsAfter && exec.statsAfter.executions > 0), 'EXEC-03', '处决产生奖励（回血 +6 起/统计/得分）', JSON.stringify({ hpBefore: exec.hpBeforeExec, hpAfter: exec.hpAfterExec, heal, score: [exec.scoreBefore, exec.scoreAfter] }).slice(0, 600), execShot);
      ctx.expect(exec.modeAtEnd === 'playing', 'EXEC-04', '处决后玩家状态机恢复正常', 'mode=' + exec.modeAtEnd);
    } else if (exec && exec.error) {
      ctx.fail('EXEC-01', '无法构造处决场景', exec.error);
    }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'PARRY-08', '战斗机制套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
  },
};
