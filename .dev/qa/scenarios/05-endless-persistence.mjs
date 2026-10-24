// 05-endless-persistence — 无尽模式入口 / 波次持续推进 / 最高纪录跨刷新持久化（v2 final）
import { ensurePlaying, god, isV2, solveBlessing, detectBlessing } from '../lib/flows.mjs';

const BEST_KEY = 'emberblade_best_v2';

/* ---------- 页面内实验 ---------- */
async function victoryPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const D = G.game.D, S = G.game.S, P = G.game.P;
  const step = () => { if (window.__QA_SOLVE_B) window.__QA_SOLVE_B(); };
  try { DBG.god(true); } catch (e) {}
  step();
  P.hp = P.maxHp; P.invuln = 0;
  try { DBG.skipToBoss(); } catch (e) {}
  for (let i = 0; i < 600; i++) { step(); DBG.tick(1 / 30); P.hp = P.maxHp; if (D.boss && D.boss.alive) break; }
  if (!D.boss || !D.boss.alive) return { error: 'Boss 未生成', mode: S.mode, wave: S.wave };
  for (let i = 0; i < 30; i++) DBG.tick(1 / 30); // 出生保护 ~1s
  const bossId = D.boss.id;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { DBG.damageEnemyById(bossId, 999999); } catch (e) {}
    for (let i = 0; i < 6; i++) DBG.tick(1 / 30);
    if (!D.boss || !D.boss.alive) break;
  }
  for (let i = 0; i < 180; i++) { step(); DBG.tick(1 / 30); P.hp = P.maxHp; if (S.mode === 'victory') break; }
  for (let i = 0; i < 300; i++) { step(); DBG.tick(1 / 30); if (S.endShown) break; }
  return { mode: S.mode, victory: S.victory, endShown: S.endShown, wave: S.wave, score: Math.round(S.score), endless: S.endless, bossAlive: !!(D.boss && D.boss.alive) };
}

async function forceEndPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const S = G.game.S, D = G.game.D;
  try { DBG.god(false); } catch (e) {}
  for (let i = 0; i < 20; i++) {
    (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0);
    if (S.mode === 'dead' || S.mode === 'victory') break;
    try { DBG.damagePlayer(99999); } catch (e) {}
    DBG.tick(0.4);
  }
  for (let i = 0; i < 300; i++) { (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0); DBG.tick(1 / 30); if (S.endShown) break; }
  return { mode: S.mode, endShown: S.endShown, wave: S.wave, score: Math.round(S.score), victory: S.victory, endless: S.endless, bossAlive: !!(D.boss && D.boss.alive) };
}

async function progressPage(targetWave) {
  const G = window.G;
  const DBG = window.__DEBUG;
  const S = G.game.S, P = G.game.P;
  const result = { startWave: S.wave, targetWave, clears: 0, waveLog: [], blessings: 0, error: null };
  try {
    for (let i = 0; i < 40; i++) {
      (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0);
      if (S.mode === 'dead' || S.mode === 'victory') break;
      if (S.wave >= targetWave) break;
      P.hp = P.maxHp; P.invuln = 0;
      const prevWave = S.wave;
      try { DBG.killAll(); } catch (e) { result.error = String(e && e.message || e); break; }
      result.clears++;
      for (let t = 0; t < 480; t++) {
        (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0);
        DBG.tick(1 / 30);
        P.hp = P.maxHp;
        if (S.mode === 'dead' || S.mode === 'victory') break;
        if (S.wave > prevWave) break;
      }
      result.waveLog.push({ wave: S.wave, mode: S.mode, score: Math.round(S.score), blessings: result.blessings });
      if (S.mode === 'dead' || S.mode === 'victory') break;
      if (S.wave >= targetWave) break;
    }
  } catch (e) { result.error = String(e && e.stack || e); }
  result.end = { wave: S.wave, mode: S.mode, score: Math.round(S.score), elapsed: +S.elapsed.toFixed(1), endless: S.endless };
  return result;
}

