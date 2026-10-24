// 01-blessing — 回响祝福：初始三选一 / 波次间祝福 / 选择生效 / 效果（对齐 v2 实现）
import { detectBlessing, solveBlessing, clearWave, ensurePlaying, isV2 } from '../lib/flows.mjs';

export default {
  id: '01-blessing',
  title: '回响祝福（初始 + 波次间 + 生效）',
  coverage: ['BLESS-01..08'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('BLESS-01', '当前构建不是 v2.x，跳过祝福验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });

    // ---- 初始三选一 ----
    const clicked = await ctx.clickSelector('#start-btn');
    await ctx.waitFor(`window.__DEBUG.state().mode === 'blessing'`, { timeout: 15000 }).catch(() => {});
    const flow = await detectBlessing(ctx);
    const initShot = await ctx.shot('02-blessing-initial');
    ctx.info('BLESS-01a', '初始祝福检测', JSON.stringify({ clicked, source: flow.source, options: flow.options, stateMode: flow.state && flow.state.mode }).slice(0, 800));
    if (!flow.found) {
      ctx.fail('BLESS-01', '开始游戏后未出现初始祝福三选一', JSON.stringify(flow).slice(0, 1000), initShot);
      return;
    }
    const opts = flow.options || [];
    ctx.expect(opts.length === 3, 'BLESS-01', '初始祝福为三选一', JSON.stringify(opts), initShot);
    ctx.expect(new Set(opts).size === 3, 'BLESS-01b', '三个祝福选项互不相同', JSON.stringify(opts));
    const domCards = await ctx.eval(`(() => {
      const box = document.getElementById('blessing-cards');
      if (!box) return null;
      return [...box.children].map((el) => ({ cls: typeof el.className === 'string' ? el.className : '', text: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 90) }));
    })()`).catch(() => null);
    ctx.info('BLESS-02a', '祝福卡 DOM', JSON.stringify(domCards).slice(0, 1600));
    ctx.expect(!!domCards && domCards.length === 3, 'BLESS-02', '祝福界面渲染 3 张卡（含名称/效果/稀有度文本）', JSON.stringify({ count: domCards && domCards.length }).slice(0, 400), initShot);
    const rarities = (domCards || []).map((c) => (c.cls.match(/(common|rare|epic|legend)/) || [])[1]).filter(Boolean);
    ctx.info('BLESS-02b', '稀有度 class', JSON.stringify(rarities));

    // ---- 祝福界面输入隔离（在初始祝福界面直接验证：Q 不触发格挡、ESC 不暂停） ----
    try {
      const s0 = await ctx.state();
      await ctx.page.press('Escape');
      await ctx.key('KeyQ');
      await ctx.tick(0.2);
      const s1 = await ctx.state();
      ctx.info('BLESS-06b', '祝福界面输入隔离', JSON.stringify({ before: s0 && s0.mode, after: s1 && s1.mode, blocking: s1 && s1.parry && s1.parry.blocking }).slice(0, 500));
      ctx.expect(s1 && s1.mode === 'blessing' && !(s1.parry && s1.parry.blocking), 'BLESS-06', '祝福界面屏蔽 Q/ESC（不误触格挡/暂停）', JSON.stringify({ mode: s1 && s1.mode, blocking: s1 && s1.parry && s1.parry.blocking }));
    } catch (e) { ctx.warn('BLESS-06', '祝福输入隔离用例异常', String(e.message || e)); }

    // ---- 选择生效 ----
    const chosenId = opts[1] || opts[0];
    const solved = await solveBlessing(ctx, { index: 1 });
    await ctx.waitFor(`window.__DEBUG.state().mode === 'playing'`, { timeout: 8000 }).catch(() => {});
    let st = await ctx.state();
    ctx.expect(solved.done && st && st.mode === 'playing', 'BLESS-03', '选择祝福后关闭界面并进入战斗', JSON.stringify({ solved: solved.picked, mode: st && st.mode }).slice(0, 600));
    ctx.expect(st && Array.isArray(st.blessings) && st.blessings.length === 1, 'BLESS-03b', '祝福记录到 P.blessings', JSON.stringify(st && st.blessings));
    const chips = await ctx.eval(`(() => { const el = document.getElementById('blessing-list'); return el ? el.children.length : -1; })()`).catch(() => -1);
    ctx.info('BLESS-03c', 'HUD 祝福列表数量', 'chips=' + chips);
    ctx.expect(chips >= 1, 'BLESS-03c', 'HUD 显示已获得祝福', 'chips=' + chips);
    await ctx.tick(1.5);

    // ---- 确定性祝福效果：vigor（不屈）maxHp +25 ----
    const maxBefore = (await ctx.state()).maxHp;
    const give = await ctx.tryDbg('giveBlessing', 'vigor');
    await ctx.tick(0.2);
    const stAfterGive = await ctx.state();
    ctx.info('BLESS-05a', '祝福效果测试（vigor）', JSON.stringify({ give, maxBefore, maxAfter: stAfterGive && stAfterGive.maxHp, blessings: stAfterGive && stAfterGive.blessings }).slice(0, 800));
    ctx.expect(give.ok && stAfterGive && stAfterGive.maxHp >= (maxBefore || 0) + 20, 'BLESS-05', '数值型祝福生效（不屈：生命上限 +25）', JSON.stringify({ maxBefore, maxAfter: stAfterGive && stAfterGive.maxHp }));

    // ---- 波次间祝福（清波后 1.6s 弹出） ----
    await ensurePlaying(ctx);
    let waveFlow = null;
    for (let attempt = 0; attempt < 3 && !waveFlow; attempt++) {
      const res = await clearWave(ctx, { maxWait: 25 });
      if (res.blessing && res.blessing.found) { waveFlow = res.blessing; break; }
      if (res.ended) { ctx.warn('BLESS-04a', '清波过程中进入结算', 'ended=' + res.ended); break; }
      await ctx.tick(0.5);
    }
    if (waveFlow) {
      const waveShot = await ctx.shot('04-blessing-wave-end');
      const wopts = waveFlow.options || [];
      ctx.info('BLESS-04a', '波次间祝福', JSON.stringify({ source: waveFlow.source, options: wopts, mode: waveFlow.state && waveFlow.state.mode }).slice(0, 600));
      ctx.pass('BLESS-04', '波次间祝福再次出现（三选一）', JSON.stringify(wopts), waveShot);
      ctx.expect(wopts.length === 3, 'BLESS-04b', '波次间祝福同样为三选一', JSON.stringify(wopts));
      // 用真实数字键选择（UI 输入链路）；选择后 0.45s 卡牌动画
      const beforeCount = ((await ctx.state()).blessings || []).length;
      await ctx.page.press('Digit1');
      await ctx.tick(1.2);
      await ctx.waitFor(`window.__DEBUG.state().mode === 'playing'`, { timeout: 8000 }).catch(() => {});
      await ctx.tick(0.3);
      st = await ctx.state();
      ctx.expect(st && st.mode === 'playing' && ((st.blessings || []).length > beforeCount), 'BLESS-04c', '数字键 1/2/3 可选择祝福并继续', JSON.stringify({ mode: st && st.mode, blessings: st && st.blessings }).slice(0, 500));
    } else {
      ctx.fail('BLESS-04', '波次间祝福未出现', '连续清波 3 次未检测到 mode=blessing');
    }

    // ---- 祝福界面输入隔离信息（BLESS-06 已在初始界面验证；此处仅收集波次间祝福 UI 数据） ----
    try {
      await ensurePlaying(ctx);
      let isoFlow = null;
      for (let attempt = 0; attempt < 2 && !isoFlow; attempt++) {
        const res = await clearWave(ctx, { maxWait: 25 });
        if (res.blessing && res.blessing.found) { isoFlow = res.blessing; break; }
        await ctx.tick(0.4);
      }
      if (isoFlow) {
        ctx.info('BLESS-06c', '波次间祝福界面数据（补充）', JSON.stringify({ source: isoFlow.source, options: isoFlow.options }).slice(0, 500));
        await solveBlessing(ctx, { limit: 2 });
      }
    } catch (e) { ctx.info('BLESS-06c', '波次间祝福界面补充数据采集失败', String(e.message || e)); }

    // ---- 控制台 ----
    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'BLESS-07', '祝福套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
    const internalErrors = await ctx.game(`function(){ return (window.__ERRORS || []).slice(0, 10); }`);
    ctx.expect(!internalErrors || internalErrors.length === 0, 'BLESS-08', 'window.__ERRORS 为空', JSON.stringify(internalErrors));
  },
};
