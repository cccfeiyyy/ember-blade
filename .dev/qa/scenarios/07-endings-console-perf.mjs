// 07-endings-console-perf — 死亡/胜利结算、重开、控制台零报错、性能粗测（v2 final）
import { ensurePlaying, god, isV2, solveBlessing } from '../lib/flows.mjs';

function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default {
  id: '07-endings-console-perf',
  title: '死亡/胜利结算 + 控制台 + 性能粗测',
  coverage: ['END-01..04', 'WIN-01..04', 'CONSOLE-01..04', 'PERF-01..04'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('END-01', '当前构建不是 v2.x，跳过结算/性能验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, false);

    // ---- END-01/02 死亡结算 ----
    for (let i = 0; i < 6; i++) {
      await ctx.tryDbg('damagePlayer', 9999);
      await ctx.tick(0.4);
      const st = await ctx.state();
      if (st && (st.mode === 'dead' || st.mode === 'victory')) break;
    }
    await ctx.tick(4);
    const deadState = await ctx.state();
    const endVisible = await ctx.waitVisible('end-screen', { timeout: 3000 });
    const deathShot = await ctx.shot('17-death-end');
    const stats = {
      score: await ctx.text('#stat-score'), time: await ctx.text('#stat-time'),
      kills: await ctx.text('#stat-kills'), combo: await ctx.text('#stat-combo'),
      rank: await ctx.text('#end-rank'), title: await ctx.text('#end-title'),
    };
    ctx.info('END-01a', '死亡结算数据', JSON.stringify({ state: deadState && { mode: deadState.mode, endShown: deadState.endShown }, endVisible, stats }).slice(0, 1000));
    ctx.expect(deadState && (deadState.mode === 'dead' || deadState.mode === 'victory'), 'END-01', '死亡后进入结算状态', 'mode=' + (deadState && deadState.mode), deathShot);
    ctx.expect(deadState && deadState.endShown && endVisible, 'END-01b', '结算页正确显示', JSON.stringify({ endShown: deadState && deadState.endShown, endVisible }), deathShot);
    const statNums = [stats.score, stats.time, stats.kills, stats.combo].map((s) => String(s || '').trim());
    ctx.expect(statNums.slice(0, 4).every((s) => s.length > 0), 'END-02', '结算统计项均有显示（得分/用时/击破/连击）', JSON.stringify(stats), deathShot);
    ctx.expect(stats.rank && /^[DCBAS]$/.test(stats.rank.trim()), 'END-02b', '结算评级为 D/C/B/A/S', 'rank=' + stats.rank);
    const endRecord = await ctx.text('#end-record');
    const bestAfterDeath = await ctx.tryDbg('best');
    const storageAfterDeath = await ctx.localStorageAll();
    ctx.info('END-02c', '结算纪录与最佳纪录', JSON.stringify({ endRecord, best: bestAfterDeath.value, storageKeys: Object.keys(storageAfterDeath) }).slice(0, 800));
    ctx.expect(/最高|纪录|得分/.test(endRecord || '') || (bestAfterDeath.ok && !!bestAfterDeath.value), 'END-02c', '结算页显示最高纪录/历史最佳', JSON.stringify({ endRecord, best: bestAfterDeath.value }).slice(0, 500));
    ctx.expect(!!storageAfterDeath['emberblade_best_v2'], 'END-02d', '结算后最佳纪录写入 localStorage', JSON.stringify(Object.keys(storageAfterDeath)));

    // ---- END-03 再战一次 ----
    await ctx.waitVisible('again-btn', { timeout: 3000 }).catch(() => {});
    const againOk = await ctx.clickSelector('#again-btn') || await ctx.clickText('再\\s*战|again');
    await sleepMs(400);
    await solveBlessing(ctx, { limit: 3 });
    const afterAgain = await ctx.state();
    ctx.expect(againOk && afterAgain && afterAgain.wave === 1 && afterAgain.mode === 'playing', 'END-03', '再战一次回到第 1 波新局', JSON.stringify({ againOk, wave: afterAgain && afterAgain.wave, mode: afterAgain && afterAgain.mode }).slice(0, 500));

    // ---- WIN-01/02 胜利结算 ----
    await god(ctx, true);
    let winOk = false;
    if (await ctx.hasDebug('skipToBoss')) {
      await ctx.tryDbg('skipToBoss');
      await ctx.waitFor(`(() => { const b = window.G.game.D.boss; return !!(b && b.alive); })()`, { timeout: 25000, poll: 120 }).catch(() => {});
      await ctx.tick(0.5);
      const bossId = await ctx.game(`function(){ const b=window.G.game.D.boss; return b ? b.id : null; }`);
      if (bossId != null && (await ctx.hasDebug('damageEnemyById'))) await ctx.tryDbg('damageEnemyById', bossId, 999999);
      else await ctx.tryDbg('damageEnemy', 999999);
      await ctx.tick(6);
      const st = await ctx.state();
      winOk = !!(st && (st.mode === 'victory' || st.endShown));
    }
    if (!winOk && (await ctx.hasDebug('endNow'))) {
      await ctx.tryDbg('endNow', true);
      await ctx.tick(1);
      const st = await ctx.state();
      winOk = !!(st && (st.mode === 'victory' || st.endShown));
    }
    const winState = await ctx.state();
    const winEndVisible = await ctx.waitVisible('end-screen', { timeout: 3000 });
    const endlessBtnVisible = await ctx.waitVisible('endless-btn', { timeout: 3000 }).catch(() => false);
    const winShot = await ctx.shot('18-victory-end');
    const winStats = { rank: await ctx.text('#end-rank'), title: await ctx.text('#end-title'), score: await ctx.text('#stat-score'), record: await ctx.text('#end-record') };
    ctx.info('WIN-01a', '胜利结算数据', JSON.stringify({ state: winState && { mode: winState.mode, endShown: winState.endShown }, winEndVisible, winStats, endlessBtnVisible }).slice(0, 1000));
    ctx.expect(winOk && winState && winState.mode === 'victory', 'WIN-01', '击败 Boss/胜利流程可进入胜利结算', JSON.stringify({ winOk, mode: winState && winState.mode }).slice(0, 500), winShot);
    ctx.expect(winState && winState.endShown && winEndVisible, 'WIN-01b', '胜利结算页正确显示', JSON.stringify({ endShown: winState && winState.endShown, winEndVisible }), winShot);
    ctx.expect(winStats.rank && /^[DCBAS]$/.test(winStats.rank.trim()), 'WIN-02', '胜利评级显示', 'rank=' + winStats.rank, winShot);
    ctx.expect(/最高|纪录|得分/.test(winStats.record || '') || endlessBtnVisible, 'WIN-02b', '胜利结算显示纪录/无尽入口', JSON.stringify({ record: winStats.record, endlessBtnVisible }).slice(0, 500), winShot);
    // ---- WIN-03 重开 ----
    await ctx.waitVisible('again-btn', { timeout: 3000 }).catch(() => {});
    const again2 = await ctx.clickSelector('#again-btn') || await ctx.clickText('再\\s*战|again');
    await sleepMs(400);
    await solveBlessing(ctx, { limit: 3 });
    const afterAgain2 = await ctx.state();
    ctx.expect(again2 && afterAgain2 && afterAgain2.wave === 1 && afterAgain2.mode === 'playing', 'WIN-03', '胜利后重开为干净新局', JSON.stringify({ again2, wave: afterAgain2 && afterAgain2.wave, mode: afterAgain2 && afterAgain2.mode }));
    ctx.expect(afterAgain2 && !afterAgain2.bossPhase2 && !afterAgain2.bossEnraged && afterAgain2.endless === false, 'WIN-03b', '重开后 Boss 阶段/无尽状态完全重置', JSON.stringify({ bossPhase2: afterAgain2 && afterAgain2.bossPhase2, bossEnraged: afterAgain2 && afterAgain2.bossEnraged, endless: afterAgain2 && afterAgain2.endless }));

    // ---- CONSOLE ----
    const allErrs = ctx.page.allErrors();
    const internalErrors = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 20); }`);
    const errorVisible = await ctx.visible('error-screen');
    ctx.expect(allErrs.length === 0, 'CONSOLE-01', '到目前为止全流程控制台零错误', allErrs.length ? JSON.stringify(allErrs.slice(0, 8)).slice(0, 1800) : '无');
    ctx.expect(!internalErrors || internalErrors.length === 0, 'CONSOLE-02', 'window.__ERRORS 为空', JSON.stringify(internalErrors).slice(0, 1200));
    ctx.expect(!errorVisible, 'CONSOLE-03', '未出现错误页', '');

    // ---- PERF-01 战斗场景 ----
    try {
      await god(ctx, true);
      if (await ctx.hasDebug('waveNow')) await ctx.tryDbg('waveNow', 3);
      await ctx.tick(2.5);
      await solveBlessing(ctx, { limit: 3 });
      const enemies = await ctx.game(`function(){
        const G=window.G, D=G.game.D, P=G.game.P;
        P.hp=P.maxHp;
        for (let i=0;i<8;i++) { try { window.__DEBUG.spawnEnemy('wraith', P.pos.x+Math.cos(i)*3, P.pos.z+Math.sin(i)*3); } catch(e){} }
        return (D.enemies||[]).filter(e=>e.alive).length;
      }`);
      const gl = await ctx.glInfo();
      const perf = await ctx.frameStats(4000);
      const perfShot = await ctx.shot('19-perf-combat');
      await ctx.snapshotDiag('perf-combat', { perf, gl, enemies });
      ctx.info('PERF-01a', '战斗场景帧率', JSON.stringify({ ...perf, gl, enemies }));
      // SwiftShader 软件渲染环境：以「无超长冻结帧」为粗测通过标准，FPS 仅作参考并在报告注明
      ctx.expect(perf.frames > 0 && perf.maxFrameMs < 1000, 'PERF-01', '战斗场景无超长冻结帧（软件渲染粗测）', JSON.stringify(perf), perfShot);
      if (perf.avgFps < 20) ctx.warn('PERF-01b', '软件渲染下帧率偏低（真机 GPU 需人工复核）', JSON.stringify(perf));
    } catch (e) { ctx.warn('PERF-01', '战斗性能测量失败', String(e.message || e)); }

    // ---- PERF-02 Boss 二阶段 ----
    try {
      if (await ctx.hasDebug('skipToBoss')) {
        await ctx.tryDbg('skipToBoss');
        await ctx.waitFor(`(() => { const b = window.G.game.D.boss; return !!(b && b.alive); })()`, { timeout: 25000, poll: 120 }).catch(() => {});
        const bossMax = await ctx.game(`function(){ const b=window.G.game.D.boss; return b ? b.maxHp : null; }`);
        const bossId = await ctx.game(`function(){ const b=window.G.game.D.boss; return b ? b.id : null; }`);
        if (bossMax) {
          if (bossId != null && (await ctx.hasDebug('damageEnemyById'))) await ctx.tryDbg('damageEnemyById', bossId, bossMax * 0.55);
          else await ctx.tryDbg('damageEnemy', bossMax * 0.55);
          await ctx.tick(2.5);
          await ctx.shot('19-perf-boss');
          const perf2 = await ctx.frameStats(4000);
          await ctx.snapshotDiag('perf-boss2', perf2);
          ctx.info('PERF-02a', 'Boss 二阶段帧率', JSON.stringify(perf2));
          ctx.expect(perf2.frames > 0 && perf2.maxFrameMs < 1500, 'PERF-02', 'Boss 二阶段无超长冻结帧', JSON.stringify(perf2));
        } else {
          ctx.skip('PERF-02', '未生成 Boss，跳过二阶段性能测量', '');
        }
      } else {
        ctx.skip('PERF-02', '无 skipToBoss，跳过二阶段性能测量', '');
      }
    } catch (e) { ctx.warn('PERF-02', 'Boss 性能测量失败', String(e.message || e)); }

    // ---- PERF-03 长时稳定性（60s 逻辑推进） ----
    try {
      await ctx.reset();
      await ensurePlaying(ctx);
      await god(ctx, true);
      const t0 = Date.now();
      let last = null;
      for (let i = 0; i < 12; i++) {
        last = await ctx.tick(5);
        await solveBlessing(ctx, { limit: 1 });
        if (last && (last.mode === 'dead' || last.mode === 'victory')) break;
      }
      const counts = await ctx.entityCounts();
      const internalErrors2 = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 20); }`);
      ctx.info('PERF-03a', '60s 逻辑推进稳定性', JSON.stringify({ realMs: Date.now() - t0, state: last && { mode: last.mode, wave: last.wave, elapsed: last.elapsed }, counts, errors: internalErrors2 }).slice(0, 1500));
      ctx.expect(!internalErrors2 || internalErrors2.length === 0, 'PERF-03', '长时运行无内部错误', JSON.stringify(internalErrors2).slice(0, 800));
    } catch (e) { ctx.warn('PERF-03', '长时稳定性测试失败', String(e.message || e)); }

    // ---- 汇总控制台 ----
    const finalErrs = ctx.page.errorsSince(seq0);
    ctx.expect(finalErrs.length === 0, 'CONSOLE-04', '结算/性能套件控制台零错误', finalErrs.length ? JSON.stringify(finalErrs.slice(0, 8)) : '无');
  },
};
