// 06-pause-settings — 暂停冻结 / 继续/重开/返回标题 / 反转Y / 画质 / 灵敏度 / 音量 / 设置持久化
import { ensurePlaying, isV2, god } from '../lib/flows.mjs';
import { sleep } from '../lib/chrome.mjs';

/* ---------- 页面内实验 ---------- */
async function pitchProbePage(dy) {
  const G = window.G;
  const S = G.game.S, C = G.game.C;
  if (S.mode !== 'playing') return { error: 'not playing', mode: S.mode };
  S.pointerLocked = true;
  const before = { yaw: C.yawTarget, pitch: C.pitchTarget };
  try { window.__DEBUG.mouse(0, dy); } catch (e) { return { error: String(e && e.message || e) }; }
  return { before, after: { yaw: C.yawTarget, pitch: C.pitchTarget }, deltaPitch: +(C.pitchTarget - before.pitch).toFixed(5), deltaYaw: +(C.yawTarget - before.yaw).toFixed(5) };
}

async function yawProbePage(dx) {
  const G = window.G;
  const S = G.game.S, C = G.game.C;
  if (S.mode !== 'playing') return { error: 'not playing', mode: S.mode };
  S.pointerLocked = true;
  const before = { yaw: C.yawTarget, pitch: C.pitchTarget };
  try { window.__DEBUG.mouse(dx, 0); } catch (e) { return { error: String(e && e.message || e) }; }
  return { before, after: { yaw: C.yawTarget, pitch: C.pitchTarget }, deltaPitch: +(C.pitchTarget - before.pitch).toFixed(5), deltaYaw: +(C.yawTarget - before.yaw).toFixed(5) };
}

async function settingsInternalPage() {
  const G = window.G;
  const S = G.game.S;
  const out = {};
  const scan = (name, obj, depth) => {
    if (!obj || depth > 2) return;
    for (const k of Object.keys(obj)) {
      if (/invert|sens|quality|volume|mute|setting|invertY|invertPitch/i.test(k)) {
        const v = obj[k];
        if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) out[name + '.' + k] = v;
        else if (typeof v === 'object' && !Array.isArray(v)) scan(name + '.' + k, v, depth + 1);
      }
    }
  };
  scan('S', S, 0); scan('settings', S && S.settings, 1); scan('game', G.game, 0); scan('C', G.game.C, 0); scan('audio', G.audio, 0);
  return out;
}

