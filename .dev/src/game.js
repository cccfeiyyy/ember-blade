/* ============================================================
   余烬之刃 — 主框架：状态 / 输入 / 相机 / 流程 / 主循环
   ============================================================ */
(function () {
  const G = window.G;
  const U = G.util;
  const W = G.world;
  const $ = (id) => document.getElementById(id);
  const audio = G.audio;

  window.__ERRORS = [];
  window.addEventListener('error', (e) => {
    window.__ERRORS.push(String(e.message || e.error || 'error'));
    console.error('[GAME ERROR]', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    window.__ERRORS.push('unhandledrejection: ' + String(e.reason));
    console.error('[PROMISE ERROR]', e.reason);
  });

  /* ---------------- 全局状态 ---------------- */
  const S = {
    mode: 'boot',          /* boot | title | playing | paused | dead | victory */
    realTime: 0,
    time: 0,
    elapsed: 0,
    wave: 0,
    waveState: 'idle',
    waveTimer: 0,
    spawnQueue: [],
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    comboMult: 1,
    maxCombo: 0,
    hitStop: 0,
    timeScale: 1,
    slowmoTarget: 1,
    slowmoTimer: 0,
    fovKick: 0,
    endTimer: 0,
    endShown: false,
    victory: false,
    bossActive: false,
    waveDamageTaken: 0,
    pointerLocked: false,
    cinTime: 0,
    quality: 2,
    fpsAcc: 0,
    fpsN: 0,
    qualityChecked: false,
    screenFlash: 0,
    hurtFlash: 0,
    lastHitTime: 0,
    runId: 0,
    endless: false,
    autoPause: !/[?&]qa/.test(location.search),
    pauseLog: [],
    blessingFrom: null,
    blessingChoices: [],
    blessingPicked: false,
    blessingPickedTimer: 0,
    blessingNextFrom: null,
    autoBlessTimer: 0,
    pendingBlessing: false,
    blessingDelay: 0,
    stylePoints: 0,
    styleRankIdx: 0,
    styleDecayTimer: 0,
    best: null,
    newRecord: false,
    deathDefyUsed: false,
    qualityMode: 'auto',
    debug: { autopilot: false, god: false },
  };

  const P = {
    model: null,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    hp: 100, maxHp: 100,
    stamina: 100, maxStamina: 100,
    potions: 3, maxPotions: 3,
    momentum: 0, maxMomentum: 100,
    state: 'idle',
    t: 0,
    comboStep: 0,
    comboResetTimer: 0,
    attack: null,
    buffered: null,
    invuln: 0,
    iframe: false,
    staminaDelay: 0,
    dodgeCd: 0,
    healCd: 0,
    waveCd: 0,
    lockTarget: null,
    moveSpeed: 0,
    moveDir: new THREE.Vector3(),
    knock: new THREE.Vector3(),
    trail: null,
    stats: { damageDealt: 0, damageTaken: 0, perfectDodges: 0, parries: 0, executions: 0 },
    hurtDir: 0,
    deathT: 0,
    afterimageTimer: 0,
    healGlow: 0,
    blessings: [],
    blessingCounts: {},
    mods: G.blessingModsBase(),
    parryWindow: 0,
    parryCd: 0,
    blockHeld: false,
    perfectBuffTimer: 0,
    deathDefyUsed: false,
  };

  const C = {
    yaw: 0,            /* 渲染用相机朝向（平滑后） */
    yawTarget: 0,      /* 鼠标输入的目标朝向 */
    pitch: 0.22,
    pitchTarget: 0.22,
    dist: 5.8,
    sens: 1.0,
    shakeAmp: 0,
    fov: 60,
    lastMouseMove: -99,
    ignoreMouseEvents: 0,
    shoulder: 0.5,     /* 过肩偏移，让角色略偏画面左侧 */
    invertY: false,
  };

  const D = {
    enemies: [],
    projectiles: [],
    pickups: [],
    boss: null,
    enemyId: 1,
  };

  const CFG = {
    arenaRadius: 27.4,
    playerSpeed: 6.5,
  };

  G.game.S = S;
  G.game.P = P;
  G.game.C = C;
  G.game.D = D;
  G.game.CFG = CFG;

  const keys = Object.create(null);
  G.game.keys = keys;
  let canvas = null;
  let last = 0;

  /* ---------------- 基础工具 ---------------- */
  const HUD_MODES = ['playing', 'paused', 'dead', 'victory', 'blessing'];

  function setMode(m) {
    S.mode = m;
    const hud = $('hud');
    hud.classList.toggle('hidden', HUD_MODES.indexOf(m) < 0);
    $('title-screen').classList.toggle('hidden', m !== 'title');
    $('pause-screen').classList.toggle('hidden', m !== 'paused');
    $('blessing-screen').classList.toggle('hidden', m !== 'blessing');
    if (m !== 'dead' && m !== 'victory') $('end-screen').classList.add('hidden');
    if (m === 'blessing' && document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) { }
    }
  }

  function requestLock() {
    if (!canvas) return;
    try {
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* 某些环境不支持指针锁定，仍可键盘游玩 */ }
  }

  function addShake(v) { C.shakeAmp = Math.min(1.35, C.shakeAmp + v); }
  function hitStop(t) { S.hitStop = Math.max(S.hitStop, t); }
  function setSlowmo(scale, dur) { S.slowmoTarget = scale; S.slowmoTimer = dur; }
  function addScore(n) { S.score += n; }
  function addMomentum(n) {
    P.momentum = U.clamp(P.momentum + n, 0, P.maxMomentum);
  }
  function flashScreen(amount) { S.screenFlash = Math.min(1.4, S.screenFlash + amount); }
  function hurtFlash(amount) { S.hurtFlash = Math.min(1, S.hurtFlash + amount); }

  G.game.addShake = addShake;
  G.game.hitStop = hitStop;
  G.game.setSlowmo = setSlowmo;
  G.game.addScore = addScore;
  G.game.addMomentum = addMomentum;
  G.game.flashScreen = flashScreen;
  G.game.hurtFlash = hurtFlash;
  G.game.setMode = setMode;

  /* ---------------- 游戏流程 ---------------- */
  function resetAll() {
    S.runId++;
    S.wave = 0;
    S.waveState = 'idle';
    S.waveTimer = 0;
    S.spawnQueue = [];
    S.score = 0;
    S.kills = 0;
    S.combo = 0;
    S.comboTimer = 0;
    S.comboMult = 1;
    S.maxCombo = 0;
    S.hitStop = 0;
    S.timeScale = 1;
    S.slowmoTarget = 1;
    S.slowmoTimer = 0;
    S.fovKick = 0;
    S.endTimer = 0;
    S.endShown = false;
    S.victory = false;
    S.bossActive = false;
    S.waveDamageTaken = 0;
    S.screenFlash = 0;
    S.hurtFlash = 0;
    S.elapsed = 0;
    S.endless = false;
    S.blessingFrom = null;
    S.blessingChoices = [];
    S.blessingPicked = false;
    S.blessingPickedTimer = 0;
    S.blessingNextFrom = null;
    S.autoBlessTimer = 0;
    S.pendingBlessing = false;
    S.blessingDelay = 0;
    S.stylePoints = 0;
    S.styleRankIdx = 0;
    S.styleDecayTimer = 0;
    S.newRecord = false;
    S.deathDefyUsed = false;

    P.blessings = [];
    P.blessingCounts = {};
    G.recalcBlessingMods(P);
    P.hp = P.maxHp;
    P.stamina = P.maxStamina;
    P.potions = P.maxPotions;
    P.momentum = 0;
    P.state = 'idle';
    P.t = 0;
    P.comboStep = 0;
    P.comboResetTimer = 0;
    P.attack = null;
    P.buffered = null;
    P.invuln = 0;
    P.iframe = false;
    P.staminaDelay = 0;
    P.dodgeCd = 0;
    P.healCd = 0;
    P.waveCd = 0;
    P.lockTarget = null;
    P.moveSpeed = 0;
    P.knock.set(0, 0, 0);
    P.pos.set(0, 0, 0);
    P.yaw = 0;
    P.stats = { damageDealt: 0, damageTaken: 0, perfectDodges: 0, parries: 0, executions: 0 };
    P.deathT = 0;
    P.afterimageTimer = 0;
    P.healGlow = 0;
    P.parryWindow = 0;
    P.parryCd = 0;
    P.blockHeld = false;
    P.perfectBuffTimer = 0;
    P.deathDefyUsed = false;
    P.autoBlockT = 0;
    P.autoBlockCd = 0;
    P.model.root.position.set(0, 0, 0);
    P.model.root.rotation.set(0, 0, 0);
    P.model.root.visible = true;
    const m = P.model;
    m.visual.position.set(0, 0, 0);
    m.visual.rotation.set(0, 0, 0);
    m.visual.scale.set(1, 1, 1);

    C.yaw = 0;
    C.yawTarget = 0;
    C.pitch = 0.22;
    C.pitchTarget = 0.22;
    C.dist = 5.8;
    C.shakeAmp = 0;
    C.fov = 60;
    C.lastMouseMove = -99;
    C.ignoreMouseEvents = 8;
  }

  function startGame() {
    if (!G.combat) return;
    audio.init();
    audio.resume();
    resetAll();
    G.combat.resetAll();
    if (G.hud) G.hud.reset();
    S.fpsAcc = 0; S.fpsN = 0; S.qualityChecked = false; S.quality = 2;
    W.setCrimson(false);
    setMode('playing');
    audio.setMusicMode('battle');
    audio.setIntensity(0.2);
    updateBestRecordUI();
    if (S.qualityMode !== 'auto') applyQualityMode();
    openBlessing('start', '初始回响 · 选择你的第一道力量');
  }
  G.game.startGame = startGame;

  function pauseGame(reason) {
    if (S.mode !== 'playing') return;
    S.pauseLog.push({ reason: reason || 'unknown', at: +S.realTime.toFixed(2) });
    if (S.pauseLog.length > 12) S.pauseLog.shift();
    setMode('paused');
    if (document.pointerLockElement) document.exitPointerLock();
    audio.sfx('ui');
  }
  function resumeGame() {
    if (S.mode !== 'paused') return;
    setMode('playing');
    $('hint').classList.remove('hidden');
    requestLock();
    audio.sfx('ui');
  }
  function quitToTitle() {
    if (G.combat) G.combat.clearAll();
    resetAll();
    if (G.hud) G.hud.reset();
    W.setCrimson(false);
    setMode('title');
    audio.setMusicMode('title');
    updateBestRecordUI();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  G.game.pauseGame = pauseGame;
  G.game.resumeGame = resumeGame;
  G.game.quitToTitle = quitToTitle;

  /* =========================================================
     v2：回响祝福 / 风格评价 / 最高纪录 / 无尽 / 设置
     ========================================================= */
  const STYLE_TIERS = [
    { min: 0, rank: 'D', mul: 1.0, title: '静默' },
    { min: 12, rank: 'C', mul: 1.08, title: '锋利' },
    { min: 28, rank: 'B', mul: 1.18, title: '华丽' },
    { min: 48, rank: 'A', mul: 1.32, title: '无双' },
    { min: 70, rank: 'S', mul: 1.5, title: '余烬' },
  ];
  const BEST_KEY = 'emberblade_best_v2';
  const SETTINGS_KEY = 'emberblade_settings_v2';

  function openBlessing(from, note) {
    const rollWave = from === 'start' ? 1 : (S.wave || 1) + 1;
    const choices = G.rollBlessingChoices(P, rollWave, 3);
    if (!choices.length) {
      if (G.hud) G.hud.hideBlessings();
      S.mode = 'playing';
      setMode('playing');
      if (from === 'start') G.combat.startWave(1);
      else G.combat.startWave(S.wave + 1);
      return;
    }
    S.blessingFrom = from;
    S.blessingChoices = choices;
    setMode('blessing');
    if (G.hud) G.hud.showBlessings(choices, note, (i) => selectBlessing(i));
    audio.sfx('blessingOpen');
  }
  G.game.openBlessing = openBlessing;

  function selectBlessing(index) {
    if (S.mode !== 'blessing' || S.blessingPicked) return;
    const b = S.blessingChoices[index];
    if (!b) return;
    S.blessingPicked = true;
    S.blessingPickedTimer = 0.45;
    S.blessingNextFrom = S.blessingFrom;
    audio.sfx('blessingPick', { rarity: b.rarity });
    acquireBlessing(b);
    if (G.hud) G.hud.pickBlessingCard(index);
  }
  G.game.selectBlessing = selectBlessing;

  function finishBlessing() {
    if (!S.blessingPicked) return;
    S.blessingPicked = false;
    S.blessingPickedTimer = 0;
    const from = S.blessingNextFrom;
    S.blessingFrom = null;
    S.blessingNextFrom = null;
    if (G.hud) G.hud.hideBlessings();
    setMode('playing');
    requestLock();
    if (from === 'start') G.combat.startWave(1);
    else if (from === 'endlessStart') { S.endless = true; G.combat.startWave(6); }
    else G.combat.startWave(S.wave + 1);
  }
  G.game.finishBlessing = finishBlessing;

  function acquireBlessing(b) {
    P.blessings.push(b);
    G.recalcBlessingMods(P);
    if (b.onPick) b.onPick(P, G);
    if (P.hp < 1) P.hp = 1;
    if (G.hud) G.hud.addBlessingChip(b);
    addStyle(4);
    const rarityCls = b.rarity === 'epic' ? 'violet' : (b.rarity === 'rare' ? 'cyan' : '');
    if (G.hud) G.hud.msg(`回响 · ${b.name}`, 'small ' + rarityCls);
  }
  G.game.acquireBlessing = acquireBlessing;

  function onWaveCleared(wave) {
    if (S.mode !== 'playing') return;
    if (S.endless) { S.pendingBlessing = true; S.blessingDelay = 1.5; }
    else if (wave < 5) { S.pendingBlessing = true; S.blessingDelay = 1.6; }
  }
  G.game.onWaveCleared = onWaveCleared;

  function styleTierIndex() {
    let idx = 0;
    for (let i = 0; i < STYLE_TIERS.length; i++) if (S.stylePoints >= STYLE_TIERS[i].min) idx = i;
    return idx;
  }
  function addStyle(n) {
    if (S.mode !== 'playing' && S.mode !== 'blessing') return;
    S.stylePoints = U.clamp(S.stylePoints + n, 0, 100);
    S.styleDecayTimer = 2.6;
    const ni = styleTierIndex();
    if (ni > S.styleRankIdx) {
      S.styleRankIdx = ni;
      const tier = STYLE_TIERS[ni];
      audio.sfx('styleUp', { rank: tier.rank });
      if (G.hud) {
        G.hud.styleRankUp(tier.rank, tier.title);
        if (ni >= 2) G.hud.msg(`${tier.rank} · ${tier.title}之刃`, 'small cyan');
      }
    } else if (ni < S.styleRankIdx) {
      S.styleRankIdx = ni;
    }
  }
  G.game.addStyle = addStyle;
  G.game.styleMul = function () { return STYLE_TIERS[S.styleRankIdx].mul; };
  G.game.styleRank = function () { return STYLE_TIERS[S.styleRankIdx]; };

  function updateStyle(dt) {
    if (S.stylePoints <= 0) return;
    if (S.styleDecayTimer > 0) { S.styleDecayTimer -= dt; return; }
    S.stylePoints = Math.max(0, S.stylePoints - 9 * dt);
    const ni = styleTierIndex();
    if (ni < S.styleRankIdx) {
      S.styleRankIdx = ni;
      audio.sfx('styleDown');
    }
  }

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      S.best = raw ? JSON.parse(raw) : null;
    } catch (e) { S.best = null; }
  }
  function saveResult() {
    const b = S.best || {};
    const score = Math.round(S.score);
    let nr = false;
    if (!b.bestScore || score > b.bestScore) { b.bestScore = score; nr = true; }
    if (S.endless) {
      if (S.wave > (b.endlessBest || 0)) { b.endlessBest = S.wave; nr = true; }
      b.endlessLast = S.wave;
    } else if (S.mode === 'victory') {
      if (score > (b.storyBest || 0)) { b.storyBest = score; nr = true; }
      b.storyWins = (b.storyWins || 0) + 1;
    }
    b.updated = Date.now();
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { }
    S.best = b;
    S.newRecord = nr;
  }
  G.game.saveResult = saveResult;

  function updateBestRecordUI() {
    const el = $('best-record');
    if (!el) return;
    const b = S.best;
    if (!b || !b.bestScore) {
      el.textContent = '尚无纪录 · 成为第一个回响';
      return;
    }
    let html = `最高纪录 · 得分 <span class="new">${U.formatScore(b.bestScore)}</span>`;
    if (b.endlessBest) html += ` · 无尽 第 ${b.endlessBest} 波`;
    if (b.storyWins) html += ` · 通关 ${b.storyWins} 次`;
    el.innerHTML = html;
  }
  G.game.updateBestRecordUI = updateBestRecordUI;

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (typeof s.sens === 'number') C.sens = U.clamp(s.sens, 0.3, 2.0);
      if (typeof s.volume === 'number') audio.setVolume(U.clamp(s.volume, 0, 1));
      C.invertY = !!s.invertY;
      if (['auto', 'high', 'low'].indexOf(s.quality) >= 0) S.qualityMode = s.quality;
    } catch (e) { }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        sens: C.sens, volume: audio.volume, invertY: C.invertY, quality: S.qualityMode,
      }));
    } catch (e) { }
  }
  function applyQualityMode() {
    if (S.qualityMode === 'high') { W.setQuality(2); }
    else if (S.qualityMode === 'low') { W.setQuality(0); S.quality = 0; S.qualityChecked = true; }
    else { S.quality = 2; S.qualityChecked = false; W.setQuality(2); }
  }
  G.game.applyQualityMode = applyQualityMode;

  function startEndless() {
    if (!G.combat) return;
    if (S.mode !== 'victory' && S.mode !== 'dead') return;
    audio.init();
    audio.resume();
    S.endless = true;
    S.victory = false;
    S.endShown = false;
    S.endTimer = 0;
    S.pendingBlessing = false;
    S.bossActive = false;
    S.wave = 5;
    S.waveState = 'idle';
    S.waveDamageTaken = 0;
    S.spawnQueue = [];
    G.combat.clearAll();
    P.hp = Math.max(P.hp, Math.round(P.maxHp * 0.5));
    P.potions = Math.max(P.potions, 1);
    P.invuln = 1.2;
    P.state = 'idle';
    W.setCrimson(false);
    setMode('playing');
    if (G.hud) {
      G.hud.hideEnd();
      G.hud.showBoss(false);
      G.hud.msg('无 尽 回 响', 'big cyan');
      G.hud.msg('回响不会结束 · 击破得越深，纪录越远', 'small');
    }
    audio.setMusicMode('battle');
    audio.sfx('endlessStart');
    updateBestRecordUI();
    requestLock();
    G.combat.startWave(6);
  }
  G.game.startEndless = startEndless;

  /* 无尽死亡后：以全新构筑重新进入无尽（第 6 波） */
  function restartEndless() {
    if (!G.combat) return;
    audio.init();
    audio.resume();
    resetAll();
    G.combat.resetAll();
    if (G.hud) G.hud.reset();
    S.endless = true;
    S.fpsAcc = 0; S.fpsN = 0; S.qualityChecked = false; S.quality = 2;
    W.setCrimson(false);
    setMode('playing');
    audio.setMusicMode('battle');
    audio.setIntensity(0.6);
    audio.sfx('endlessStart');
    if (G.hud) G.hud.hideEnd();
    openBlessing('endlessStart', '无尽回响 · 选择新的启程之力');
  }
  G.game.restartEndless = restartEndless;


  function onVictory() {
    if (S.mode !== 'playing') return;
    S.mode = 'victory';
    S.victory = true;
    S.endTimer = 0;
    S.endShown = false;
    saveResult();
    audio.setMusicMode('none');
    audio.sfx('victory');
    setSlowmo(0.35, 1.2);
    flashScreen(0.9);
    addShake(0.4);
    C.fovKick = 8;
    W.emitBurst(new THREE.Vector3(P.pos.x, 1.4, P.pos.z), {
      count: 80, color: 0xffd090, speed: 10, size: 0.22, life: 1.6, gravity: 2.5, up: 1.2,
    });
    if (G.hud) {
      G.hud.msg('逃 出 生 天', 'big');
      setTimeout(() => G.hud && G.hud.msg('回响竞技场沉寂了', 'small cyan'), 1200);
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function onDefeat() {
    if (S.mode !== 'playing') return;
    S.mode = 'dead';
    S.endTimer = 0;
    S.endShown = false;
    saveResult();
    audio.setMusicMode('none');
    audio.sfx('death');
    setSlowmo(0.3, 1.8);
    if (G.hud) {
      if (S.endless) G.hud.msg('回 响 止 步', 'violet');
      else G.hud.msg('余烬熄灭', 'violet');
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  G.game.onVictory = onVictory;
  G.game.onDefeat = onDefeat;

  /* ---------------- 输入 ---------------- */
  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Space', 'KeyE', 'KeyF', 'KeyR', 'Tab',
    'ShiftLeft', 'ShiftRight', 'Escape', 'KeyM',
    'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3',
  ]);

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) {
      if (['Space', 'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'Digit1', 'Digit2', 'Digit3'].indexOf(e.code) >= 0) return;
    }
    keys[e.code] = true;

    if (e.code === 'Escape') {
      if (S.mode === 'playing') { pauseGame('escape'); return; }
      if (S.mode === 'paused') { resumeGame(); return; }
      if (S.mode === 'blessing') return;
    }
    if (e.code === 'KeyM') {
      const muted = audio.toggleMute();
      if (G.hud) G.hud.toast(muted ? '静音' : '声音开启');
      return;
    }
    if (S.mode === 'blessing') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') selectBlessing(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') selectBlessing(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') selectBlessing(2);
      return;
    }
    if (S.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { startGame(); }
      return;
    }
    if (S.mode === 'paused') {
      if (e.code === 'Enter') resumeGame();
      return;
    }
    if (S.mode === 'dead' || S.mode === 'victory') {
      if (e.code === 'Enter' && S.endShown) startGame();
      return;
    }
    if (S.mode !== 'playing') return;

    switch (e.code) {
      case 'Space': G.combat.playerDodge(); break;
      case 'KeyQ': P.blockHeld = true; G.combat.playerParryDown(); break;
      case 'KeyE': G.combat.playerWave(); break;
      case 'KeyF': G.combat.playerUlt(); break;
      case 'KeyR': G.combat.playerHeal(); break;
      case 'Tab': G.combat.toggleLock(); break;
      default: break;
    }
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    if (e.code === 'KeyQ') {
      P.blockHeld = false;
      if (G.combat) G.combat.playerParryUp();
    }
  }

  function onMouseDown(e) {
    if (S.mode !== 'playing') return;
    if (!S.pointerLocked) {
      if (e.target === canvas) requestLock();
      return;
    }
    if (e.button === 0) G.combat.playerAttack('light');
    else if (e.button === 2) G.combat.playerAttack('heavy');
  }

  /* 鼠标视角：输入写入目标角，由相机平滑追赶，避免抖动/跳变 */
  function applyMouseLook(dx, dy) {
    if (S.mode !== 'playing' || !S.pointerLocked) return;
    /* 过滤单帧异常大位移（指针刚锁定、切换窗口时浏览器会给出尖峰） */
    dx = U.clamp(dx, -90, 90);
    dy = U.clamp(dy, -90, 90);
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    C.lastMouseMove = S.realTime;
    const k = 0.0017 * C.sens;
    C.yawTarget -= dx * k;
    C.pitchTarget = U.clamp(C.pitchTarget + (C.invertY ? -dy : dy) * k, -0.08, 0.72);
  }

  function onMouseMove(e) {
    if (S.mode !== 'playing' || !S.pointerLocked) return;
    if (C.ignoreMouseEvents > 0) { C.ignoreMouseEvents--; return; }
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > 250 || Math.abs(dy) > 250) {
      /* 极大概率是锁定瞬间的异常尖峰，直接丢弃 */
      if (C.ignoreMouseEvents <= 0) applyMouseLook(dx, dy);
      return;
    }
    applyMouseLook(dx, dy);
  }

  function onWheel(e) {
    if (S.mode !== 'playing') return;
    e.preventDefault();
    C.dist = U.clamp(C.dist + Math.sign(e.deltaY) * 0.6, 3.8, 9.0);
  }

  function onPointerLockChange() {
    const locked = document.pointerLockElement === canvas;
    S.pointerLocked = locked;
    if (locked) {
      /* 锁定瞬间对齐目标角，并忽略接下来几帧的异常增量 */
      C.yawTarget = C.yaw;
      C.pitchTarget = C.pitch;
      C.ignoreMouseEvents = 8;
      $('hint').classList.add('hidden');
    } else if (S.mode === 'playing') {
      if (S.autoPause) pauseGame('pointerlock');
    }
  }

  function bindInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && S.mode === 'playing') pauseGame('hidden');
    });

    $('start-btn').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
    $('resume-btn').addEventListener('click', resumeGame);
    $('restart-btn').addEventListener('click', startGame);
    $('quit-btn').addEventListener('click', quitToTitle);
    $('again-btn').addEventListener('click', startGame);
    $('end-quit-btn').addEventListener('click', quitToTitle);
    const endlessBtn = $('endless-btn');
    if (endlessBtn) endlessBtn.addEventListener('click', () => {
      if (S.endless) restartEndless();
      else startEndless();
    });

    const sens = $('sens-slider'), vol = $('vol-slider');
    sens.value = String(C.sens);
    $('sens-val').textContent = C.sens.toFixed(1);
    vol.value = String(Math.round((audio.volume != null ? audio.volume : 0.7) * 100));
    $('vol-val').textContent = String(Math.round((audio.volume != null ? audio.volume : 0.7) * 100));
    sens.addEventListener('input', () => {
      C.sens = parseFloat(sens.value);
      $('sens-val').textContent = C.sens.toFixed(1);
      saveSettings();
    });
    vol.addEventListener('input', () => {
      const v = parseFloat(vol.value) / 100;
      audio.setVolume(v);
      $('vol-val').textContent = String(Math.round(v * 100));
      saveSettings();
    });
    const invert = $('invert-y');
    invert.checked = !!C.invertY;
    invert.addEventListener('change', () => {
      C.invertY = invert.checked;
      saveSettings();
    });
    const quality = $('quality-select');
    if (quality) {
      quality.value = S.qualityMode;
      quality.addEventListener('change', () => {
        S.qualityMode = quality.value;
        applyQualityMode();
        saveSettings();
      });
    }
  }

  /* ---------------- 相机 ---------------- */
  const _focus = new THREE.Vector3();
  const _desired = new THREE.Vector3();
  const _look = new THREE.Vector3();

  function updateCamera(raw) {
    const cam = W.camera;
    if (!cam) return;

    if (S.mode === 'title') {
      S.cinTime += raw;
      const t = S.cinTime * 0.1;
      const rad = 7.6;
      _desired.set(Math.sin(t) * rad, 2.75 + Math.sin(t * 1.7) * 0.35, Math.cos(t) * rad);
      cam.position.x = U.damp(cam.position.x, _desired.x, 2.2, raw);
      cam.position.y = U.damp(cam.position.y, _desired.y, 2.2, raw);
      cam.position.z = U.damp(cam.position.z, _desired.z, 2.2, raw);
      _look.set(0, 1.35, 0);
      cam.lookAt(_look);
      C.fov = U.damp(C.fov, 52, 3, raw);
      cam.fov = C.fov;
      cam.updateProjectionMatrix();
      return;
    }
    if (S.mode === 'paused') return;

    /* 祝福选择：环绕角色的仪式镜头 */
    if (S.mode === 'blessing') {
      S.cinTime += raw;
      const t = S.cinTime * 0.09;
      const rad = 7.2;
      _desired.set(
        P.pos.x + Math.sin(t) * rad,
        2.55 + Math.sin(t * 1.3) * 0.25,
        P.pos.z + Math.cos(t) * rad
      );
      cam.position.x = U.damp(cam.position.x, _desired.x, 1.8, raw);
      cam.position.y = U.damp(cam.position.y, _desired.y, 1.8, raw);
      cam.position.z = U.damp(cam.position.z, _desired.z, 1.8, raw);
      cam.lookAt(P.pos.x, P.pos.y + 1.35, P.pos.z);
      C.fov = U.damp(C.fov, 54, 2, raw);
      cam.fov = C.fov;
      cam.updateProjectionMatrix();
      return;
    }

    /* 死亡 / 胜利运镜：缓慢环绕 */
    if (S.mode === 'dead' || S.mode === 'victory') {
      S.cinTime += raw;
      const t = S.cinTime * 0.35 + C.yaw;
      const rad = 6.4;
      const focus = P.pos;
      _desired.set(focus.x - Math.sin(t) * rad, 2.1 + Math.sin(S.cinTime * 0.5) * 0.2, focus.z - Math.cos(t) * rad);
      cam.position.x = U.damp(cam.position.x, _desired.x, 1.8, raw);
      cam.position.y = U.damp(cam.position.y, _desired.y, 1.8, raw);
      cam.position.z = U.damp(cam.position.z, _desired.z, 1.8, raw);
      cam.lookAt(focus.x, focus.y + 1.15, focus.z);
      C.fov = U.damp(C.fov, 54, 2, raw);
      cam.fov = C.fov;
      cam.updateProjectionMatrix();
      return;
    }

    /* 输入角 → 渲染角：平滑追赶，手感稳且不抖 */
    C.yaw = U.dampAngle(C.yaw, C.yawTarget, 30, raw);
    C.pitch = U.damp(C.pitch, C.pitchTarget, 30, raw);

    /* 锁定目标时，仅在鼠标静止片刻后缓慢把镜头带回目标方向 */
    if (P.lockTarget && P.lockTarget.alive && S.mode === 'playing'
        && S.realTime - C.lastMouseMove > 0.7) {
      const desiredYaw = Math.atan2(P.lockTarget.pos.x - P.pos.x, P.lockTarget.pos.z - P.pos.z);
      C.yawTarget = U.dampAngle(C.yawTarget, desiredYaw, 1.6, raw);
    }

    const pitch = C.pitch;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwdX = Math.sin(C.yaw), fwdZ = Math.cos(C.yaw);
    /* 屏幕右方向（世界坐标）：相机沿 +forward 看时，屏幕右 = (-cos, 0, sin) */
    const rightX = -Math.cos(C.yaw), rightZ = Math.sin(C.yaw);
    const shoulder = C.shoulder;

    _focus.set(P.pos.x, P.pos.y + 1.42, P.pos.z);
    _desired.set(
      _focus.x - fwdX * cp * C.dist + rightX * shoulder,
      _focus.y + sp * C.dist + 0.26,
      _focus.z - fwdZ * cp * C.dist + rightZ * shoulder
    );
    if (_desired.y < 0.6) _desired.y = 0.6;

    const yLambda = 10;
    cam.position.x = U.damp(cam.position.x, _desired.x, 13, raw);
    cam.position.y = U.damp(cam.position.y, _desired.y, yLambda, raw);
    cam.position.z = U.damp(cam.position.z, _desired.z, 13, raw);

    /* 镜头震动（收敛幅度，避免和鼠标争夺控制） */
    C.shakeAmp = U.damp(C.shakeAmp, 0, 9, raw);
    if (C.shakeAmp > 0.002) {
      const s = C.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * s * 0.38;
      cam.position.y += (Math.random() - 0.5) * s * 0.32;
      cam.position.z += (Math.random() - 0.5) * s * 0.38;
    }

    _look.set(
      _focus.x + fwdX * 1.25 + rightX * shoulder * 0.55,
      _focus.y + 0.06,
      _focus.z + fwdZ * 1.25 + rightZ * shoulder * 0.55
    );
    cam.lookAt(_look);
    if (C.shakeAmp > 0.002) cam.rotation.z += (Math.random() - 0.5) * C.shakeAmp * 0.02;

    C.fov = U.damp(C.fov, 60 + S.fovKick, 8, raw);
    cam.fov = C.fov;
    cam.updateProjectionMatrix();
  }

  /* ---------------- 画质自适应 ---------------- */
  function checkQuality(raw) {
    if (S.qualityChecked || S.mode !== 'playing' || S.qualityMode !== 'auto') return;
    S.fpsAcc += raw; S.fpsN++;
    if (S.fpsN >= 120) {
      const avg = S.fpsAcc / S.fpsN;
      const forced = /hq/.test(location.search);
      if (!forced && avg > 0.030) {
        S.quality = avg > 0.055 ? 0 : 1;
      }
      S.qualityChecked = true;
      if (S.quality < 2) W.setQuality(S.quality);
    }
  }

  /* ---------------- 主循环 ---------------- */
  function update(raw) {
    S.realTime += raw;
    checkQuality(raw);

    /* 慢动作 / 命中停顿 */
    if (S.hitStop > 0) {
      S.hitStop = Math.max(0, S.hitStop - raw);
    }
    if (S.slowmoTimer > 0) {
      S.slowmoTimer -= raw;
      S.timeScale = U.damp(S.timeScale, S.slowmoTarget, 16, raw);
    } else {
      S.timeScale = U.damp(S.timeScale, 1, 5, raw);
    }
    let dt = raw * S.timeScale;
    if (S.hitStop > 0) dt = 0;
    S.time += dt;

    /* 调试自动驾驶 */
    if (S.mode === 'playing' && S.debug.autopilot && G.combat) G.combat.autopilot(dt);

    if (S.mode === 'playing') {
      S.elapsed += dt;
      if (G.combat) G.combat.update(dt, raw);
      if (G.combat) G.combat.animatePlayer(dt, S.realTime);
      updateStyle(dt);
      /* 波次肃清后进入祝福选择 */
      if (S.pendingBlessing) {
        S.blessingDelay -= dt;
        if (S.blessingDelay <= 0) {
          S.pendingBlessing = false;
          const waveNote = (S.endless ? '无尽 · 第 ' + S.wave + ' 波' : '第 ' + S.wave + ' 波')
            + '肃清 · 选择新的回响';
          openBlessing('wave', waveNote);
        }
      }
    } else if (S.mode === 'blessing') {
      /* 冻结战斗，保留角色待机呼吸与氛围 */
      if (G.combat) G.combat.animatePlayer(raw * 0.5, S.realTime);
      if (S.debug.autopilot && !S.blessingPicked) {
        S.autoBlessTimer += raw;
        if (S.autoBlessTimer > 0.7) {
          S.autoBlessTimer = 0;
          selectBlessing(Math.floor(Math.random() * S.blessingChoices.length));
        }
      }
      if (S.blessingPicked) {
        S.blessingPickedTimer -= raw;
        if (S.blessingPickedTimer <= 0) finishBlessing();
      }
    } else if (S.mode === 'dead' || S.mode === 'victory') {
      if (G.combat) G.combat.updateEnd(dt, raw);
    } else if (S.mode === 'title') {
      if (G.combat) G.combat.animatePlayer(raw * 0.8, S.realTime, true);
    }

    /* 结算页 */
    if ((S.mode === 'dead' || S.mode === 'victory')) {
      S.endTimer += raw;
      if (S.endTimer > (S.mode === 'victory' ? 2.6 : 2.2) && !S.endShown) {
        S.endShown = true;
        if (G.hud) G.hud.showEnd(S.mode === 'victory');
      }
    }

    updateCamera(raw);

    /* 世界动画：暂停时静止 */
    let worldDt = raw;
    if (S.mode === 'playing' || S.mode === 'dead' || S.mode === 'victory') worldDt = dt;
    if (S.mode === 'paused') worldDt = 0;
    if (S.mode === 'blessing') worldDt = raw * 0.35;
    W.update(worldDt, S.realTime, P.pos);

    /* 屏幕闪光衰减 */
    S.screenFlash = U.damp(S.screenFlash, 0, 6, raw);
    S.hurtFlash = U.damp(S.hurtFlash, 0, 4.5, raw);
    S.fovKick = U.damp(S.fovKick, 0, 6, raw);
    const flashEl = $('flash-fx'), hurtEl = $('hurt-fx'), slowEl = $('slowmo-fx');
    flashEl.style.opacity = String(Math.min(1, S.screenFlash * 0.55));
    hurtEl.style.opacity = String(Math.min(1, S.hurtFlash * 0.85));
    slowEl.style.opacity = String(Math.min(0.9, (1 - S.timeScale) * 1.1));

    if (G.hud) G.hud.update(raw, dt);
    updateHint();
  }

  function updateHint() {
    const hint = $('hint');
    if (S.mode === 'playing' && !S.pointerLocked) hint.classList.remove('hidden');
    else hint.classList.add('hidden');
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!last) last = now;
    let raw = (now - last) / 1000;
    last = now;
    if (raw > 0.05) raw = 0.05;
    if (raw < 0) raw = 0;
    try {
      update(raw);
      if (W.renderer && W.scene && W.camera) W.renderer.render(W.scene, W.camera);
    } catch (err) {
      window.__ERRORS.push(String(err && err.stack || err));
      console.error('[LOOP ERROR]', err);
    }
  }

  /* ---------------- 初始化 ---------------- */
  function showError(err) {
    $('loading-screen').classList.add('fade');
    $('loading-screen').style.display = 'none';
    $('error-screen').classList.remove('hidden');
    const t = $('error-text');
    if (t) t.textContent = '渲染器初始化失败：' + (err && err.message ? err.message : String(err));
  }

  function boot() {
    canvas = $('game-canvas');
    loadBest();
    loadSettings();
    bindInput();
    try {
      W.init(canvas);
    } catch (e) {
      console.error(e);
      showError(e);
      return;
    }
    P.model = W.playerModel;
    P.trail = W.playerTrail;
    G.game.scene = W.scene;
    G.game.renderer = W.renderer;
    G.game.camera = W.camera;
    P.pos.copy(P.model.root.position);
    if (G.hud) G.hud.init();
    applyQualityMode();

    /* 初始镜头 */
    W.camera.position.set(0, 3.0, -7.5);
    W.camera.lookAt(0, 1.4, 0);

    /* 加载进度 */
    let prog = 0;
    const loadTimer = setInterval(() => {
      prog = Math.min(100, prog + 22);
      $('loading-fill').style.width = prog + '%';
      if (prog >= 100) {
        clearInterval(loadTimer);
        setTimeout(() => {
          $('loading-screen').classList.add('fade');
          setTimeout(() => { $('loading-screen').style.display = 'none'; }, 650);
          setMode('title');
          S.qualityChecked = false;
          updateBestRecordUI();
          window.__READY = true;
        }, 260);
      }
    }, 110);

    $('loading-text').textContent = '正在点燃余烬…';
    requestAnimationFrame(loop);
  }

  /* ---------------- 调试接口 ---------------- */
  window.__DEBUG = {
    get ready() { return S.mode !== 'boot'; },
    version: '2.0.2',
    start() { startGame(); return S.mode; },
    state() {
      return {
        mode: S.mode, wave: S.wave, waveState: S.waveState, score: Math.round(S.score),
        combo: S.combo, comboMult: +S.comboMult.toFixed(2), maxCombo: S.maxCombo,
        hp: +P.hp.toFixed(1), maxHp: P.maxHp, stamina: +P.stamina.toFixed(1), momentum: +P.momentum.toFixed(1),
        playerState: P.state, kills: S.kills, elapsed: +S.elapsed.toFixed(2),
        enemiesAlive: D.enemies.filter(e => e.alive).length,
        enemyStates: D.enemies.map(e => ({ id: e.id, type: e.type, hp: +e.hp.toFixed(0), state: e.state, x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), elite: !!e.elite, executable: !!e.executable })),
        bossHp: D.boss ? +D.boss.hp.toFixed(0) : null,
        bossMax: D.boss ? D.boss.maxHp : null,
        bossPhase2: D.boss ? !!D.boss.phase2 : false,
        bossEnraged: D.boss ? !!D.boss.enraged : false,
        bossAttack: D.boss ? D.boss.attackKind : null,
        bossState: D.boss ? D.boss.state : null,
        bossMusic: audio.ready ? audio.musicMode : null,
        crimson: !!(G.world && G.world._crimson),
        pos: { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2) },
        lock: P.lockTarget ? +P.lockTarget.id : null,
        timeScale: +S.timeScale.toFixed(2), hitStop: +S.hitStop.toFixed(3),
        pointerLocked: S.pointerLocked, endShown: S.endShown,
        endless: S.endless,
        style: { points: +S.stylePoints.toFixed(1), rank: STYLE_TIERS[S.styleRankIdx].rank, mul: STYLE_TIERS[S.styleRankIdx].mul },
        blessingOptions: S.mode === 'blessing' ? S.blessingChoices.map(b => b.id) : [],
        blessings: P.blessings.map(b => b.id),
        mods: P.mods ? {
          lightMul: +P.mods.lightMul.toFixed(2), heavyMul: +P.mods.heavyMul.toFixed(2),
          maxHpBonus: P.mods.maxHpBonus, potionMax: P.mods.potionMax,
          thornDamage: P.mods.thornDamage, burnPerHit: P.mods.burnPerHit,
        } : null,
        parry: { window: +P.parryWindow.toFixed(2), blocking: P.state === 'block' },
        pendingBlessing: S.pendingBlessing,
        pickups: D.pickups ? D.pickups.length : 0,
        bossName: D.boss ? (D.boss.enraged ? '终焉守望者' : (D.boss.phase2 ? '回响之主' : '无面守望者')) : null,
        best: S.best,
        newRecord: S.newRecord,
        audio: audio.ready ? { ctx: audio.ctx.state, music: audio.musicMode, muted: audio.muted } : null,
        errors: window.__ERRORS.slice(0, 5),
      };
    },
    player() {
      return {
        hp: P.hp, maxHp: P.maxHp, stamina: P.stamina, maxStamina: P.maxStamina,
        momentum: P.momentum, state: P.state, potions: P.potions, maxPotions: P.maxPotions,
        yaw: P.yaw, invuln: P.invuln, pos: { x: P.pos.x, z: P.pos.z },
        parryWindow: P.parryWindow, blocking: P.state === 'block', perfectBuff: P.perfectBuffTimer,
        stats: { dealt: Math.round(P.stats.damageDealt), taken: Math.round(P.stats.damageTaken), perfect: P.stats.perfectDodges, parries: P.stats.parries, executions: P.stats.executions },
        blessings: P.blessings.map(b => b.id),
      };
    },
    enemies() {
      return D.enemies.map(e => ({
        id: e.id, type: e.type, hp: e.hp, maxHp: e.maxHp, state: e.state,
        x: e.pos.x, z: e.pos.z, alive: e.alive, elite: !!e.elite, eliteKind: e.eliteKind || null,
        executable: !!e.executable,
      }));
    },
    god(v) { S.debug.god = !!v; return S.debug.god; },
    autopilot(v) { S.debug.autopilot = !!v; return S.debug.autopilot; },
    camera(yaw, pitch, dist) {
      if (yaw != null) { C.yaw = yaw; C.yawTarget = yaw; }
      if (pitch != null) { C.pitch = pitch; C.pitchTarget = pitch; }
      if (dist != null) C.dist = dist;
      return { yaw: C.yaw, yawTarget: C.yawTarget, pitch: C.pitch, pitchTarget: C.pitchTarget, dist: C.dist };
    },
    /* 测试用：模拟鼠标视角输入（与真实鼠标走同一条处理路径） */
    mouse(dx, dy) {
      C.ignoreMouseEvents = 0;
      applyMouseLook(dx || 0, dy || 0);
      return { yaw: C.yaw, yawTarget: C.yawTarget, pitch: C.pitch, pitchTarget: C.pitchTarget };
    },
    setPlayerPos(x, z) { P.pos.x = x; P.pos.z = z; return { x, z }; },
    spawnEnemy(type, x, z, opts) { return G.combat.debugSpawn(type, x, z, opts); },
    spawnElite(type, x, z, kind) {
      return G.combat.debugSpawn(type, x, z, { elite: true, eliteKind: kind || 'shield' });
    },
    spawnPickup(type) { if (G.combat.debugSpawnPickup) G.combat.debugSpawnPickup(type); },
    damageEnemy(dmg) { G.combat.debugDamageAll(dmg); },
    killAll() { G.combat.debugKillAll(); },
    damagePlayer(n) { G.combat.damagePlayer(n, null); },
    healPlayer(n) { P.hp = Math.min(P.maxHp, P.hp + n); },
    attack(kind) { G.combat.debugAttack(kind || 'light'); },
    dodge() { G.combat.playerDodge(); },
    heal() { G.combat.playerHeal(); },
    wave() { G.combat.playerWave(); },
    ult() { P.momentum = 100; G.combat.playerUlt(); },
    lockNearest() { G.combat.toggleLock(); },
    skipToBoss() { G.combat.debugSkipToBoss(); },
    waveNow(n) { G.combat.startWave(n); },
    /* ---- v2 调试接口 ---- */
    chooseBlessing(i) { selectBlessing(Number(i) || 0); return S.mode; },
    blessingOptions() { return S.mode === 'blessing' ? S.blessingChoices.map(b => b.id) : []; },
    giveBlessing(id) {
      const b = G.getBlessing(id);
      if (!b) return false;
      acquireBlessing(b);
      if (S.mode === 'blessing') { /* 保持选择界面 */ }
      return true;
    },
    style(points) { addStyle(points == null ? 20 : points); return { points: S.stylePoints, rank: STYLE_TIERS[S.styleRankIdx].rank }; },
    parryDown() { P.blockHeld = true; G.combat.playerParryDown(); },
    parryUp() { P.blockHeld = false; G.combat.playerParryUp(); },
    startEndless() { startEndless(); return S.mode; },
    restartEndless() { restartEndless(); return S.mode; },
    best() { return S.best; },
    resetBest() { try { localStorage.removeItem(BEST_KEY); } catch (e) { } S.best = null; updateBestRecordUI(); return null; },
    damageEnemyById(id, dmg) { return G.combat.debugDamageById(id, dmg); },
    setQualityMode(m) { S.qualityMode = m; applyQualityMode(); return m; },
    settings() { return { sens: C.sens, invertY: C.invertY, quality: S.qualityMode, volume: audio.volume }; },
    forceCrit() { P.perfectBuffTimer = 4; },
    victory() { onVictory(); },
    defeat() { onDefeat(); },
    endNow(victory) {
      if (victory) onVictory(); else onDefeat();
      S.endTimer = 5;
      return this.state();
    },
    pause() { pauseGame('debug'); },
    resume() { resumeGame(); },
    setAutoPause(v) { S.autoPause = !!v; return S.autoPause; },
    pauseInfo() {
      return {
        mode: S.mode, autoPause: S.autoPause, pointerLocked: S.pointerLocked,
        focus: document.hasFocus(), visibility: document.visibilityState,
        log: S.pauseLog.slice(-8),
      };
    },
    overlayVisible(id) {
      const el = document.getElementById(id);
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return !el.classList.contains('hidden') && !el.hidden &&
        cs.display !== 'none' && cs.visibility !== 'hidden' &&
        parseFloat(cs.opacity) > 0.9 && r.width > 1 && r.height > 1;
    },
    uiState() {
      const ids = ['title-screen', 'pause-screen', 'blessing-screen', 'end-screen', 'hud', 'error-screen'];
      const out = {};
      ids.forEach((id) => {
        const el = document.getElementById(id);
        out[id] = el ? {
          hiddenClass: el.classList.contains('hidden'),
          display: getComputedStyle(el).display,
          opacity: getComputedStyle(el).opacity,
        } : null;
      });
      return out;
    },
    fillMomentum() { P.momentum = 100; },
    endScreen() { return { shown: S.endShown, mode: S.mode }; },
    pointerLockTry() { requestLock(); return document.pointerLockElement === canvas; },
    /* 确定性推进游戏逻辑（毫秒级测试用，不渲染） */
    tick(seconds) {
      let left = Math.max(0, Math.min(900, Number(seconds) || 0));
      const step = 1 / 60;
      while (left > 0) {
        const d = Math.min(step, left);
        update(d);
        left -= d;
      }
      return this.state();
    },
    setAutopilotDodge(v) { /* 预留 */ },
  };

  /* 启动 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
