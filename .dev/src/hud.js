/* ============================================================
   余烬之刃 v2 — HUD / 界面 / 祝福选择 / 伤害数字 / 结算
   ============================================================ */
(function () {
  const G = window.G;
  const U = G.util;
  const $ = (id) => document.getElementById(id);

  const el = {};
  const dmgPool = [];
  const activeDmg = [];
  const msgTimers = [];
  const enemyBars = [];
  let wavePipEls = [];

  const RANK_CLASS = { D: 'rank-d', C: 'rank-c', B: 'rank-b', A: 'rank-a', S: 'rank-s' };

  function project(v3) {
    const cam = G.world.camera;
    if (!cam) return { x: 0, y: 0, vis: false };
    const v = v3.clone().project(cam);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      vis: v.z < 1 && v.z > -1,
    };
  }

  function cache() {
    ['hud', 'score', 'timer', 'wave-label', 'wave-sub', 'wave-pips', 'combo-box', 'combo-num',
      'combo-mult', 'hp-fill', 'hp-text', 'stamina-fill', 'momentum-fill', 'mom-text', 'ult-prompt',
      'potion-row', 'low-hp-warn', 'boss-bar', 'boss-name', 'boss-hp-fill', 'boss-phase',
      'lock-reticle', 'lock-name', 'center-msg-layer', 'dmg-layer', 'skill-wave', 'skill-dodge',
      'skill-parry', 'style-box', 'style-rank', 'style-fill', 'style-mul',
      'blessing-list', 'blessing-screen', 'blessing-note', 'blessing-cards',
      'end-screen', 'end-kicker', 'end-title', 'end-rank', 'stat-score', 'stat-time', 'stat-kills',
      'stat-combo', 'end-record', 'endless-btn', 'best-record', 'invert-y', 'quality-select',
      'hint', 'sens-slider', 'vol-slider', 'sens-val', 'vol-val'].forEach((id) => {
        el[id] = $(id);
      });
    el.potions = Array.from(document.querySelectorAll('.potion'));
    el.potionCounts = el.potions.map(p => p.querySelector('.potion-count'));
    el.comboNum = el['combo-num'];
    el.bossBar = el['boss-bar'];
    el.lockReticle = el['lock-reticle'];
    el.centerLayer = el['center-msg-layer'];
    el.dmgLayer = el['dmg-layer'];
    el.styleRank = el['style-rank'];
    el.styleFill = el['style-fill'];
    el.blessingList = el['blessing-list'];

    if (!document.getElementById('enemy-bars')) {
      const layer = document.createElement('div');
      layer.id = 'enemy-bars';
      el.hud.appendChild(layer);
      el.enemyBarLayer = layer;
    } else {
      el.enemyBarLayer = document.getElementById('enemy-bars');
    }
    if (!document.getElementById('toast-layer')) {
      const t = document.createElement('div');
      t.id = 'toast-layer';
      el.hud.appendChild(t);
      el.toastLayer = t;
    } else {
      el.toastLayer = document.getElementById('toast-layer');
    }

    wavePipEls = [];
    el['wave-pips'].innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('i');
      el['wave-pips'].appendChild(pip);
      wavePipEls.push(pip);
    }
    H._blessingCb = null;
  }

  const H = {
    bossHp: 1,
    bossVisible: false,
    _lastCombo: -1,
    _lastHp: -1,
    _blessingCb: null,
  };

  H.init = function () {
    cache();
    H.reset();
  };

  H.reset = function () {
    activeDmg.forEach(d => { d.life = 0; d.el.style.display = 'none'; });
    activeDmg.length = 0;
    msgTimers.forEach(t => clearTimeout(t));
    msgTimers.length = 0;
    if (el.centerLayer) el.centerLayer.innerHTML = '';
    if (el.toastLayer) el.toastLayer.innerHTML = '';
    if (el.enemyBarLayer) el.enemyBarLayer.innerHTML = '';
    enemyBars.length = 0;
    el['combo-box'].classList.add('zero');
    el['low-hp-warn'].classList.add('hidden');
    el.bossBar.classList.add('hidden');
    el.lockReticle.classList.add('hidden');
    el['ult-prompt'].classList.add('off');
    el['skill-wave'].classList.remove('cooling');
    el['skill-dodge'].classList.remove('cooling');
    if (el['skill-parry']) el['skill-parry'].classList.remove('cooling', 'active');
    el['hp-fill'].style.width = '100%';
    el['stamina-fill'].style.width = '100%';
    el['momentum-fill'].style.width = '0%';
    el['hp-text'].textContent = '100 / 100';
    el.score.textContent = '0';
    el.timer.textContent = '00:00';
    el['wave-label'].textContent = '第 一 波';
    el['wave-label'].classList.remove('endless');
    el['wave-sub'].textContent = '剩余敌人 · 0';
    wavePipEls.forEach((p, i) => { p.className = i === 0 ? 'now' : ''; });
    el['combo-num'].textContent = '0';
    el['combo-mult'].textContent = '×1.0';
    if (el.styleRank) { el.styleRank.textContent = 'D'; el.styleRank.className = 'style-rank rank-d'; }
    if (el.styleFill) el.styleFill.style.width = '0%';
    if (el['style-mul']) el['style-mul'].textContent = '×1.0';
    if (el.blessingList) el.blessingList.innerHTML = '';
    if (el['blessing-cards']) el['blessing-cards'].innerHTML = '';
    if (el['blessing-screen']) el['blessing-screen'].classList.add('hidden');
    if (el['endless-btn']) el['endless-btn'].classList.add('hidden');
    el['end-screen'].classList.add('hidden');
    H._lastCombo = -1;
    H._lastHp = -1;
    H.bossHp = 1;
    H._blessingCb = null;
  };

  /* ---------- 中央提示 ---------- */
  H.msg = function (text, cls) {
    if (!el.centerLayer) return;
    /* 去重：相同文本不重复堆叠 */
    const existing = Array.from(el.centerLayer.children);
    if (existing.some(c => c.textContent === text)) return;
    const div = document.createElement('div');
    div.className = 'center-msg' + (cls ? ' ' + cls : '');
    div.textContent = text;
    el.centerLayer.appendChild(div);
    while (el.centerLayer.children.length > 3) {
      el.centerLayer.removeChild(el.centerLayer.firstChild);
    }
    const t = setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 2400);
    msgTimers.push(t);
  };

  H.toast = function (text) {
    if (!el.toastLayer) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    el.toastLayer.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 1600);
  };

  /* ---------- 伤害数字 ---------- */
  function getDmgEl() {
    let d = dmgPool.find(x => x.life <= 0);
    if (!d) {
      if (dmgPool.length >= 30) d = dmgPool[0];
      else {
        const node = document.createElement('div');
        el.dmgLayer.appendChild(node);
        d = { el: node, life: 0, max: 1, pos: new THREE.Vector3(), vy: 0, vx: 0, scale: 1, cls: '' };
        dmgPool.push(d);
      }
    }
    return d;
  }

  H.damageNumber = function (pos, text, cls) {
    if (!el.dmgLayer || !pos) return;
    const d = getDmgEl();
    d.life = cls === 'perfect' ? 1.0 : 0.85;
    d.max = d.life;
    d.pos.copy(pos);
    d.pos.x += U.rand(-0.25, 0.25);
    d.pos.y += U.rand(0, 0.3);
    d.vy = cls === 'big' ? 2.2 : 1.6;
    d.vx = U.rand(-0.5, 0.5);
    d.cls = cls || '';
    d.el.className = 'dmg' + (cdCls(cls) ? ' ' + cdCls(cls) : '');
    d.el.textContent = text;
    d.el.style.display = 'block';
    d.el.style.opacity = '1';
    if (activeDmg.indexOf(d) < 0) activeDmg.push(d);
  };
  function cdCls(cls) {
    if (!cls) return '';
    if (cls.indexOf('taken') >= 0) return 'taken';
    if (cls.indexOf('heal') >= 0) return 'heal';
    if (cls.indexOf('perfect') >= 0) return 'perfect';
    if (cls.indexOf('big') >= 0) return 'big';
    return '';
  }

  /* ---------- 敌人血条 ---------- */
  H.enemyBar = function (e, show) {
    if (!el.enemyBarLayer) return;
    if (e.type === 'boss') return;
    if (!show && !e._bar) return;
    if (!e._bar) {
      const b = document.createElement('div');
      b.className = 'enemy-hp';
      const f = document.createElement('div');
      f.className = 'fill';
      b.appendChild(f);
      el.enemyBarLayer.appendChild(b);
      e._bar = b;
      e._barFill = f;
      enemyBars.push(e);
    }
    e._bar.style.display = 'block';
    const frac = Math.max(0, e.hp / e.maxHp);
    e._barFill.style.width = (frac * 100).toFixed(1) + '%';
    e._bar.classList.toggle('exec', !!e.executable);
    if (frac <= 0) e._bar.style.display = 'none';
  };

  /* ---------- 连击 / 风格 ---------- */
  H.popCombo = function () {
    if (!el.comboNum) return;
    el.comboNum.classList.remove('pop');
    void el.comboNum.offsetWidth;
    el.comboNum.classList.add('pop');
    setTimeout(() => el.comboNum && el.comboNum.classList.remove('pop'), 90);
  };

  H.styleRankUp = function (rank, title) {
    if (!el.styleRank) return;
    el.styleRank.className = 'style-rank ' + (RANK_CLASS[rank] || 'rank-d');
    el.styleRank.textContent = rank;
    el.styleRank.classList.remove('rankup');
    void el.styleRank.offsetWidth;
    el.styleRank.classList.add('rankup');
    if (rank === 'S' || rank === 'A') H.toast(`${rank} · ${title}之刃`);
  };

  /* ---------- 祝福 ---------- */
  H.showBlessings = function (choices, note, cb) {
    H._blessingCb = cb;
    if (!el['blessing-cards']) return;
    if (el['blessing-note']) el['blessing-note'].textContent = note || '从三道回响中选择其一';
    el['blessing-cards'].innerHTML = '';
    choices.forEach((b, i) => {
      const r = G.BLESSING_RARITY[b.rarity] || G.BLESSING_RARITY.common;
      const card = document.createElement('div');
      card.className = 'blessing-card ' + b.rarity;
      card.dataset.index = String(i);
      card.innerHTML =
        '<div class="card-key">' + (i + 1) + '</div>' +
        '<div class="card-rarity">' + r.label + '</div>' +
        '<div class="card-icon"><span>' + b.icon + '</span></div>' +
        '<div class="card-name">' + b.name + '</div>' +
        '<div class="card-desc">' + b.desc + '</div>' +
        '<div class="card-flavor">「' + b.flavor + '」</div>';
      card.addEventListener('click', () => { if (H._blessingCb) H._blessingCb(i); });
      card.addEventListener('mouseenter', () => { if (G.audio) G.audio.sfx('uiHover'); });
      el['blessing-cards'].appendChild(card);
    });
    el['blessing-screen'].classList.remove('hidden');
  };

  H.pickBlessingCard = function (i) {
    if (!el['blessing-cards']) return;
    const cards = Array.from(el['blessing-cards'].children);
    cards.forEach((c, idx) => {
      if (idx === i) c.classList.add('picked');
      else c.style.opacity = '0.25';
    });
  };

  H.hideBlessings = function () {
    H._blessingCb = null;
    if (el['blessing-screen']) el['blessing-screen'].classList.add('hidden');
    if (el['blessing-cards']) el['blessing-cards'].innerHTML = '';
  };

  H.addBlessingChip = function (b) {
    if (!el.blessingList) return;
    const P = G.game.P;
    const count = (P.blessingCounts && P.blessingCounts[b.id]) || 1;
    const chip = document.createElement('div');
    chip.className = 'blessing-chip ' + b.rarity;
    chip.title = `${b.name}（${G.BLESSING_RARITY[b.rarity].label}）\n${b.desc}`;
    chip.innerHTML = b.icon + (count > 1 ? '<span class="stack">' + count + '</span>' : '');
    el.blessingList.appendChild(chip);
  };

  /* ---------- 波次 ---------- */
  H.waveIntro = function (n, w) {
    const S = G.game.S;
    if (S.endless) {
      el['wave-label'].textContent = `无尽 · 第 ${n} 波`;
      el['wave-label'].classList.add('endless');
      wavePipEls.forEach((p, i) => { p.className = i < 4 ? 'done' : 'now'; });
      return;
    }
    const names = ['第 一 波', '第 二 波', '第 三 波', '第 四 波', '第 五 波'];
    el['wave-label'].textContent = names[n - 1] || `第 ${n} 波`;
    el['wave-label'].classList.remove('endless');
    wavePipEls.forEach((p, i) => {
      p.className = i < n - 1 ? 'done' : (i === n - 1 ? 'now' : '');
    });
  };

  H.showBoss = function (v) {
    H.bossVisible = v;
    el.bossBar.classList.toggle('hidden', !v);
    H.bossHp = 1;
    if (v) {
      el['boss-name'].textContent = '无面守望者';
      el['boss-phase'].textContent = '深渊守望者';
    }
  };

  H.setCooldowns = function (waveCd, dodgeCd, parryCd) {
    el['skill-wave'].classList.toggle('cooling', waveCd > 0.05);
    el['skill-dodge'].classList.toggle('cooling', dodgeCd > 0.05);
    if (el['skill-parry']) el['skill-parry'].classList.toggle('cooling', (parryCd || 0) > 0.05);
  };

  H.setLockTarget = function (t) {
    if (!t || !t.alive) {
      el.lockReticle.classList.add('hidden');
      return;
    }
    const y = t.type === 'boss' ? 4.6 : (t.type === 'golem' ? 3.1 : (t.type === 'hexer' ? 2.9 : 2.2));
    const sp = project(new THREE.Vector3(t.pos.x, y, t.pos.z));
    if (!sp.vis) {
      el.lockReticle.classList.add('hidden');
      return;
    }
    el.lockReticle.classList.remove('hidden');
    el.lockReticle.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%)`;
    el['lock-name'].textContent = t.def ? t.def.name : '';
  };

  /* ---------- 每帧更新 ---------- */
  H.update = function (raw, dt) {
    if (!G.game || !el.hud) return;
    const S = G.game.S, P = G.game.P, D = G.game.D;
    if (S.mode === 'boot' || S.mode === 'title') return;

    el.score.textContent = U.formatScore(S.score);
    el.timer.textContent = U.formatTime(S.elapsed);
    el['hp-fill'].style.width = Math.max(0, (P.hp / P.maxHp) * 100) + '%';
    el['hp-text'].textContent = `${Math.ceil(Math.max(0, P.hp))} / ${P.maxHp}`;
    el['stamina-fill'].style.width = Math.max(0, (P.stamina / P.maxStamina) * 100) + '%';
    el['momentum-fill'].style.width = Math.max(0, (P.momentum / P.maxMomentum) * 100) + '%';
    el['mom-text'].textContent = Math.round(P.momentum);
    const full = P.momentum >= P.maxMomentum;
    el['momentum-fill'].parentNode.classList.toggle('full', full);
    el['ult-prompt'].classList.toggle('off', !full || S.mode !== 'playing');
    el['low-hp-warn'].classList.toggle('hidden', !(P.hp > 0 && P.hp / P.maxHp <= 0.3 && S.mode === 'playing'));

    /* 风格 */
    if (el.styleRank) {
      const tier = G.game.styleRank ? G.game.styleRank() : { rank: 'D', mul: 1 };
      const cls = 'style-rank ' + (RANK_CLASS[tier.rank] || 'rank-d');
      if (el.styleRank.className !== cls && !el.styleRank.classList.contains('rankup')) el.styleRank.className = cls;
      if (el.styleRank.textContent !== tier.rank) el.styleRank.textContent = tier.rank;
      el.styleFill.style.width = (S.stylePoints / 100 * 100).toFixed(1) + '%';
      el['style-mul'].textContent = '×' + tier.mul.toFixed(2);
    }

    /* 连击 */
    if (S.combo > 0) {
      el['combo-box'].classList.remove('zero');
      el['combo-num'].textContent = S.combo;
      el['combo-mult'].textContent = '×' + S.comboMult.toFixed(1);
    } else {
      el['combo-box'].classList.add('zero');
    }

    /* 药水 */
    el.potions.forEach((p, i) => {
      const has = i < P.potions;
      p.classList.toggle('empty', !has);
      el.potionCounts[i].textContent = has ? '×1' : '';
    });

    /* 波次 */
    const remaining = D.enemies.filter(e => e.alive).length + S.spawnQueue.length;
    el['wave-sub'].textContent = (S.waveState === 'clear' ? '区域肃清 · 选择回响' : `剩余敌人 · ${remaining}`);

    /* Boss 条 */
    const boss = D.boss;
    if (S.bossActive && boss && boss.alive) {
      H.bossHp = U.damp(H.bossHp, boss.hp / boss.maxHp, 10, raw);
      el.bossBar.classList.remove('hidden');
      el['boss-hp-fill'].style.width = Math.max(0, H.bossHp * 100) + '%';
      const f = boss.hp / boss.maxHp;
      const names = boss.enraged ? '终焉守望者' : (boss.phase2 ? '回响之主' : '无面守望者');
      el['boss-name'].textContent = names;
      el['boss-phase'].textContent = boss.enraged ? '终焉形态' : (boss.phase2 ? '回响形态 · 第 2 阶段' : (f > 0.66 ? '深渊守望者' : '破碎的守望者'));
    } else {
      el.bossBar.classList.add('hidden');
    }

    /* 锁定准星 */
    if (P.lockTarget && P.lockTarget.alive && S.mode === 'playing') {
      H.setLockTarget(P.lockTarget);
    } else {
      el.lockReticle.classList.add('hidden');
    }

    /* 格挡状态 */
    if (el['skill-parry']) el['skill-parry'].classList.toggle('active', P.state === 'block');

    /* 伤害数字 */
    for (let i = activeDmg.length - 1; i >= 0; i--) {
      const d = activeDmg[i];
      d.life -= raw;
      if (d.life <= 0) {
        d.el.style.display = 'none';
        activeDmg.splice(i, 1);
        continue;
      }
      const k = d.life / d.max;
      d.pos.y += d.vy * raw;
      d.pos.x += d.vx * raw;
      const sp = project(d.pos);
      if (!sp.vis) { d.el.style.opacity = '0'; continue; }
      const scale = d.cls === 'big' ? 1.15 : (d.cls === 'perfect' ? 1.05 : 1);
      const pop = k > 0.82 ? 1.35 - (1 - k) * 1.9 : 1;
      d.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%) scale(${(scale * pop).toFixed(2)})`;
      d.el.style.opacity = String(Math.min(1, k * 2.2));
    }

    /* 敌人血条定位 */
    for (let i = enemyBars.length - 1; i >= 0; i--) {
      const e = enemyBars[i];
      if (!e._bar) { enemyBars.splice(i, 1); continue; }
      if (!e.alive || e.hp >= e.maxHp) { e._bar.style.display = 'none'; continue; }
      const y = e.type === 'golem' ? 3.2 : (e.type === 'hexer' ? 2.9 : (e.type === 'detonator' ? 1.7 : 2.2));
      const sp = project(new THREE.Vector3(e.pos.x, y, e.pos.z));
      if (!sp.vis) { e._bar.style.display = 'none'; continue; }
      e._bar.style.display = 'block';
      e._bar.style.left = sp.x + 'px';
      e._bar.style.top = sp.y + 'px';
      e._barFill.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      e._bar.classList.toggle('exec', !!e.executable);
    }

    /* 提示 */
    if (el.hint && S.mode === 'playing' && !S.pointerLocked) el.hint.classList.remove('hidden');
    else if (el.hint) el.hint.classList.add('hidden');
  };

  /* ---------- 结算 ---------- */
  H.hideEnd = function () {
    if (el['end-screen']) el['end-screen'].classList.add('hidden');
  };

  H.showEnd = function (victory) {
    const S = G.game.S, P = G.game.P;
    const finalScore = Math.round(S.score);
    const endless = !!S.endless;
    let rank, note;
    if (endless) {
      rank = S.wave >= 15 ? 'S' : S.wave >= 10 ? 'A' : S.wave >= 7 ? 'B' : 'C';
      note = `无尽回响 · 止步于第 ${S.wave} 波 · 评级 ${rank}`;
      el['end-kicker'].textContent = 'THE ECHO ENDURES';
      el['end-title'].textContent = '回 响 止 步';
    } else if (victory) {
      const timeBonus = Math.max(0, 420 - Math.floor(S.elapsed)) * 8;
      const hpBonus = Math.round(P.hp) * 10;
      const potionBonus = (P.potions || 0) * 120;
      const final = finalScore + timeBonus + hpBonus + potionBonus;
      if (final >= 38000) rank = 'S';
      else if (final >= 29000) rank = 'A';
      else if (final >= 21000) rank = 'B';
      else rank = 'C';
      note = `回响竞技场 · ${U.formatTime(S.elapsed)} · 评级 ${rank}`;
      el['end-kicker'].textContent = 'THE CYCLE ENDS';
      el['end-title'].textContent = '逃 出 生 天';
    } else {
      if (S.wave >= 5) rank = 'A';
      else if (S.wave >= 4) rank = 'B';
      else if (S.wave >= 3) rank = 'C';
      else rank = 'D';
      note = `止步于第 ${Math.max(1, S.wave)} 波 · 评级 ${rank}`;
      el['end-kicker'].textContent = 'THE CYCLE CONTINUES';
      el['end-title'].textContent = '余 烬 熄 灭';
    }
    el['end-rank'].className = 'rank-badge rank-' + rank.toLowerCase();
    el['end-rank'].innerHTML = '<span>' + rank + '</span>';
    el['stat-score'].textContent = U.formatScore(finalScore);
    el['stat-time'].textContent = U.formatTime(S.elapsed);
    el['stat-kills'].textContent = String(S.kills);
    el['stat-combo'].textContent = String(S.maxCombo);
    let noteEl = document.getElementById('end-note');
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = 'end-note';
      noteEl.className = 'end-note';
      const panel = el['end-screen'].querySelector('.menu-panel');
      const btns = panel.querySelector('.menu-buttons');
      panel.insertBefore(noteEl, btns);
    }
    noteEl.textContent = note;

    /* 最高纪录 */
    const b = S.best || {};
    if (el['end-record']) {
      let html = `历史最高得分 <b>${U.formatScore(b.bestScore || finalScore)}</b>`;
      if (b.endlessBest) html += ` · 无尽最高 <b>第 ${b.endlessBest} 波</b>`;
      if (S.newRecord) html += ' <span class="record-new">◆ 新纪录</span>';
      el['end-record'].innerHTML = html;
    }
    /* 仅剧情胜利后可进入无尽；无尽死亡后可再入无尽 */
    if (el['endless-btn']) {
      const showEndless = (victory && !endless) || (endless && !victory);
      el['endless-btn'].classList.toggle('hidden', !showEndless);
      el['endless-btn'].textContent = (endless && !victory) ? '再 入 无 尽' : '无 尽 回 响';
    }
    el['end-screen'].classList.remove('hidden');
    G.audio.sfx('ui');
  };

  G.hud = H;
})();
