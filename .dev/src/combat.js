/* ============================================================
   余烬之刃 — 战斗系统：玩家 / 敌人 / Boss / 波次 / 投射物
   ============================================================ */
(function () {
  const G = window.G;
  const U = G.util;
  const W = G.world;
  const audio = G.audio;
  const S = G.game.S;
  const P = G.game.P;
  const C = G.game.C;
  const D = G.game.D;
  const CFG = G.game.CFG;
  const TMP = new THREE.Vector3();
  const TMP2 = new THREE.Vector3();
  const TMP3 = new THREE.Vector3();

  const NEUTRAL = {
    ry: 0, rx: -0.14, rz: -0.1, erx: -0.32, ly: 0, lx: -0.08, lz: 0.1, elx: -0.26,
    torsoY: 0, torsoX: 0.02, torsoZ: 0, hipY: 0, headX: 0, headY: 0, swordZ: 0, swordX: 0,
  };

  const ATT = {
    light1: {
      kind: 'light', duration: 0.46, windup: 0.10, active: 0.15,
      range: 2.8, halfArc: 1.22, damage: 24, knockback: 4.0, lunge: 2.6,
      shake: 0.14, hitstop: 0.045, hitSfx: 'hit',
      windPose: { ry: -0.65, rx: -1.15, rz: -0.4, erx: -0.4, torsoY: -0.55, torsoX: 0.04, hipY: -0.03 },
      hitPose: { ry: 0.95, rx: -1.48, rz: 0.15, erx: -0.02, torsoY: 0.68, torsoX: 0.06, hipY: 0.02 },
    },
    light2: {
      kind: 'light', duration: 0.48, windup: 0.09, active: 0.16,
      range: 2.85, halfArc: 1.25, damage: 28, knockback: 4.4, lunge: 2.8,
      shake: 0.16, hitstop: 0.05, hitSfx: 'hit',
      windPose: { ry: 0.7, rx: -1.05, rz: 0.3, erx: -0.5, torsoY: 0.56, torsoX: 0.03, hipY: -0.02 },
      hitPose: { ry: -1.0, rx: -1.42, rz: -0.2, erx: -0.02, torsoY: -0.72, torsoX: 0.08, hipY: 0.03 },
    },
    light3: {
      kind: 'light', duration: 0.68, windup: 0.17, active: 0.2,
      range: 3.1, halfArc: 1.05, damage: 38, knockback: 7.5, lunge: 3.6,
      shake: 0.3, hitstop: 0.065, hitSfx: 'hitHeavy',
      windPose: { ry: 0, rx: -2.9, rz: -0.15, erx: -0.55, torsoY: 0.15, torsoX: -0.16, hipY: 0.02 },
      hitPose: { ry: 0.1, rx: -0.5, rz: 0, erx: -0.05, torsoY: -0.1, torsoX: 0.32, hipY: -0.05 },
    },
    heavy: {
      kind: 'heavy', duration: 0.92, windup: 0.3, active: 0.24,
      range: 3.3, halfArc: 1.5, damage: 58, knockback: 11, lunge: 4.4,
      shake: 0.4, hitstop: 0.1, hitSfx: 'hitHeavy',
      windPose: { ry: -0.2, rx: -3.0, rz: -0.3, erx: -0.6, torsoY: -0.25, torsoX: -0.22, hipY: 0.04 },
      hitPose: { ry: 0.05, rx: -0.35, rz: 0.1, erx: -0.02, torsoY: 0.25, torsoX: 0.42, hipY: -0.07 },
    },
  };

  const ENEMY_TYPES = {
    wraith: {
      name: '蚀影', maxHp: 46, radius: 0.58, speed: 4.4, damage: 12, score: 140,
      attackCd: [1.3, 2.3], portal: 0xff2f7a,
    },
    golem: {
      name: '石卫', maxHp: 150, radius: 1.05, speed: 2.35, damage: 24, score: 360,
      attackCd: [1.4, 2.4], portal: 0xff8a3a,
    },
    hexer: {
      name: '咒眼', maxHp: 66, radius: 0.65, speed: 2.9, damage: 10, score: 300,
      attackCd: [1.8, 2.8], portal: 0xb44dff,
    },
    detonator: {
      name: '爆裂者', maxHp: 56, radius: 0.6, speed: 4.9, damage: 26, score: 260,
      attackCd: [1.2, 2.0], portal: 0xffb040,
    },
    boss: {
      name: '无面守望者', maxHp: 820, radius: 2.1, speed: 2.9, damage: 20, score: 3000,
      attackCd: [1.6, 2.4], portal: 0xff2a18,
    },
  };

  const WAVES = [
    { label: '第 一 波', sub: '肃 清 侵 蚀 者', spawns: [{ type: 'wraith', n: 3 }] },
    { label: '第 二 波', sub: '石 卫 苏 醒', spawns: [{ type: 'wraith', n: 4 }, { type: 'golem', n: 1 }] },
    { label: '第 三 波', sub: '咒 眼 窥 视', spawns: [{ type: 'wraith', n: 3 }, { type: 'golem', n: 2 }, { type: 'hexer', n: 2 }] },
    { label: '第 四 波', sub: '侵 蚀 加 剧', spawns: [{ type: 'wraith', n: 4 }, { type: 'golem', n: 3 }, { type: 'hexer', n: 3 }, { type: 'detonator', n: 2 }] },
    { label: '第 五 波', sub: '无 面 守 望 者', spawns: [{ type: 'wraith', n: 2 }, { type: 'detonator', n: 1 }, { type: 'boss', n: 1 }], boss: true },
  ];

  /* 精英词缀 */
  const ELITE_KINDS = {
    swift: { label: '迅捷', color: 0xffd36b, hpMul: 1.35, spdMul: 1.4, dmgMul: 1.0 },
    shield: { label: '护盾', color: 0x6fe3ff, hpMul: 1.7, spdMul: 1.0, dmgMul: 1.0, shield: 1 },
    fury: { label: '狂怒', color: 0xff5a3a, hpMul: 1.5, spdMul: 1.15, dmgMul: 1.45 },
  };

  /* 无尽回响：波次程序化生成 */
  function makeEndlessWave(n) {
    const k = n - 5; /* 1,2,3... */
    const boss = n % 5 === 0;
    const count = Math.min(16, 4 + Math.floor(k * 0.9));
    const types = ['wraith', 'golem', 'detonator'];
    if (k >= 2) types.push('hexer');
    if (k >= 4) types.push('detonator', 'hexer');
    const counts = {};
    const regular = boss ? Math.max(2, Math.floor(count * 0.35)) : count;
    for (let i = 0; i < regular; i++) {
      const t = types[i % types.length];
      counts[t] = (counts[t] || 0) + 1;
    }
    const spawns = Object.keys(counts).map(type => ({ type, n: counts[type] }));
    if (boss) spawns.push({ type: 'boss', n: 1 });
    return {
      label: `无 尽 · 第 ${n} 波`,
      sub: boss ? '回 响 守 望 者' : '回 响 继 续',
      spawns,
      boss,
      endless: true,
      hpMul: 1 + Math.max(0, k - 1) * 0.11,
      dmgMul: 1 + Math.max(0, k - 1) * 0.065,
      scoreMul: 1 + Math.max(0, k - 1) * 0.16,
      eliteChance: Math.min(0.55, 0.10 + k * 0.05),
    };
  }

  function getWaveDef(n) {
    if (n <= WAVES.length) {
      const w = WAVES[n - 1];
      return Object.assign({}, w, {
        hpMul: n <= 2 ? 1 : 1 + (n - 2) * 0.06,
        dmgMul: n <= 2 ? 1 : 1 + (n - 2) * 0.04,
        scoreMul: 1,
        eliteChance: n >= 4 ? 0.16 : (n === 3 ? 0.1 : 0),
      });
    }
    return makeEndlessWave(n);
  }

  /* =========================================================
     玩家：动作
     ========================================================= */
  function modeOk() { return S.mode === 'playing'; }

  function nearestEnemy(maxDist, preferLock) {
    if (preferLock !== false && P.lockTarget && P.lockTarget.alive) return P.lockTarget;
    let best = null, bd = maxDist * maxDist;
    for (const e of D.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  function faceTarget(halfArcLimit) {
    let t = P.lockTarget && P.lockTarget.alive ? P.lockTarget : null;
    if (!t) {
      let best = null, bd = 1e9;
      for (const e of D.enemies) {
        if (!e.alive) continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 10) continue;
        const ang = Math.abs(U.wrapAngle(Math.atan2(dx, dz) - P.yaw));
        if (halfArcLimit != null && ang > halfArcLimit && d > 3.2) continue;
        if (d < bd) { bd = d; best = e; }
      }
      t = best;
    }
    if (t) P.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
    else P.yaw = C.yaw;
    return t;
  }

  function playerAttack(kind) {
    if (!modeOk() || P.state === 'dead') return;
    if (kind === 'heavy' && P.stamina < 30) {
      if (G.hud) G.hud.toast('体力不足');
      return;
    }
    if (P.state === 'idle' || P.state === 'run' || P.state === 'block') {
      startAttack(kind);
    } else if (P.state === 'attack') {
      if (P.t > P.attack.def.windup * 0.55) {
        if (kind === 'heavy' && P.stamina < 30) return;
        P.buffered = kind;
      }
    } else if (P.state === 'dodge' && P.t > 0.16) {
      P.buffered = kind;
    } else if (P.state === 'cast' && P.t > 0.12) {
      P.buffered = kind;
    }
  }

  function startAttack(kind) {
    let def, step = 0;
    if (kind === 'light') {
      if (P.comboResetTimer > 0) P.comboStep = (P.comboStep % 3) + 1;
      else P.comboStep = 1;
      step = P.comboStep;
      def = ATT['light' + step];
    } else {
      def = ATT.heavy;
      P.comboStep = 0;
      P.stamina = Math.max(0, P.stamina - 30);
      P.staminaDelay = 0.75;
    }
    /* 双刃祝福：攻速提升（缩短前后摇） */
    const atkSpeed = (P.mods && P.mods.atkSpeedMul) || 1;
    if (atkSpeed !== 1) {
      def = Object.assign({}, def, {
        duration: def.duration / atkSpeed,
        windup: def.windup / atkSpeed,
        active: def.active / atkSpeed,
      });
    }
    P.attack = { def, step, kind, strikeDone: false, hitSet: new Set() };
    P.state = 'attack';
    P.t = 0;
    P.comboResetTimer = 0.9;
    P.buffered = null;
    P.parryWindow = 0;
    faceTarget(1.5);
    audio.sfx(kind === 'heavy' ? 'swingHeavy' : 'swing');
  }

  /* 攻击伤害（含祝福 / 势满 / 完美余音加成） */
  function attackDamage(kind, step) {
    const m = P.mods || {};
    let dmg;
    if (kind === 'heavy') dmg = ATT.heavy.damage * (m.heavyMul || 1);
    else dmg = ATT['light' + (step || 1)].damage * (m.lightMul || 1);
    if (P.momentum >= P.maxMomentum && m.echoLord) dmg *= 1.15;
    if (P.perfectBuffTimer > 0 && m.perfectBuff) dmg *= 1.5;
    return dmg;
  }
  function waveDamageValue() {
    const m = P.mods || {};
    let dmg = 36 * (m.waveMul || 1);
    if (P.momentum >= P.maxMomentum && m.echoLord) dmg *= 1.15;
    if (P.perfectBuffTimer > 0 && m.perfectBuff) dmg *= 1.5;
    return dmg;
  }

  function doAttackHit() {
    const a = P.attack;
    const def = a.def;
    let hitAny = false;
    for (const e of D.enemies) {
      if (!e.alive) continue;
      if (e.state === 'spawn' && e.t < 0.45) continue;
      if (a.hitSet.has(e.id)) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > def.range + e.radius * 0.55) continue;
      if (!U.inCone(P.pos.x, P.pos.z, P.yaw, dx, dz, dist, def.halfArc)) continue;
      a.hitSet.add(e.id);
      hitAny = true;
      const opts = {
        heavy: def.kind === 'heavy' || a.step === 3,
        knockback: def.knockback,
        dir: { x: dist > 0.01 ? dx / dist : 0, z: dist > 0.01 ? dz / dist : 1 },
      };
      if (e.executable && e.type !== 'boss') {
        executeEnemy(e);
        continue;
      }
      damageEnemy(e, attackDamage(a.kind, a.step), opts);
    }
    /* 回响之刃祝福：第三段轻斩附带剑气 */
    if (a.step === 3 && P.mods && P.mods.comboWave > 0) {
      spawnPlayerWave({ offsetY: 0.9, scale: 0.85, dmgMul: 0.6 });
    }
    W.slashArc(new THREE.Vector3(P.pos.x, 0.95, P.pos.z), P.yaw, {
      radius: def.range * 0.98, halfArc: def.halfArc * 0.95,
      color: def.kind === 'heavy' ? 0xffd090 : 0xffa050,
      dur: def.kind === 'heavy' ? 0.28 : 0.2,
    });
    /* 前冲 */
    const fwd = U.dirFromYaw(P.yaw, TMP);
    P.knock.x += fwd.x * def.lunge;
    P.knock.z += fwd.z * def.lunge;
    if (hitAny) {
      G.game.hitStop(def.hitstop);
      G.game.addShake(def.shake);
      audio.sfx(def.hitSfx);
      G.game.addStyle(a.kind === 'heavy' ? 6 : 3);
      if (def.kind === 'heavy') S.fovKick = Math.min(14, S.fovKick + 6);
    } else {
      G.game.addShake(def.shake * 0.25);
    }
  }

  function updateAttack(dt) {
    const a = P.attack;
    if (!a) { P.state = 'idle'; return; }
    const def = a.def;
    if (!a.strikeDone && P.t >= def.windup) {
      a.strikeDone = true;
      doAttackHit();
    }
    const activeEnd = def.windup + def.active;
    if (P.t >= activeEnd && P.buffered) {
      const b = P.buffered;
      if (b === 'heavy') {
        if (P.stamina >= 30) { startAttack('heavy'); return; }
        P.buffered = null;
      } else {
        P.buffered = null;
        startAttack('light');
        return;
      }
    }
    if (P.t >= def.duration) {
      if (P.buffered) {
        const b = P.buffered;
        P.buffered = null;
        if (b !== 'heavy' || P.stamina >= 30) { startAttack(b); return; }
      }
      P.state = 'idle';
      P.attack = null;
      P.comboResetTimer = 0.85;
    }
  }

  function playerDodge() {
    if (!modeOk() || P.state === 'dead') return;
    const canCancel = P.state === 'attack' && P.t > P.attack.def.windup * 0.8;
    const weakCancel = (P.state === 'cast' && P.t > 0.1) || (P.state === 'heal' && P.t > 0.3);
    if (!(P.state === 'idle' || P.state === 'run' || canCancel || weakCancel)) return;
    if (P.stamina < 25 || P.dodgeCd > 0) return;
    const keys = G.game.keys;
    const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    let dx, dz;
    if (ix || iz) {
      const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
      const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
      dx = fx * iz + rx * ix; dz = fz * iz + rz * ix;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    } else {
      dx = Math.sin(P.yaw); dz = Math.cos(P.yaw);
    }
    P.state = 'dodge';
    P.t = 0;
    P.iframe = false;
    P.dodgeDir = P.dodgeDir || new THREE.Vector3();
    P.dodgeDir.set(dx, 0, dz);
    P._dodgeF = 0;
    P.yaw = Math.atan2(dx, dz);
    P.stamina = Math.max(0, P.stamina - 25);
    P.staminaDelay = 0.6;
    P.dodgeCd = 0.12;
    P.dodgeDistMul = (P.mods && P.mods.dodgeDistMul) || 1;
    P.attack = null;
    P.buffered = null;
    P.afterimageTimer = 0;
    if (P.state === 'block') P.parryWindow = 0;
    audio.sfx('dodge');
    W.emitBurst(new THREE.Vector3(P.pos.x, 0.15, P.pos.z), { count: 8, color: 0x9fb6c8, speed: 2.5, size: 0.1, life: 0.4, gravity: 1.5 });
  }

  function updateDodge(dt) {
    const dur = 0.42;
    const k = U.clamp01(P.t / dur);
    const dist = 3.0 * (P.dodgeDistMul || 1);
    /* 位移曲线：强起手、平稳收尾，总距离精确可控 */
    const f = 0.35 * (1 - Math.pow(1 - k, 2)) + 0.65 * k;
    const prevF = P._dodgeF || 0;
    const dF = Math.max(0, f - prevF);
    P._dodgeF = f;
    P.pos.x += P.dodgeDir.x * dist * dF;
    P.pos.z += P.dodgeDir.z * dist * dF;
    P.iframe = P.t > 0.02 && P.t < 0.28;
    P.afterimageTimer -= dt;
    if (P.t < 0.30 && P.afterimageTimer <= 0) {
      P.afterimageTimer = 0.058;
      W.afterimage(P.model.visual, P.pos, P.yaw);
    }
    if (P.t >= dur) {
      P.state = 'idle';
      P.iframe = false;
      P.dodgeCd = 0.1;
      P._dodgeF = 0;
      /* 翻滚结束立即归位，避免 2π 旋转反向插值造成穿地 */
      const vis = P.model.visual;
      vis.rotation.x = 0;
      vis.position.y = 0;
      vis.scale.set(1, 1, 1);
      if (P.buffered) {
        const b = P.buffered;
        P.buffered = null;
        if (b !== 'heavy' || P.stamina >= 30) startAttack(b);
      }
    }
  }

  /* ---------------- v2：格挡 / 精准弹反（Q） ---------------- */
  function playerParryDown() {
    if (!modeOk() || P.state === 'dead') return;
    if (!(P.state === 'idle' || P.state === 'run' || P.state === 'block')) return;
    if (P.stamina < 8 || P.parryCd > 0) return;
    if (P.state !== 'block') {
      P.state = 'block';
      P.t = 0;
      P.parryWindow = 0.2;
      P.attack = null;
      P.buffered = null;
      P.iframe = false;
      audio.sfx('block');
      W.emitBurst(new THREE.Vector3(P.pos.x + Math.sin(P.yaw) * 0.7, 1.2, P.pos.z + Math.cos(P.yaw) * 0.7),
        { count: 8, color: 0x9fe8ff, speed: 2, size: 0.08, life: 0.3, gravity: 1 });
    }
  }
  function playerParryUp() {
    if (P.state === 'block') {
      P.state = 'idle';
      P.parryWindow = 0;
    }
  }
  function blockFacing(x, z) {
    const dx = x - P.pos.x, dz = z - P.pos.z;
    if (dx * dx + dz * dz < 0.01) return true;
    const ang = Math.abs(U.wrapAngle(Math.atan2(dx, dz) - P.yaw));
    return ang < 1.95;
  }
  function perfectParry(sourceEnemy) {
    P.stats.parries++;
    P.parryWindow = 0;
    P.stamina = Math.min(P.maxStamina, P.stamina + 16);
    P.invuln = Math.max(P.invuln, 0.5);
    G.game.addScore(320);
    G.game.addMomentum(24);
    G.game.addStyle(12);
    if (P.mods && P.mods.perfectBuff) P.perfectBuffTimer = 3.0;
    if (P.mods && P.mods.timeSand) G.game.setSlowmo(0.3, 0.95);
    else G.game.setSlowmo(0.34, 0.5);
    G.game.hitStop(0.06);
    G.game.addShake(0.18);
    audio.sfx('parry');
    const sparkPos = new THREE.Vector3(P.pos.x + Math.sin(P.yaw) * 0.9, 1.35, P.pos.z + Math.cos(P.yaw) * 0.9);
    W.emitBurst(sparkPos, { count: 28, color: 0xbfe8ff, speed: 9, size: 0.13, life: 0.5, gravity: 4 });
    W.flash(sparkPos, 0x9fe8ff, 3.4, 0.3);
    W.slashArc(new THREE.Vector3(P.pos.x, 1.1, P.pos.z), P.yaw, { radius: 2.6, halfArc: 1.5, color: 0x9fe8ff, dur: 0.24 });
    if (G.hud) {
      G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.45, P.pos.z), '完 美 弹 反', 'perfect');
      G.hud.msg('完美弹反', 'small cyan');
    }
    if (sourceEnemy && sourceEnemy.alive) {
      if (sourceEnemy.type === 'boss') {
        sourceEnemy.stunTimer = 0.5;
      } else {
        setEnemyState(sourceEnemy, 'stagger');
        sourceEnemy.staggerDur = 1.2;
        killTele(sourceEnemy);
        damageEnemy(sourceEnemy, 22, {
          heavy: false, knockback: 3, reflect: true,
          dir: { x: Math.sin(P.yaw), z: Math.cos(P.yaw) },
        });
      }
    }
  }
  function perfectDodgeFx() {
    if (P.mods && P.mods.perfectBuff) P.perfectBuffTimer = 3.0;
    if (P.mods && P.mods.timeSand) {
      G.game.setSlowmo(0.3, 1.1);
      if (Math.random() < 0.25) P.dodgeCd = 0;
    }
  }

  function playerWave() {
    if (!modeOk() || P.state === 'dead') return;
    if (P.state !== 'idle' && P.state !== 'run' && P.state !== 'block' && P.state !== 'hurt') return;
    if (P.waveCd > 0 || P.stamina < 25) {
      if (P.waveCd > 0 && G.hud) G.hud.toast('剑气冷却中');
      return;
    }
    faceTarget(1.6);
    P.state = 'cast';
    P.t = 0;
    P.waveFired = false;
    P.stamina = Math.max(0, P.stamina - 25);
    P.staminaDelay = 0.7;
    P.waveCd = Math.max(0.9, 3.2 - ((P.mods && P.mods.waveCdCut) || 0));
    audio.sfx('cast');
  }

  function spawnPlayerWave(opts) {
    opts = opts || {};
    const group = new THREE.Group();
    const color = 0x8fe8ff;
    const sc = opts.scale || 1;
    const spriteA = new THREE.Sprite(new THREE.SpriteMaterial({
      map: W.makeGlowTexture(64), color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    spriteA.scale.set(2.6 * sc, 1.15 * sc, 1);
    group.add(spriteA);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({
      color: 0xe8ffff, transparent: true, opacity: 1,
    }));
    core.scale.set(1.7 * sc, 0.55 * sc, 0.55 * sc);
    group.add(core);
    const y = opts.offsetY != null ? opts.offsetY : 1.15;
    group.position.set(
      P.pos.x + Math.sin(P.yaw) * 1.2,
      y,
      P.pos.z + Math.cos(P.yaw) * 1.2
    );
    group.rotation.y = P.yaw;
    W.scene.add(group);
    const dmg = waveDamageValue() * (opts.dmgMul || 1);
    D.projectiles.push({
      group, pos: group.position,
      dir: new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)),
      speed: 25, damage: dmg, radius: 1.05 * sc, life: 1.35, owner: 'player',
      pierce: 3 + ((P.mods && P.mods.wavePierce) || 0), hitSet: new Set(), spin: core,
    });
    W.emitDirectional(group.position, new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), {
      count: 10, color: 0x8fe8ff, speed: 5, size: 0.1, life: 0.35,
    });
    if (!opts.silent) audio.sfx('swordWave');
  }

  function playerHeal() {
    if (!modeOk() || P.state === 'dead') return;
    if (P.potions <= 0) { if (G.hud) G.hud.toast('没有余烬药剂了'); return; }
    if (P.hp >= P.maxHp) { if (G.hud) G.hud.toast('生命已满'); return; }
    if (P.state !== 'idle' && P.state !== 'run' && P.state !== 'block' && P.state !== 'hurt') return;
    P.state = 'heal';
    P.t = 0;
    P.healDone = false;
    P.healCd = 1.1;
    P.parryWindow = 0;
    audio.sfx('potion');
  }

  function playerUlt() {
    if (!modeOk() || P.state === 'dead') return;
    if (P.momentum < P.maxMomentum) { if (G.hud) G.hud.toast('势能不足'); return; }
    if (!(P.state === 'idle' || P.state === 'run' || P.state === 'attack' || P.state === 'block' || P.state === 'hurt')) return;
    P.state = 'ult';
    P.t = 0;
    P.ultDone = false;
    P.attack = null;
    P.buffered = null;
    P.parryWindow = 0;
    P.invuln = 1.4;
    P.momentum = 0;
    audio.sfx('ult');
    G.game.hitStop(0.06);
    S.fovKick = 10;
    if (G.hud) G.hud.msg('烬 灭', 'cyan');
  }

  function doUltDamage() {
    const echo = P.mods && P.mods.echoLord;
    const radius = 8.6 * (echo ? 1.25 : 1);
    W.shockwave(new THREE.Vector3(P.pos.x, 0, P.pos.z), { color: 0xffb060, radius, dur: 0.7 });
    W.shockwave(new THREE.Vector3(P.pos.x, 0, P.pos.z), { color: 0x8fe8ff, radius: radius * 0.7, dur: 0.85 });
    W.emitBurst(new THREE.Vector3(P.pos.x, 1.2, P.pos.z), { count: 90, color: 0xffb060, speed: 15, size: 0.24, life: 1.0, gravity: 4, up: 0.7 });
    W.emitBurst(new THREE.Vector3(P.pos.x, 0.4, P.pos.z), { count: 40, color: 0x8fe8ff, speed: 10, size: 0.18, life: 0.8, gravity: 2 });
    W.flash(new THREE.Vector3(P.pos.x, 1.4, P.pos.z), 0xffe0b0, 9, 0.5);
    G.game.flashScreen(1.2);
    G.game.addShake(0.75);
    G.game.hitStop(0.09);
    G.game.setSlowmo(0.4, 0.55);
    G.game.addStyle(20);
    audio.sfx('shockwave');
    const dmg = 150 * (echo ? 1.25 : 1);
    let hit = 0;
    for (const e of D.enemies) {
      if (!e.alive) continue;
      const d = U.distXZ(e.pos, P.pos);
      if (d < radius + e.radius * 0.5) {
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        damageEnemy(e, dmg, { heavy: true, knockback: 16, dir: { x: dx / dl, z: dz / dl }, ult: true });
        hit++;
      }
    }
    if (hit > 0) G.game.addScore(150 * hit);
  }

  /* =========================================================
     玩家：主更新
     ========================================================= */
  function updatePlayer(dt) {
    P.t += dt;
    P.invuln = Math.max(0, P.invuln - dt);
    P.dodgeCd = Math.max(0, P.dodgeCd - dt);
    P.healCd = Math.max(0, P.healCd - dt);
    P.waveCd = Math.max(0, P.waveCd - dt);
    P.parryCd = Math.max(0, P.parryCd - dt);
    P.comboResetTimer = Math.max(0, P.comboResetTimer - dt);
    P.staminaDelay = Math.max(0, P.staminaDelay - dt);
    P.parryWindow = Math.max(0, P.parryWindow - dt);
    P.perfectBuffTimer = Math.max(0, P.perfectBuffTimer - dt);

    if (P.state !== 'dead' && P.staminaDelay <= 0) {
      const regen = 24 * ((P.mods && P.mods.staminaRegenMul) || 1);
      P.stamina = Math.min(P.maxStamina, P.stamina + regen * dt);
    }
    if (S.combo > 0) {
      S.comboTimer -= dt;
      if (S.comboTimer <= 0) { S.combo = 0; S.comboMult = 1; }
    }
    if (S.realTime - S.lastHitTime > 3.2 && P.state !== 'ult') {
      P.momentum = Math.max(0, P.momentum - 5 * dt);
    }
    /* 格挡：持续消耗体力，体力耗尽则架势崩溃 */
    if (P.state === 'block' && P.t > 0.25) {
      P.stamina -= 13 * dt;
      if (P.stamina <= 0) {
        P.stamina = 0;
        P.state = 'hurt';
        P.t = 0;
        P.parryCd = 1.6;
        P.parryWindow = 0;
        G.game.addShake(0.4);
        audio.sfx('guardBreak');
        if (G.hud) G.hud.msg('架 势 崩 溃', 'small');
      }
    }

    const keys = G.game.keys;
    const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    let moveX = 0, moveZ = 0, hasInput = false;
    if (ix || iz) {
      const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
      /* 屏幕右方 = (-cos yaw, 0, sin yaw)，修正左右方向 */
      const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
      moveX = fx * iz + rx * ix;
      moveZ = fz * iz + rz * ix;
      const l = Math.hypot(moveX, moveZ) || 1;
      moveX /= l; moveZ /= l;
      hasInput = true;
    }
    P.moveDir.set(moveX, 0, moveZ);

    let speedMul = 1;
    if (P.state === 'attack') speedMul = 0.12;
    else if (P.state === 'block') speedMul = 0.28;
    else if (P.state === 'cast' || P.state === 'heal') speedMul = 0.15;
    else if (P.state === 'dodge' || P.state === 'hurt' || P.state === 'ult' || P.state === 'dead') speedMul = 0;

    const targetSpeed = hasInput
      ? CFG.playerSpeed * speedMul * ((P.mods && P.mods.speedMul) || 1)
      : 0;
    P.moveSpeed = U.damp(P.moveSpeed, targetSpeed, 14, dt);
    if (hasInput && speedMul > 0) {
      P.pos.x += moveX * P.moveSpeed * dt;
      P.pos.z += moveZ * P.moveSpeed * dt;
    }

    /* 状态机 */
    switch (P.state) {
      case 'idle':
      case 'run':
        if (hasInput) {
          P.state = 'run';
          P.yaw = U.dampAngle(P.yaw, Math.atan2(moveX, moveZ), 14, dt);
        } else {
          P.state = 'idle';
          if (P.lockTarget && P.lockTarget.alive) {
            P.yaw = U.dampAngle(P.yaw, Math.atan2(P.lockTarget.pos.x - P.pos.x, P.lockTarget.pos.z - P.pos.z), 8, dt);
          }
        }
        break;
      case 'block':
        if (!P.blockHeld) { P.state = 'idle'; P.parryWindow = 0; }
        else if (P.lockTarget && P.lockTarget.alive) {
          P.yaw = U.dampAngle(P.yaw, Math.atan2(P.lockTarget.pos.x - P.pos.x, P.lockTarget.pos.z - P.pos.z), 10, dt);
        }
        break;
      case 'attack':
        updateAttack(dt);
        break;
      case 'dodge':
        updateDodge(dt);
        break;
      case 'hurt':
        if (P.t > 0.34) { P.state = 'idle'; P.t = 0; }
        break;
      case 'cast':
        if (!P.waveFired && P.t >= 0.12) { P.waveFired = true; spawnPlayerWave(); }
        if (P.t >= 0.42) {
          P.state = 'idle';
          if (P.buffered) { const b = P.buffered; P.buffered = null; startAttack(b); }
        }
        break;
      case 'heal':
        if (!P.healDone && P.t >= 0.3) {
          P.healDone = true;
          P.potions--;
          const amount = 40;
          P.hp = Math.min(P.maxHp, P.hp + amount);
          if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 1.9, P.pos.z), '+' + amount, 'heal');
          W.emitBurst(new THREE.Vector3(P.pos.x, 1.0, P.pos.z), { count: 22, color: 0x7dffb0, speed: 2.2, size: 0.1, life: 0.8, gravity: -1.5, up: 1.2 });
          audio.sfx('heal');
        }
        if (P.t >= 0.7) P.state = 'idle';
        break;
      case 'ult':
        if (!P.ultDone && P.t >= 0.42) { P.ultDone = true; doUltDamage(); }
        if (P.t >= 1.15) { P.state = 'idle'; P.t = 0; }
        break;
      case 'dead':
        P.deathT += dt;
        break;
      default:
        P.state = 'idle';
        break;
    }

    /* 击退 / 惯性 */
    if (P.knock.lengthSq() > 0.01) {
      P.pos.x += P.knock.x * dt;
      P.pos.z += P.knock.z * dt;
      P.knock.multiplyScalar(Math.pow(0.02, dt));
    } else P.knock.set(0, 0, 0);

    /* 场地边界 */
    const r = Math.hypot(P.pos.x, P.pos.z);
    if (r > CFG.arenaRadius) {
      P.pos.x = (P.pos.x / r) * CFG.arenaRadius;
      P.pos.z = (P.pos.z / r) * CFG.arenaRadius;
    }
    P.model.root.position.copy(P.pos);
    P.model.root.rotation.y = P.yaw;
  }

  /* =========================================================
     玩家：动画
     ========================================================= */
  const _tip = new THREE.Vector3();
  const _base = new THREE.Vector3();
  const _pose = {};

  function blendPose(from, to, k, out) {
    out = out || {};
    for (const key in NEUTRAL) {
      const a = from[key] != null ? from[key] : NEUTRAL[key];
      const b = to[key] != null ? to[key] : NEUTRAL[key];
      out[key] = a + (b - a) * k;
    }
    return out;
  }

  function applyPose(m, pose, lambda, dt) {
    const d = (cur, target) => U.damp(cur, target, lambda, dt);
    m.armR.shoulder.rotation.x = d(m.armR.shoulder.rotation.x, pose.rx);
    m.armR.shoulder.rotation.y = d(m.armR.shoulder.rotation.y, pose.ry);
    m.armR.shoulder.rotation.z = d(m.armR.shoulder.rotation.z, pose.rz);
    m.armR.elbow.rotation.x = d(m.armR.elbow.rotation.x, pose.erx);
    m.armL.shoulder.rotation.x = d(m.armL.shoulder.rotation.x, pose.lx);
    m.armL.shoulder.rotation.y = d(m.armL.shoulder.rotation.y, pose.ly);
    m.armL.shoulder.rotation.z = d(m.armL.shoulder.rotation.z, pose.lz);
    m.armL.elbow.rotation.x = d(m.armL.elbow.rotation.x, pose.elx);
    m.torso.rotation.y = d(m.torso.rotation.y, pose.torsoY);
    m.torso.rotation.x = d(m.torso.rotation.x, pose.torsoX);
    m.torso.rotation.z = d(m.torso.rotation.z, pose.torsoZ);
    m.hips.position.y = d(m.hips.position.y, 0.94 + pose.hipY);
    m.head.rotation.x = d(m.head.rotation.x, pose.headX);
    m.head.rotation.y = d(m.head.rotation.y, pose.headY);
    m.sword.rotation.z = d(m.sword.rotation.z, pose.swordZ);
  }

  function animatePlayer(dt, time, titleOnly) {
    if (!P.model) return;
    const m = P.model;
    const t = time;
    if (titleOnly) {
      /* 标题展示：持剑站立、呼吸 */
      const breathe = Math.sin(t * 1.6) * 0.012;
      const pose = {
        ry: 0.05 + Math.sin(t * 0.5) * 0.03, rx: -0.2 + breathe * 2, rz: -0.16, erx: -0.38,
        ly: -0.04, lx: -0.12, lz: 0.14, elx: -0.3,
        torsoY: Math.sin(t * 0.4) * 0.04, torsoX: 0.015 + breathe, torsoZ: 0, hipY: breathe,
        headX: 0.02, headY: Math.sin(t * 0.32) * 0.12, swordZ: 0.02, swordX: 0,
      };
      applyPose(m, pose, 6, dt);
      m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, 0.02, 5, dt);
      m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, -0.02, 5, dt);
      m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, 0.04, 5, dt);
      m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, 0.04, 5, dt);
      m.capeSegs.forEach((p, i) => {
        p.rotation.x = U.damp(p.rotation.x, 0.18 + Math.sin(t * 1.4 + i * 0.7) * 0.06, 4, dt);
      });
      m.root.position.copy(P.pos);
      m.root.rotation.y = P.yaw;
      m.visual.position.set(0, 0, 0);
      m.visual.rotation.set(0, 0, 0);
      m.visual.scale.set(1, 1, 1);
      if (P.trail) P.trail.update(_tip, _base, 0);
      return;
    }

    let strength = 0;
    const state = P.state;

    if (state === 'attack' && P.attack) {
      const def = P.attack.def;
      let pose;
      const neu = NEUTRAL;
      if (P.t < def.windup) {
        const k = U.easeOutCubic(U.clamp01(P.t / def.windup));
        pose = blendPose(neu, def.windPose, k);
      } else if (P.t < def.windup + def.active) {
        const k = U.easeOutQuart(U.clamp01((P.t - def.windup) / def.active));
        pose = blendPose(def.windPose, def.hitPose, k);
      } else {
        const k = U.easeInOutCubic(U.clamp01((P.t - def.windup - def.active) / Math.max(0.01, def.duration - def.windup - def.active)));
        pose = blendPose(def.hitPose, neu, k);
      }
      const quick = 60;
      applyPose(m, pose, quick, dt);
      /* 腿 */
      const lungeK = P.attack.step === 3 || P.attack.kind === 'heavy' ? 1 : 0.55;
      m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, -0.35 * lungeK, 30, dt);
      m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, 0.4 * lungeK, 30, dt);
      m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, 0.5, 30, dt);
      m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, 0.15, 30, dt);
      m.visual.position.y = 0;
      m.visual.rotation.x = 0;
      strength = (P.t > def.windup * 0.55 && P.t < def.windup + def.active + 0.06) ? 1 : 0;
    } else if (state === 'dodge') {
      /* 收身翻滚：绕身体中心旋转并抬升，任何角度都不穿入地面 */
      const k = U.clamp01(P.t / 0.42);
      const angle = k * Math.PI * 2;
      const squash = 1 - 0.42 * Math.sin(k * Math.PI); /* 1 → 0.58 → 1 */
      const L = 1.9 * squash;
      /* 抬升补偿：主体绕中轴翻滚 + 侧向饰件额外离地量，保证所有可见 Mesh 不穿地 */
      const lift = L * Math.sin(angle / 2) + 0.95 * Math.abs(Math.sin(angle));
      m.visual.rotation.x = angle;
      m.visual.position.y = lift;
      m.visual.scale.set((1 + (1 - squash) * 0.22) * 0.9, squash, (1 + (1 - squash) * 0.22) * 0.9);
      /* 翻滚中段收剑，避免长剑刃在翻转时扫入地面 */
      if (m.sword) m.sword.visible = !(P.t > 0.045 && P.t < 0.39);
      const pose = Object.assign({}, NEUTRAL, {
        rx: -1.9, erx: -1.35, lx: -1.7, elx: -1.35, torsoX: 0.55, hipY: -0.12,
        headX: -0.25, headY: 0,
      });
      applyPose(m, pose, 30, dt);
      m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, 1.5, 26, dt);
      m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, 1.3, 26, dt);
      m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, 2.0, 26, dt);
      m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, 1.8, 26, dt);
      strength = 0.4;
      /* 尘土/残影 */
      if (Math.random() < 0.5) {
        W.emitParticle(P.pos.x + U.rand(-0.3, 0.3), 0.12, P.pos.z + U.rand(-0.3, 0.3),
          U.rand(-0.4, 0.4), U.rand(0.3, 1.0), U.rand(-0.4, 0.4), 0x9fb6c8, 0.09, 0.5, 0.92, 1.6);
      }
    } else if (state === 'hurt') {
      const k = U.clamp01(P.t / 0.2);
      const pose = Object.assign({}, NEUTRAL, {
        torsoX: -0.3 + k * 0.25, torsoY: 0.2, headX: -0.25, rx: -0.5, erx: -0.7, lx: -0.7, elx: -0.9,
      });
      applyPose(m, pose, 24, dt);
      m.visual.position.y = 0;
      m.visual.rotation.x = 0;
    } else if (state === 'block') {
      const pose = Object.assign({}, NEUTRAL, {
        rx: -1.4, ry: 0.55, rz: 0.22, erx: -1.3,
        lx: -1.2, ly: -0.35, lz: -0.3, elx: -1.4,
        torsoY: -0.2, torsoX: 0.08, hipY: -0.05, headX: 0.06, swordZ: 0.6,
      });
      applyPose(m, pose, 22, dt);
      m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, -0.22, 18, dt);
      m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, 0.26, 18, dt);
      m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, 0.35, 18, dt);
      m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, 0.2, 18, dt);
      m.visual.position.y = 0;
      m.visual.rotation.x = 0;
      strength = 0.15;
    } else if (state === 'cast') {
      const k = U.clamp01(P.t / 0.42);
      const pose = Object.assign({}, NEUTRAL, {
        rx: -1.25, ry: 0.1, rz: 0.15, erx: -0.05, torsoY: -0.4, torsoX: 0.05,
        lx: -0.6, ly: 0.4, lz: 0.4, elx: -0.8, hipY: -0.03,
      });
      applyPose(m, pose, 32, dt);
      strength = k < 0.5 ? 1 : 0.5;
    } else if (state === 'heal') {
      const pose = Object.assign({}, NEUTRAL, {
        rx: -0.35, erx: -1.6, lx: -1.1, ly: 0.5, lz: 0.5, elx: -1.7,
        torsoX: 0.24, hipY: -0.1, headX: 0.2,
      });
      applyPose(m, pose, 16, dt);
      /* 绿色余烬 */
      if (Math.random() < 0.5) {
        W.emitParticle(P.pos.x + U.rand(-0.4, 0.4), P.pos.y + U.rand(0.3, 1.6), P.pos.z + U.rand(-0.4, 0.4),
          U.rand(-0.2, 0.2), U.rand(0.6, 1.4), U.rand(-0.2, 0.2), 0x7dffb0, 0.06, 0.6, 0.98, -1);
      }
    } else if (state === 'ult') {
      const raise = P.t < 0.38;
      let pose;
      if (raise) {
        const k = U.easeOutCubic(U.clamp01(P.t / 0.38));
        pose = blendPose(NEUTRAL, {
          rx: -3.0, ry: -0.1, rz: -0.25, erx: -0.35, torsoX: -0.16, torsoY: 0.1, hipY: 0.03,
          lx: -2.9, ly: -0.15, lz: 0.2, elx: -0.4,
        }, k);
      } else {
        const k = U.easeOutQuart(U.clamp01((P.t - 0.38) / 0.16));
        pose = blendPose({
          rx: -3.0, ry: -0.1, rz: -0.25, erx: -0.35, torsoX: -0.16, torsoY: 0.1, hipY: 0.03,
          lx: -2.9, ly: -0.15, lz: 0.2, elx: -0.4,
        }, {
          rx: -0.45, ry: 0, rz: 0.05, erx: -0.05, torsoX: 0.42, torsoY: 0, hipY: -0.08,
          lx: -0.4, ly: 0, lz: 0.1, elx: -0.1,
        }, k);
      }
      applyPose(m, pose, 40, dt);
      strength = 1;
    } else if (state === 'dead') {
      const k = U.clamp01(P.deathT / 0.9);
      m.visual.rotation.x = U.damp(m.visual.rotation.x, -Math.PI * 0.48 * U.easeOutCubic(k), 6, dt);
      m.visual.position.y = U.damp(m.visual.position.y, -0.1 * k, 6, dt);
      const pose = Object.assign({}, NEUTRAL, { rx: 0.3, rz: 0.2, erx: -0.1, lx: 0.4, lz: -0.3, elx: -0.1 });
      applyPose(m, pose, 5, dt);
    } else {
      /* idle / run */
      const moving = state === 'run' && P.moveSpeed > 0.4;
      const spd = U.clamp01(P.moveSpeed / CFG.playerSpeed);
      const phase = t * 9.5 * (0.5 + spd * 0.7);
      const breathe = Math.sin(t * 2.1) * 0.012;
      let pose;
      if (moving) {
        pose = Object.assign({}, NEUTRAL, {
          torsoX: 0.1 + spd * 0.08, torsoY: Math.sin(phase) * 0.07,
          rx: -0.2 - Math.sin(phase) * 0.5 * spd, ry: 0, rz: -0.18,
          erx: -0.45, lx: -0.1 + Math.sin(phase) * 0.55 * spd, ly: 0,
          hipY: Math.abs(Math.sin(phase)) * 0.055 * spd + breathe,
          headX: -0.04, headY: -Math.sin(phase) * 0.06,
        });
        m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, Math.sin(phase) * 0.72 * spd, 16, dt);
        m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, -Math.sin(phase) * 0.72 * spd, 16, dt);
        m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, Math.max(0, -Math.sin(phase)) * 0.95 * spd, 16, dt);
        m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, Math.max(0, Math.sin(phase)) * 0.95 * spd, 16, dt);
      } else {
        pose = Object.assign({}, NEUTRAL, {
          torsoX: 0.02 + breathe, torsoY: Math.sin(t * 0.55) * 0.035,
          rx: -0.14 + breathe, rz: -0.12, erx: -0.34,
          lx: -0.08 - breathe * 0.5, lz: 0.1, elx: -0.28,
          hipY: breathe, headX: 0.01, headY: Math.sin(t * 0.4) * 0.1,
        });
        m.legL.hip.rotation.x = U.damp(m.legL.hip.rotation.x, 0.02, 7, dt);
        m.legR.hip.rotation.x = U.damp(m.legR.hip.rotation.x, -0.02, 7, dt);
        m.legL.knee.rotation.x = U.damp(m.legL.knee.rotation.x, 0.05, 7, dt);
        m.legR.knee.rotation.x = U.damp(m.legR.knee.rotation.x, 0.05, 7, dt);
      }
      applyPose(m, pose, 10, dt);
      m.visual.position.y = U.damp(m.visual.position.y, 0, 12, dt);
      m.visual.rotation.x = U.damp(m.visual.rotation.x, 0, 12, dt);
      m.visual.scale.y = U.damp(m.visual.scale.y, 1, 12, dt);
    }

    /* 非翻滚状态：平滑归位（防止翻滚后的旋转/缩放残留） */
    if (state !== 'dodge') {
      if (m.sword && !m.sword.visible) m.sword.visible = true;
    }
    if (state !== 'dodge' && state !== 'dead') {
      /* 角度归一化：避免从 2π 反向插值回 0 时穿地 */
      if (m.visual.rotation.x > Math.PI) m.visual.rotation.x -= Math.PI * 2;
      else if (m.visual.rotation.x < -Math.PI) m.visual.rotation.x += Math.PI * 2;
      m.visual.position.y = U.damp(m.visual.position.y, 0, 14, dt);
      m.visual.rotation.x = U.damp(m.visual.rotation.x, 0, 14, dt);
      m.visual.scale.x = U.damp(m.visual.scale.x, 1, 12, dt);
      m.visual.scale.z = U.damp(m.visual.scale.z, 1, 12, dt);
      if (state !== 'idle' && state !== 'run') {
        m.visual.scale.y = U.damp(m.visual.scale.y, 1, 12, dt);
      }
    }

    /* 披风飘动 */
    m.capeSegs.forEach((p, i) => {
      const flutter = Math.sin(t * 3.4 + i * 1.1) * 0.07 + P.moveSpeed * 0.035;
      const target = 0.2 + flutter + (state === 'dodge' ? 0.7 : 0);
      p.rotation.x = U.damp(p.rotation.x, target, 6, dt);
    });
    /* 飘带 */
    m.ribbon.children.forEach((p, i) => {
      p.rotation.z = Math.sin(t * 2.6 + i * 0.9) * 0.16;
    });
    /* 剑刃辉光 */
    const perfectGlow = P.perfectBuffTimer > 0 ? 0.35 : 0;
    m.bladeGlow.material.opacity = 0.4 + (state === 'attack' || state === 'ult' ? 0.5 : 0.08) + perfectGlow + Math.sin(t * 7) * 0.06;
    m.bladeGlow.material.color.setHex(P.perfectBuffTimer > 0 ? 0x9fe8ff : 0xff7a30);
    m.swordLight.intensity = (state === 'attack' || state === 'ult' || state === 'block') ? 1.8 : 1.0;
    m.swordLight.color.setHex(P.perfectBuffTimer > 0 ? 0x9fe8ff : 0xff6a28);
    /* 无敌闪烁 */
    m.visual.visible = !(P.invuln > 0 && P.state !== 'dodge' && Math.floor(t * 24) % 2 === 0);

    m.root.position.copy(P.pos);
    m.root.rotation.y = P.yaw;

    /* 刀光拖尾 */
    if (P.trail) {
      if (strength > 0.01) {
        m.sword.updateWorldMatrix(true, false);
        _tip.set(0, 1.2, 0).applyMatrix4(m.sword.matrixWorld);
        _base.set(0, 0.16, 0).applyMatrix4(m.sword.matrixWorld);
      }
      P.trail.update(_tip, _base, strength);
    }
  }

  /* =========================================================
     敌人：生成 / 更新 / 动画
     ========================================================= */
  function createEnemy(type, x, z, opts) {
    opts = opts || {};
    const def = ENEMY_TYPES[type];
    const model = W.enemyFactory[type]();
    const group = model.root;
    group.position.set(x, -2.5, z);
    group.scale.setScalar(0.75);
    let hpMul = opts.hpMul || 1;
    let dmgMul = opts.dmgMul || 1;
    let scoreMul = opts.scoreMul || 1;
    let elite = false, eliteKind = null, eliteCfg = null;
    if (opts.elite && type !== 'boss') {
      elite = true;
      eliteKind = opts.eliteKind || U.choice(['swift', 'shield', 'fury']);
      eliteCfg = ELITE_KINDS[eliteKind] || ELITE_KINDS.swift;
      hpMul *= eliteCfg.hpMul;
      dmgMul *= eliteCfg.dmgMul;
      scoreMul *= 2;
    }
    const maxHp = Math.round(def.maxHp * hpMul);
    const e = {
      id: D.enemyId++,
      type, def, model, group,
      pos: group.position,
      yaw: Math.atan2(-x, -z),
      hp: maxHp, maxHp, radius: def.radius,
      dmg: def.damage * dmgMul,
      score: Math.round(def.score * scoreMul),
      alive: true, active: false,
      state: 'spawn', t: 0,
      cooldown: U.rand(0.5, 1.3),
      tele: null, teleFade: 0, tele2: [],
      flash: 0, flashOn: false,
      knock: new THREE.Vector3(),
      phase: U.rand(0, Math.PI * 2),
      attackKind: null, strikeIdx: 0, shots: 0, shotTimer: 0,
      summonFlags: {},
      enraged: false, speedMul: elite ? eliteCfg.spdMul : 1,
      deathT: 0, dissolve: false,
      baseY: 0,
      vuln: 1,
      elite, eliteKind, eliteCfg,
      shieldHits: (elite && eliteCfg.shield) ? 1 : 0,
      executable: false,
      burnTime: 0, burnDps: 0, burnTick: 0,
      phase2: false, stunTimer: 0,
      finalScale: elite ? 1.12 : 1,
      guaranteedDrop: elite,
      lastDmgFromPlayer: 0,
      dmgScale: dmgMul,
      phaseT: 0,
      rainRings: null,
      chargeTimer: 0,
      auraPhase: U.rand(0, 6),
    };
    if (elite) {
      const base = type === 'golem' ? 2.8 : 2.0;
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({
        map: W.makeGlowTexture(64), color: eliteCfg.color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      aura.scale.set(base, base, 1);
      aura.position.y = type === 'golem' ? 1.4 : 0.9;
      group.add(aura);
      e.aura = aura;
      e.auraBase = base;
    }
    group.rotation.y = e.yaw;
    W.scene.add(group);
    W.portal(new THREE.Vector3(x, 0, z), elite && eliteCfg ? eliteCfg.color : def.portal);
    D.enemies.push(e);
    if (type === 'boss') {
      D.boss = e;
      e.baseY = 0;
      e.bossHpScale = opts.bossHpScale || 1;
      e.maxHp = Math.round(def.maxHp * (opts.bossHpScale || 1));
      e.hp = e.maxHp;
    }
    return e;
  }

  function disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh || o.isSprite || o.isPoints) {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) { } }
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m && m.dispose) { try { m.dispose(); } catch (e) { } }
          });
        }
      }
    });
  }

  function killTele(e, flash) {
    if (e.tele) {
      if (flash && e.tele.flash) {
        e.tele.flash();
        const t = e.tele;
        setTimeout(() => { try { t.remove(); } catch (err) { } }, 110);
      } else {
        e.tele.remove();
      }
      e.tele = null;
    }
    if (e.tele2 && e.tele2.length) {
      e.tele2.forEach(t => {
        if (flash && t && t.flash) {
          try { t.flash(); } catch (err) { }
          setTimeout(() => { try { t.remove(); } catch (err) { } }, 110);
        } else {
          try { t.remove(); } catch (err) { }
        }
      });
      e.tele2 = null;
    }
  }

  function updateTele(e) {
    if (e.tele) {
      if (e.tele.setPos && !e.teleFixed) e.tele.setPos(e.pos);
      if (e.tele.setYaw) e.tele.setYaw(e.yaw);
      if (e.tele.setProgress) e.tele.setProgress(U.clamp01(e.t / Math.max(0.01, e.windupDur || 0.6)));
    }
    if (e.tele2 && e.tele2.length) {
      const p = U.clamp01(e.t / Math.max(0.01, e.windupDur || 0.6));
      e.tele2.forEach(t => { if (t && t.setProgress) t.setProgress(p); });
    }
  }

  function moveEnemy(e, dx, dz, speed, dt) {
    if (dx === 0 && dz === 0) return;
    const l = Math.hypot(dx, dz) || 1;
    e.pos.x += (dx / l) * speed * dt;
    e.pos.z += (dz / l) * speed * dt;
  }

  function setEnemyState(e, state) {
    e.state = state;
    e.t = 0;
  }

  function aliveCount() {
    let n = 0;
    for (const e of D.enemies) if (e.alive) n++;
    return n;
  }

  /* ---- 蚀影 ---- */
  function updateWraith(e, dt) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.t += dt;
    e.cooldown -= dt;

    if (e.state === 'stagger') {
      if (e.t > 0.45) setEnemyState(e, 'chase');
      return;
    }
    switch (e.state) {
      case 'chase': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 6, dt);
        if (dist > 2.1) moveEnemy(e, dx, dz, e.def.speed * e.speedMul, dt);
        else {
          /* 环绕 */
          const ang = e.phase + S.time * 0.9;
          moveEnemy(e, -dz * Math.sin(ang) * 0.4, dx * Math.sin(ang) * 0.4, 1.4, dt);
        }
        if (dist < 2.75 && e.cooldown <= 0) {
          setEnemyState(e, 'windup');
          e.windupDur = 0.55;
          e.windPose = { rx: -0.4 };
          e.tele = W.telegraphSector(new THREE.Vector3(e.pos.x, 0, e.pos.z), e.yaw, 3.0, 1.0, 0xff2f7a);
          audio.sfx('teleport');
        }
        break;
      }
      case 'windup': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 5, dt);
        updateTele(e);
        if (e.t >= e.windupDur) {
          killTele(e, true);
          setEnemyState(e, 'strike');
          const fwd = U.dirFromYaw(e.yaw, TMP);
          e.knock.x += fwd.x * 9;
          e.knock.z += fwd.z * 9;
          W.slashArc(new THREE.Vector3(e.pos.x, 1.0, e.pos.z), e.yaw, {
            radius: 2.6, halfArc: 0.9, color: 0xff4f8a, dur: 0.22,
          });
          if (dist < 3.0 && U.inCone(e.pos.x, e.pos.z, e.yaw, dx, dz, dist, 1.2)) {
            damagePlayer(e.dmg, e.pos, e);
          }
          audio.sfx('swing');
        }
        break;
      }
      case 'strike': {
        if (dist < 3.1 && !e.struck) {
          e.struck = true;
        }
        if (e.t > 0.24) { e.struck = false; setEnemyState(e, 'recover'); e.windupDur = 0.65; }
        break;
      }
      case 'recover': {
        if (e.t > 0.62) {
          setEnemyState(e, 'chase');
          e.cooldown = U.rand(e.def.attackCd[0], e.def.attackCd[1]);
        }
        break;
      }
      default:
        setEnemyState(e, 'chase');
    }
  }

  /* ---- 石卫 ---- */
  function updateGolem(e, dt) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.t += dt;
    e.cooldown -= dt;

    if (e.state === 'stagger') {
      if (e.t > 0.32) setEnemyState(e, 'chase');
      return;
    }
    switch (e.state) {
      case 'chase': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 3.5, dt);
        if (dist > 2.9) moveEnemy(e, dx, dz, e.def.speed * e.speedMul, dt);
        if (dist < 3.9 && e.cooldown <= 0) {
          setEnemyState(e, 'windup');
          e.windupDur = 0.95;
          e.tele = W.telegraphRing(new THREE.Vector3(e.pos.x, 0, e.pos.z), 4.0, 0xff2a1a);
          audio.sfx('roar');
        }
        break;
      }
      case 'windup': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 2.5, dt);
        updateTele(e);
        if (e.t >= e.windupDur) {
          killTele(e, true);
          setEnemyState(e, 'strike');
          W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff6a3a, radius: 3.7, dur: 0.45 });
          W.emitBurst(new THREE.Vector3(e.pos.x, 0.2, e.pos.z), { count: 30, color: 0xff8a50, speed: 7, size: 0.16, life: 0.55, gravity: 6, up: 0.8 });
          G.game.addShake(0.3);
          audio.sfx('shockwave');
          if (dist < 4.0) damagePlayer(e.dmg, e.pos, e);
        }
        break;
      }
      case 'strike': {
        if (e.t > 0.55) { setEnemyState(e, 'recover'); }
        break;
      }
      case 'recover': {
        if (e.t > 1.15) {
          setEnemyState(e, 'chase');
          e.cooldown = U.rand(e.def.attackCd[0], e.def.attackCd[1]);
        }
        break;
      }
      default:
        setEnemyState(e, 'chase');
    }
  }

  /* ---- 咒眼 ---- */
  function updateHexer(e, dt) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.t += dt;
    e.cooldown -= dt;

    if (e.state === 'stagger') {
      if (e.t > 0.4) setEnemyState(e, 'chase');
      return;
    }
    switch (e.state) {
      case 'chase': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 4, dt);
        if (dist < 8.5) moveEnemy(e, -dx, -dz, e.def.speed, dt);
        else if (dist > 13.5) moveEnemy(e, dx, dz, e.def.speed, dt);
        else {
          const ang = e.phase + S.time * 0.7;
          moveEnemy(e, -dz * Math.sin(ang) * 0.3, dx * Math.sin(ang) * 0.3, 1.2, dt);
        }
        if (dist > 5 && dist < 16 && e.cooldown <= 0) {
          setEnemyState(e, 'windup');
          e.windupDur = 0.65;
          e.teleFixed = true;
          e.tele = W.telegraphRing(new THREE.Vector3(P.pos.x, 0, P.pos.z), 1.5, 0xb44dff);
          audio.sfx('teleport');
        }
        break;
      }
      case 'windup': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 4, dt);
        updateTele(e);
        if (e.t >= e.windupDur) {
          killTele(e);
          setEnemyState(e, 'strike');
          e.shots = 3;
          e.shotTimer = 0;
        }
        break;
      }
      case 'strike': {
        e.shotTimer -= dt;
        if (e.shots > 0 && e.shotTimer <= 0) {
          e.shots--;
          e.shotTimer = 0.14;
          fireHexerBolt(e);
        }
        if (e.shots <= 0 && e.t > 0.5) { setEnemyState(e, 'recover'); }
        break;
      }
      case 'recover': {
        if (e.t > 1.0) {
          setEnemyState(e, 'chase');
          e.cooldown = U.rand(e.def.attackCd[0], e.def.attackCd[1]);
        }
        break;
      }
      default:
        setEnemyState(e, 'chase');
    }
  }

  function fireHexerBolt(e) {
    const origin = new THREE.Vector3(e.pos.x, 1.75, e.pos.z);
    const target = new THREE.Vector3(P.pos.x, 1.0, P.pos.z);
    const dir = target.sub(origin).normalize();
    dir.x += U.rand(-0.045, 0.045);
    dir.z += U.rand(-0.045, 0.045);
    dir.normalize();
    const group = W.createProjectileMesh(0xb44dff, 0.4);
    group.position.copy(origin);
    W.scene.add(group);
    D.projectiles.push({
      group, pos: group.position, dir, speed: 14, damage: e.dmg, radius: 0.6,
      life: 3.5, owner: 'enemy', hit: false,
    });
    W.emitBurst(origin, { count: 8, color: 0xc06bff, speed: 2.5, size: 0.1, life: 0.4, gravity: 0 });
    audio.sfx('cast');
  }

  /* ---- Boss ---- */
  function updateBoss(e, dt) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.t += dt;
    e.cooldown -= dt;
    e.stunTimer = Math.max(0, (e.stunTimer || 0) - dt);

    /* 50%：进入回响形态（二阶段） */
    if (!e.phase2 && e.hp <= e.maxHp * 0.5 && e.state !== 'spawn' && e.state !== 'transition') {
      startBossPhase2(e);
    }
    /* 25%：终焉狂怒 */
    if (!e.enraged && e.hp < e.maxHp * 0.25 && e.state !== 'spawn' && e.state !== 'transition') {
      e.enraged = true;
      e.speedMul = 1.3;
      e.windMul = 0.78;
      W.emitBurst(new THREE.Vector3(e.pos.x, 2.5, e.pos.z), { count: 60, color: 0xff3020, speed: 9, size: 0.2, life: 1, gravity: 6, up: 1 });
      G.game.addShake(0.45);
      audio.sfx('roar');
      if (G.hud) G.hud.msg('终 焉 形 态', 'small');
    }

    switch (e.state) {
      case 'transition': {
        e.phaseT += dt;
        W.emitBurst(new THREE.Vector3(e.pos.x, 1.5 + Math.random() * 2.5, e.pos.z), {
          count: 5, color: Math.random() < 0.5 ? 0xff3a20 : 0x9a3050,
          speed: U.rand(3, 9), size: 0.18, life: 0.8, gravity: 2, up: 1,
        });
        if (e.phaseT > 1.9) {
          e.state = 'chase';
          e.t = 0;
          e.cooldown = 0.8;
        }
        break;
      }
      case 'chase': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 2.6, dt);
        if (dist > 5.2) moveEnemy(e, dx, dz, e.def.speed * e.speedMul, dt);
        else if (e.cooldown > 0) {
          const ang = e.phase + S.time * 0.5;
          moveEnemy(e, -dz * Math.sin(ang) * 0.25, dx * Math.sin(ang) * 0.25, 1.2, dt);
        }
        if (e.cooldown <= 0 && dist < 11.5) chooseBossAttack(e, dist);
        break;
      }
      case 'windup': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 1.8, dt);
        updateTele(e);
        if (e.t >= e.windupDur) {
          killTele(e, true);
          startBossAttack(e);
        }
        break;
      }
      case 'attack': {
        e.attackT += dt;
        updateBossAttack(e, e.attackT, dt);
        break;
      }
      case 'recover': {
        if (e.t > e.recoverDur && e.stunTimer <= 0) {
          setEnemyState(e, 'chase');
          e.cooldown = e.enraged ? 1.3 : (e.phase2 ? 1.7 : 2.1);
        }
        break;
      }
      default:
        setEnemyState(e, 'chase');
    }
  }

  function clearBossRain(e) {
    if (e.rainRings) {
      e.rainRings.forEach(r => { try { r.remove(); } catch (err) { } });
      e.rainRings = null;
    }
  }

  function startBossPhase2(e) {
    e.phase2 = true;
    e.state = 'transition';
    e.t = 0;
    e.phaseT = 0;
    killTele(e);
    clearBossRain(e);
    e.summonFlags = {};
    e.stunTimer = 0;
    e.invulnUntil = S.time + 1.9;
    W.setCrimson(true);
    audio.setMusicMode('boss2');
    audio.sfx('bossPhase');
    G.game.addShake(0.8);
    G.game.flashScreen(0.8);
    G.game.setSlowmo(0.4, 0.9);
    G.game.addStyle(10);
    W.emitBurst(new THREE.Vector3(e.pos.x, 2.6, e.pos.z), { count: 110, color: 0xff3a20, speed: 15, size: 0.28, life: 1.6, gravity: 2.5, up: 1 });
    W.emitBurst(new THREE.Vector3(e.pos.x, 0.4, e.pos.z), { count: 60, color: 0xffb060, speed: 10, size: 0.2, life: 1.2, gravity: 3, up: 0.6 });
    W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff3020, radius: 14, dur: 0.9 });
    W.flash(new THREE.Vector3(e.pos.x, 2.6, e.pos.z), 0xff5a30, 12, 0.9);
    if (G.hud) {
      G.hud.msg('无 面 守 望 者 · 回 响 形 态', 'big violet');
      G.hud.msg('它 记 起 了 你 的 剑', 'small');
    }
  }

  function chooseBossAttack(e, dist) {
    const hpF = e.hp / e.maxHp;
    let kind;
    if (e.phase2) {
      if (hpF <= 0.25 && !e.summonFlags.p2s) { kind = 'summon'; e.summonFlags.p2s = true; }
      else if (dist > 9) kind = Math.random() < 0.5 ? 'swordrain' : 'charge';
      else if (dist > 5) kind = Math.random() < 0.35 ? 'charge' : (Math.random() < 0.42 ? 'swordrain' : (Math.random() < 0.5 ? 'shock3' : 'sweep3'));
      else kind = Math.random() < 0.42 ? 'shock3' : (Math.random() < 0.5 ? 'sweep3' : 'overhead');
    } else {
      if (hpF <= 0.66 && !e.summonFlags.s1) { kind = 'summon'; e.summonFlags.s1 = true; }
      else if (dist > 8.5) kind = 'slam';
      else if (dist > 5.5) kind = Math.random() < 0.55 ? 'slam' : 'sweep3';
      else kind = Math.random() < 0.58 ? 'sweep3' : 'overhead';
    }

    e.attackKind = kind;
    setEnemyState(e, 'windup');
    e.teleFixed = false;
    const windBase = {
      sweep3: 0.85, overhead: 0.95, slam: 1.25, summon: 1.55,
      swordrain: 1.2, shock3: 1.05, charge: 0.75,
    }[kind] || 1;
    e.windupDur = windBase * (e.enraged ? e.windMul : 1);
    e.strikeIdx = 0;
    e.tele2 = [];
    if (kind === 'sweep3') {
      e.tele = W.telegraphSector(new THREE.Vector3(e.pos.x, 0, e.pos.z), e.yaw, 6.6, 1.25, 0xff3020);
    } else if (kind === 'overhead') {
      e.tele = W.telegraphSector(new THREE.Vector3(e.pos.x, 0, e.pos.z), e.yaw, 7.2, 0.55, 0xff3020);
    } else if (kind === 'slam') {
      e.tele = W.telegraphRing(new THREE.Vector3(e.pos.x, 0, e.pos.z), 11, 0xff4020);
    } else if (kind === 'swordrain') {
      e.teleFixed = true;
      e.tele = W.telegraphRing(new THREE.Vector3(P.pos.x, 0, P.pos.z), 2.9, 0xff4020);
      e.tele2 = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + U.rand(0, 0.5);
        const r = U.rand(2.4, 5.0);
        const pos = new THREE.Vector3(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r);
        e.tele2.push(W.telegraphRing(pos, 2.9, 0xff6020));
      }
    } else if (kind === 'shock3') {
      e.tele = W.telegraphRing(new THREE.Vector3(e.pos.x, 0, e.pos.z), 12, 0xff4020);
    } else if (kind === 'charge') {
      e.tele = W.telegraphSector(new THREE.Vector3(e.pos.x, 0, e.pos.z), e.yaw, 13, 0.34, 0xff4020);
    } else {
      e.tele = W.telegraphRing(new THREE.Vector3(e.pos.x, 0, e.pos.z), 5, 0xb44dff);
    }
    audio.sfx('roar');
  }

  function startBossAttack(e) {
    setEnemyState(e, 'attack');
    e.attackT = 0;
    e.strikeIdx = 0;
    e.struck = {};
    e.dashDir = null;
    if (e.tele2 && e.tele2.length) {
      e.tele2.forEach(t => { if (t) t.setProgress(1); });
    }
    if (e.attackKind === 'summon' || e.attackKind === 'swordrain') {
      audio.sfx(e.attackKind === 'swordrain' ? 'swordRain' : 'bossStart');
    }
    if (e.attackKind === 'swordrain') {
      /* 剑雨预警圈立即完成并移除 */
      if (e.tele2) {
        e.tele2.forEach(t => { if (t) { try { t.setProgress(1); t.remove(); } catch (err) { } } });
        e.tele2 = null;
      }
    }
  }

  function bossConeHit(e, range, halfArc, dmg, shake) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const realDmg = dmg * (e.dmgScale || 1);
    if (dist <= range && U.inCone(e.pos.x, e.pos.z, e.yaw, dx, dz, dist, halfArc)) {
      damagePlayer(realDmg, e.pos, e);
      G.game.addShake(shake || 0.35);
      G.game.hitStop(0.05);
    }
    W.slashArc(new THREE.Vector3(e.pos.x, 1.6, e.pos.z), e.yaw, {
      radius: range, halfArc, color: 0xff3a25, dur: 0.3, tilt: 0.15,
    });
    W.emitDirectional(new THREE.Vector3(e.pos.x, 2, e.pos.z), U.dirFromYaw(e.yaw, new THREE.Vector3()), {
      count: 18, color: 0xff5a3a, speed: 9, size: 0.16, life: 0.45,
    });
    audio.sfx('swingHeavy');
  }

  function updateBossAttack(e, t, dt) {
    const kind = e.attackKind;
    const sc = e.dmgScale || 1;
    if (kind === 'sweep3') {
      const times = [0.05, 0.38, 0.72];
      while (e.strikeIdx < 3 && t >= times[e.strikeIdx] * (e.enraged ? 0.85 : 1)) {
        const fwd = U.dirFromYaw(e.yaw, TMP);
        if (e.strikeIdx > 0) { e.pos.x += fwd.x * 0.5; e.pos.z += fwd.z * 0.5; }
        bossConeHit(e, 6.6, 1.25, 16, 0.28);
        e.strikeIdx++;
      }
      if (t >= 1.15) { setEnemyState(e, 'recover'); e.recoverDur = 1.15; }
    } else if (kind === 'overhead') {
      if (e.strikeIdx < 1 && t >= 0.24) {
        e.strikeIdx = 1;
        bossConeHit(e, 7.2, 0.6, 34, 0.6);
        W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff4020, radius: 5, dur: 0.5 });
        G.game.flashScreen(0.35);
      }
      if (t >= 0.95) { setEnemyState(e, 'recover'); e.recoverDur = 1.3; }
    } else if (kind === 'slam') {
      if (e.strikeIdx < 1 && t >= 0.14) {
        e.strikeIdx = 1;
        const dist = U.distXZ(P.pos, e.pos);
        W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff4020, radius: 11, dur: 0.65 });
        W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xffa050, radius: 8, dur: 0.5 });
        W.emitBurst(new THREE.Vector3(e.pos.x, 0.2, e.pos.z), { count: 70, color: 0xff6a3a, speed: 12, size: 0.2, life: 0.8, gravity: 7, up: 0.6 });
        G.game.addShake(0.55);
        audio.sfx('shockwave');
        if (dist < 11) damagePlayer(26 * sc, e.pos, e);
      }
      if (t >= 1.15) { setEnemyState(e, 'recover'); e.recoverDur = 1.5; }
    } else if (kind === 'summon') {
      if (e.strikeIdx < 1 && t >= 0.85) {
        e.strikeIdx = 1;
        const spots = [[-3.4, -2.4], [3.4, -2.4], [0, 4.2], [-5.5, 2], [5.5, 2]];
        const n = e.phase2 ? 4 : (e.summonFlags.s2 ? 3 : 2);
        for (let i = 0; i < n; i++) {
          const s = spots[i % spots.length];
          const t2 = e.phase2 && i === 3 ? 'detonator' : (i === 2 ? 'hexer' : 'wraith');
          createEnemy(t2, e.pos.x + s[0], e.pos.z + s[1], { elite: e.phase2 && i === 2 });
        }
        W.emitBurst(new THREE.Vector3(e.pos.x, 2.5, e.pos.z), { count: 50, color: 0xb44dff, speed: 8, size: 0.18, life: 1.0, gravity: 2, up: 1 });
        if (G.hud) G.hud.msg('守 望 者 撕 裂 了 空 间', 'small violet');
        audio.sfx('bossStart');
      }
      if (t >= 1.5) { setEnemyState(e, 'recover'); e.recoverDur = 1.0; }
    } else if (kind === 'shock3') {
      const times = [0.2, 0.55, 0.9];
      while (e.strikeIdx < 3 && t >= times[e.strikeIdx]) {
        e.strikeIdx++;
        W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), {
          color: e.strikeIdx === 3 ? 0xffb060 : 0xff4020, radius: 12, dur: 0.6,
        });
        W.emitBurst(new THREE.Vector3(e.pos.x, 0.3, e.pos.z), { count: 40, color: 0xff5a2a, speed: 12, size: 0.18, life: 0.6, gravity: 6, up: 0.5 });
        G.game.addShake(0.35);
        audio.sfx('swordRain');
        if (U.distXZ(P.pos, e.pos) < 12) damagePlayer(14 * sc, e.pos, e);
      }
      if (t >= 1.35) { setEnemyState(e, 'recover'); e.recoverDur = 1.3; }
    } else if (kind === 'swordrain') {
      if (e.strikeIdx < 1 && t >= 0.15) {
        e.strikeIdx = 1;
        const spots = [];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + U.rand(0, 0.6);
          const r = U.rand(2.2, 4.8);
          spots.push(new THREE.Vector3(P.pos.x + Math.cos(a) * r, 0, P.pos.z + Math.sin(a) * r));
        }
        for (const sp of spots) {
          W.emitDirectional(new THREE.Vector3(sp.x, 15, sp.z), new THREE.Vector3(0, -1, 0), {
            count: 14, color: 0xff5030, speed: 22, size: 0.18, life: 0.8,
          });
          W.emitBurst(new THREE.Vector3(sp.x, 0.2, sp.z), { count: 34, color: 0xff5a2a, speed: 9, size: 0.16, life: 0.6, gravity: 5, up: 0.8 });
          W.shockwave(new THREE.Vector3(sp.x, 0, sp.z), { color: 0xff4020, radius: 2.8, dur: 0.45 });
          W.flash(new THREE.Vector3(sp.x, 1.2, sp.z), 0xff6a30, 3.2, 0.3);
          if (U.distXZ(P.pos, sp) < 2.9) damagePlayer(18 * sc, sp, e);
        }
        G.game.addShake(0.5);
        G.game.flashScreen(0.3);
        audio.sfx('swordRain');
      }
      if (t >= 1.2) { setEnemyState(e, 'recover'); e.recoverDur = 1.3; }
    } else if (kind === 'charge') {
      if (e.strikeIdx < 1 && t >= 0.1) {
        e.strikeIdx = 1;
        const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        e.dashDir = { x: dx / l, z: dz / l };
        e.yaw = Math.atan2(e.dashDir.x, e.dashDir.z);
        audio.sfx('swingHeavy');
      }
      if (e.dashDir && t < 0.62) {
        const spd = 26 * (1 - Math.max(0, (t - 0.1) / 0.55));
        e.pos.x += e.dashDir.x * spd * dt;
        e.pos.z += e.dashDir.z * spd * dt;
        if (Math.random() < 0.9) {
          W.emitParticle(e.pos.x + U.rand(-0.6, 0.6), U.rand(0.4, 2.4), e.pos.z + U.rand(-0.6, 0.6),
            U.rand(-1, 1), U.rand(0, 2), U.rand(-1, 1), 0xff5a2a, 0.16, 0.5, 0.9, 1);
        }
        if (!e.dashHit && U.distXZ(P.pos, e.pos) < 3.4) {
          e.dashHit = true;
          damagePlayer(26 * sc, e.pos, e);
          G.game.addShake(0.5);
        }
      }
      if (t >= 0.95) { e.dashDir = null; setEnemyState(e, 'recover'); e.recoverDur = 1.2; }
    }
  }

  /* ---- 爆裂者（v2）：靠近后自爆 ---- */
  function updateDetonator(e, dt) {
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.t += dt;
    e.cooldown -= dt;
    if (e.state === 'stagger') {
      if (e.t > 0.4) setEnemyState(e, 'chase');
      return;
    }
    switch (e.state) {
      case 'chase': {
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 6, dt);
        if (dist > 1.5) moveEnemy(e, dx, dz, e.def.speed * e.speedMul, dt);
        e.chargeTimer = (e.chargeTimer || 0) + dt;
        if (dist < 2.7 || e.chargeTimer > 6.5) {
          setEnemyState(e, 'windup');
          e.windupDur = 0.85;
          e.teleFixed = true;
          e.tele = W.telegraphRing(new THREE.Vector3(e.pos.x, 0, e.pos.z), 3.8, 0xff3018);
          audio.sfx('detonate');
        }
        break;
      }
      case 'windup': {
        updateTele(e);
        e.yaw = U.dampAngle(e.yaw, Math.atan2(dx, dz), 2, dt);
        if (e.t >= e.windupDur) {
          killTele(e, true);
          detonateEnemy(e);
        }
        break;
      }
      default:
        setEnemyState(e, 'chase');
    }
  }

  function detonateEnemy(e) {
    if (!e.alive) return;
    const pos = new THREE.Vector3(e.pos.x, 0.4, e.pos.z);
    W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff7a20, radius: 3.8, dur: 0.5 });
    W.emitBurst(pos, { count: 80, color: 0xff8a30, speed: 13, size: 0.22, life: 0.9, gravity: 6, up: 0.7 });
    W.flash(pos, 0xffa040, 5.5, 0.4);
    G.game.addShake(0.5);
    G.game.addStyle(3);
    audio.sfx('detonate');
    const d = U.distXZ(P.pos, e.pos);
    if (d < 3.8) damagePlayer(e.dmg, e.pos, e);
    e.alive = false;
    e.deathT = 0;
    killTele(e);
    if (G.hud) G.hud.enemyBar(e, false);
    spawnPickup(e.pos.x, e.pos.z, 'momentum', 16, true);
  }

  /* ---- 掉落拾取（v2） ---- */
  function spawnPickup(x, z, type, amount, fromDetonator) {
    if (!D.pickups) D.pickups = [];
    if (D.pickups.length > 26) return;
    const color = type === 'heal' ? 0x7dffb0 : 0xffc860;
    const group = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: W.makeGlowTexture(64), color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.set(0.95, 0.95, 1);
    group.add(sprite);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: type === 'heal' ? 0xd8ffe8 : 0xfff0c8 }));
    group.add(core);
    group.position.set(x + U.rand(-0.4, 0.4), 0.6, z + U.rand(-0.4, 0.4));
    W.scene.add(group);
    D.pickups.push({
      group, pos: group.position, type,
      amount: amount || (type === 'heal' ? 10 : 18),
      life: fromDetonator ? 12 : 20, max: fromDetonator ? 12 : 20,
      phase: U.rand(0, 6), sprite, core,
    });
  }

  function updatePickups(dt) {
    if (!D.pickups) return;
    for (let i = D.pickups.length - 1; i >= 0; i--) {
      const p = D.pickups[i];
      p.life -= dt;
      p.phase += dt;
      p.pos.y = 0.6 + Math.sin(p.phase * 3) * 0.16;
      p.core.rotation.y += dt * 3;
      p.core.rotation.x += dt * 1.5;
      const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 5.2 && dist > 0.001) {
        const sp = 7 * (1 - dist / 6) + 1.5;
        p.pos.x += (dx / dist) * sp * dt;
        p.pos.z += (dz / dist) * sp * dt;
      }
      if (p.life < 3.5) p.sprite.material.opacity = 0.4 + Math.abs(Math.sin(p.phase * 6)) * 0.6;
      if (dist < 1.25) {
        if (p.type === 'heal') {
          const heal = Math.min(P.maxHp - P.hp, p.amount);
          if (heal > 0) {
            P.hp += heal;
            if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.1, P.pos.z), '+' + Math.round(heal), 'heal');
          }
        } else {
          G.game.addMomentum(p.amount);
          if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.1, P.pos.z), '势 +' + p.amount, 'perfect');
        }
        audio.sfx('pickup');
        W.emitBurst(p.pos, { count: 14, color: p.type === 'heal' ? 0x7dffb0 : 0xffd080, speed: 4, size: 0.1, life: 0.4, gravity: -1 });
        W.scene.remove(p.group);
        disposeGroup(p.group);
        D.pickups.splice(i, 1);
        continue;
      }
      if (p.life <= 0) {
        W.scene.remove(p.group);
        disposeGroup(p.group);
        D.pickups.splice(i, 1);
      }
    }
  }

  /* ---- 敌人通用更新 ---- */
  function updateEnemies(dt) {
    for (let i = D.enemies.length - 1; i >= 0; i--) {
      const e = D.enemies[i];

      /* 死亡 */
      if (!e.alive) {
        e.deathT += dt;
        const k = U.clamp01(e.deathT / 0.7);
        W.setDissolve(e.group, k);
        e.group.position.y -= dt * 0.35;
        e.group.rotation.z += dt * 0.4;
        if (e.deathT > 0.8) {
          W.scene.remove(e.group);
          disposeGroup(e.group);
          D.enemies.splice(i, 1);
        }
        continue;
      }

      /* 击退 */
      if (e.knock.lengthSq() > 0.01) {
        e.pos.x += e.knock.x * dt;
        e.pos.z += e.knock.z * dt;
        e.knock.multiplyScalar(Math.pow(0.015, dt));
      }

      /* 出生 */
      if (e.state === 'spawn') {
        e.t += dt;
        const k = U.clamp01(e.t / 0.85);
        e.group.position.y = -2.5 + U.easeOutCubic(k) * 2.5;
        e.group.scale.setScalar((0.75 + 0.25 * U.easeOutBack(k)) * e.finalScale);
        if (k >= 1) {
          e.active = true;
          e.group.position.y = 0;
          e.group.scale.setScalar(e.finalScale);
          setEnemyState(e, 'chase');
          if (e.elite) {
            if (G.hud) G.hud.toast(`精英 · ${e.eliteCfg.label}`);
            audio.sfx('eliteSpawn');
          }
        }
      } else if (e.type === 'wraith') {
        updateWraith(e, dt);
      } else if (e.type === 'golem') {
        updateGolem(e, dt);
      } else if (e.type === 'hexer') {
        updateHexer(e, dt);
      } else if (e.type === 'detonator') {
        updateDetonator(e, dt);
      } else if (e.type === 'boss') {
        updateBoss(e, dt);
      }

      /* 灼烧 DoT */
      if (e.alive && e.burnTime > 0) {
        e.burnTime -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          const bd = e.burnDps * 0.5;
          e.hp -= bd;
          P.stats.damageDealt += bd;
          W.emitParticle(e.pos.x + U.rand(-0.4, 0.4), U.rand(0.4, 2.2), e.pos.z + U.rand(-0.4, 0.4),
            U.rand(-0.3, 0.3), U.rand(0.8, 2), U.rand(-0.3, 0.3), 0xff7a30, 0.12, 0.35, 0.9, -1);
          if (G.hud) G.hud.enemyBar(e, true);
          if (e.hp <= 0) {
            killEnemy(e, { silent: true, burn: true });
            continue;
          }
        }
      }
      /* 处决提示余烬 */
      if (e.alive && e.executable && Math.random() < 0.18) {
        W.emitParticle(e.pos.x + U.rand(-0.5, 0.5), U.rand(0.6, 2.0), e.pos.z + U.rand(-0.5, 0.5),
          U.rand(-0.3, 0.3), U.rand(0.4, 1.2), U.rand(-0.3, 0.3), 0xffd080, 0.08, 0.5, 0.95, -0.5);
      }

      /* 受击闪白衰减 */
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt);
        W.setFlash(e.group, U.clamp01(e.flash / 0.16));
        e.flashOn = true;
      } else if (e.flashOn) {
        W.setFlash(e.group, 0);
        e.flashOn = false;
      }

      /* 边界 */
      const r = Math.hypot(e.pos.x, e.pos.z);
      const lim = CFG.arenaRadius + (e.type === 'boss' ? 0.5 : 0);
      if (r > lim) {
        e.pos.x = (e.pos.x / r) * lim;
        e.pos.z = (e.pos.z / r) * lim;
      }
      /* 贴地 */
      if (e.alive && e.state !== 'spawn') e.group.position.y = 0;

      /* 与玩家保持体积 */
      if (e.type !== 'boss') {
        const pdx = e.pos.x - P.pos.x, pdz = e.pos.z - P.pos.z;
        const pd = Math.hypot(pdx, pdz);
        const minD = 0.55 + e.radius * 0.55;
        if (pd < minD && pd > 0.001) {
          e.pos.x += (pdx / pd) * (minD - pd) * 0.5;
          e.pos.z += (pdz / pd) * (minD - pd) * 0.5;
        }
      }
      e.group.rotation.y = e.yaw;
    }

    /* 敌人互相分离 */
    for (let i = 0; i < D.enemies.length; i++) {
      const a = D.enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < D.enemies.length; j++) {
        const b = D.enemies[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = (a.radius + b.radius) * 0.85;
        if (d < minD && d > 0.001) {
          const push = (minD - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          if (a.type !== 'boss') { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (b.type !== 'boss') { b.pos.x += nx * push; b.pos.z += nz * push; }
        }
      }
    }

    /* Boss 血条与阶段 */
    if (D.boss && D.boss.alive && G.hud) {
      G.hud.bossHp = D.boss.hp / D.boss.maxHp;
    }
  }

  /* ---- 敌人动画 ---- */
  function animateEnemies(dt, time) {
    for (const e of D.enemies) {
      if (!e.alive) continue;
      const m = e.model;
      /* 精英光环脉冲 */
      if (e.aura) {
        e.aura.material.opacity = 0.24 + Math.sin(time * 3 + (e.auraPhase || 0)) * 0.12;
        const base = e.auraBase || 2.2;
        const s = base + Math.sin(time * 2.4 + (e.auraPhase || 0)) * 0.2;
        e.aura.scale.set(s, s, 1);
      }
      if (e.type === 'wraith') {
        const bob = Math.sin(time * 2.4 + e.phase) * 0.14;
        m.visual.position.y = 1.02 + bob;
        let lean = 0;
        if (e.state === 'windup') lean = -0.45;
        else if (e.state === 'strike') lean = 0.55;
        else if (e.state === 'stagger') lean = -0.3;
        m.visual.rotation.x = U.damp(m.visual.rotation.x, lean, 12, dt);
        m.clawL.rotation.x = U.damp(m.clawL.rotation.x, e.state === 'strike' ? -1.5 : Math.sin(time * 2 + e.phase) * 0.25, 10, dt);
        m.clawR.rotation.x = U.damp(m.clawR.rotation.x, e.state === 'strike' ? -1.5 : Math.sin(time * 2 + e.phase + 1.6) * 0.25, 10, dt);
        m.eyeL.scale.setScalar(1 + (e.state === 'windup' ? 0.7 : 0) + Math.sin(time * 6) * 0.1);
        m.eyeR.scale.setScalar(1 + (e.state === 'windup' ? 0.7 : 0) + Math.sin(time * 6 + 1) * 0.1);
        m.glow.material.opacity = 0.35 + (e.state === 'windup' ? 0.4 : 0) + Math.sin(time * 3) * 0.08;
        m.skirts.forEach((p, i) => {
          p.rotation.x = 0.18 + Math.sin(time * 2.2 + i + e.phase) * 0.12 + (e.state === 'strike' ? 0.5 : 0);
        });
        if (e.state === 'stagger') m.visual.rotation.z = Math.sin(time * 26) * 0.18;
        else m.visual.rotation.z = U.damp(m.visual.rotation.z, 0, 8, dt);
      } else if (e.type === 'golem') {
        const moving = e.state === 'chase';
        const phase = time * 3.4 + e.phase;
        m.legL.rotation.x = U.damp(m.legL.rotation.x, moving ? Math.sin(phase) * 0.3 : 0, 8, dt);
        m.legR.rotation.x = U.damp(m.legR.rotation.x, moving ? -Math.sin(phase) * 0.3 : 0, 8, dt);
        m.torso.rotation.z = U.damp(m.torso.rotation.z, moving ? Math.sin(phase) * 0.06 : 0, 8, dt);
        let armX = 0;
        if (e.state === 'windup') armX = -2.7;
        else if (e.state === 'strike') armX = 0.5;
        else if (e.state === 'recover') armX = 0.2;
        m.armL.shoulder.rotation.x = U.damp(m.armL.shoulder.rotation.x, armX, 9, dt);
        m.armR.shoulder.rotation.x = U.damp(m.armR.shoulder.rotation.x, armX, 9, dt);
        m.armL.elbow.rotation.x = U.damp(m.armL.elbow.rotation.x, e.state === 'windup' ? -0.5 : 0, 8, dt);
        m.armR.elbow.rotation.x = U.damp(m.armR.elbow.rotation.x, e.state === 'windup' ? -0.5 : 0, 8, dt);
        m.core.scale.setScalar(1 + Math.sin(time * 4 + e.phase) * 0.12 + (e.state === 'windup' ? 0.5 : 0));
      } else if (e.type === 'hexer') {
        m.visual.position.y = 1.62 + Math.sin(time * 2 + e.phase) * 0.12;
        m.ring1.rotation.z += dt * (e.state === 'windup' ? 4 : 1.2);
        m.ring2.rotation.y += dt * (e.state === 'windup' ? -5 : -1.6);
        m.ring2.rotation.z += dt * 0.8;
        m.shards.forEach((s, i) => {
          const a = time * 0.8 + e.phase + i * 1.05;
          s.position.x = Math.cos(a) * 1.15;
          s.position.z = Math.sin(a) * 1.15;
          s.position.y = Math.sin(time * 1.5 + i) * 0.35;
          s.rotation.x += dt * 1.5; s.rotation.y += dt * 2;
        });
        m.eye.scale.setScalar(1 + (e.state === 'windup' ? 0.8 : 0) + Math.sin(time * 5) * 0.08);
        m.glow.material.opacity = 0.35 + (e.state === 'windup' ? 0.45 : 0);
        if (e.state === 'stagger') m.visual.rotation.z = Math.sin(time * 22) * 0.15;
        else m.visual.rotation.z = U.damp(m.visual.rotation.z, 0, 8, dt);
      } else if (e.type === 'detonator') {
        const pulse = e.state === 'windup'
          ? 1 + Math.sin(time * 20) * 0.1 + Math.min(0.35, e.t * 0.4)
          : 1 + Math.sin(time * 4 + e.phase) * 0.05;
        m.visual.scale.setScalar(pulse);
        m.core.scale.setScalar(0.9 + (e.state === 'windup' ? 0.8 + Math.sin(time * 22) * 0.25 : 0));
        m.glow.material.opacity = 0.4 + (e.state === 'windup' ? 0.5 + Math.sin(time * 24) * 0.2 : 0) + Math.sin(time * 6) * 0.08;
        m.body.rotation.y += dt * (e.state === 'windup' ? 6 : 1.5);
        m.legs.forEach((l, i) => {
          l.rotation.x = -0.4 + Math.sin(time * 8 + i * 1.3) * 0.3;
        });
        m.visual.position.y = 0.62 + Math.sin(time * 6 + e.phase) * 0.05;
      } else if (e.type === 'boss') {
        const moving = e.state === 'chase';
        const phase = time * 2.6 + e.phase;
        m.legL.rotation.x = U.damp(m.legL.rotation.x, moving ? Math.sin(phase) * 0.22 : 0, 6, dt);
        m.legR.rotation.x = U.damp(m.legR.rotation.x, moving ? -Math.sin(phase) * 0.22 : 0, 6, dt);
        m.torso.position.y = 2.15 + Math.sin(time * 1.6 + e.phase) * 0.03;
        let torsoY = 0, torsoX = 0;
        let armRX = 0, armRY = 0, armLX = 0;
        if (e.state === 'windup') {
          const k = U.clamp01(e.t / Math.max(0.01, e.windupDur));
          if (e.attackKind === 'sweep3') { torsoY = -0.6 * k; armRX = -1.6 * k; armRY = -0.9 * k; armLX = -0.7 * k; }
          else if (e.attackKind === 'overhead') { torsoX = -0.3 * k; armRX = -2.9 * k; armLX = -2.4 * k; }
          else if (e.attackKind === 'slam') { torsoX = -0.32 * k; armRX = -3.0 * k; armLX = -3.0 * k; }
          else { torsoX = -0.2 * k; armRX = -2.6 * k; armLX = -2.6 * k; }
        } else if (e.state === 'attack') {
          const at = e.attackT;
          if (e.attackKind === 'sweep3') {
            armRX = -1.5; armRY = Math.sin(at * 12) * 1.1; torsoY = Math.sin(at * 12) * 0.5;
          } else if (e.attackKind === 'overhead') {
            armRX = -2.7 + Math.min(1, at / 0.25) * 2.2; torsoX = -0.28 + Math.min(1, at / 0.25) * 0.55;
          } else if (e.attackKind === 'slam') {
            armRX = -2.9 + Math.min(1, at / 0.15) * 3.1; armLX = armRX; torsoX = 0.3;
          } else {
            armRX = -2.7 + Math.sin(at * 8) * 0.15; armLX = -2.7 + Math.sin(at * 8 + 1) * 0.15; torsoX = -0.15;
          }
        } else if (e.state === 'stagger') {
          torsoX = -0.2;
        }
        m.torso.rotation.y = U.damp(m.torso.rotation.y, torsoY, 10, dt);
        m.torso.rotation.x = U.damp(m.torso.rotation.x, torsoX, 10, dt);
        m.armR.shoulder.rotation.x = U.damp(m.armR.shoulder.rotation.x, armRX, 12, dt);
        m.armR.shoulder.rotation.y = U.damp(m.armR.shoulder.rotation.y, armRY, 12, dt);
        m.armL.shoulder.rotation.x = U.damp(m.armL.shoulder.rotation.x, armLX, 12, dt);
        const eyeOpacity = e.enraged ? 0.9 + Math.sin(time * 10) * 0.2 : (e.state === 'windup' ? 0.95 : 0.6);
        m.eyeGlow.material.opacity = Math.min(1, eyeOpacity);
        m.eyeGlow.scale.set(0.5 + (e.enraged ? 0.3 : 0), 0.3, 1);
        m.capeSegs.forEach((p, i) => {
          p.rotation.x = U.damp(p.rotation.x, 0.12 + Math.sin(time * 1.8 + i) * 0.05, 4, dt);
        });
        /* 二阶段 / 转阶段表现 */
        if (e.state === 'transition') {
          m.torso.rotation.z = Math.sin(time * 26) * 0.07;
          m.visual.position.y = Math.abs(Math.sin(time * 18)) * 0.12;
          m.eyeGlow.material.opacity = 0.9 + Math.sin(time * 20) * 0.1;
          m.eyeGlow.scale.set(0.9, 0.5, 1);
        } else {
          m.visual.position.y = U.damp(m.visual.position.y, 0, 8, dt);
          m.torso.rotation.z = U.damp(m.torso.rotation.z, 0, 8, dt);
        }
        if (e.phase2) {
          m.eyeGlow.material.color.setHex(0xff2010);
          m.swordGlowColor = 0xff2010;
        }
      }
    }
  }

  /* =========================================================
     伤害 / 连击 / 分数
     ========================================================= */
  function addComboHit() {
    S.combo++;
    S.comboTimer = 2.7 + ((P.mods && P.mods.comboWindowBonus) || 0);
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.comboMult = 1 + Math.min(2, S.combo * 0.07);
    if (S.combo % 5 === 0) audio.sfx('comboTick', { pitch: Math.min(600, S.combo * 12) });
    if (G.hud) G.hud.popCombo();
  }

  /* ---------- v2：处决 ---------- */
  function executeEnemy(e) {
    if (!e.alive) return;
    const heal = 6 + ((P.mods && P.mods.executeHealBonus) || 0);
    P.hp = Math.min(P.maxHp, P.hp + heal);
    P.stats.executions++;
    const styleMul = G.game.styleMul ? G.game.styleMul() : 1;
    G.game.addScore(300 * S.comboMult * styleMul);
    G.game.addMomentum(20);
    G.game.addStyle(18);
    G.game.hitStop(0.09);
    G.game.setSlowmo(0.34, 0.55);
    G.game.addShake(0.35);
    G.game.flashScreen(0.25);
    audio.sfx('execute');
    const pos = new THREE.Vector3(e.pos.x, 1.2, e.pos.z);
    W.emitBurst(pos, { count: 52, color: 0xffd090, speed: 11, size: 0.2, life: 0.9, gravity: 4, up: 0.8 });
    W.flash(pos, 0xffe0a0, 5, 0.5);
    W.slashArc(new THREE.Vector3(P.pos.x, 1.0, P.pos.z), P.yaw, { radius: 3.2, halfArc: 1.25, color: 0xffe0a0, dur: 0.35 });
    if (G.hud) {
      G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.6, P.pos.z), '处 决', 'perfect');
      G.hud.msg('处决 · 生命 +' + heal, 'small');
    }
    e.executable = false;
    e.hp = 0;
    killEnemy(e, { execution: true, silent: true });
  }

  function damageEnemy(e, dmg, opts) {
    opts = opts || {};
    if (!e.alive) return;
    if (e.state === 'spawn' && e.t < 0.4) return;
    if (e.invulnUntil && S.time < e.invulnUntil) {
      if (G.hud) G.hud.damageNumber(new THREE.Vector3(e.pos.x, 3.6, e.pos.z), '无 效', 'perfect');
      return;
    }
    const heavy = !!opts.heavy;
    let actual = dmg;
    /* 精英护盾：第一击大幅减伤并破盾 */
    if (e.shieldHits > 0) {
      e.shieldHits--;
      actual = dmg * 0.3;
      W.flash(new THREE.Vector3(e.pos.x, 1.4, e.pos.z), 0x6fe3ff, 3.4, 0.35);
      W.emitBurst(new THREE.Vector3(e.pos.x, 1.4, e.pos.z), { count: 24, color: 0x6fe3ff, speed: 7, size: 0.12, life: 0.5, gravity: 3 });
      audio.sfx('block');
      if (G.hud) G.hud.msg('护盾破碎', 'small');
    }
    e.hp -= actual;
    e.lastDmgFromPlayer = S.realTime;
    e.execTime = S.realTime;
    P.stats.damageDealt += actual;
    S.lastHitTime = S.realTime;
    addComboHit();
    const styleMul = G.game.styleMul ? G.game.styleMul() : 1;
    G.game.addScore(actual * S.comboMult * (heavy ? 1.4 : 1) * styleMul);
    if (!opts.ult) {
      G.game.addMomentum((heavy ? 12 : 6) * ((P.mods && P.mods.momentumMul) || 1));
    }
    G.game.addStyle(heavy ? 4 : 2);
    e.flash = 0.16;
    const headY = e.type === 'boss' ? 4.2 : (e.type === 'golem' ? 2.7 : 1.9);
    const hpPos = new THREE.Vector3(e.pos.x, headY, e.pos.z);
    if (G.hud) G.hud.damageNumber(hpPos, String(Math.round(actual)), heavy ? 'big' : '');
    if (G.hud) G.hud.enemyBar(e, true);

    const dir = opts.dir || { x: 0, z: 1 };
    const hitPos = new THREE.Vector3(e.pos.x - dir.x * e.radius * 0.4, Math.min(headY - 0.6, 2.0), e.pos.z - dir.z * e.radius * 0.4);
    W.emitDirectional(hitPos, new THREE.Vector3(dir.x, 0.35, dir.z), {
      count: heavy ? 22 : 12, color: heavy ? 0xffd090 : 0xffa050,
      speed: heavy ? 11 : 8, size: heavy ? 0.16 : 0.11, life: heavy ? 0.5 : 0.35,
    });
    W.flash(hitPos, 0xffc080, heavy ? 2.2 : 1.3, 0.18);

    const mass = e.type === 'boss' ? 0.06 : (e.type === 'golem' ? 0.35 : 1);
    const kb = (opts.knockback || 4) * mass;
    e.knock.x += dir.x * kb;
    e.knock.z += dir.z * kb;

    /* 祝福：烬火缠身（灼烧 DoT） */
    if (!opts.burn && !opts.reflect && P.mods && P.mods.burnPerHit > 0) {
      e.burnDps = Math.max(e.burnDps || 0, P.mods.burnPerHit / 3);
      e.burnTime = 3;
      e.burnTick = Math.min(e.burnTick || 0.5, 0.5);
    }
    /* 祝福：剑势风暴（每 5 连击小冲击波） */
    if (!opts.noStorm && P.mods && P.mods.storm > 0 && S.combo > 0 && S.combo % 5 === 0) {
      G.game.addShake(0.18);
      W.shockwave(new THREE.Vector3(P.pos.x, 0, P.pos.z), { color: 0xffb060, radius: 5, dur: 0.42 });
      W.emitBurst(new THREE.Vector3(P.pos.x, 0.5, P.pos.z), { count: 26, color: 0xffb060, speed: 8, size: 0.12, life: 0.5, gravity: 4 });
      audio.sfx('swordWave');
      for (const other of D.enemies) {
        if (other !== e && other.alive && other.type !== 'boss' && U.distXZ(other.pos, P.pos) < 5.2) {
          damageEnemy(other, 20 * P.mods.storm, { noStorm: true, knockback: 3, burn: true });
        }
      }
    }

    /* 破绽：可处决 */
    if (!e.executable && e.type !== 'boss' && e.alive && e.hp > 0) {
      const threshold = 0.24 + ((P.mods && P.mods.execThresholdBonus) || 0);
      if (e.hp <= e.maxHp * threshold) {
        e.executable = true;
        W.flash(new THREE.Vector3(e.pos.x, 1.4, e.pos.z), 0xffd080, 2.2, 0.45);
        if (G.hud) G.hud.enemyBar(e, true);
      }
    }

    if (e.type !== 'boss' && heavy && e.type !== 'golem' && !opts.noStagger) {
      setEnemyState(e, 'stagger');
      killTele(e);
      if (e.type === 'wraith') e.yaw = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    } else if (e.type === 'golem' && heavy && !opts.noStagger) {
      setEnemyState(e, 'stagger');
      killTele(e);
    }

    if (e.hp <= 0) killEnemy(e, opts);
  }

  function dropLoot(e) {
    if (e.type === 'boss') {
      for (let i = 0; i < 4; i++) {
        spawnPickup(e.pos.x + U.rand(-2, 2), e.pos.z + U.rand(-2, 2), i % 2 ? 'momentum' : 'heal', i % 2 ? 20 : 14);
      }
      return;
    }
    if (e.guaranteedDrop) {
      spawnPickup(e.pos.x, e.pos.z, 'heal', 12);
      spawnPickup(e.pos.x, e.pos.z, 'momentum', 20);
      return;
    }
    if (Math.random() < 0.28) spawnPickup(e.pos.x, e.pos.z, 'heal', 9);
    else if (Math.random() < 0.22) spawnPickup(e.pos.x, e.pos.z, 'momentum', 15);
  }

  function killEnemy(e, opts) {
    if (!e.alive) return;
    e.alive = false;
    e.deathT = 0;
    e.hp = Math.max(0, e.hp);
    killTele(e);
    S.kills++;
    S.lastHitTime = S.realTime;
    addComboHit();
    const isBoss = e.type === 'boss';
    const styleMul = G.game.styleMul ? G.game.styleMul() : 1;
    G.game.addScore((e.score || e.def.score) * S.comboMult * styleMul);
    if (P.state !== 'ult') {
      G.game.addMomentum((isBoss ? 60 : 22) * ((P.mods && P.mods.momentumMul) || 1));
    }
    G.game.addStyle(isBoss ? 25 : 8);
    audio.sfx(isBoss ? 'bossStart' : 'enemyDeath');
    const headY = isBoss ? 2.4 : 1.2;
    const pos = new THREE.Vector3(e.pos.x, headY, e.pos.z);
    W.emitBurst(pos, {
      count: isBoss ? 120 : (e.elite ? 50 : 30),
      color: isBoss ? 0xff4020 : (e.type === 'hexer' ? 0xb44dff : (e.type === 'detonator' ? 0xff8a30 : 0xff8a50)),
      speed: isBoss ? 16 : 8, size: isBoss ? 0.35 : (e.elite ? 0.22 : 0.16), life: isBoss ? 1.6 : 0.8,
      gravity: isBoss ? 2 : 4, up: 0.8,
    });
    W.flash(pos, isBoss ? 0xff5030 : 0xffa060, isBoss ? 8 : 2.6, isBoss ? 0.8 : 0.25);
    /* 祝福：噬魂 */
    if (P.mods && P.mods.lifesteal > 0) {
      P.hp = Math.min(P.maxHp, P.hp + P.mods.lifesteal);
      if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.1, P.pos.z), '+' + P.mods.lifesteal, 'heal');
    }
    /* 爆裂者被击杀：无害殉爆 */
    if (e.type === 'detonator') {
      W.shockwave(new THREE.Vector3(e.pos.x, 0, e.pos.z), { color: 0xff7a20, radius: 3.2, dur: 0.45 });
      W.emitBurst(new THREE.Vector3(e.pos.x, 0.4, e.pos.z), { count: 40, color: 0xff8a30, speed: 10, size: 0.18, life: 0.7, gravity: 6, up: 0.6 });
    }
    if (isBoss) {
      G.game.addShake(0.9);
      G.game.hitStop(0.12);
      G.game.setSlowmo(0.3, 1.4);
      G.game.flashScreen(0.9);
      for (const other of D.enemies) {
        if (other !== e && other.alive) {
          other.alive = false;
          other.deathT = 0;
          killTele(other);
          other.flash = 0;
        }
      }
      dropLoot(e);
      if (S.endless) {
        /* 无尽：Boss 只是更深一层的守关者 */
        W.setCrimson(false);
        audio.setMusicMode('battle');
        S.bossActive = false;
        S.waveState = 'clear';
        S.waveTimer = 0;
        if (G.hud) {
          G.hud.showBoss(false);
          G.hud.msg('回 响 守 望 者 陨 落', 'big violet');
          G.hud.msg('继续下沉 · 选择新的回响', 'small');
        }
        if (G.game.onWaveCleared) G.game.onWaveCleared(S.wave);
      } else {
        W.setCrimson(false);
        if (G.game.onVictory) G.game.onVictory();
      }
    } else if (G.hud) {
      G.hud.enemyBar(e, false);
      dropLoot(e);
    }
    if (!opts || !opts.silent) {
      if (S.combo > 0 && S.combo % 10 === 0 && G.hud) G.hud.msg(`${S.combo} 连斩`, 'small');
    }
  }

  function perfectDodge() {
    P.stats.perfectDodges++;
    G.game.addScore(300);
    G.game.addMomentum(22 * ((P.mods && P.mods.momentumMul) || 1));
    G.game.addStyle(16);
    P.stamina = Math.min(P.maxStamina, P.stamina + 18);
    P.invuln = Math.max(P.invuln, 0.55);
    G.game.hitStop(0.05);
    if (P.mods && P.mods.timeSand) G.game.setSlowmo(0.32, 1.15);
    else G.game.setSlowmo(0.35, 0.65);
    perfectDodgeFx();
    G.game.addShake(0.12);
    audio.sfx('perfect');
    if (G.hud) {
      G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.3, P.pos.z), '完美闪避', 'perfect');
      G.hud.msg('完美闪避', 'small cyan');
    }
    W.flash(new THREE.Vector3(P.pos.x, 1.2, P.pos.z), 0x8fe8ff, 3, 0.35);
  }

  function diePlayer() {
    P.hp = 0;
    P.state = 'dead';
    P.deathT = 0;
    P.invuln = 999;
    G.game.onDefeat();
    G.game.setSlowmo(0.3, 1.4);
    G.game.addShake(0.8);
    audio.sfx('death');
    W.emitBurst(new THREE.Vector3(P.pos.x, 1.2, P.pos.z), { count: 60, color: 0xff6a3a, speed: 8, size: 0.2, life: 1.2, gravity: 5, up: 0.8 });
  }

  function damagePlayer(amount, sourcePos, sourceEnemy, sourceProjectile) {
    if (S.mode !== 'playing' || P.state === 'dead') return false;
    if (S.debug.god) return false;
    if (P.invuln > 0) return false;

    /* 格挡 / 弹反 */
    if (P.state === 'block' && (!sourcePos || blockFacing(sourcePos.x, sourcePos.z))) {
      if (P.parryWindow > 0) {
        perfectParry(sourceEnemy || null);
        if (sourceProjectile) {
          W.emitBurst(sourceProjectile.pos, { count: 24, color: 0x9fe8ff, speed: 8, size: 0.14, life: 0.45, gravity: 2 });
        }
        return false;
      }
      const blocked = amount * 0.3 * ((P.mods && P.mods.damageTakenMul) || 1);
      P.hp -= blocked;
      P.stats.damageTaken += blocked;
      S.waveDamageTaken += blocked;
      P.stamina = Math.max(0, P.stamina - Math.max(8, amount * 0.8));
      P.invuln = 0.42;
      G.game.hurtFlash(0.45);
      G.game.addShake(0.22);
      G.game.hitStop(0.035);
      audio.sfx('block');
      const sparkPos = new THREE.Vector3(P.pos.x + Math.sin(P.yaw) * 0.85, 1.3, P.pos.z + Math.cos(P.yaw) * 0.85);
      W.emitBurst(sparkPos, { count: 14, color: 0xbfe8ff, speed: 6, size: 0.1, life: 0.35, gravity: 3 });
      if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.2, P.pos.z), '-' + Math.round(blocked), 'taken');
      if (sourcePos) {
        const dx = P.pos.x - sourcePos.x, dz = P.pos.z - sourcePos.z;
        const l = Math.hypot(dx, dz) || 1;
        P.knock.x += (dx / l) * 2.2;
        P.knock.z += (dz / l) * 2.2;
      }
      if (P.stamina <= 0) {
        P.state = 'hurt';
        P.t = 0;
        P.parryCd = 1.6;
        P.parryWindow = 0;
        audio.sfx('guardBreak');
        G.game.addShake(0.4);
        if (G.hud) G.hud.msg('架 势 崩 溃', 'small');
      }
      if (P.hp <= 0) diePlayer();
      return false;
    }

    if (P.iframe) { perfectDodge(); return false; }

    const dmg = amount * ((P.mods && P.mods.damageTakenMul) || 1);
    /* 祝福：向死而生 */
    if (P.hp - dmg <= 0 && P.mods && P.mods.deathDefy && !P.deathDefyUsed) {
      P.deathDefyUsed = true;
      P.hp = 1;
      P.invuln = 3.0;
      P.stamina = P.maxStamina;
      G.game.setSlowmo(0.25, 1.2);
      G.game.hitStop(0.1);
      G.game.flashScreen(0.8);
      G.game.addShake(0.5);
      audio.sfx('perfect');
      if (G.hud) G.hud.msg('向 死 而 生', 'big violet');
      return true;
    }

    P.hp -= dmg;
    P.stats.damageTaken += dmg;
    S.waveDamageTaken += dmg;
    /* 受击惩罚：扣 10 点风格分 */
    G.game.addStyle(-10);
    P.invuln = 0.75;
    P.state = 'hurt';
    P.t = 0;
    P.attack = null;
    P.buffered = null;
    P.iframe = false;
    P.parryWindow = 0;
    if (!(P.mods && P.mods.keepCombo)) {
      S.combo = 0;
      S.comboMult = 1;
    }
    G.game.hurtFlash(1.0);
    G.game.addShake(0.5);
    G.game.hitStop(0.07);
    audio.sfx('hurt');
    if (G.hud) G.hud.damageNumber(new THREE.Vector3(P.pos.x, 2.2, P.pos.z), '-' + Math.round(dmg), 'taken');
    W.emitBurst(new THREE.Vector3(P.pos.x, 1.1, P.pos.z), { count: 20, color: 0xff5a4a, speed: 6, size: 0.13, life: 0.5, gravity: 8 });
    if (sourcePos) {
      const dx = P.pos.x - sourcePos.x, dz = P.pos.z - sourcePos.z;
      const l = Math.hypot(dx, dz) || 1;
      P.knock.x += (dx / l) * 5;
      P.knock.z += (dz / l) * 5;
    }
    /* 祝福：荆棘反伤 */
    if (P.mods && P.mods.thornDamage > 0) {
      for (const e of D.enemies) {
        if (!e.alive || e.type === 'boss') continue;
        if (U.distXZ(e.pos, P.pos) < 4.8) {
          damageEnemy(e, P.mods.thornDamage, { noStorm: true, burn: true, knockback: 2 });
        }
      }
    }
    if (P.hp <= 0) diePlayer();
    return true;
  }

  /* =========================================================
     投射物
     ========================================================= */
  function updateProjectiles(dt) {
    const pp = new THREE.Vector3(P.pos.x, 1.0, P.pos.z);
    for (let i = D.projectiles.length - 1; i >= 0; i--) {
      const pr = D.projectiles[i];
      pr.life -= dt;
      pr.pos.x += pr.dir.x * pr.speed * dt;
      pr.pos.y += pr.dir.y * pr.speed * dt;
      pr.pos.z += pr.dir.z * pr.speed * dt;
      if (pr.spin) pr.spin.rotation.y += dt * 8;

      /* 粒子拖尾 */
      if (pr.owner === 'enemy' && Math.random() < 0.7) {
        W.emitParticle(pr.pos.x, pr.pos.y, pr.pos.z, U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), U.rand(-0.3, 0.3),
          0xb44dff, 0.08, 0.35, 0.9, 0);
      } else if (pr.owner === 'player' && Math.random() < 0.8) {
        W.emitParticle(pr.pos.x, pr.pos.y, pr.pos.z, U.rand(-0.6, 0.6), U.rand(-0.6, 0.6), U.rand(-0.6, 0.6),
          0x8fe8ff, 0.1, 0.3, 0.88, 0);
      }

      let dead = pr.life <= 0;
      if (!dead && pr.owner === 'enemy') {
        if (Math.hypot(pr.pos.x - P.pos.x, pr.pos.z - P.pos.z) < 0.85 && Math.abs(pr.pos.y - 1.0) < 1.6) {
          damagePlayer(pr.damage, pr.pos, null, pr);
          W.emitBurst(pr.pos, { count: 14, color: 0xb44dff, speed: 5, size: 0.12, life: 0.4, gravity: 2 });
          dead = true;
        }
      } else if (!dead && pr.owner === 'player') {
        /* 剑气击落弹幕 */
        for (let j = D.projectiles.length - 1; j >= 0; j--) {
          if (j === i) continue;
          const other = D.projectiles[j];
          if (other.owner !== 'enemy') continue;
          if (U.distXZ(other.pos, pr.pos) < 1.4) {
            W.emitBurst(other.pos, { count: 12, color: 0x8fe8ff, speed: 5, size: 0.1, life: 0.3, gravity: 2 });
            W.scene.remove(other.group);
            D.projectiles.splice(j, 1);
            if (j < i) i--;
          }
        }
        for (const e of D.enemies) {
          if (!e.alive || pr.hitSet.has(e.id)) continue;
          if (e.state === 'spawn' && e.t < 0.4) continue;
          if (U.distXZ(e.pos, pr.pos) < pr.radius + e.radius * 0.6) {
            pr.hitSet.add(e.id);
            const dxx = e.pos.x - P.pos.x, dzz = e.pos.z - P.pos.z;
            const l = Math.hypot(dxx, dzz) || 1;
            if (e.executable && e.type !== 'boss') {
              executeEnemy(e);
            } else {
              damageEnemy(e, pr.damage, { heavy: true, knockback: 6, dir: { x: dxx / l, z: dzz / l } });
            }
            W.emitBurst(pr.pos, { count: 22, color: 0x8fe8ff, speed: 8, size: 0.14, life: 0.5, gravity: 2 });
            pr.pierce--;
            if (pr.pierce <= 0) { dead = true; break; }
          }
        }
      }
      const r = Math.hypot(pr.pos.x, pr.pos.z);
      if (r > CFG.arenaRadius + 4) dead = true;
      if (dead) {
        W.scene.remove(pr.group);
        disposeGroup(pr.group);
        D.projectiles.splice(i, 1);
      }
    }
  }

  /* =========================================================
     波次
     ========================================================= */
  function startWave(n) {
    if (!G.combat) return;
    /* 清理残留 */
    if (n === 1) {
      for (const e of D.enemies) {
        if (e._bar) e._bar.style.display = 'none';
        W.scene.remove(e.group);
      }
      D.enemies.length = 0;
      D.boss = null;
    }
    S.wave = n;
    S.waveState = 'intro';
    S.waveTimer = 0;
    S.waveDamageTaken = 0;
    S.spawnQueue = [];
    if (n > WAVES.length) S.endless = true;
    const w = getWaveDef(n);
    if (!w) return;
    const isEndless = n > WAVES.length;
    if (!w.boss) {
      W.setCrimson(false);
      audio.setMusicMode(isEndless ? 'battle' : 'battle');
    } else {
      audio.setMusicMode('boss');
    }
    audio.setIntensity(Math.min(1, 0.3 + n * 0.08));

    /* 波次开始时的祝福回血 */
    let waveHeal = (P.mods.waveHealFlat || 0) + P.maxHp * (P.mods.waveHealPct || 0);
    if (waveHeal > 0 && P.hp > 0) {
      P.hp = Math.min(P.maxHp, P.hp + waveHeal);
    }
    if (G.hud) {
      G.hud.msg(w.label, 'big' + (w.boss ? ' violet' : ''));
      G.hud.waveIntro(n, w);
    }
    audio.sfx(w.boss ? 'bossStart' : 'waveStart');
    S.bossActive = !!w.boss;
    if (S.bossActive && G.hud) G.hud.showBoss(true);
    if (w.boss && isEndless && G.hud) {
      G.hud.msg('无 尽 · 第 ' + n + ' 波 · 守望者再临', 'small violet');
    }

    let idx = 0;
    const total = w.spawns.reduce((a, s) => a + s.n, 0);
    w.spawns.forEach((group) => {
      for (let i = 0; i < group.n; i++) {
        let x, z;
        if (group.type === 'boss') {
          x = P.pos.x + Math.sin(C.yaw) * 13.5;
          z = P.pos.z + Math.cos(C.yaw) * 13.5;
        } else {
          const a = (idx / Math.max(1, total)) * Math.PI * 2 + U.rand(-0.4, 0.4);
          const r = U.rand(17, 24);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        }
        const eliteChance = w.eliteChance || 0;
        const elite = group.type !== 'boss' && Math.random() < eliteChance;
        S.spawnQueue.push({
          type: group.type, x, z,
          delay: Math.min(6.5, 0.75 + idx * 0.24),
          opts: {
            hpMul: w.hpMul || 1,
            dmgMul: w.dmgMul || 1,
            scoreMul: w.scoreMul || 1,
            bossHpScale: w.hpMul || 1,
            elite,
            eliteKind: elite ? U.choice(['swift', 'shield', 'fury']) : null,
          },
        });
        idx++;
      }
    });
  }

  function updateWaves(dt) {
    const w = getWaveDef(S.wave);
    if (!w) return;
    if (S.waveState === 'intro') {
      S.waveTimer += dt;
      for (let i = S.spawnQueue.length - 1; i >= 0; i--) {
        const q = S.spawnQueue[i];
        q.delay -= dt;
        if (q.delay <= 0) {
          createEnemy(q.type, q.x, q.z, q.opts);
          S.spawnQueue.splice(i, 1);
        }
      }
      if (S.waveTimer > 1.1 && S.spawnQueue.length === 0) {
        S.waveState = 'fight';
        S.waveTimer = 0;
      }
    } else if (S.waveState === 'fight') {
      if (aliveCount() === 0 && S.spawnQueue.length === 0) {
        if (w.boss) return;
        S.waveState = 'clear';
        S.waveTimer = 0;
        const isEndless = S.wave > WAVES.length;
        const bonus = isEndless ? Math.round(420 + 180 * (S.wave - 5)) : 420 * S.wave;
        G.game.addScore(bonus);
        const heal = 20 + ((P.mods && P.mods.waveHealFlat) || 0) + Math.round(P.maxHp * ((P.mods && P.mods.waveHealPct) || 0));
        P.hp = Math.min(P.maxHp, P.hp + heal);
        if (P.potions < P.maxPotions) P.potions++;
        if (G.hud) {
          G.hud.msg('区 域 肃 清', 'big');
          G.hud.msg(S.waveDamageTaken <= 0 ? '无伤之刃 · 额外奖励' : `生命 +${heal} · 获得奖励 ${bonus}`, 'small');
        }
        if (S.waveDamageTaken <= 0) G.game.addScore(300);
        audio.sfx('heal');
        if (G.game.onWaveCleared) G.game.onWaveCleared(S.wave);
      }
    } else if (S.waveState === 'clear') {
      S.waveTimer += dt;
      /* 后续波次由 Game 在祝福选择完成后启动 */
    }
  }

  /* =========================================================
     主更新
     ========================================================= */
  function update(dt, raw) {
    if (P.state === 'dead') {
      P.t += dt;
      P.deathT += dt;
      updateEnemies(dt);
      animateEnemies(dt, S.realTime);
      updateProjectiles(dt);
      updatePickups(dt);
      return;
    }
    updatePlayer(dt);
    updateEnemies(dt);
    animateEnemies(dt, S.realTime);
    updateProjectiles(dt);
    updatePickups(dt);
    updateWaves(dt);
    /* 自动瞄准辅助：锁定目标死亡后失效 */
    if (P.lockTarget && (!P.lockTarget.alive)) P.lockTarget = null;
    /* 技能冷却 UI 状态 */
    if (G.hud) {
      G.hud.setCooldowns(P.waveCd, P.dodgeCd, P.parryCd);
      G.hud.setLockTarget(P.lockTarget);
    }
  }

  function updateEnd(dt, raw) {
    P.t += dt;
    if (P.state === 'dead') P.deathT += dt;
    updateEnemies(dt);
    animateEnemies(dt, S.realTime);
    updateProjectiles(dt);
    updatePickups(dt);
    if (P.lockTarget && !P.lockTarget.alive) P.lockTarget = null;
  }

  /* 自动驾驶（仅调试）：模拟一个会闪避、会喝药的普通玩家 */
  function autopilot(dt) {
    const t = nearestEnemy(40, false);
    const keys = G.game.keys;
    if (!t) {
      keys.KeyW = false; keys.KeyA = false; keys.KeyS = false; keys.KeyD = false;
      return;
    }
    const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z;
    const dist = Math.hypot(dx, dz);
    C.yaw = Math.atan2(dx, dz);
    C.yawTarget = C.yaw;
    C.pitch = 0.2;
    C.pitchTarget = 0.2;
    keys.KeyW = dist > 2.6;
    keys.KeyS = false;
    keys.KeyA = false;
    keys.KeyD = false;

    /* 防御：敌人起手时闪避 */
    let threat = null;
    for (const e of D.enemies) {
      if (!e.alive) continue;
      const d = U.distXZ(e.pos, P.pos);
      if (d < 4.6 && (e.state === 'windup' || e.state === 'strike' || (e.type === 'boss' && e.state === 'attack'))) { threat = e; break; }
    }
    if (threat && (P.state === 'idle' || P.state === 'run') && P.stamina >= 25 && P.dodgeCd <= 0) {
      const ax = P.pos.x - threat.pos.x, az = P.pos.z - threat.pos.z;
      const l = Math.hypot(ax, az) || 1;
      P.yaw = Math.atan2(ax / l, az / l);
      playerDodge();
    }
    /* Boss 震地预警时拉开距离 */
    if (D.boss && D.boss.alive && D.boss.state === 'windup' && D.boss.attackKind === 'slam') {
      C.yaw = Math.atan2(P.pos.x - D.boss.pos.x, P.pos.z - D.boss.pos.z);
      C.yawTarget = C.yaw;
      keys.KeyW = true;
      keys.KeyA = false;
      keys.KeyD = false;
      if (P.stamina > 30 && P.dodgeCd <= 0) playerDodge();
    }

    if (dist < 3.2 && (P.state === 'idle' || P.state === 'run')) playerAttack('light');
    if (dist < 3.4 && P.state === 'idle' && P.stamina > 55 && Math.random() < 0.02) playerAttack('heavy');
    if (P.momentum >= 100 && dist < 7) playerUlt();
    if (P.hp < 55 && P.potions > 0 && P.state === 'idle') playerHeal();
    if (P.state === 'idle' && P.stamina > 85 && Math.random() < 0.006) playerDodge();
    /* 自动测试：偶尔尝试格挡 / 弹反 */
    if (P.autoBlockCd > 0) P.autoBlockCd -= dt;
    if (P.autoBlockT > 0) {
      P.autoBlockT -= dt;
      P.blockHeld = true;
      if (P.autoBlockT <= 0) { playerParryUp(); P.blockHeld = false; }
    } else if (threat && threat.state === 'windup' && (P.state === 'idle' || P.state === 'run') && P.stamina > 30 && (P.autoBlockCd || 0) <= 0 && Math.random() < 0.12) {
      P.autoBlockT = 0.3;
      P.autoBlockCd = 1.4;
      P.blockHeld = true;
      playerParryDown();
    }
  }

  /* =========================================================
     重置 / 清理 / 调试
     ========================================================= */
  function clearAll() {
    for (const e of D.enemies) {
      killTele(e, false);
      if (e._bar) e._bar.style.display = 'none';
      W.scene.remove(e.group);
      disposeGroup(e.group);
    }
    for (const pr of D.projectiles) {
      W.scene.remove(pr.group);
      disposeGroup(pr.group);
    }
    if (D.pickups) {
      for (const p of D.pickups) {
        W.scene.remove(p.group);
        disposeGroup(p.group);
      }
      D.pickups.length = 0;
    }
    D.enemies.length = 0;
    D.projectiles.length = 0;
    D.boss = null;
    S.spawnQueue = [];
    S.bossActive = false;
    W.setCrimson(false);
  }

  function resetAll() {
    clearAll();
    S.waveState = 'idle';
    S.wave = 0;
  }

  function debugSpawn(type, x, z, opts) {
    if (!ENEMY_TYPES[type]) return null;
    if (x == null) x = P.pos.x + 4;
    if (z == null) z = P.pos.z + 4;
    const e = createEnemy(type, x, z, opts || {});
    e.state = 'chase';
    e.group.position.y = 0;
    e.group.scale.setScalar(e.finalScale);
    e.active = true;
    return e.id;
  }
  function debugDamageById(id, dmg) {
    const e = D.enemies.find(x => x.id === id);
    if (e && e.alive) damageEnemy(e, dmg == null ? 20 : dmg, { heavy: false });
    return e ? e.hp : null;
  }
  function debugDamageAll(dmg) {
    for (const e of [...D.enemies]) if (e.alive) damageEnemy(e, dmg, { heavy: true });
  }
  function debugKillAll() {
    for (const e of [...D.enemies]) {
      if (e.alive) { e.hp = 0; killEnemy(e, { silent: true }); }
    }
  }
  function debugSkipToBoss() {
    clearAll();
    S.wave = 4;
    startWave(5);
    /* 立即生成全部敌人，跳过入场排队（便于验收/调试） */
    while (S.spawnQueue.length) {
      const q = S.spawnQueue.shift();
      createEnemy(q.type, q.x, q.z, q.opts);
    }
    S.waveState = 'fight';
    S.waveTimer = 0;
  }

  G.combat = {
    update, updateEnd, animatePlayer, autopilot,
    resetAll, clearAll, startWave,
    playerAttack, playerDodge, playerWave, playerHeal, playerUlt, toggleLock: (() => {
      return function () {
        if (P.lockTarget && P.lockTarget.alive) {
          P.lockTarget = null;
          if (G.hud) G.hud.setLockTarget(null);
          return;
        }
        let best = null, bd = 1e9;
        for (const e of D.enemies) {
          if (!e.alive) continue;
          const d = U.distXZ(e.pos, P.pos);
          if (d < 34 && d < bd) { bd = d; best = e; }
        }
        P.lockTarget = best;
        if (best) audio.sfx('ui');
      };
    })(),
    playerParryDown, playerParryUp,
    perfectParry,
    damagePlayer, damageEnemy, executeEnemy,
    debugSpawn, debugDamageAll, debugKillAll, debugSkipToBoss, debugDamageById,
    debugAttack: function (kind) { playerAttack(kind || 'light'); },
    debugSpawnPickup: function (type, x, z) { spawnPickup(x == null ? P.pos.x + 2 : x, z == null ? P.pos.z + 2 : z, type || 'heal', null); },
    claimTarget: nearestEnemy,
    get aliveCount() { return aliveCount(); },
    getWaveDef,
    ENEMY_TYPES, WAVES, ELITE_KINDS,
  };
})();
