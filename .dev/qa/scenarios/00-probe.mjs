// 00-probe — 构建/能力探针 + 标题页 + 开始游戏 + 首波
import { ensurePlaying, detectBlessing, solveBlessing, buildNote } from '../lib/flows.mjs';

export default {
  id: '00-probe',
  title: '构建探针 + 标题/开始 + 首波',
  coverage: ['ENTRY-01..04', 'TITLE-01/02/03', 'BLESS-01', 'CONSOLE-03'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;

    // ---- 加载与构建 ----
    const ready = await ctx.eval(`!!(window.__READY && window.__DEBUG)`).catch(() => false);
    ctx.expect(ready, 'ENTRY-01', '页面加载后 window.__READY 与 window.__DEBUG 可用', 'ready=' + ready);
    if (!ready) return; // 后续无意义

    const info = await ctx.debugInfo(true);
    ctx.info('ENTRY-02', '调试接口能力表', `version=${info.version}, keys=${info.keys.join(',')}`);
    const v2 = /^2\./.test(String(info.version || ''));
    ctx.expect(v2, 'ENTRY-03', '__DEBUG.version 为 2.x', '实际=' + info.version);

    // ---- 能力探针（诊断用；失败不影响后续） ----
    try {
      const probe = await ctx.probe();
      ctx.info('ENTRY-04', '能力探针已保存', ctx.diagnostics.probe);
      ctx.info('ENTRY-05', 'DOM 快照', JSON.stringify({
        screens: probe.dom.screens.filter((s) => s.visible).map((s) => s.id),
        clickables: (probe.dom.screens || []).length,
        storageKeys: Object.keys(probe.storage || {}),
        debugKeys: probe.debugInfo ? probe.debugInfo.keys : [],
      }).slice(0, 1500));
      ctx.info('ENTRY-06', '内部对象关键字', JSON.stringify((probe.internal.keyword_paths || []).slice(0, 160)));
      if (probe.source && probe.source.ids) ctx.info('ENTRY-07', '源码 id 清单（供选择器）', probe.source.ids.join(','));
    } catch (e) {
      ctx.warn('ENTRY-04', '能力探针失败（不影响主流程）', String(e.message || e));
    }

    // ---- 标题页 ----
    const titleVisible = await ctx.visible('title-screen');
    const errorVisible = await ctx.visible('error-screen');
    const bodyText = await ctx.bodyText();
    const titleShot = await ctx.shot('01-title');
    ctx.expect(titleVisible, 'TITLE-01a', '标题页可见', 'evidence=' + titleShot, titleShot);
    ctx.expect(!errorVisible, 'CONSOLE-03', '未出现 WebGL/加载错误页', '', '');
    ctx.expect(/余\s*烬\s*之\s*刃|EMBER\s*BLADE/i.test(bodyText), 'TITLE-01b', '标题文案渲染', '', titleShot);
    const bestRecordText = await ctx.text('#best-record');
    ctx.info('TITLE-01c', '标题页最高纪录展示', JSON.stringify(bestRecordText));
    ctx.expect(bestRecordText != null, 'TITLE-01c', '标题页存在最高纪录区域（#best-record）', JSON.stringify(bestRecordText));

    // ---- 开始游戏（真实 UI 点击） ----
    let clicked = false;
    try {
      clicked = await ctx.clickSelector('#start-btn');
      if (!clicked) {
        const c = await ctx.clickText('开\\s*始|开始战斗|start');
        clicked = !!c;
      }
    } catch (e) { ctx.warn('TITLE-02', '开始按钮点击异常', String(e.message || e)); }
    await ctx.waitFor(`(() => { const d = window.__DEBUG; const st = d && d.state && d.state(); return st && st.mode !== 'title' && st.mode !== 'boot'; })()`, { timeout: 20000 }).catch(() => {});
    let st = await ctx.state();
    ctx.expect(clicked && st && st.mode !== 'title', 'TITLE-02', '点击开始后可进入游戏流程', `clicked=${clicked}, mode=${st && st.mode}`);

    // ---- 初始祝福（v2：mode=blessing + state().blessingOptions） ----
    const flow = await detectBlessing(ctx);
    if (flow.found) {
      const blessShot = await ctx.shot('02-blessing-initial');
      ctx.info('BLESS-01a', '初始祝福界面出现', `source=${flow.source}, options=${JSON.stringify(flow.options)}, cardCount=${(flow.cards || []).length}`);
      const opts = flow.options || [];
      ctx.expect(opts.length === 3 || (flow.cards || []).length === 3, 'BLESS-01', '初始祝福为三选一', `options=${opts.length}, cards=${(flow.cards || []).length}`, blessShot);
      ctx.expect(flow.state && flow.state.mode === 'blessing', 'BLESS-01b', '祝福界面为独立模式（阻塞战斗，不可误操作）', 'mode=' + (flow.state && flow.state.mode));
      const domCards = await ctx.eval(`(() => { const box = document.getElementById('blessing-cards'); if (!box) return 0; return box.children.length; })()`).catch(() => 0);
      ctx.info('BLESS-01c', '祝福卡 DOM 数量', 'cards=' + domCards);
      const solved = await solveBlessing(ctx, { index: 0 });
      ctx.expect(solved.done, 'BLESS-03a', '初始祝福可被选择并使游戏继续', JSON.stringify(solved.picked).slice(0, 500));
      st = await ctx.state();
      ctx.expect(st && st.mode === 'playing', 'BLESS-03b', '选择后进入 playing 模式', 'mode=' + (st && st.mode));
      ctx.expect(Array.isArray(st && st.blessings) && st.blessings.length >= 1, 'BLESS-03c', '所选祝福记录在 P.blessings', JSON.stringify(st && st.blessings));
    } else {
      ctx.fail('BLESS-01', '未检测到初始祝福界面', 'v2 应在开始游戏后进入 mode=blessing');
    }

    // ---- 首波 ----
    st = await ctx.tick(2.5);
    const alive = st && (st.enemiesAlive != null ? st.enemiesAlive : (st.enemyStates || []).filter((e) => e.alive !== false).length);
    const waveShot = await ctx.shot('03-wave1');
    ctx.expect(st && st.wave >= 1, 'TITLE-03a', '进入第 1 波', `wave=${st && st.wave}, waveState=${st && st.waveState}`);
    ctx.expect(alive > 0, 'TITLE-03b', '第 1 波敌人生成', `alive=${alive}`, waveShot);
    ctx.expect(await ctx.visible('hud'), 'TITLE-02b', '战斗 HUD 可见', '', waveShot);

    // ---- 本套件控制台错误 ----
    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'CONSOLE-03b', '加载/开始流程控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
    const internalErrors = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 10); }`);
    ctx.expect(!internalErrors || internalErrors.length === 0, 'CONSOLE-02a', 'window.__ERRORS 为空', JSON.stringify(internalErrors));
    ctx.info('ENV-01', '运行环境', await ctx.eval(`JSON.stringify({ ua: navigator.userAgent, three: window.THREE && THREE.REVISION, dpr: devicePixelRatio, canvas: [innerWidth, innerHeight] })`));
    ctx.info('ENV-02', '构建说明', await buildNote(ctx));
  },
};