async function qualityProbePage() {
  const G = window.G;
  const W = G.world;
  const S = G.game.S;
  const out = { settings: {}, selectOptions: [], qualityButtons: [] };
  const vis = (el) => { const st = getComputedStyle(el); const r = el.getBoundingClientRect(); return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
  for (const sel of document.querySelectorAll('select')) {
    if (!vis(sel)) continue;
    const label = (sel.labels && sel.labels[0] && sel.labels[0].innerText) || sel.id || '';
    if (/画质|quality/i.test(label)) out.selectOptions.push({ id: sel.id, label, value: sel.value, options: [...sel.options].map((o) => ({ value: o.value, text: o.text })) });
  }
  for (const el of document.querySelectorAll('button,[role=button],.btn,.quality-option')) {
    if (!vis(el)) continue;
    const t = (el.innerText || '').trim();
    if (/^(低|中|高|极低|极致|low|medium|high)/i.test(t) || /画质/i.test(t)) out.qualityButtons.push({ text: t.slice(0, 40), id: el.id || '', cls: typeof el.className === 'string' ? el.className : '' });
  }
  for (const k of Object.keys(S.settings || {})) if (/quality/i.test(k)) out.settings['settings.' + k] = S.settings[k];
  for (const k of Object.keys(G.game)) if (/quality/i.test(k)) out.settings['game.' + k] = G.game[k];
  out.settings['S.quality'] = S.quality;
  try {
    const r = W.renderer;
    out.gl = { pixelRatio: r.getPixelRatio(), shadowMap: !!(r.shadowMap && r.shadowMap.enabled), size: [r.domElement.width, r.domElement.height] };
  } catch (e) {}
  return out;
}

export default {
  id: '06-pause-settings',
  title: '暂停 + 四项设置 + 持久化',
  coverage: ['PAUSE-01..04', 'SET-01..06'],
  async run(ctx) {
    const seq0 = ctx.current.startSeq;
    if (!(await isV2(ctx))) {
      ctx.blocked('PAUSE-01', '当前构建不是 v2.x，跳过暂停/设置验收', await ctx.debugInfo().then((i) => 'version=' + (i && i.version)));
      return;
    }
    await ctx.reset({ clearStorage: true });
    await ensurePlaying(ctx);
    await god(ctx, true);

    const openPause = async () => {
      const st = await ctx.state();
      if (st && st.mode === 'paused') return true;
      if (await ctx.hasDebug('pause')) { await ctx.tryDbg('pause'); await sleep(150); }
      if ((await ctx.state()).mode !== 'paused') await ctx.page.press('Escape');
      await ctx.waitFor(`window.__DEBUG.state().mode === 'paused'`, { timeout: 6000 }).catch(() => {});
      return (await ctx.state()).mode === 'paused';
    };
    const resumePause = async () => {
      if (await ctx.hasDebug('resume')) { await ctx.tryDbg('resume'); await sleep(120); }
      if ((await ctx.state()).mode !== 'playing') {
        const ok = await ctx.clickSelector('#resume-btn');
        if (!ok) await ctx.clickText('继\\s*续|resume');
      }
      await ctx.waitFor(`window.__DEBUG.state().mode === 'playing'`, { timeout: 6000 }).catch(() => {});
      return (await ctx.state()).mode === 'playing';
    };
    const dbgSettings = async () => { const r = await ctx.tryDbg('settings'); return r.ok ? r.value : null; };
    const uiValue = async (sel) => ctx.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? (el.type === 'checkbox' ? !!el.checked : el.value) : null; })()`);

    // ---- PAUSE-01 ESC 暂停冻结 ----
    const elapsed1 = (await ctx.state()).elapsed;
    await ctx.page.press('Escape');
    await ctx.waitFor(`window.__DEBUG.state().mode === 'paused'`, { timeout: 6000 }).catch(() => {});
    const pausedState = await ctx.state();
    const pauseVisible = await ctx.waitVisible('pause-screen', { timeout: 3000 });
    const pausedShot = await ctx.shot('16-pause-settings');
    await ctx.tick(1.0);
    const elapsed2 = (await ctx.state()).elapsed;
    ctx.expect(pausedState && pausedState.mode === 'paused', 'PAUSE-01', 'ESC 可暂停游戏', `mode=${pausedState && pausedState.mode}`, pausedShot);
    ctx.expect(pauseVisible, 'PAUSE-01b', '暂停设置面板可见', '', pausedShot);
    ctx.expect(Math.abs(elapsed2 - elapsed1) < 0.35, 'PAUSE-01c', '暂停期间游戏时间冻结', `elapsed ${elapsed1} -> ${elapsed2}`);

    // ---- 设置面板元素快照 ----
    const panel = await ctx.settingsSnapshot();
    await ctx.snapshotDiag('settings-panel', panel);
    ctx.info('SET-00', '设置控件快照', JSON.stringify(panel.inputs).slice(0, 1800));
    const internalBefore = await ctx.eval(`(${settingsInternalPage.toString()})()`);
    ctx.info('SET-00b', '设置内部状态（暂停时）', JSON.stringify(internalBefore).slice(0, 1500));
    const settingsBefore = await dbgSettings();
    ctx.info('SET-00c', '__DEBUG.settings() 初始', JSON.stringify(settingsBefore));
    ctx.info('SET-00d', '设置 DOM 值', JSON.stringify({ sens: await uiValue('#sens-slider'), vol: await uiValue('#vol-slider'), invertY: await uiValue('#invert-y'), quality: await uiValue('#quality-select') }));

    // ---- SET-01 反转 Y ----
    let invertResult = { toggle: null, probe1: null, probe2: null, internal: null };
    try {
      const inv0 = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      const sInv0 = await dbgSettings();
      const invToggle = await ctx.toggleByLabel('反转|invert|Y\\s*轴|垂直');
      invertResult.toggle = invToggle;
      await ctx.snapshotDiag('settings-invert-toggle', invToggle);
      const inv1 = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      const sInv1 = await dbgSettings();
      invertResult.internal = { before: inv0, after: inv1, settingsBefore: sInv0, settingsAfter: sInv1 };
      await resumePause();
      invertResult.probe1 = await ctx.eval(`(${pitchProbePage.toString()})(120)`);
      await openPause();
      const toggleBack = await ctx.toggleByLabel('反转|invert|Y\\s*轴|垂直');
      invertResult.toggleBack = toggleBack;
      await resumePause();
      invertResult.probe2 = await ctx.eval(`(${pitchProbePage.toString()})(120)`);
      await openPause();
      await ctx.snapshotDiag('settings-invert-probes', invertResult);
      const p1 = invertResult.probe1, p2 = invertResult.probe2;
      const behavioral = p1 && p2 && p1.deltaPitch != null && p2.deltaPitch != null && p1.deltaPitch !== 0 && p2.deltaPitch !== 0 && Math.sign(p1.deltaPitch) !== Math.sign(p2.deltaPitch);
      const internalChanged = JSON.stringify(invertResult.internal.before) !== JSON.stringify(invertResult.internal.after);
      const settingsChanged = !!(sInv0 && sInv1 && sInv0.invertY !== sInv1.invertY);
      ctx.expect(invertResult.toggle && invertResult.toggle.ok, 'SET-01a', '反转 Y 开关可点击切换', JSON.stringify(invertResult.toggle).slice(0, 500));
      ctx.expect(behavioral || settingsChanged || internalChanged, 'SET-01', '反转 Y 生效（垂直视角方向反转）', JSON.stringify({ sInv0, sInv1, probe1: p1, probe2: p2, behavioral }).slice(0, 1600));
    } catch (e) { ctx.error('SET-01', '反转Y用例执行失败', e); }

    // ---- SET-03 鼠标灵敏度 ----
    try {
      const before = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      const sLow0 = await dbgSettings();
      const low = await ctx.setRangeByLabel('灵敏度|sens', 0.3);
      const sLow = await dbgSettings();
      await ctx.snapshotDiag('settings-sens-low', { low, sLow0, sLow });
      await resumePause();
      const lowProbe = await ctx.eval(`(${yawProbePage.toString()})(100)`);
      await openPause();
      const high = await ctx.setRangeByLabel('灵敏度|sens', 2.0);
      const sHigh = await dbgSettings();
      await ctx.snapshotDiag('settings-sens-high', { high, sHigh });
      await resumePause();
      const highProbe = await ctx.eval(`(${yawProbePage.toString()})(100)`);
      await openPause();
      const after = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      await ctx.snapshotDiag('settings-sens-probes', { lowProbe, highProbe, before, after, sLow, sHigh });
      const lowD = lowProbe && Math.abs(lowProbe.deltaYaw || 0), highD = highProbe && Math.abs(highProbe.deltaYaw || 0);
      ctx.expect(low && low.ok, 'SET-03a', '灵敏度滑条可调节', JSON.stringify(low).slice(0, 500));
      ctx.expect(lowD > 0 && highD > lowD * 1.5, 'SET-03', '灵敏度影响视角转动幅度（高 > 低）', JSON.stringify({ lowD, highD, lowProbe, highProbe, sLow, sHigh }).slice(0, 900));
      ctx.expect(sLow && sHigh && Math.abs(sLow.sens - 0.3) < 0.06 && Math.abs(sHigh.sens - 2.0) < 0.06, 'SET-03b', '灵敏度数值写入设置状态', JSON.stringify({ low: sLow && sLow.sens, high: sHigh && sHigh.sens }));
      ctx.info('SET-03c', '灵敏度相关内部值', JSON.stringify({ before, after }).slice(0, 1200));
    } catch (e) { ctx.error('SET-03', '灵敏度用例执行失败', e); }

    // ---- SET-04 音量 ----
    try {
      const vol0 = await ctx.setRangeByLabel('音量|volume|vol', 0);
      const volProbe0 = await ctx.game(`function(){ const A=window.G.audio||{}; return { volume: A.volume, muted: A.muted, gain: A.master && A.master.gain ? +A.master.gain.value.toFixed(3) : null, ctxState: A.ctx && A.ctx.state }; }`);
      const sVol0 = await dbgSettings();
      const vol1 = await ctx.setRangeByLabel('音量|volume|vol', 100);
      const volProbe1 = await ctx.game(`function(){ const A=window.G.audio||{}; return { volume: A.volume, muted: A.muted, gain: A.master && A.master.gain ? +A.master.gain.value.toFixed(3) : null }; }`);
      const sVol1 = await dbgSettings();
      await ctx.snapshotDiag('settings-volume', { vol0, volProbe0, vol1, volProbe1, sVol0, sVol1 });
      ctx.expect(vol0 && vol0.ok && vol1 && vol1.ok, 'SET-04a', '音量滑条可调节', JSON.stringify({ vol0: vol0 && vol0.ok, vol1: vol1 && vol1.ok }));
      ctx.expect(volProbe1 && (volProbe1.volume > 0.9 || volProbe1.gain > 0.9) && (sVol0 && sVol0.volume < 0.05 || volProbe0 && volProbe0.volume < 0.05), 'SET-04', '音量设置作用于音频引擎', JSON.stringify({ zero: volProbe0, full: volProbe1, sVol0, sVol1 }).slice(0, 900));
      // 触发一次音效确认无异常
      const sfxRes = await ctx.game(`function(){ try { window.G.audio.sfx('hit'); return 'ok'; } catch(e) { return 'error: ' + String(e && e.message || e); } }`);
      ctx.info('SET-04b', '音效触发检查', sfxRes);
    } catch (e) { ctx.error('SET-04', '音量用例执行失败', e); }

    // ---- SET-02 画质 ----
    try {
      await openPause();
      const qBefore = await ctx.eval(`(${qualityProbePage.toString()})()`);
      const glBefore = await ctx.glInfo();
      let switched = false, via = '', target = null;
      // 1) select 控件
      const qProbe = qBefore;
      if (qProbe.selectOptions && qProbe.selectOptions.length) {
        const opts = qProbe.selectOptions[0].options.map((o) => o.value);
        target = opts[0] === qProbe.selectOptions[0].value ? opts[opts.length - 1] : opts[0];
        const sel = await ctx.selectByLabel('画质|quality', target);
        switched = !!(sel && sel.ok);
        via = 'select:' + JSON.stringify(sel);
      }
      // 2) 按钮式
      if (!switched && qProbe.qualityButtons && qProbe.qualityButtons.length >= 2) {
        const pick = qProbe.qualityButtons[qProbe.qualityButtons.length - 1];
        const click = await ctx.clickText(pick.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        switched = !!click;
        via = 'button:' + pick.text;
      }
      await sleep(250);
      const qAfter = await ctx.eval(`(${qualityProbePage.toString()})()`);
      const glAfter = await ctx.glInfo();
      const qSettings = await dbgSettings();
      const uiQuality = await uiValue('#quality-select');
      const qShot = await ctx.shot('16-settings-quality');
      await ctx.snapshotDiag('settings-quality', { qBefore, qAfter, glBefore, glAfter, switched, via, qSettings, uiQuality, target });
      const changed = JSON.stringify(qBefore.settings) !== JSON.stringify(qAfter.settings) || JSON.stringify(qBefore.gl) !== JSON.stringify(glAfter);
      ctx.expect(switched, 'SET-02a', '画质档位可切换', via);
      ctx.expect(changed, 'SET-02', '画质设置实际生效（渲染配置/设置值变化）', JSON.stringify({ glBefore, glAfter, before: qBefore.settings, after: qAfter.settings, qSettings, uiQuality, target }).slice(0, 1400), qShot);
      ctx.expect(!!qSettings && !!target && qSettings.quality === target, 'SET-02b', '画质模式写入设置状态', JSON.stringify({ target, quality: qSettings && qSettings.quality, uiQuality }).slice(0, 500));
    } catch (e) { ctx.error('SET-02', '画质用例执行失败', e); }

    // ---- SET-05 设置持久化 ----
    try {
      await openPause();
      await ctx.setRangeByLabel('灵敏度|sens', 1.2);
      await ctx.setRangeByLabel('音量|volume|vol', 55);
      const persistedBefore = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      const persistedSettings = await dbgSettings();
      const storageBefore = await ctx.localStorageAll();
      await ctx.snapshotDiag('settings-persist-before', { persistedBefore, persistedSettings, storageBefore });
      await ctx.page.reload({ waitReady: true });
      await ensurePlaying(ctx);
      await openPause();
      const settingsAfterReload = await ctx.settingsSnapshot();
      const internalAfterReload = await ctx.eval(`(${settingsInternalPage.toString()})()`);
      const reloadedSettings = await dbgSettings();
      const uiSens = await uiValue('#sens-slider');
      const uiVol = await uiValue('#vol-slider');
      const storageAfter = await ctx.localStorageAll();
      const reloadShot = await ctx.shot('16-pause-settings-after-reload');
      await ctx.snapshotDiag('settings-persist-after', { settingsAfterReload, internalAfterReload, reloadedSettings, storageAfter });
      ctx.info('SET-05a', '刷新后设置快照', JSON.stringify({ inputs: settingsAfterReload.inputs, internal: internalAfterReload, reloadedSettings, uiSens, uiVol, storage: storageAfter }).slice(0, 2400));
      const sensInput = (settingsAfterReload.inputs || []).find((i) => /灵敏度|sens/i.test(i.label));
      const volInput = (settingsAfterReload.inputs || []).find((i) => /音量|volume|vol/i.test(i.label));
      const sensOk = (sensInput && Math.abs(Number(sensInput.value) - 1.2) < 0.101) || Math.abs(Number(uiSens) - 1.2) < 0.101;
      const volOk = (volInput && Math.abs(Number(volInput.value) - 55) < 1.01) || Math.abs(Number(uiVol) - 55) < 1.01;
      const dbgOk = !!(reloadedSettings && Math.abs(reloadedSettings.sens - 1.2) < 0.06 && Math.abs(reloadedSettings.volume - 0.55) < 0.06);
      const storageKeyOk = !!storageAfter['emberblade_settings_v2'];
      ctx.expect((sensOk && volOk && dbgOk) || (storageKeyOk && dbgOk), 'SET-05', '设置跨刷新持久化（灵敏度/音量/反转Y/画质）', JSON.stringify({ sensOk, volOk, dbgOk, storageKeyOk, persistedSettings, reloadedSettings, storageBefore, storageAfter }).slice(0, 1600), reloadShot);
    } catch (e) { ctx.error('SET-05', '设置持久化用例执行失败', e); }

    // ---- PAUSE-02 继续 / PAUSE-03 重开 / PAUSE-04 返回标题 ----
    try {
      await openPause();
      const resumed = await resumePause();
      ctx.expect(resumed, 'PAUSE-02', '暂停后可继续游戏', (await ctx.state()).mode);
      await openPause();
      const restartOk = await ctx.clickSelector('#restart-btn') || await ctx.clickText('重新开始|restart');
      await sleep(300);
      await solveAnyBlessingAndWait(ctx);
      const stRestart = await ctx.state();
      ctx.expect(restartOk && stRestart && stRestart.wave === 1 && (stRestart.hp == null || stRestart.hp === stRestart.maxHp), 'PAUSE-03', '暂停页重新开始回到第 1 波初始满血状态', JSON.stringify({ restartOk, wave: stRestart && stRestart.wave, hp: stRestart && stRestart.hp, maxHp: stRestart && stRestart.maxHp }));
      await openPause();
      const quitOk = await ctx.clickSelector('#quit-btn') || await ctx.clickText('返回标题|quit');
      await sleep(300);
      const stQuit = await ctx.state();
      ctx.expect(quitOk && stQuit && stQuit.mode === 'title', 'PAUSE-04', '暂停页可返回标题', JSON.stringify({ quitOk, mode: stQuit && stQuit.mode }));
      const titleVisible = await ctx.waitVisible('title-screen', { timeout: 3000 });
      ctx.expect(titleVisible, 'PAUSE-04b', '返回标题后标题页可见', 'titleVisible=' + titleVisible);
    } catch (e) { ctx.error('PAUSE-02', '暂停操作用例执行失败', e); }

    const errs = ctx.page.errorsSince(seq0);
    ctx.expect(errs.length === 0, 'SET-06', '暂停/设置套件控制台零错误', errs.length ? JSON.stringify(errs.slice(0, 5)) : '无');
  },
};

async function solveAnyBlessingAndWait(ctx) {
  try {
    for (let i = 0; i < 3; i++) {
      const snap = await ctx.overlaySnapshot();
      const overlay = snap.overlays.find((o) => /祝福|选择|恩赐/.test(o.text));
      if (!overlay) return;
      const cards = (snap.clickables || []).filter((c) => {
        const [x, y, w, h] = c.rect, [ox, oy, ow, oh] = overlay.rect;
        return x >= ox - 5 && y >= oy - 5 && x + w <= ox + ow + 5 && y + h <= oy + oh + 5;
      });
      if (cards.length) await ctx.clickRect(cards[0].rect);
      else {
        const [ox, oy, ow, oh] = overlay.rect;
        await ctx.mouseClick(Math.round(ox + ow / 2), Math.round(oy + oh * 0.62));
      }
      await sleep(250);
    }
  } catch (e) {}
}
