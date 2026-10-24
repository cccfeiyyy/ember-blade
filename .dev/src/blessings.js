/* ============================================================
   余烬之刃 v2 — 回响祝福（Echoes of the Blade）
   数据驱动构筑系统：每个祝福通过 apply(P) 修改 P.mods
   ============================================================ */
(function () {
  const G = window.G;
  const U = G.util;

  const RARITY = {
    common: { label: '普通', weight: 62, cls: 'common', color: 0x9fb4c8 },
    rare: { label: '稀有', weight: 28, cls: 'rare', color: 0x6fe3ff },
    epic: { label: '史诗', weight: 10, cls: 'epic', color: 0xc084ff },
  };
  G.BLESSING_RARITY = RARITY;

  /* 基础修正值：所有祝福在此之上叠加 */
  G.blessingModsBase = function () {
    return {
      lightMul: 1, heavyMul: 1, waveMul: 1, waveCdCut: 0, wavePierce: 0,
      speedMul: 1, dodgeDistMul: 1, momentumMul: 1,
      potionMax: 0, maxHpBonus: 0, staminaMaxBonus: 0, staminaRegenMul: 1,
      waveHealPct: 0, waveHealFlat: 0,
      execThresholdBonus: 0, executeHealBonus: 0,
      perfectBuff: 0,        /* 完美闪避/弹反后的增伤持续/倍率：0 表示没有 */
      burnPerHit: 0,         /* 每次命中附加的灼烧总伤害 */
      thornDamage: 0,        /* 受击反弹 */
      comboWave: 0,          /* 第三段轻斩附带剑气（层数） */
      storm: 0,              /* 每 5 连击冲击波（层数） */
      lifesteal: 0,          /* 击杀回复 */
      timeSand: 0,           /* 完美闪避/弹反强化 */
      comboWindowBonus: 0,   /* 连击窗口延长 */
      keepCombo: 0,          /* 受击不清连击 */
      damageTakenMul: 1,
      atkSpeedMul: 1,
      echoLord: 0,           /* 势满增伤 */
      deathDefy: 0,          /* 一次免死 */
      auraHeal: 0,
    };
  };

  function mul(P, key, v) { P.mods[key] *= v; }
  function add(P, key, v) { P.mods[key] += v; }

  const BLESSINGS = [
    /* ---------------- 普通 ---------------- */
    {
      id: 'sharp', name: '锋锐', icon: '锋', rarity: 'common', max: 3,
      desc: '轻斩伤害 +15%',
      flavor: '剑锋所至，皆成余烬。',
      apply(P) { mul(P, 'lightMul', 1.15); },
    },
    {
      id: 'heavyEdge', name: '重势', icon: '重', rarity: 'common', max: 3,
      desc: '重斩伤害 +20%，击退增强',
      flavor: '以身为轴，以势为刃。',
      apply(P) { mul(P, 'heavyMul', 1.2); },
    },
    {
      id: 'swift', name: '疾风', icon: '疾', rarity: 'common', max: 2,
      desc: '移动速度 +10%，闪避距离 +12%',
      flavor: '风追不上余烬。',
      apply(P) { mul(P, 'speedMul', 1.1); mul(P, 'dodgeDistMul', 1.12); },
    },
    {
      id: 'vigor', name: '不屈', icon: '命', rarity: 'common', max: 3,
      desc: '生命上限 +25，立即回复 25',
      flavor: '只要还剩一口气。',
      apply(P) { add(P, 'maxHpBonus', 25); },
      onPick(P) { P.hp = Math.min(P.maxHp, P.hp + 25); },
    },
    {
      id: 'drinker', name: '饮者', icon: '饮', rarity: 'common', max: 2,
      desc: '药水上限 +1，立即获得 1 瓶',
      flavor: '余烬入口，血脉重燃。',
      apply(P) { add(P, 'potionMax', 1); },
      onPick(P) { P.potions = Math.min(P.maxPotions, P.potions + 1); },
    },
    {
      id: 'momentumFlow', name: '势涌', icon: '势', rarity: 'common', max: 2,
      desc: '获得势能 +25%',
      flavor: '怒意不熄，剑势自涌。',
      apply(P) { mul(P, 'momentumMul', 1.25); },
    },
    {
      id: 'footwork', name: '步法', icon: '步', rarity: 'common', max: 2,
      desc: '体力上限 +20，体力回复 +15%',
      flavor: '呼吸、落步、出剑。',
      apply(P) { add(P, 'staminaMaxBonus', 20); mul(P, 'staminaRegenMul', 1.15); },
    },
    {
      id: 'recovery', name: '余温', icon: '愈', rarity: 'common', max: 2,
      desc: '每波开始时回复 12 生命',
      flavor: '灰烬深处仍有余温。',
      apply(P) { add(P, 'waveHealFlat', 12); },
    },

    /* ---------------- 稀有 ---------------- */
    {
      id: 'waveMaster', name: '剑压', icon: '剑', rarity: 'rare', max: 2,
      desc: '剑气伤害 +35%，冷却 -0.7s，穿透 +1',
      flavor: '斩出的是剑气，也是意志。',
      apply(P) { mul(P, 'waveMul', 1.35); add(P, 'waveCdCut', 0.7); add(P, 'wavePierce', 1); },
    },
    {
      id: 'executioner', name: '处决者', icon: '处', rarity: 'rare', max: 2,
      desc: '处决阈值 +8%，处决回复 +8 生命',
      flavor: '留给你一息，只为最后一剑。',
      apply(P) { add(P, 'execThresholdBonus', 0.08); add(P, 'executeHealBonus', 8); },
    },
    {
      id: 'perfectEcho', name: '完美余音', icon: '韵', rarity: 'rare', max: 2,
      desc: '完美闪避/弹反后 3 秒内，攻击伤害 +50%',
      flavor: '危险之后的余韵。',
      apply(P) { add(P, 'perfectBuff', 1); },
    },
    {
      id: 'burn', name: '烬火缠身', icon: '炎', rarity: 'rare', max: 2,
      desc: '命中附加灼烧，3 秒内共 24 伤害（叠加）',
      flavor: '伤口里开出了余烬。',
      apply(P) { add(P, 'burnPerHit', 24); },
    },
    {
      id: 'thorn', name: '荆棘', icon: '荆', rarity: 'rare', max: 2,
      desc: '受到伤害时，反弹 14 点伤害给周围敌人',
      flavor: '触碰我的人会记住代价。',
      apply(P) { add(P, 'thornDamage', 14); },
    },
    {
      id: 'comboBlade', name: '回响之刃', icon: '连', rarity: 'rare', max: 1,
      desc: '轻斩第三段附带一道剑气',
      flavor: '斩击的回声追上第二剑。',
      apply(P) { add(P, 'comboWave', 1); },
    },
    {
      id: 'storm', name: '剑势风暴', icon: '暴', rarity: 'rare', max: 1,
      desc: '每 5 连击释放一次小范围冲击波（20 伤害）',
      flavor: '剑势积聚成风暴。',
      apply(P) { add(P, 'storm', 1); },
    },
    {
      id: 'lifesteal', name: '噬魂', icon: '噬', rarity: 'rare', max: 2,
      desc: '击杀回复 6 生命',
      flavor: '敌人的余烬归于你。',
      apply(P) { add(P, 'lifesteal', 6); },
    },

    /* ---------------- 史诗 ---------------- */
    {
      id: 'timeSand', name: '时之砂', icon: '时', rarity: 'epic', max: 1,
      desc: '完美闪避/弹反的慢动作延长，且 25% 几率立刻重置闪避',
      flavor: '你听见时间碎了一角。',
      apply(P) { add(P, 'timeSand', 1); },
    },
    {
      id: 'endlessCombo', name: '无限连', icon: '无', rarity: 'epic', max: 1,
      desc: '连击窗口 +1.5 秒，受到伤害不再清空连击',
      flavor: '连击的尽头是另一个你。',
      apply(P) { add(P, 'comboWindowBonus', 1.5); add(P, 'keepCombo', 1); },
    },
    {
      id: 'immortal', name: '不灭余烬', icon: '烬', rarity: 'epic', max: 1,
      desc: '每波开始回复 35% 生命，但受到伤害 +10%',
      flavor: '烧不尽的，才是余烬。',
      apply(P) { add(P, 'waveHealPct', 0.35); mul(P, 'damageTakenMul', 1.1); },
    },
    {
      id: 'dualBlade', name: '双刃', icon: '双', rarity: 'epic', max: 1,
      desc: '攻击速度 +18%，生命上限 -20',
      flavor: '快，是另一种狠。',
      apply(P) { mul(P, 'atkSpeedMul', 1.18); add(P, 'maxHpBonus', -20); },
    },
    {
      id: 'echoLord', name: '回响之主', icon: '主', rarity: 'epic', max: 1,
      desc: '势能满时伤害 +15%；烬灭伤害/范围 +25%',
      flavor: '竞技场记得每一个主人。',
      apply(P) { add(P, 'echoLord', 1); },
    },
    {
      id: 'deathDefy', name: '向死而生', icon: '生', rarity: 'epic', max: 1,
      desc: '每场战斗一次：致命伤时保留 1 点生命并短暂无敌',
      flavor: '死亡也曾被你斩断。',
      apply(P) { add(P, 'deathDefy', 1); },
    },
  ];

  const BY_ID = {};
  BLESSINGS.forEach((b) => { BY_ID[b.id] = b; });

  function recalc(P) {
    P.mods = G.blessingModsBase();
    const counts = {};
    for (const b of P.blessings) {
      counts[b.id] = (counts[b.id] || 0) + 1;
      b.apply(P, P);
    }
    P.maxHp = Math.max(50, 100 + P.mods.maxHpBonus);
    P.maxStamina = 100 + P.mods.staminaMaxBonus;
    P.maxPotions = 3 + P.mods.potionMax;
    if (P.hp > P.maxHp) P.hp = P.maxHp;
    if (P.stamina > P.maxStamina) P.stamina = P.maxStamina;
    if (P.potions > P.maxPotions) P.potions = P.maxPotions;
    P.blessingCounts = counts;
  }

  function rarityWeight(rarity, wave) {
    const base = RARITY[rarity].weight;
    if (rarity === 'common') return Math.max(18, base - wave * 2);
    if (rarity === 'rare') return Math.min(52, base + wave * 2.5);
    return Math.min(40, base + wave * 3.5);
  }

  function rollChoices(P, wave, count) {
    count = count || 3;
    const pool = BLESSINGS.filter((b) => (P.blessingCounts[b.id] || 0) < b.max);
    const picks = [];
    let guard = 0;
    while (picks.length < count && guard++ < 200) {
      /* 按稀有度权重抽取，再按该稀有度权重挑选 */
      const totalBy = {};
      let total = 0;
      for (const b of pool) {
        if (picks.includes(b)) continue;
        const w = rarityWeight(b.rarity, wave);
        totalBy[b.rarity] = (totalBy[b.rarity] || 0) + w;
        total += w;
      }
      if (total <= 0) break;
      let roll = Math.random() * total;
      let rarityPick = 'common';
      for (const r in totalBy) {
        if (roll < totalBy[r]) { rarityPick = r; break; }
        roll -= totalBy[r];
      }
      const sub = pool.filter(b => b.rarity === rarityPick && !picks.includes(b));
      if (!sub.length) {
        const rest = pool.filter(b => !picks.includes(b));
        if (!rest.length) break;
        picks.push(U.choice(rest));
      } else {
        picks.push(U.choice(sub));
      }
    }
    return picks.slice(0, count);
  }

  G.BLESSINGS = BLESSINGS;
  G.getBlessing = function (id) { return BY_ID[id]; };
  G.recalcBlessingMods = recalc;
  G.rollBlessingChoices = rollChoices;
})();