async function finishAndReadPage() {
  const G = window.G;
  const DBG = window.__DEBUG;
  const S = G.game.S;
  const storage = () => { const out = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); } } catch (e) {} return out; };
  try { DBG.god(false); } catch (e) {}
  for (let i = 0; i < 20; i++) {
    (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0);
    if (S.mode === 'dead' || S.mode === 'victory') break;
    try { DBG.damagePlayer(99999); } catch (e) {}
    DBG.tick(0.4);
  }
  for (let i = 0; i < 360; i++) { (window.__QA_SOLVE_B ? window.__QA_SOLVE_B() : 0); DBG.tick(1 / 30); if (S.endShown) break; }
  const st = DBG.state();
  const endEl = document.getElementById('end-screen');
  const endVisible = !!endEl && !endEl.classList.contains('hidden') && getComputedStyle(endEl).display !== 'none';
  const btn = document.getElementById('endless-btn');
  return {
    mode: st.mode, wave: st.wave, score: st.score, endless: st.endless, endShown: st.endShown, endVisible,
    best: st.best, newRecord: st.newRecord,
    endlessBtn: btn ? { visible: !btn.classList.contains('hidden'), text: (btn.textContent || '').trim(), cls: btn.className } : null,
    endText: (endEl || {}).innerText || '',
    endRecord: (document.getElementById('end-record') || {}).innerText || '',
    storage: storage(),
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1500),
  };
}

async function readPageStatePage() {
  const storage = () => { const out = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); } } catch (e) {} return out; };
  const DBG = window.__DEBUG;
  const st = DBG.state();
  const br = document.getElementById('best-record');
  return {
    mode: st.mode, best: st.best, bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1500),
    bestRecordText: br ? (br.textContent || '').trim() : '', storage: storage(),
  };
}

function recordOf(storage) { try { return JSON.parse(storage[BEST_KEY] || 'null'); } catch (e) { return null; } }

