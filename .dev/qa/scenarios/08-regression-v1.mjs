// 08-regression-v1 — v1.0.1 核心玩法回归（连击/重击/闪避/剑气/烬灭/饮烬/锁定/波次/设置）
import { ensurePlaying, clearWave, solveBlessing, isV2, god } from '../lib/flows.mjs';

export default {
  id: '08-regression-v1',
  title: 'v1 核心玩法回归',
  coverage: ['REG-01..10'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('REG-01', '当前构建不是 v2.x，跳过回归套件（v1 自检另行执行）', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, false);
    const keys = (await ctx.debugInfo()).keys;
    ctx.info('REG-DIAG', '调试接口', keys.join(','));

    const ensurePlay = async () => {
      const st = await ctx.state();
      if (st && st.mode === 'blessing') await solveBlessing(ctx, { limit: 2 });
      else if (st && st.mode === 'paused') await ctx.tryDbg('resume');
      await ctx.tick(0.2);
    };
    const setupArena = async () => ctx.game(`function(){
      const G=window.G, DBG=window.__DEBUG, D=G.game.D, P=G.game.P, S=G.game.S;
      if (S.mode==='blessing') { try{DBG.chooseBlessing(0);}catch(e){} DBG.tick(1.0); }
      if (S.mode==='paused') { try{DBG.resume();}catch(e){} DBG.tick(0.1); }
      /* 保留波次敌人但赶到远处并锁血，避免清波触发祝福 */
      for (const e of D.enemies) if (e.alive) { e.hp = Math.max(e.hp, 99999); e.pos.x = 22; e.pos.z = 20; e.cooldown = 99; }
      P.hp=P.maxHp; P.stamina=P.maxStamina; P.invuln=0; P.iframe=false; P.state='idle'; P.momentum=0;
      P.pos.x=0; P.pos.z=0; P.yaw=0;
      let id=null; try { id = DBG.spawnEnemy('wraith', 0, 2.2); } catch(e) {}
      DBG.tick(0.12);
      const e = D.enemies.find(x=>x.alive && (id==null || x.id===id));
      return { enemy: e? {id:e.id, hp:e.hp, maxHp:e.maxHp, type:e.type, state:e.state} : null, player:{hp:P.hp, stamina:P.stamina, momentum:P.momentum, potions:P.potions}, mode:S.mode };
    }`);

    let setup = await setupArena();
    ctx.info('REG-SETUP', '战斗场地', JSON.stringify(setup).slice(0, 700));
    const enemyHp = async () => {
      const list = await ctx.tryDbg('enemies');
      if (!list.ok || !Array.isArray(list.value)) return null;
      return list.value;
    };

    // ---- REG-01 轻斩连击 ----
    try {
      await ensurePlay();
      ctx.expect(setup && setup.enemy, 'REG-01a', '可生成近战目标', JSON.stringify(setup && setup.enemy).slice(0, 300));
      const hp0 = setup.enemy ? setup.enemy.hp : null;
      for (let i = 0; i < 3; i++) {
        const atk = await ctx.tryDbg('attack', 'light');
        if (!atk.ok) { ctx.blocked('REG-01', '无 attack 调试钩子', atk.error); return; }
        await ctx.tick(0.3);
      }
      const list = await enemyHp();
      const hpNow = list && list.length ? Math.min(...list.map((e) => e.hp)) : null;
      const p = await ctx.tryDbg('player');
      const st = await ctx.state();
      ctx.info('REG-01b', '连击后状态', JSON.stringify({ hp0, hpNow, player: p.value && p.value.state, combo: st && st.combo, maxCombo: st && st.maxCombo, score: st && st.score }).slice(0, 600));
      ctx.expect(hpNow == null || hpNow < hp0 || (st && st.combo > 0), 'REG-01', '轻斩连击可命中并产生连击', JSON.stringify({ hp0, hpNow, combo: st && st.combo }).slice(0, 400));
    } catch (e) { ctx.error('REG-01', '轻斩连击测试异常', e); }

    // ---- REG-02 重斩 ----
    try {
      setup = await setupArena();
      const before = await ctx.game(`function(){ const P=window.G.game.P; P.stamina=P.maxStamina; P.state='idle'; return { stamina:P.stamina }; }`);
      const atk = await ctx.tryDbg('attack', 'heavy');
      await ctx.tick(0.6);
      const p = await ctx.tryDbg('player');
      ctx.info('REG-02a', '重斩状态', JSON.stringify({ before, player: p.value && { stamina: p.value.stamina, state: p.value.state } }).slice(0, 500));
      ctx.expect(atk.ok, 'REG-02a', '重斩可释放', String(atk.error || ''));
      ctx.expect(p.ok && p.value.stamina < before.stamina - 1, 'REG-02', '重斩消耗体力', JSON.stringify({ before: before.stamina, after: p.value && p.value.stamina }));
    } catch (e) { ctx.error('REG-02', '重斩测试异常', e); }

    // ---- REG-03 闪避无敌帧 ----
    try {
      setup = await setupArena();
      const hpB = await ctx.game(`function(){ const P=window.G.game.P; P.hp=P.maxHp; P.invuln=0; P.iframe=false; P.state='idle'; return P.hp; }`);
      const dodge = await ctx.tryDbg('dodge');
      await ctx.tick(0.05);
      const p = await ctx.tryDbg('player');
      const iframe = await ctx.game(`function(){ return !!window.G.game.P.iframe; }`);
      await ctx.tryDbg('damagePlayer', 20);
      await ctx.tick(0.2);
      const hpAfter = await ctx.game(`function(){ return window.G.game.P.hp; }`);
      ctx.info('REG-03a', '闪避无敌帧数据', JSON.stringify({ dodge: dodge.ok, iframe, hpBefore: hpB, hpAfter }));
      ctx.expect(dodge.ok, 'REG-03a', '闪避可释放', String(dodge.error || ''));
      ctx.expect(hpB === hpAfter, 'REG-03', '闪避无敌帧内不受伤害', JSON.stringify({ hpBefore: hpB, hpAfter, iframe }));
      // 对照组：无无敌帧时受到伤害
      setup = await setupArena();
      const hpB2 = await ctx.game(`function(){ const P=window.G.game.P; P.hp=100; P.invuln=0; P.iframe=false; P.state='idle'; return P.hp; }`);
      await ctx.tryDbg('damagePlayer', 20);
      await ctx.tick(0.1);
      const hpA2 = await ctx.game(`function(){ return window.G.game.P.hp; }`);
      ctx.expect(hpA2 < hpB2, 'REG-03b', '无无敌帧时受到伤害（对照组）', JSON.stringify({ hpBefore: hpB2, hpAfter: hpA2, mode: (await ctx.state()).mode }));
    } catch (e) { ctx.error('REG-03', '闪避测试异常', e); }

    // ---- REG-04 剑气（E） ----
    try {
      setup = await setupArena();
      await ctx.game(`function(){ const P=window.G.game.P; P.stamina=P.maxStamina; P.state='idle'; P.waveCd=0; return true; }`);
      const before = await ctx.game(`function(){ const P=window.G.game.P, D=window.G.game.D; return { stamina:P.stamina, projectiles:(D.projectiles||[]).length }; }`);
      const w = await ctx.tryDbg('wave');
      await ctx.tick(0.8);
      const after = await ctx.game(`function(){ const P=window.G.game.P, D=window.G.game.D; return { stamina:P.stamina, projectiles:(D.projectiles||[]).length, cd:P.waveCd, state:P.state }; }`);
      ctx.info('REG-04a', '剑气数据', JSON.stringify({ before, after, mode: (await ctx.state()).mode }));
      ctx.expect(w.ok, 'REG-04a', '剑气可释放', String(w.error || ''));
      ctx.expect(after.stamina < before.stamina - 1 || after.projectiles > before.projectiles || after.cd > 0, 'REG-04', '剑气产生投射物/消耗体力/进入冷却', JSON.stringify({ before, after }));
    } catch (e) { ctx.error('REG-04', '剑气测试异常', e); }

    // ---- REG-05 烬灭（F） ----
    try {
      setup = await setupArena();
      await ctx.game(`function(){ const G=window.G, DBG=window.__DEBUG, P=G.game.P; P.hp=P.maxHp; P.stamina=P.maxStamina; P.state='idle'; P.pos.x=0; P.pos.z=0; P.yaw=0; try{DBG.spawnEnemy('wraith',0,2.0); DBG.spawnEnemy('wraith',1.2,1.6);}catch(e){} return true; }`);
      await ctx.tick(0.1);
      const res = await ctx.game(`function(){
        const G=window.G, DBG=window.__DEBUG, P=G.game.P;
        P.state='idle'; P.momentum=0; P.hp=P.maxHp; P.invuln=0;
        const hpSum0 = (() => { let s=0; for (const e of G.game.D.enemies) if (e.alive) s += e.hp; return s; })();
        DBG.fillMomentum();
        const m0 = P.momentum;
        DBG.ult();
        const mCast = P.momentum;
        let min = mCast, max = mCast;
        for (let i=0;i<90;i++) { DBG.tick(1/60); min = Math.min(min, P.momentum); max = Math.max(max, P.momentum); }
        const hpSum1 = (() => { let s=0; for (const e of G.game.D.enemies) if (e.alive) s += e.hp; return s; })();
        return { m0, mCast, min, max, final: +P.momentum.toFixed(1), state: P.state, mode: G.game.S.mode, hpSum0, hpSum1 };
      }`);
      ctx.info('REG-05a', '烬灭数据', JSON.stringify(res).slice(0, 700));
      const consumed = res && (res.mCast < 50 || res.min < 50);
      ctx.expect(consumed, 'REG-05', '烬灭释放时消耗全部势能', JSON.stringify({ m0: res && res.m0, mCast: res && res.mCast, min: res && res.min, final: res && res.final }));
      ctx.expect(res && res.hpSum1 < res.hpSum0, 'REG-05b', '烬灭造成范围伤害', JSON.stringify({ hpSumBefore: res && res.hpSum0, hpSumAfter: res && res.hpSum1 }));
    } catch (e) { ctx.error('REG-05', '烬灭测试异常', e); }

    // ---- REG-06 饮烬（R） ----
    try {
      setup = await setupArena();
      const before = await ctx.game(`function(){ const P=window.G.game.P; P.hp=40; P.potions=3; P.invuln=0; P.iframe=false; P.state='idle'; return { hp:P.hp, potions:P.potions }; }`);
      const h = await ctx.tryDbg('heal');
      await ctx.tick(0.9);
      const after = await ctx.game(`function(){ const P=window.G.game.P; return { hp:P.hp, potions:P.potions }; }`);
      ctx.info('REG-06a', '饮烬数据', JSON.stringify({ before, after, mode: (await ctx.state()).mode }));
      ctx.expect(h.ok, 'REG-06a', '饮烬可释放', String(h.error || ''));
      ctx.expect(after.hp > before.hp && after.potions === before.potions - 1, 'REG-06', '饮烬回复生命并消耗药剂', JSON.stringify({ before, after }));
    } catch (e) { ctx.error('REG-06', '饮烬测试异常', e); }

    // ---- REG-07 Tab 锁定 ----
    try {
      setup = await setupArena();
      await ctx.game(`function(){ const G=window.G, DBG=window.__DEBUG; try{DBG.spawnEnemy('wraith',3,2); DBG.spawnEnemy('wraith',-3,2);}catch(e){} return true; }`);
      await ctx.tick(0.1);
      const l1 = await ctx.tryDbg('lockNearest');
      await ctx.tick(0.05);
      const s1 = await ctx.state();
      const l2 = await ctx.tryDbg('lockNearest');
      await ctx.tick(0.05);
      const s2 = await ctx.state();
      ctx.info('REG-07a', '锁定数据', JSON.stringify({ lock1: s1 && s1.lock, lock2: s2 && s2.lock }));
      ctx.expect(l1.ok && s1 && s1.lock != null, 'REG-07', 'Tab 可锁定最近敌人', JSON.stringify({ lock: s1 && s1.lock }));
      ctx.expect(l2.ok && s2 && s2.lock == null, 'REG-07b', '再次锁定可解除', JSON.stringify({ lock: s2 && s2.lock }));
    } catch (e) { ctx.error('REG-07', '锁定测试异常', e); }

    // ---- REG-08 波次推进 ----
    try {
      const res = await clearWave(ctx, { maxWait: 25 });
      await solveBlessing(ctx, { limit: 2 });
      const st = await ctx.state();
      ctx.info('REG-08a', '波次推进数据', JSON.stringify({ wave: st && st.wave, waveState: st && st.waveState, blessing: res.blessing && res.blessing.found }));
      ctx.expect(st && st.wave >= 2, 'REG-08', '清空波次后自动进入下一波', JSON.stringify({ wave: st && st.wave, waveState: st && st.waveState }));
    } catch (e) { ctx.error('REG-08', '波次推进测试异常', e); }

    // ---- REG-09 原有设置控件 ----
    try {
      if (await ctx.hasDebug('pause')) await ctx.tryDbg('pause');
      else await ctx.page.press('Escape');
      await new Promise((r) => setTimeout(r, 300));
      const sens = await ctx.waitVisible('sens-slider', { timeout: 2000 });
      const vol = await ctx.visible('vol-slider');
      const restart = await ctx.visible('restart-btn');
      const quit = await ctx.visible('quit-btn');
      ctx.info('REG-09a', '暂停面板控件', JSON.stringify({ sens, vol, restart, quit }));
      ctx.expect(sens && vol && restart && quit, 'REG-09', 'v1 暂停面板控件（灵敏度/音量/重开/返回标题）仍存在', JSON.stringify({ sens, vol, restart, quit }));
      if (await ctx.hasDebug('resume')) await ctx.tryDbg('resume');
      else await ctx.clickSelector('#resume-btn');
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) { ctx.warn('REG-09', 'v1 暂停控件检查异常', String(e.message || e)); }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'REG-10', '回归套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
  },
};