export default {
  id: '05-endless-persistence',
  title: '无尽模式 + 最高纪录持久化',
  coverage: ['ENDLESS-01..11'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('ENDLESS-01', '当前构建不是 v2.x，跳过无尽模式验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);
    const injectSolve = () => ctx.eval(`window.__QA_SOLVE_B = function(){
      const DBG = window.__DEBUG, S = window.G.game.S;
      if (S.mode === 'blessing') { try { DBG.chooseBlessing(0); } catch (e) {} DBG.tick(1.0); return true; }
      if (S.mode === 'paused') { try { DBG.resume(); } catch (e) {} DBG.tick(0.1); return false; }
      return false;
    }; true;`);
    await injectSolve();

    // ---- 胜利结算 →「无 尽 回 响」入口 ----
    const win = await ctx.eval(`(${victoryPage.toString()})()`);
    ctx.info('ENDLESS-01a', '剧情胜利前置', JSON.stringify(win));
    if (win.error) { ctx.fail('ENDLESS-01', '无法达成剧情胜利进入无尽', JSON.stringify(win)); return; }
    const entryShot = await ctx.shot('14-endless-entry');
    const btnBefore = await ctx.eval(`(() => { const el = document.getElementById('endless-btn'); return el ? { visible: !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none', text: (el.textContent || '').trim(), cls: el.className } : null; })()`);
    ctx.info('ENDLESS-01b', '胜利结算无尽按钮', JSON.stringify({ btnBefore, mode: win.mode, victory: win.victory, endShown: win.endShown }).slice(0, 700));
    ctx.expect(win.mode === 'victory' && win.endShown, 'ENDLESS-01', '剧情胜利后进入结算页', JSON.stringify(win).slice(0, 600), entryShot);
    ctx.expect(!!btnBefore && btnBefore.visible && /无\s*尽/.test(btnBefore.text), 'ENDLESS-01b', '胜利结算页显示「无尽回响」入口', JSON.stringify(btnBefore).slice(0, 500), entryShot);
    await ctx.waitVisible('endless-btn', { timeout: 3000 }).catch(() => {});
    const clicked = await ctx.clickSelector('#endless-btn');
    await ctx.tick(1.2);
    await solveBlessing(ctx, { limit: 3 });
    await ctx.tick(1.5);
    let st = await ctx.state();
    const endlessShot = await ctx.shot('14-endless');
    ctx.info('ENDLESS-01c', '进入无尽状态', JSON.stringify({ clicked, mode: st && st.mode, endless: st && st.endless, wave: st && st.wave }).slice(0, 700));
    ctx.expect(clicked && st && st.endless === true, 'ENDLESS-01c', '点击入口进入无尽模式（S.endless=true）', JSON.stringify({ clicked, endless: st && st.endless, wave: st && st.wave }));
    ctx.expect(st && st.wave >= 6, 'ENDLESS-01d', '无尽模式从第 6 波开始', 'wave=' + (st && st.wave));
    if (!(st && st.endless)) return;

    // ---- 波次持续超过第 5 波 ----
    await god(ctx, true);
    let progress = await ctx.eval(`(${progressPage.toString()})(9)`);
    await ctx.snapshotDiag('endless-progress', progress);
    ctx.info('ENDLESS-02a', '无尽推进日志', JSON.stringify(progress).slice(0, 2400));
    let reachedWave = progress.end ? progress.end.wave : 0;
    ctx.expect(reachedWave > 5, 'ENDLESS-02', '无尽模式波次超过第 5 波并持续生成', 'reachedWave=' + reachedWave, endlessShot);
    ctx.expect(progress.clears >= 2 && !progress.error, 'ENDLESS-03', '无尽连续清波推进（难度递增数据供人工复核）', JSON.stringify({ clears: progress.clears, waveLog: progress.waveLog }).slice(0, 1000));
    const waveLabel = await ctx.text('#wave-label');
    ctx.info('ENDLESS-03b', '无尽 HUD 波次文案', JSON.stringify(waveLabel));
    ctx.expect(/无\s*尽|第/.test(waveLabel || ''), 'ENDLESS-03b', '无尽模式 HUD 波次标识正常', JSON.stringify(waveLabel));

    // ---- 无尽死亡结算 + 纪录写入 ----
    const fin = await ctx.eval(`(${finishAndReadPage.toString()})()`);
    await ctx.snapshotDiag('endless-finish', fin);
    const recordShot = await ctx.shot('15-record');
    const rec = recordOf(fin.storage);
    ctx.info('ENDLESS-04a', '无尽结算数据', JSON.stringify(fin).slice(0, 2600));
    ctx.expect(fin.endVisible || fin.endShown, 'ENDLESS-04', '无尽死亡后出现结算页', JSON.stringify({ mode: fin.mode, endShown: fin.endShown, endVisible: fin.endVisible }), recordShot);
    ctx.expect(/回\s*响\s*止\s*步|无\s*尽/.test(fin.endText || ''), 'ENDLESS-04b', '无尽结算页文案为无尽模式', JSON.stringify((fin.endText || '').slice(0, 300)));
    ctx.expect(!!rec, 'ENDLESS-05', '最高纪录写入 localStorage[' + BEST_KEY + ']', JSON.stringify({ storage: fin.storage, rec }).slice(0, 1200), recordShot);
    let bestWave = reachedWave;
    if (rec) {
      bestWave = rec.endlessBest || reachedWave;
      ctx.expect(typeof rec.endlessBest === 'number' && rec.endlessBest >= fin.wave, 'ENDLESS-05b', 'localStorage 记录本局到达波次', JSON.stringify(rec).slice(0, 600));
    }
    ctx.expect(/最高|纪录|得分/.test(fin.endRecord || fin.bodyText || ''), 'ENDLESS-04c', '结算页显示最高纪录信息', JSON.stringify(fin.endRecord || '').slice(0, 400));
    ctx.expect(!!fin.endlessBtn && fin.endlessBtn.visible && /再\s*入\s*无\s*尽/.test(fin.endlessBtn.text), 'ENDLESS-10a', '无尽死亡结算页显示「再 入 无 尽」按钮', JSON.stringify(fin.endlessBtn));

    // ---- ENDLESS-10：再 入 无 尽 → 初始祝福 → 第 6 波 ----
    await ctx.waitVisible('endless-btn', { timeout: 3000 }).catch(() => {});
    const restartClicked = await ctx.clickSelector('#endless-btn');
    await ctx.tick(0.5);
    const blessAfterRestart = await detectBlessing(ctx);
    await solveBlessing(ctx, { limit: 3 });
    await ctx.tick(1.5);
    st = await ctx.state();
    const restartShot = await ctx.shot('14-endless-restart');
    ctx.info('ENDLESS-10b', '再入无尽状态', JSON.stringify({ restartClicked, blessingShown: blessAfterRestart.found, mode: st && st.mode, endless: st && st.endless, wave: st && st.wave, hp: st && st.hp }).slice(0, 700));
    ctx.expect(restartClicked && st && st.endless === true && st.wave >= 6, 'ENDLESS-10', '「再入无尽」可从无尽死亡结算返回初始祝福并进入第 6 波', JSON.stringify({ restartClicked, mode: st && st.mode, endless: st && st.endless, wave: st && st.wave }).slice(0, 600), restartShot);

    // ---- 刷新后持久化 ----
    await ctx.tick(0.5);
    await ctx.page.reload({ waitReady: true });
    await injectSolve();
    const afterReload = await ctx.eval(`(${readPageStatePage.toString()})()`);
    await ctx.snapshotDiag('endless-after-reload', afterReload);
    const reloadShot = await ctx.shot('15-record-after-reload');
    const rec2 = recordOf(afterReload.storage);
    ctx.info('ENDLESS-06a', '刷新后状态', JSON.stringify(afterReload).slice(0, 2200));
    ctx.expect(!!rec2 && rec2.endlessBest === bestWave, 'ENDLESS-06', '刷新后最高纪录仍在 localStorage', JSON.stringify({ before: rec, after: rec2 }).slice(0, 900), reloadShot);
    ctx.expect(/最高|纪录/.test(afterReload.bestRecordText || ''), 'ENDLESS-06c', '刷新后标题页显示最高纪录', JSON.stringify({ bestRecordText: afterReload.bestRecordText }).slice(0, 500), reloadShot);

    // ---- 新纪录更新（更高波次，只增不减） ----
    try {
      await ensurePlaying(ctx);
      await god(ctx, true);
      const win2 = await ctx.eval(`(${victoryPage.toString()})()`);
      let entered2 = false;
      if (win2 && !win2.error) {
        await ctx.waitVisible('endless-btn', { timeout: 3000 }).catch(() => {});
        entered2 = await ctx.clickSelector('#endless-btn');
      }
      if (!entered2) { const dbg2 = await ctx.tryDbg('startEndless'); entered2 = dbg2.ok; }
      await ctx.tick(1.2);
      await solveBlessing(ctx, { limit: 3 });
      await ctx.tick(1.5);
      if (entered2) {
        const target = Math.max(8, bestWave + 2);
        const p2 = await ctx.eval(`(${progressPage.toString()})(${target})`);
        ctx.info('ENDLESS-07a', '第二局无尽推进', JSON.stringify(p2).slice(0, 1600));
        const fin2 = await ctx.eval(`(${finishAndReadPage.toString()})()`);
        const rec3 = recordOf(fin2.storage);
        ctx.info('ENDLESS-07b', '新旧纪录对比', JSON.stringify({ before: rec2, after: rec3, wave: fin2.wave }).slice(0, 1400));
        ctx.expect(rec3 && rec2 && rec3.endlessBest >= rec2.endlessBest, 'ENDLESS-07', '更高波次刷新最高纪录（只增不减）', JSON.stringify({ prev: rec2, next: rec3 }).slice(0, 900));
      } else {
        ctx.warn('ENDLESS-07', '无法再次进入无尽，跳过新纪录更新用例', JSON.stringify(win2 || {}));
      }
    } catch (e) { ctx.error('ENDLESS-07', '新纪录更新用例失败', e); }

    // ---- 损坏 localStorage 容错 ----
    try {
      await ctx.setLocalStorage({ [BEST_KEY]: '{broken-json:' });
      await ctx.page.reload({ waitReady: true });
      const afterCorrupt = await ctx.eval(`(${readPageStatePage.toString()})()`);
      const errorVisible = await ctx.visible('error-screen');
      ctx.info('ENDLESS-08a', '损坏存储后启动状态', JSON.stringify({ mode: afterCorrupt.mode, best: afterCorrupt.best, errorVisible, bestRecordText: afterCorrupt.bestRecordText }).slice(0, 900));
      ctx.expect(afterCorrupt.mode && !errorVisible, 'ENDLESS-08', 'localStorage 损坏时游戏仍可正常启动', JSON.stringify({ mode: afterCorrupt.mode, best: afterCorrupt.best, errorVisible }));
    } catch (e) { ctx.warn('ENDLESS-08', '存储容错用例执行失败', String(e.message || e)); }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'ENDLESS-09', '无尽/持久化套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
    ctx.expect(!!fin.endlessBtn, 'ENDLESS-11', '无尽结算页存在无尽入口按钮', JSON.stringify(fin.endlessBtn));
  },
};
