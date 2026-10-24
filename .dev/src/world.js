/* ============================================================
   余烬之刃 — 场景 / 模型 / 特效
   ============================================================ */
(function () {
  const G = window.G;
  const U = G.util;
  const W = G.world;

  let renderer, scene, camera, clock;
  let lowSpec = false;
  const vfx = {
    particles: [],          /* CPU 粒子池记录 */
    pGeo: null, pPoints: null, pIdx: 0, pCount: 1200,
    pPos: null, pCol: null, pSize: null, pAlpha: null,
    flashes: [], arcs: [], rings: [], portals: [], ghosts: [],
    emberTimer: 0, ashTimer: 0,
  };

  /* ---------------------------------------------------------
     贴图生成
     --------------------------------------------------------- */
  /* 贴图缓存：相同参数的贴图只生成一次，避免高频特效造成纹理泄漏 */
  const _texCache = new Map();

  function makeGlowTexture(size, inner, color) {
    const key = 'glow|' + size + '|' + (inner || 0) + '|' + (color || '');
    if (_texCache.has(key)) return _texCache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color || 'rgba(255,255,255,1)');
    g.addColorStop(inner || 0.22, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    _texCache.set(key, t);
    return t;
  }

  function makeBlobShadowTexture() {
    if (_texCache.has('blob')) return _texCache.get('blob');
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.72)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    _texCache.set('blob', t);
    return t;
  }

  function makeMoonTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(112, 108, 10, 128, 128, 126);
    g.addColorStop(0, 'rgba(238,244,255,1)');
    g.addColorStop(0.55, 'rgba(190,205,230,1)');
    g.addColorStop(0.82, 'rgba(140,160,196,0.95)');
    g.addColorStop(1, 'rgba(110,130,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 126, 0, U.PI2);
    ctx.fill();
    /* 环形山 */
    const craters = [[108, 96, 15], [152, 128, 11], [118, 150, 9], [160, 88, 7], [96, 128, 6], [140, 164, 5]];
    craters.forEach(([x, y, r]) => {
      const cg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      cg.addColorStop(0, 'rgba(120,138,170,0.5)');
      cg.addColorStop(0.7, 'rgba(150,168,198,0.35)');
      cg.addColorStop(1, 'rgba(200,212,235,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.PI2); ctx.fill();
    });
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function makeArenaTextures() {
    const S = 2048;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      return { c, ctx: c.getContext('2d') };
    };
    const base = mk(), emis = mk();
    const b = base.ctx, e = emis.ctx;
    b.fillStyle = '#0a0d13';
    b.fillRect(0, 0, S, S);
    e.fillStyle = '#000';
    e.fillRect(0, 0, S, S);

    /* 石质颗粒 */
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = Math.random() * 3.4 + 0.4;
      const v = Math.floor(10 + Math.random() * 16);
      b.fillStyle = `rgba(${v + 4},${v + 7},${v + 13},${Math.random() * 0.5 + 0.15})`;
      b.beginPath(); b.arc(x, y, r, 0, U.PI2); b.fill();
    }
    /* 大块石板缝隙 */
    b.strokeStyle = 'rgba(5,7,11,0.85)';
    b.lineWidth = 10;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * U.PI2 + Math.random() * 0.25;
      b.beginPath();
      b.moveTo(S / 2, S / 2);
      b.lineTo(S / 2 + Math.cos(a) * S * 0.52, S / 2 + Math.sin(a) * S * 0.52);
      b.stroke();
    }

    const cx = S / 2, cy = S / 2;
    /* 同心法阵 */
    const circles = [0.12, 0.24, 0.37, 0.485];
    circles.forEach((rr, idx) => {
      const r = rr * S;
      b.strokeStyle = idx % 2 ? 'rgba(58,80,94,0.55)' : 'rgba(40,56,68,0.55)';
      b.lineWidth = idx === 0 ? 6 : 4;
      b.beginPath(); b.arc(cx, cy, r, 0, U.PI2); b.stroke();
      e.strokeStyle = idx === 0 ? 'rgba(120,215,235,0.45)' : 'rgba(45,100,120,0.25)';
      e.lineWidth = idx === 0 ? 5 : 2.5;
      e.beginPath(); e.arc(cx, cy, r, 0, U.PI2); e.stroke();
    });
    /* 放射线 / 符文刻度 */
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * U.PI2;
      const r0 = 0.25 * S, r1 = i % 4 === 0 ? 0.485 * S : 0.47 * S;
      b.strokeStyle = i % 4 === 0 ? 'rgba(66,92,106,0.5)' : 'rgba(34,46,56,0.45)';
      b.lineWidth = i % 4 === 0 ? 4 : 2;
      b.beginPath();
      b.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      b.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      b.stroke();
      if (i % 4 === 0) {
        e.strokeStyle = 'rgba(255,150,80,0.36)';
        e.lineWidth = 4;
        e.beginPath();
        e.arc(cx, cy, 0.477 * S, a - 0.03, a + 0.03);
        e.stroke();
      }
    }
    /* 中央剑阵纹 */
    e.save();
    e.translate(cx, cy);
    e.strokeStyle = 'rgba(255,160,90,0.55)';
    e.lineWidth = 5;
    for (let k = 0; k < 8; k++) {
      e.rotate(U.PI2 / 8);
      e.beginPath();
      e.arc(0, 0, 0.085 * S, -0.16, 0.16);
      e.stroke();
      e.beginPath();
      e.moveTo(0.03 * S, 0);
      e.lineTo(0.062 * S, 0);
      e.stroke();
    }
    e.beginPath(); e.arc(0, 0, 0.058 * S, 0, U.PI2); e.stroke();
    e.restore();
    b.save();
    b.translate(cx, cy);
    b.strokeStyle = 'rgba(120,90,60,0.4)';
    b.lineWidth = 8;
    for (let k = 0; k < 8; k++) {
      b.rotate(U.PI2 / 8);
      b.beginPath(); b.arc(0, 0, 0.085 * S, -0.16, 0.16); b.stroke();
    }
    b.restore();

    /* 裂隙：从外缘向中心的锯齿线 */
    const crackSeeds = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * U.PI2;
      const startR = (0.34 + Math.random() * 0.15) * S;
      const points = [];
      let x = cx + Math.cos(a) * startR, y = cy + Math.sin(a) * startR;
      const dir = a + Math.PI + (Math.random() - 0.5) * 0.8;
      points.push([x, y]);
      let d = dir;
      for (let s = 0; s < 6; s++) {
        d += (Math.random() - 0.5) * 0.9;
        const len = (0.02 + Math.random() * 0.05) * S;
        x += Math.cos(d) * len;
        y += Math.sin(d) * len;
        points.push([x, y]);
      }
      crackSeeds.push(points);
    }
    crackSeeds.forEach((pts) => {
      b.strokeStyle = 'rgba(4,6,9,0.9)';
      b.lineWidth = 10;
      b.beginPath(); b.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) b.lineTo(pts[i][0], pts[i][1]);
      b.stroke();
      b.strokeStyle = 'rgba(28,64,74,0.85)';
      b.lineWidth = 4;
      b.beginPath(); b.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) b.lineTo(pts[i][0], pts[i][1]);
      b.stroke();
      e.shadowColor = 'rgba(110,225,255,0.9)';
      e.shadowBlur = 30;
      e.strokeStyle = 'rgba(130,235,255,0.92)';
      e.lineWidth = 4.4;
      e.beginPath(); e.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) e.lineTo(pts[i][0], pts[i][1]);
      e.stroke();
      e.shadowBlur = 0;
    });

    /* 外圈警戒符文带 */
    e.save();
    e.translate(cx, cy);
    e.strokeStyle = 'rgba(255,130,60,0.4)';
    e.lineWidth = 3.4;
    e.setLineDash([26, 38]);
    e.beginPath(); e.arc(0, 0, 0.497 * S, 0, U.PI2); e.stroke();
    e.setLineDash([]);
    e.restore();

    /* 渐暗边缘 */
    const edge = b.createRadialGradient(cx, cy, S * 0.3, cx, cy, S * 0.52);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(2,4,7,0.92)');
    b.fillStyle = edge;
    b.fillRect(0, 0, S, S);

    const map = new THREE.CanvasTexture(base.c);
    map.encoding = THREE.sRGBEncoding;
    map.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
    const em = new THREE.CanvasTexture(emis.c);
    em.encoding = THREE.sRGBEncoding;
    em.anisotropy = map.anisotropy;
    return { map, emissive: em };
  }

  /* ---------------------------------------------------------
     几何 / 材质工具
     --------------------------------------------------------- */
  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.castShadowDefault = true;
    return m;
  }
  function box(w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function cyl(rt, rb, h, seg, mat, x, y, z) { return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z); }
  function sph(r, mat, x, y, z, ws, hs) {
    const g = new THREE.SphereGeometry(r, ws || 12, hs || 10);
    return mesh(g, mat, x, y, z);
  }
  function plane(w, h, mat, x, y, z) {
    const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z);
    m.castShadow = false;
    return m;
  }
  function matSet() {
    return {
      armor: new THREE.MeshStandardMaterial({ color: 0x333b4d, metalness: 0.72, roughness: 0.4 }),
      armorDark: new THREE.MeshStandardMaterial({ color: 0x1e2330, metalness: 0.55, roughness: 0.55 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x1a1517, metalness: 0.0, roughness: 0.92, side: THREE.DoubleSide }),
      clothRed: new THREE.MeshStandardMaterial({ color: 0x571d1b, metalness: 0.0, roughness: 0.86, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ color: 0x2a1c14, metalness: 0.5, roughness: 0.5, emissive: 0xff5a1a, emissiveIntensity: 1.8 }),
      blade: new THREE.MeshStandardMaterial({ color: 0xb9c5d4, metalness: 1.0, roughness: 0.16, emissive: 0xff4d12, emissiveIntensity: 0.28 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xffb060, emissiveIntensity: 3.2 }),
    };
  }

  /* ---------------------------------------------------------
     玩家模型
     --------------------------------------------------------- */
  function buildPlayer() {
    const M = matSet();
    M.clothRed.color.setHex(0x6b2420);
    const root = new THREE.Group();
    root.name = 'player-root';
    const visual = new THREE.Group();
    root.add(visual);

    const hips = new THREE.Group();
    hips.position.y = 0.94;
    visual.add(hips);

    const torso = new THREE.Group();
    hips.add(torso);

    /* 身体 */
    const pelvis = box(0.34, 0.2, 0.24, M.armorDark, 0, 0.02, 0);
    torso.add(pelvis);
    const chest = box(0.5, 0.54, 0.28, M.armor, 0, 0.36, 0);
    chest.scale.set(1, 1, 1);
    torso.add(chest);
    const chestPlate = box(0.42, 0.3, 0.1, M.armorDark, 0, 0.42, 0.17);
    torso.add(chestPlate);
    const emblem = box(0.09, 0.16, 0.03, M.trim, 0, 0.44, 0.235);
    torso.add(emblem);
    /* 腹部布甲 */
    torso.add(box(0.42, 0.2, 0.24, M.cloth, 0, 0.06, 0));

    /* 肩甲 */
    const pauldronGeo = new THREE.BoxGeometry(0.24, 0.18, 0.3);
    const pauldronL = new THREE.Mesh(pauldronGeo, M.armor);
    pauldronL.position.set(0.38, 0.56, 0); pauldronL.rotation.z = -0.22;
    pauldronL.castShadow = true; torso.add(pauldronL);
    const pauldronR = pauldronL.clone(); pauldronR.position.x = -0.38; pauldronR.rotation.z = 0.22; torso.add(pauldronR);
    const pauldronTrimL = box(0.05, 0.12, 0.16, M.trim, 0.45, 0.55, 0.06); pauldronTrimL.rotation.z = -0.22; torso.add(pauldronTrimL);
    const pauldronTrimR = pauldronTrimL.clone(); pauldronTrimR.position.x = -0.45; pauldronTrimR.rotation.z = 0.22; torso.add(pauldronTrimR);

    /* 头部 */
    const head = new THREE.Group();
    head.position.set(0, 0.72, 0);
    torso.add(head);
    torso.add(cyl(0.09, 0.13, 0.12, 8, M.armorDark, 0, 0.63, 0)); /* 颈 */
    const skull = sph(0.155, M.armor, 0, 0.07, 0.01);
    skull.scale.set(1, 1.08, 1);
    head.add(skull);
    /* 头盔面甲 */
    head.add(box(0.24, 0.14, 0.08, M.armorDark, 0, 0.07, 0.12));
    const visor = box(0.19, 0.028, 0.03, M.trim, 0, 0.09, 0.17);
    head.add(visor);
    /* 盔檐与冠饰 */
    const crest = box(0.045, 0.1, 0.26, M.trim, 0, 0.23, -0.02);
    crest.rotation.x = -0.18;
    head.add(crest);
    const crestBack = box(0.03, 0.05, 0.22, M.clothRed, 0, 0.2, -0.16);
    crestBack.rotation.x = 0.7;
    head.add(crestBack);
    /* 飘带 */
    const ribbon = new THREE.Group();
    head.add(ribbon);
    for (let i = 0; i < 3; i++) {
      const p = plane(0.1 + i * 0.03, 0.5, M.clothRed, 0, 0.1 - i * 0.14, -0.2 - i * 0.07);
      p.rotation.x = -1.1 - i * 0.14;
      p.rotation.z = (i - 1) * 0.12;
      ribbon.add(p);
    }

    /* 手臂 */
    function buildArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.33 * side, 0.5, 0);
      torso.add(shoulder);
      const upper = cyl(0.065, 0.075, 0.32, 8, M.armor, 0, -0.16, 0);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.32, 0);
      shoulder.add(elbow);
      elbow.add(cyl(0.055, 0.062, 0.3, 8, M.armorDark, 0, -0.15, 0));
      const hand = new THREE.Group();
      hand.position.set(0, -0.31, 0);
      elbow.add(hand);
      hand.add(sph(0.06, M.armorDark, 0, 0, 0));
      return { shoulder, elbow, hand, upper };
    }
    const armR = buildArm(1);
    const armL = buildArm(-1);

    /* 腿 */
    function buildLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(0.14 * side, 0.02, 0);
      hips.add(hip);
      hip.add(box(0.17, 0.4, 0.18, M.armorDark, 0, -0.21, 0));
      const knee = new THREE.Group();
      knee.position.set(0, -0.42, 0);
      hip.add(knee);
      knee.add(box(0.15, 0.38, 0.16, M.armor, 0, -0.2, 0));
      knee.add(box(0.17, 0.09, 0.28, M.armorDark, 0, -0.4, 0.05));
      return { hip, knee };
    }
    const legR = buildLeg(1);
    const legL = buildLeg(-1);

    /* 剑 */
    const sword = new THREE.Group();
    sword.position.set(0, -0.02, 0);
    sword.rotation.x = Math.PI * 0.72;
    armR.hand.add(sword);
    sword.add(cyl(0.022, 0.026, 0.2, 8, M.cloth, 0, -0.02, 0));       /* 剑柄 */
    sword.add(sph(0.038, M.trim, 0, -0.13, 0));                         /* 剑首 */
    sword.add(box(0.24, 0.035, 0.065, M.trim, 0, 0.085, 0));            /* 护手 */
    const blade = box(0.055, 1.02, 0.016, M.blade, 0, 0.6, 0);
    sword.add(blade);
    const bladeEdge = box(0.012, 1.0, 0.02, M.trim, 0.033, 0.6, 0);
    sword.add(bladeEdge);
    const tip = mesh(new THREE.ConeGeometry(0.032, 0.12, 4), M.blade, 0, 1.16, 0);
    sword.add(tip);
    const bladeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xff7a30, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    bladeGlow.scale.set(0.5, 1.5, 1);
    bladeGlow.position.set(0, 0.65, 0);
    sword.add(bladeGlow);
    const swordLight = new THREE.PointLight(0xff6a28, 1.0, 7, 2);
    swordLight.position.set(0, 0.6, 0);
    sword.add(swordLight);

    /* 披风 */
    const cape = new THREE.Group();
    cape.position.set(0, 0.56, -0.17);
    torso.add(cape);
    const capeSegs = [];
    for (let i = 0; i < 4; i++) {
      const p = plane(0.46 - i * 0.045, 0.34, M.clothRed, 0, -0.15 - i * 0.3, -0.02 - i * 0.05);
      p.rotation.x = 0.2 + i * 0.03;
      cape.add(p);
      capeSegs.push(p);
    }

    return {
      root, visual, hips, torso, head, ribbon,
      armR, armL, legR, legL, sword, blade, bladeGlow, swordLight, cape, capeSegs,
    };
  }

  /* ---------------------------------------------------------
     敌人模型
     --------------------------------------------------------- */
  function buildWraith() {
    const M = matSet();
    M.body = new THREE.MeshStandardMaterial({ color: 0x2a1838, metalness: 0.1, roughness: 0.9, side: THREE.DoubleSide });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x12060a, emissive: 0xff2f7a, emissiveIntensity: 4.6 });
    M.veil = new THREE.MeshStandardMaterial({ color: 0x1a0f24, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
    const root = new THREE.Group();
    const visual = new THREE.Group();
    visual.position.y = 1.05;
    root.add(visual);
    const body = mesh(new THREE.ConeGeometry(0.42, 1.4, 8, 1, true), M.body, 0, 0, 0);
    body.rotation.y = Math.PI / 8;
    visual.add(body);
    const hood = mesh(new THREE.ConeGeometry(0.34, 0.62, 8, 1, true), M.body, 0, 0.72, 0);
    visual.add(hood);
    visual.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({
      color: 0x09040c, roughness: 1, side: THREE.DoubleSide,
    }), 0, 0.62, 0));
    const eyeL = sph(0.047, M.eye, 0.1, 0.66, 0.16, 8, 6);
    const eyeR = sph(0.047, M.eye, -0.1, 0.66, 0.16, 8, 6);
    visual.add(eyeL); visual.add(eyeR);
    /* 破碎裙摆 */
    const skirts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * U.PI2;
      const p = plane(0.22, 0.85, M.veil, Math.sin(a) * 0.33, -0.62 + Math.random() * 0.1, Math.cos(a) * 0.33);
      p.rotation.y = a;
      p.rotation.x = 0.18 + Math.random() * 0.2;
      visual.add(p);
      skirts.push(p);
    }
    /* 爪臂 */
    function claw(side) {
      const g = new THREE.Group();
      g.position.set(0.34 * side, 0.18, 0.06);
      const arm = mesh(new THREE.ConeGeometry(0.045, 0.55, 5), M.body, 0, -0.24, 0);
      g.add(arm);
      visual.add(g);
      return g;
    }
    const clawL = claw(1), clawR = claw(-1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xff2f7a, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.5, 1.5, 1);
    glow.position.y = 0.55;
    visual.add(glow);
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBlobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    shadow.scale.set(1.1, 1.1, 1);
    shadow.position.y = 0.05;
    root.add(shadow);
    return { root, visual, eyeL, eyeR, clawL, clawR, skirts, glow, shadow, parts: { body, hood } };
  }

  function buildGolem() {
    const M = matSet();
    M.rock = new THREE.MeshStandardMaterial({ color: 0x3a3733, metalness: 0.12, roughness: 0.93 });
    M.rockDark = new THREE.MeshStandardMaterial({ color: 0x24221f, metalness: 0.1, roughness: 0.96 });
    M.crack = new THREE.MeshStandardMaterial({ color: 0x201410, emissive: 0xff7a2a, emissiveIntensity: 1.6 });
    M.core = new THREE.MeshStandardMaterial({ color: 0x140a07, emissive: 0xffb060, emissiveIntensity: 2.6 });
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.add(visual);
    /* 腿 */
    function leg(side) {
      const g = new THREE.Group();
      g.position.set(0.34 * side, 1.02, 0);
      g.add(box(0.36, 0.62, 0.4, M.rockDark, 0, -0.28, 0));
      g.add(box(0.42, 0.3, 0.52, M.rock, 0, -0.68, 0.05));
      visual.add(g);
      return g;
    }
    const legL = leg(1), legR = leg(-1);
    /* 躯干 */
    const torso = new THREE.Group();
    torso.position.y = 1.52;
    visual.add(torso);
    torso.add(box(1.15, 1.0, 0.78, M.rock, 0, 0.1, 0));
    torso.add(box(0.9, 0.5, 0.14, M.rockDark, 0, -0.15, 0.4));
    const core = sph(0.16, M.core, 0, 0.16, 0.41, 10, 8);
    torso.add(core);
    for (let i = 0; i < 4; i++) {
      const cr = box(0.03, 0.22 + Math.random() * 0.2, 0.02, M.crack,
        (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, 0.4);
      cr.rotation.z = (Math.random() - 0.5) * 1.2;
      torso.add(cr);
    }
    /* 头 */
    const head = new THREE.Group();
    head.position.set(0, 0.78, 0.04);
    torso.add(head);
    head.add(box(0.5, 0.42, 0.46, M.rock, 0, 0, 0));
    head.add(box(0.34, 0.07, 0.05, M.core, 0, 0.04, 0.235));
    head.add(box(0.6, 0.1, 0.5, M.rockDark, 0, 0.24, 0));
    /* 肩 */
    const shoulderGeo = new THREE.BoxGeometry(0.5, 0.42, 0.62);
    const shL = new THREE.Mesh(shoulderGeo, M.rock); shL.position.set(0.72, 0.58, 0); shL.castShadow = true; torso.add(shL);
    const shR = shL.clone(); shR.position.x = -0.72; torso.add(shR);
    /* 手臂 / 巨拳 */
    function arm(side) {
      const g = new THREE.Group();
      g.position.set(0.78 * side, 0.5, 0);
      torso.add(g);
      const upper = box(0.3, 0.62, 0.32, M.rock, 0, -0.3, 0);
      g.add(upper);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.6, 0);
      g.add(elbow);
      elbow.add(box(0.34, 0.55, 0.36, M.rockDark, 0, -0.26, 0));
      const fist = box(0.5, 0.42, 0.5, M.rock, 0, -0.62, 0.05);
      elbow.add(fist);
      elbow.add(box(0.42, 0.1, 0.06, M.crack, 0, -0.6, 0.3));
      return { shoulder: g, elbow, fist };
    }
    const armL = arm(1), armR = arm(-1);
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBlobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    shadow.scale.set(2.0, 2.0, 1);
    shadow.position.y = 0.05;
    root.add(shadow);
    return { root, visual, torso, head, legL, legR, armL, armR, core, shadow };
  }

  function buildHexer() {
    const M = matSet();
    M.shard = new THREE.MeshStandardMaterial({ color: 0x2e1745, metalness: 0.5, roughness: 0.35 });
    M.ring = new THREE.MeshStandardMaterial({ color: 0x241038, emissive: 0xb44dff, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.4 });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x12040f, emissive: 0xff3d8b, emissiveIntensity: 4.6 });
    const root = new THREE.Group();
    const visual = new THREE.Group();
    visual.position.y = 1.65;
    root.add(visual);
    const core = mesh(new THREE.OctahedronGeometry(0.55, 0), M.shard, 0, 0, 0);
    core.scale.set(1, 1.5, 1);
    visual.add(core);
    const ring1 = mesh(new THREE.TorusGeometry(0.75, 0.035, 6, 40), M.ring, 0, 0, 0);
    ring1.rotation.x = Math.PI * 0.42;
    visual.add(ring1);
    const ring2 = mesh(new THREE.TorusGeometry(0.95, 0.025, 5, 44), M.ring, 0, 0, 0);
    ring2.rotation.x = Math.PI * 0.58; ring2.rotation.y = 0.6;
    visual.add(ring2);
    const eye = sph(0.15, M.eye, 0, 0.12, 0.42, 10, 8);
    visual.add(eye);
    visual.add(sph(0.09, new THREE.MeshStandardMaterial({ color: 0x1a0d24, roughness: 1 }), 0, 0.12, 0.5, 8, 6));
    /* 悬浮碎片 */
    const shards = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * U.PI2;
      const s = mesh(new THREE.TetrahedronGeometry(0.12 + Math.random() * 0.08), M.shard,
        Math.cos(a) * 1.15, (Math.random() - 0.5) * 0.6, Math.sin(a) * 1.15);
      visual.add(s);
      shards.push(s);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xb44dff, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(2.4, 2.4, 1);
    visual.add(glow);
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBlobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    shadow.scale.set(1.2, 1.2, 1);
    shadow.position.y = 0.05;
    root.add(shadow);
    return { root, visual, core, ring1, ring2, eye, shards, glow, shadow };
  }

  function buildBoss() {
    const M = matSet();
    M.bossArmor = new THREE.MeshStandardMaterial({ color: 0x1d1a22, metalness: 0.85, roughness: 0.38 });
    M.bossDark = new THREE.MeshStandardMaterial({ color: 0x0c0a10, metalness: 0.6, roughness: 0.6 });
    M.bossTrim = new THREE.MeshStandardMaterial({ color: 0x2a0d0c, metalness: 0.6, roughness: 0.4, emissive: 0xff2a1a, emissiveIntensity: 2.2 });
    M.blade = new THREE.MeshStandardMaterial({ color: 0x4a4448, metalness: 1.0, roughness: 0.22, emissive: 0xff2a1a, emissiveIntensity: 0.7 });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x120000, emissive: 0xff2418, emissiveIntensity: 5.0 });
    M.void = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0 });
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.add(visual);
    /* 腿 */
    function leg(side) {
      const g = new THREE.Group();
      g.position.set(0.52 * side, 1.55, 0);
      g.add(box(0.52, 0.9, 0.55, M.bossDark, 0, -0.42, 0));
      g.add(box(0.62, 0.26, 0.75, M.bossArmor, 0, -0.92, 0.08));
      visual.add(g);
      return g;
    }
    const legL = leg(1), legR = leg(-1);
    /* 躯干 */
    const torso = new THREE.Group();
    torso.position.y = 2.15;
    visual.add(torso);
    torso.add(box(1.7, 1.5, 1.0, M.bossArmor, 0, 0.25, 0));
    torso.add(box(1.2, 0.8, 0.18, M.bossDark, 0, 0.32, 0.53));
    torso.add(box(0.3, 0.55, 0.06, M.bossTrim, 0, 0.35, 0.63));
    torso.add(box(1.3, 0.35, 0.85, M.bossDark, 0, -0.55, 0));
    /* 胸口裂隙 */
    for (let i = 0; i < 5; i++) {
      const cr = box(0.04, 0.2 + Math.random() * 0.45, 0.02, M.bossTrim,
        (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.8, 0.63);
      cr.rotation.z = (Math.random() - 0.5) * 1.4;
      torso.add(cr);
    }
    /* 头：无面 */
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.05);
    torso.add(head);
    head.add(box(0.62, 0.62, 0.58, M.bossDark, 0, 0, 0));
    head.add(box(0.5, 0.4, 0.1, M.void, 0, 0.02, 0.3));
    const eyeL = box(0.07, 0.055, 0.04, M.eye, 0.15, 0.06, 0.36);
    const eyeR = box(0.07, 0.055, 0.04, M.eye, -0.15, 0.06, 0.36);
    head.add(eyeL); head.add(eyeR);
    /* 角 */
    const hornGeo = new THREE.ConeGeometry(0.09, 0.7, 6);
    const hornL = mesh(hornGeo, M.bossArmor, 0.3, 0.48, -0.02); hornL.rotation.z = -0.55; head.add(hornL);
    const hornR = mesh(hornGeo, M.bossArmor, -0.3, 0.48, -0.02); hornR.rotation.z = 0.55; head.add(hornR);
    /* 肩甲 */
    const shGeo = new THREE.BoxGeometry(0.9, 0.6, 1.0);
    const shL = mesh(shGeo, M.bossArmor, 1.0, 0.85, 0); shL.rotation.z = -0.12; torso.add(shL);
    const shR = mesh(shGeo, M.bossArmor, -1.0, 0.85, 0); shR.rotation.z = 0.12; torso.add(shR);
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.75, 5);
    for (let i = 0; i < 3; i++) {
      const sL = mesh(spikeGeo, M.bossTrim, 1.0 + i * 0.18, 1.1, -0.2 + i * 0.2);
      sL.rotation.z = -0.9; sL.rotation.x = 0.2; torso.add(sL);
      const sR = sL.clone(); sR.position.x = -sL.position.x; sR.rotation.z = 0.9; torso.add(sR);
    }
    /* 臂 */
    function arm(side) {
      const g = new THREE.Group();
      g.position.set(1.1 * side, 0.7, 0);
      torso.add(g);
      g.add(box(0.4, 0.85, 0.42, M.bossArmor, 0, -0.4, 0));
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.82, 0);
      g.add(elbow);
      elbow.add(box(0.46, 0.8, 0.46, M.bossDark, 0, -0.38, 0));
      const hand = new THREE.Group();
      hand.position.set(0, -0.82, 0);
      elbow.add(hand);
      hand.add(box(0.44, 0.4, 0.44, M.bossArmor, 0, 0, 0));
      return { shoulder: g, elbow, hand };
    }
    const armL = arm(1), armR = arm(-1);
    /* 巨剑 */
    const sword = new THREE.Group();
    sword.position.set(0, -0.05, 0);
    sword.rotation.x = Math.PI * 0.52;
    armR.hand.add(sword);
    sword.add(cyl(0.06, 0.07, 0.5, 8, M.bossDark, 0, 0, 0));
    sword.add(box(0.62, 0.1, 0.16, M.bossTrim, 0, 0.28, 0));
    sword.add(box(0.3, 2.6, 0.09, M.blade, 0, 1.62, 0));
    const bTip = mesh(new THREE.ConeGeometry(0.16, 0.5, 4), M.blade, 0, 3.12, 0);
    sword.add(bTip);
    sword.add(box(0.05, 2.54, 0.1, M.bossTrim, 0.15, 1.62, 0));
    sword.add(box(0.05, 2.54, 0.1, M.bossTrim, -0.15, 1.62, 0));
    const swordGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xff3020, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    swordGlow.scale.set(0.9, 3.2, 1);
    swordGlow.position.y = 1.6;
    sword.add(swordGlow);
    /* 披风 */
    const capeSegs = [];
    for (let i = 0; i < 3; i++) {
      const p = plane(1.7 - i * 0.15, 1.4, new THREE.MeshStandardMaterial({
        color: 0x1c0908, roughness: 0.95, side: THREE.DoubleSide,
      }), 0, 0.35 - i * 0.55, -0.6 - i * 0.18);
      p.rotation.x = 0.12;
      torso.add(p);
      capeSegs.push(p);
    }
    /* 眼焰 */
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xff2a18, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    eyeGlow.scale.set(0.5, 0.3, 1);
    eyeGlow.position.set(0, 1.14, 0.4);
    torso.add(eyeGlow);
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBlobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.65, depthWrite: false,
    }));
    shadow.scale.set(4.2, 4.2, 1);
    shadow.position.y = 0.05;
    root.add(shadow);
    return { root, visual, torso, head, legL, legR, armL, armR, sword, eyeL, eyeR, eyeGlow, capeSegs, shadow };
  }

  /* ---------------------------------------------------------
     爆裂者（v2）：自爆型快速敌人
     --------------------------------------------------------- */
  function buildDetonator() {
    const M = matSet();
    M.shell = new THREE.MeshStandardMaterial({ color: 0x34271a, metalness: 0.25, roughness: 0.72 });
    M.shellDark = new THREE.MeshStandardMaterial({ color: 0x1c130c, metalness: 0.3, roughness: 0.85 });
    M.vent = new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff7a20, emissiveIntensity: 2.8 });
    M.eye = new THREE.MeshStandardMaterial({ color: 0x140600, emissive: 0xffb050, emissiveIntensity: 4.2 });
    const root = new THREE.Group();
    const visual = new THREE.Group();
    visual.position.y = 0.62;
    root.add(visual);

    const body = mesh(new THREE.IcosahedronGeometry(0.62, 1), M.shell, 0, 0, 0);
    body.scale.set(1, 0.92, 1);
    visual.add(body);
    /* 尖刺 */
    const spikes = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * U.PI2;
      const s = mesh(new THREE.ConeGeometry(0.13, 0.5, 5), M.shellDark,
        Math.cos(a) * 0.58, 0.12 + Math.sin(i * 1.7) * 0.25, Math.sin(a) * 0.58);
      s.rotation.z = -Math.cos(a) * 1.1;
      s.rotation.x = Math.sin(a) * 1.1;
      visual.add(s);
      spikes.push(s);
    }
    /* 熔火裂隙 */
    for (let i = 0; i < 5; i++) {
      const crack = box(0.04, 0.22 + Math.random() * 0.25, 0.03, M.vent,
        U.rand(-0.4, 0.4), U.rand(-0.35, 0.35), 0.56);
      crack.rotation.z = U.rand(-1.2, 1.2);
      visual.add(crack);
    }
    const eye = sph(0.13, M.eye, 0, 0.05, 0.58, 10, 8);
    visual.add(eye);
    /* 四条短腿 */
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * U.PI2 + Math.PI / 4;
      const leg = mesh(new THREE.ConeGeometry(0.09, 0.55, 5), M.shellDark,
        Math.cos(a) * 0.45, -0.48, Math.sin(a) * 0.45);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = -Math.sin(a) * 0.5;
      visual.add(leg);
      legs.push(leg);
    }
    const core = sph(0.2, M.vent, 0, 0.02, 0.1, 10, 8);
    visual.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: 0xff7a20, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(2.0, 2.0, 1);
    visual.add(glow);
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBlobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    shadow.scale.set(1.4, 1.4, 1);
    shadow.position.y = 0.05;
    root.add(shadow);
    return { root, visual, body, core, eye, glow, spikes, legs, shadow };
  }

  /* ---------------------------------------------------------
     粒子系统
     --------------------------------------------------------- */
  function initParticles() {
    const N = vfx.pCount;
    vfx.pPos = new Float32Array(N * 3);
    vfx.pCol = new Float32Array(N * 3);
    vfx.pSize = new Float32Array(N);
    vfx.pAlpha = new Float32Array(N);
    const vel = new Float32Array(N * 3);
    const life = new Float32Array(N);
    const maxLife = new Float32Array(N);
    const drag = new Float32Array(N);
    const grav = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      vfx.pPos[i * 3 + 1] = -999;
      vfx.particles.push({ vel: new THREE.Vector3(), life: 0, maxLife: 1, drag: 1, grav: 0, size0: 0.1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vfx.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(vfx.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(vfx.pSize, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(vfx.pAlpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: makeGlowTexture(64) },
        uPerspective: { value: 600 },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPerspective;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uPerspective / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    vfx.pGeo = geo;
    vfx.pPoints = new THREE.Points(geo, mat);
    vfx.pPoints.frustumCulled = false;
    vfx.pPoints.renderOrder = 10;
    scene.add(vfx.pPoints);
    vfx.pMat = mat;
  }

  function emitParticle(x, y, z, vx, vy, vz, color, size, life, drag, grav) {
    const i = vfx.pIdx;
    vfx.pIdx = (vfx.pIdx + 1) % vfx.pCount;
    const p = vfx.particles[i];
    p.vel.set(vx, vy, vz);
    p.life = life;
    p.maxLife = life;
    p.drag = drag;
    p.grav = grav;
    p.size0 = size;
    p.color = p.color || new THREE.Color();
    p.color.setHex(color);
    vfx.pPos[i * 3] = x; vfx.pPos[i * 3 + 1] = y; vfx.pPos[i * 3 + 2] = z;
    vfx.pCol[i * 3] = p.color.r; vfx.pCol[i * 3 + 1] = p.color.g; vfx.pCol[i * 3 + 2] = p.color.b;
    vfx.pSize[i] = size;
    vfx.pAlpha[i] = 1;
  }

  function updateParticles(dt) {
    const N = vfx.pCount;
    for (let i = 0; i < N; i++) {
      const p = vfx.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        vfx.pPos[i * 3 + 1] = -999;
        vfx.pAlpha[i] = 0;
        vfx.pSize[i] = 0;
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vel.multiplyScalar(d);
      p.vel.y += p.grav * dt;
      vfx.pPos[i * 3] += p.vel.x * dt;
      vfx.pPos[i * 3 + 1] += p.vel.y * dt;
      vfx.pPos[i * 3 + 2] += p.vel.z * dt;
      const t = p.life / p.maxLife;
      vfx.pAlpha[i] = Math.min(1, t * 1.6) * (p.fadeIn ? 1 : 1);
      vfx.pSize[i] = p.size0 * (0.35 + 0.65 * t);
    }
    vfx.pGeo.attributes.position.needsUpdate = true;
    vfx.pGeo.attributes.color.needsUpdate = true;
    vfx.pGeo.attributes.size.needsUpdate = true;
    vfx.pGeo.attributes.alpha.needsUpdate = true;
  }

  /* ---------------------------------------------------------
     特效 API
     --------------------------------------------------------- */
  function emitBurst(pos, opts) {
    opts = opts || {};
    const count = opts.count || 16;
    const color = opts.color != null ? opts.color : 0xffa050;
    const speed = opts.speed || 6;
    const size = opts.size || 0.14;
    const life = opts.life || 0.6;
    const grav = opts.gravity != null ? opts.gravity : 9;
    const up = opts.up || 0.5;
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        U.rand(-1, 1),
        U.rand(-1, 1) * up + (opts.biasY || 0),
        U.rand(-1, 1)
      ).normalize();
      if (opts.dir) dir.add(opts.dir).normalize();
      const sp = speed * U.rand(0.35, 1);
      emitParticle(pos.x + U.rand(-0.12, 0.12), pos.y + U.rand(-0.12, 0.12), pos.z + U.rand(-0.12, 0.12),
        dir.x * sp, dir.y * sp, dir.z * sp, color, size * U.rand(0.6, 1.4), life * U.rand(0.6, 1.3), 0.94, grav);
    }
  }

  function emitDirectional(pos, dir, opts) {
    opts = opts || {};
    const count = opts.count || 12;
    const color = opts.color != null ? opts.color : 0xffc070;
    const speed = opts.speed || 8;
    const size = opts.size || 0.12;
    const life = opts.life || 0.4;
    for (let i = 0; i < count; i++) {
      const v = dir.clone().multiplyScalar(U.rand(0.5, 1.4) * speed);
      v.x += U.rand(-2.2, 2.2); v.y += U.rand(-0.6, 2.2); v.z += U.rand(-2.2, 2.2);
      emitParticle(pos.x, pos.y, pos.z, v.x, v.y, v.z, color, size * U.rand(0.6, 1.3), life * U.rand(0.6, 1.2), 0.92, 8);
    }
  }

  function flash(pos, color, size, dur, follow) {
    const mat = new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: color != null ? color : 0xffa040, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.scale.set(size, size, 1);
    scene.add(sp);
    vfx.flashes.push({ sp, mat, life: dur || 0.18, max: dur || 0.18, size, follow });
  }

  /* 刀光扇形（横向） */
  let sectorGeoCache = {};
  function getSectorGeo(halfArc, inner) {
    const key = halfArc.toFixed(2) + '_' + inner.toFixed(2);
    if (sectorGeoCache[key]) return sectorGeoCache[key];
    const segs = 28;
    const positions = [];
    const indices = [];
    const i0 = inner, i1 = 1;
    for (let i = 0; i <= segs; i++) {
      const a = -halfArc + (i / segs) * halfArc * 2;
      positions.push(Math.sin(a) * i0, 0, Math.cos(a) * i0);
      positions.push(Math.sin(a) * i1, 0, Math.cos(a) * i1);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    sectorGeoCache[key] = g;
    return g;
  }

  function slashArc(pos, yaw, opts) {
    opts = opts || {};
    const radius = opts.radius || 2.6;
    const halfArc = opts.halfArc || 1.1;
    const color = opts.color != null ? opts.color : 0xffb060;
    const dur = opts.dur || 0.22;
    const tilt = opts.tilt != null ? opts.tilt : 0.24;
    const geo = getSectorGeo(halfArc, 0.52);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos.x, pos.y, pos.z);
    m.rotation.y = yaw;
    m.rotation.x = tilt;
    m.scale.set(radius, 1, radius);
    m.renderOrder = 8;
    scene.add(m);
    vfx.arcs.push({ m, mat, life: dur, max: dur, radius });
  }

  /* 冲击波圆环 */
  function shockwave(pos, opts) {
    opts = opts || {};
    const color = opts.color != null ? opts.color : 0xff6a3a;
    const maxR = opts.radius || 8;
    const dur = opts.dur || 0.6;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 64), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.08, pos.z);
    m.scale.set(0.4, 0.4, 0.4);
    m.renderOrder = 7;
    scene.add(m);
    vfx.rings.push({ m, mat, life: dur, max: dur, maxR, kind: 'shock' });
    return { mesh: m, radius: maxR, dur };
  }

  /* 地面预警圈：白色攻击范围 + 红色蓄力填充（填满即出手） */
  function telegraphRing(pos, radius, color, opts) {
    opts = opts || {};
    const fillColor = color != null ? color : 0xff3b3b;
    const group = new THREE.Group();
    group.name = 'telegraph';
    group.position.set(pos.x, 0.07, pos.z);
    scene.add(group);
    const ownedGeos = [];
    /* 白色范围轮廓 */
    const outlineGeo = new THREE.RingGeometry(0.94, 1.0, 72);
    ownedGeos.push(outlineGeo);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.rotation.x = -Math.PI / 2;
    outline.scale.set(radius, radius, radius);
    outline.renderOrder = 7;
    group.add(outline);
    /* 白色攻击范围底色（先显示完整范围，再被红色填满） */
    const baseGeo = new THREE.CircleGeometry(1, 72);
    ownedGeos.push(baseGeo);
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.002;
    base.scale.set(radius, radius, 1);
    base.renderOrder = 5;
    group.add(base);
    /* 红色填充（随蓄力从中心扩张到满范围） */
    const fillGeo = new THREE.CircleGeometry(1, 72);
    ownedGeos.push(fillGeo);
    const fillMat = new THREE.MeshBasicMaterial({
      color: fillColor, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.004;
    fill.scale.set(radius * 0.04, radius * 0.04, 1);
    fill.renderOrder = 6;
    group.add(fill);
    let curP = 0;
    return {
      group, radius, ownedGeos,
      setProgress(p) {
        curP = U.clamp01(p);
        const s = Math.max(0.04, curP) * radius;
        fill.scale.set(s, s, 1);
        fillMat.opacity = 0.16 + curP * 0.5;
        outlineMat.opacity = 0.42 + curP * 0.28;
        if (curP > 0.86) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.028);
          fillMat.opacity = 0.5 + 0.2 * pulse;
          outlineMat.opacity = 0.75;
        }
      },
      setPos(p) { group.position.x = p.x; group.position.z = p.z; },
      setYaw() { },
      remove() {
        scene.remove(group);
        outlineMat.dispose(); fillMat.dispose(); baseMat.dispose();
        ownedGeos.forEach(g => { try { g.dispose(); } catch (e) { } });
      },
      flash() {
        fillMat.color.setHex(0xfff0d0);
        fillMat.opacity = 0.9;
        outlineMat.color.setHex(0xffe8c0);
        outlineMat.opacity = 1;
        const s = radius;
        fill.scale.set(s, s, 1);
      },
    };
  }

  /* 扇形预警（Boss 挥砍）：白色扇形范围 + 红色蓄力填充 */
  function telegraphSector(pos, yaw, radius, halfArc, color, dur) {
    const fillColor = color != null ? color : 0xff3b3b;
    const group = new THREE.Group();
    group.name = 'telegraph';
    group.position.set(pos.x, 0.075, pos.z);
    group.rotation.y = yaw;
    scene.add(group);
    const outlineGeo = getSectorGeo(halfArc, 0.93);
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.scale.set(radius, 1, radius);
    outline.renderOrder = 7;
    group.add(outline);
    const fillGeo = getSectorGeo(halfArc, 0.02);
    /* 白色范围底色 */
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const base = new THREE.Mesh(fillGeo, baseMat);
    base.position.y = 0.002;
    base.scale.set(radius, 1, radius);
    base.renderOrder = 5;
    group.add(base);
    const fillMat = new THREE.MeshBasicMaterial({
      color: fillColor, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.y = 0.004;
    fill.scale.set(radius * 0.04, 1, radius * 0.04);
    fill.renderOrder = 6;
    group.add(fill);
    let curP = 0;
    return {
      group, radius, halfArc,
      setProgress(p) {
        curP = U.clamp01(p);
        const s = Math.max(0.04, curP) * radius;
        fill.scale.set(s, 1, s);
        fillMat.opacity = 0.16 + curP * 0.52;
        outlineMat.opacity = 0.42 + curP * 0.3;
        if (curP > 0.86) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.028);
          fillMat.opacity = 0.52 + 0.22 * pulse;
          outlineMat.opacity = 0.8;
        }
      },
      setPos(p) { group.position.x = p.x; group.position.z = p.z; },
      setYaw(y) { group.rotation.y = y; },
      remove() {
        scene.remove(group);
        outlineMat.dispose(); fillMat.dispose(); baseMat.dispose();
      },
      flash() {
        fillMat.color.setHex(0xfff0d0);
        fillMat.opacity = 0.9;
        outlineMat.color.setHex(0xffe8c0);
        outlineMat.opacity = 1;
        const s = radius;
        fill.scale.set(s, 1, s);
      },
    };
  }

  /* 传送门出生特效 */
  function portal(pos, color) {
    const c = color != null ? color : 0xff3d8b;
    const glowMat = new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.1, pos.z);
    ring.scale.set(0.3, 0.3, 0.3);
    scene.add(ring);
    const beamMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color: c, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Sprite(beamMat);
    beam.position.set(pos.x, 2.7, pos.z);
    beam.scale.set(1.9, 5.6, 1);
    scene.add(beam);
    emitBurst(new THREE.Vector3(pos.x, 1.0, pos.z), { count: 20, color: c, speed: 4, size: 0.16, life: 0.8, gravity: -2, up: 1 });
    vfx.portals.push({ ring, ringMat: glowMat, beam, beamMat, life: 1.0, max: 1.0 });
  }

  /* 残影 */
  const ghostMatProto = () => new THREE.MeshBasicMaterial({
    color: 0x54c8ff, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  function afterimage(sourceVisual, pos, yaw) {
    let slot = vfx.ghosts.find(g => g.life <= 0);
    if (!slot) {
      if (vfx.ghosts.length >= 5) slot = vfx.ghosts[0];
      else { slot = { group: new THREE.Group(), mat: ghostMatProto(), life: 0, max: 1 }; scene.add(slot.group); vfx.ghosts.push(slot); }
    }
    slot.group.clear();
    slot.mat.opacity = 0.32;
    const clone = sourceVisual.clone(true);
    clone.traverse((o) => {
      if (o.isMesh) { o.material = slot.mat; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5; }
      if (o.isSprite || o.isLight) o.visible = false;
    });
    slot.group.add(clone);
    slot.group.visible = true;
    slot.group.position.copy(pos);
    slot.group.rotation.y = yaw;
    slot.life = 0.26;
    slot.max = 0.26;
  }

  /* 剑刃拖尾 */
  function makeSwordTrail(color) {
    const N = 18;
    const positions = new Float32Array(N * 2 * 3);
    const colors = new Float32Array(N * 2 * 3);
    const indices = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 9;
    scene.add(m);
    const hist = [];
    const baseColor = new THREE.Color(color != null ? color : 0xff8a40);
    return {
      mesh: m,
      update(tip, base, strength) {
        if (strength > 0.02) {
          hist.unshift({ tip: tip.clone(), base: base.clone(), s: strength });
          if (hist.length > N) hist.pop();
        } else if (hist.length) {
          hist.pop();
        }
        for (let i = 0; i < N; i++) {
          const h = hist[Math.min(i, hist.length - 1)];
          if (!h) {
            positions[i * 6] = positions[i * 6 + 3] = 0;
            positions[i * 6 + 1] = positions[i * 6 + 4] = -999;
            positions[i * 6 + 2] = positions[i * 6 + 5] = 0;
            colors[i * 6] = colors[i * 6 + 3] = 0;
            continue;
          }
          const a = Math.max(0, 1 - i / N);
          const w = a * a * h.s;
          positions[i * 6] = h.tip.x; positions[i * 6 + 1] = h.tip.y; positions[i * 6 + 2] = h.tip.z;
          positions[i * 6 + 3] = h.base.x; positions[i * 6 + 4] = h.base.y; positions[i * 6 + 5] = h.base.z;
          colors[i * 6] = baseColor.r * w * 0.62; colors[i * 6 + 1] = baseColor.g * w * 0.62; colors[i * 6 + 2] = baseColor.b * w * 0.62;
          colors[i * 6 + 3] = baseColor.r * w * 0.1;
          colors[i * 6 + 4] = baseColor.g * w * 0.1;
          colors[i * 6 + 5] = baseColor.b * w * 0.1;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
    };
  }

  /* 敌人受击闪白 */
  const _flashColor = new THREE.Color(1, 0.72, 0.45);
  function setFlash(group, t) {
    group.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mat) => {
          if (mat.userData.baseEmissive == null) {
            mat.userData.baseEmissive = mat.emissive.clone();
            mat.userData.baseIntensity = mat.emissiveIntensity != null ? mat.emissiveIntensity : 1;
          }
          if (t > 0.01) {
            mat.emissive.copy(mat.userData.baseEmissive).lerp(_flashColor, t);
            mat.emissiveIntensity = mat.userData.baseIntensity + t * 4.5;
          } else {
            mat.emissive.copy(mat.userData.baseEmissive);
            mat.emissiveIntensity = mat.userData.baseIntensity;
          }
        });
      }
    });
  }

  function setDissolve(group, t) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mat) => {
          if (mat.userData.origOpacity == null) { mat.userData.origOpacity = mat.opacity; mat.userData.origTransparent = mat.transparent; }
          mat.transparent = true;
          mat.opacity = mat.userData.origOpacity * (1 - t);
          mat.depthWrite = t < 0.5;
        });
      }
    });
  }

  /* ---------------------------------------------------------
     场景搭建
     --------------------------------------------------------- */
  function buildArena() {
    /* 地面 */
    const tex = makeArenaTextures();
    const floorMat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0.5,
      roughness: 0.86, metalness: 0.18,
    });
    const floorGeo = new THREE.CircleGeometry(30, 96);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    W.floorMat = floorMat;

    /* 场地外暗地 */
    const outer = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.MeshStandardMaterial({
      color: 0x04050a, roughness: 1, metalness: 0,
    }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.05;
    outer.receiveShadow = true;
    scene.add(outer);

    /* 边缘圈 */
    const rim = new THREE.Mesh(new THREE.TorusGeometry(29.9, 0.3, 8, 120), new THREE.MeshStandardMaterial({
      color: 0x151b22, metalness: 0.8, roughness: 0.4, emissive: 0xff6a28, emissiveIntensity: 0.35,
    }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.12;
    rim.castShadow = true;
    scene.add(rim);

    /* 立柱 */
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x191d24, metalness: 0.5, roughness: 0.72 });
    const pillarDark = new THREE.MeshStandardMaterial({ color: 0x0e1116, metalness: 0.3, roughness: 0.9 });
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x241a12, emissive: 0xff7530, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * U.PI2 + 0.11;
      const r = 33.5 + U.rand(-1.2, 1.6);
      const h = U.rand(3.5, 9.5) * (i % 3 === 0 ? 1.25 : 1);
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.rotation.y = U.rand(0, U.PI2);
      const broken = i % 4 === 1;
      const base = cyl(1.0, 1.35, 0.8, 6, pillarDark, 0, 0.4, 0);
      g.add(base);
      const shaft = cyl(0.62, 0.82, h, 6, pillarMat, 0, h / 2 + 0.7, 0);
      g.add(shaft);
      const cap = cyl(0.95, 0.65, 0.45, 6, pillarDark, 0, h + 0.85, 0);
      g.add(cap);
      if (broken) {
        shaft.scale.y *= 0.42;
        shaft.position.y = h * 0.42 / 2 + 0.7;
        cap.visible = false;
        g.rotation.z = U.rand(-0.14, 0.14);
      } else {
        const rune = cyl(0.7, 0.7, 0.14, 6, runeMat, 0, h * 0.72, 0);
        g.add(rune);
        const emberOrb = new THREE.Sprite(new THREE.SpriteMaterial({
          map: makeGlowTexture(64), color: 0xff7a30, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        emberOrb.scale.set(1.6, 1.6, 1);
        emberOrb.position.y = h + 1.2;
        g.add(emberOrb);
      }
      scene.add(g);
    }

    /* 悬浮碎石 */
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x12161d, metalness: 0.2, roughness: 0.9 });
    W.floatingRocks = [];
    for (let i = 0; i < 16; i++) {
      const a = U.rand(0, U.PI2);
      const r = U.rand(34, 60);
      const s = U.rand(0.5, 2.6);
      const rock = mesh(new THREE.IcosahedronGeometry(s, 0), rockMat,
        Math.cos(a) * r, U.rand(5, 22), Math.sin(a) * r);
      rock.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
      rock.castShadow = true;
      scene.add(rock);
      W.floatingRocks.push({ mesh: rock, baseY: rock.position.y, phase: U.rand(0, U.PI2), speed: U.rand(0.2, 0.5) });
    }

    /* 远景巨影 */
    const farMat = new THREE.MeshBasicMaterial({ color: 0x070a11 });
    for (let i = 0; i < 9; i++) {
      const a = U.rand(0, U.PI2);
      const r = U.rand(95, 160);
      const h = U.rand(30, 90);
      const ob = new THREE.Mesh(new THREE.ConeGeometry(U.rand(6, 16), h, 4), farMat);
      ob.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
      ob.rotation.y = U.rand(0, 3);
      scene.add(ob);
    }

    /* 星空 */
    const starPos = [];
    for (let i = 0; i < 1400; i++) {
      const a = U.rand(0, U.PI2);
      const el = Math.asin(U.rand(-0.05, 1));
      const r = 260;
      starPos.push(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r + 10, Math.sin(a) * Math.cos(el) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0x9fb6d8, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false,
    }));
    scene.add(stars);

    /* 月亮 & 光环 */
    const moonPos = new THREE.Vector3(40, 52, 150);
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(9.5, 48), new THREE.MeshBasicMaterial({
      map: makeMoonTexture(), transparent: true, depthWrite: false, fog: false,
    }));
    moonDisc.position.copy(moonPos);
    moonDisc.lookAt(0, 1.5, 0);
    scene.add(moonDisc);
    W.moonDisc = moonDisc;
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(128), color: 0x7faeff, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    moonGlow.position.copy(moonPos);
    moonGlow.scale.set(62, 62, 1);
    scene.add(moonGlow);
    W.moonGlow = moonGlow;

    /* 中央余烬光 */
    W.emberLight = new THREE.PointLight(0xff6a28, 1.2, 26, 2);
    W.emberLight.position.set(0, 3.2, 0);
    scene.add(W.emberLight);

    /* 火盆点光 */
    W.brazierLights = [];
    const bp = [new THREE.Vector3(-21, 2.4, 18), new THREE.Vector3(21, 2.4, -18)];
    bp.forEach((p, i) => {
      const pl = new THREE.PointLight(i ? 0xff5a20 : 0xff7a30, 1.3, 26, 2);
      pl.position.copy(p);
      scene.add(pl);
      W.brazierLights.push({ light: pl, base: 1.3, phase: U.rand(0, 9) });
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(64), color: 0xff7a30, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      flame.position.copy(p);
      flame.scale.set(3.4, 3.4, 1);
      scene.add(flame);
      W.brazierLights[W.brazierLights.length - 1].flame = flame;
    });
  }

  /* ---------------------------------------------------------
     初始化
     --------------------------------------------------------- */
  W.init = function (canvas) {
    lowSpec = /lowspec/.test(location.search);
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !lowSpec, powerPreference: 'high-performance', stencil: false,
    });
    renderer.setPixelRatio(lowSpec ? 0.7 : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !lowSpec;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 30, 130);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 3.5, -6);
    camera.lookAt(0, 1.5, 0);

    /* 灯光 */
    const hemi = new THREE.HemisphereLight(0x51698f, 0x0a0a10, 0.78);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xa9c1ff, 1.35);
    moon.position.set(-20, 30, 14);
    moon.castShadow = !lowSpec;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -26; moon.shadow.camera.right = 26;
    moon.shadow.camera.top = 26; moon.shadow.camera.bottom = -26;
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 80;
    moon.shadow.bias = -0.0012;
    scene.add(moon);
    const back = new THREE.DirectionalLight(0x2b4d6e, 0.5);
    back.position.set(18, 12, -22);
    scene.add(back);
    const rim = new THREE.PointLight(0x3a6a8a, 0.7, 40, 2);
    rim.position.set(0, 9, -24);
    scene.add(rim);

    buildArena();
    initParticles();

    /* 玩家 */
    W.playerModel = buildPlayer();
    W.playerModel.root.position.set(0, 0, 0);
    scene.add(W.playerModel.root);
    W.playerTrail = makeSwordTrail(0xffa050);

    /* 预备敌人模型工厂 */
    W.enemyFactory = {
      wraith: buildWraith,
      golem: buildGolem,
      hexer: buildHexer,
      detonator: buildDetonator,
      boss: buildBoss,
    };

    /* 赤红竞技场（Boss 二阶段氛围） */
    const _crimsonBase = {
      bg: scene.background.clone(),
      fog: scene.fog.color.clone(),
      hemiSky: hemi.color.clone(),
      hemiGround: hemi.groundColor.clone(),
      dir: moon.color.clone(),
      dirI: moon.intensity,
      back: back.color.clone(),
      backI: back.intensity,
      rim: rim.color.clone(),
    };
    W._crimson = false;
    W.setCrimson = function (on) {
      on = !!on;
      if (!scene || W._crimson === on) return;
      W._crimson = on;
      if (on) {
        scene.background.setHex(0x160409);
        scene.fog.color.setHex(0x24060a);
        hemi.color.setHex(0x8a4a5a);
        hemi.groundColor.setHex(0x160406);
        moon.color.setHex(0xff9a88);
        moon.intensity = 1.55;
        back.color.setHex(0x8a2a3a);
        back.intensity = 0.7;
        rim.color.setHex(0xa83a3a);
        if (W.moonDisc) W.moonDisc.material.color.setHex(0xff9a8a);
        if (W.moonGlow) W.moonGlow.material.color.setHex(0xff3a20);
        if (W.emberLight) W.emberLight.color.setHex(0xff2a12);
        if (W.floorMat) { W.floorMat.emissive.setHex(0xff6040); W.floorMat.emissiveIntensity = 0.6; }
        if (W.brazierLights) W.brazierLights.forEach((b) => {
          b.light.color.setHex(0xff2a10);
          if (b.flame) b.flame.material.color.setHex(0xff3a18);
        });
        if (W.playerModel) W.playerModel.swordLight.color.setHex(0xff3a10);
        W._crimsonLast = Date.now();
      } else {
        scene.background.copy(_crimsonBase.bg);
        scene.fog.color.copy(_crimsonBase.fog);
        hemi.color.copy(_crimsonBase.hemiSky);
        hemi.groundColor.copy(_crimsonBase.hemiGround);
        moon.color.copy(_crimsonBase.dir);
        moon.intensity = _crimsonBase.dirI;
        back.color.copy(_crimsonBase.back);
        back.intensity = _crimsonBase.backI;
        rim.color.copy(_crimsonBase.rim);
        if (W.moonDisc) W.moonDisc.material.color.setHex(0xffffff);
        if (W.moonGlow) W.moonGlow.material.color.setHex(0x7faeff);
        if (W.emberLight) W.emberLight.color.setHex(0xff6a28);
        if (W.floorMat) { W.floorMat.emissive.setHex(0xffffff); W.floorMat.emissiveIntensity = 0.5; }
        if (W.brazierLights) W.brazierLights.forEach((b) => {
          b.light.color.setHex(0xff5a20);
          if (b.flame) b.flame.material.color.setHex(0xff7a30);
        });
        if (W.playerModel) W.playerModel.swordLight.color.setHex(0xff6a28);
      }
    };

    W.setQuality = function (level) {
      if (level === 0) {
        renderer.setPixelRatio(0.75);
        renderer.shadowMap.enabled = false;
        scene.traverse(o => { if (o.isMesh) o.castShadow = false; });
      } else if (level === 1) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
        renderer.shadowMap.enabled = false;
        scene.traverse(o => { if (o.isMesh) o.castShadow = false; });
      } else {
        renderer.setPixelRatio(lowSpec ? 0.7 : Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.shadowMap.enabled = !lowSpec;
        scene.traverse(o => {
          if (o.isMesh && o.userData.castShadowDefault !== false) o.castShadow = true;
        });
      }
    };

    W.onResize = function () {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (vfx.pMat) vfx.pMat.uniforms.uPerspective.value = (h * renderer.getPixelRatio() * 0.5) / Math.tan((camera.fov * Math.PI / 180) / 2);
    };
    window.addEventListener('resize', W.onResize);
    W.onResize();

    W.renderer = renderer;
    W.scene = scene;
    W.camera = camera;
    W.lowSpec = lowSpec;

    /* 供调试截图用 */
    W.setCamera = function (pos, look) {
      camera.position.copy(pos);
      camera.lookAt(look);
    };

    clock = new THREE.Clock();
    return W;
  };

  /* ---------------------------------------------------------
     每帧更新
     --------------------------------------------------------- */
  W.update = function (dt, time, playerPos) {
    if (!scene) return;
    updateParticles(dt);

    /* 环境余烬 */
    vfx.emberTimer += dt;
    while (vfx.emberTimer > 0.045) {
      vfx.emberTimer -= 0.045;
      const a = U.rand(0, U.PI2);
      const r = U.rand(6, 29);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const orange = U.chance(0.72);
      const crimson = W._crimson;
      emitParticle(x, U.rand(0.3, 4.5), z,
        U.rand(-0.25, 0.25), U.rand(0.25, 0.8), U.rand(-0.25, 0.25),
        crimson
          ? (orange ? (U.chance(0.5) ? 0xff2a10 : 0xff6a40) : 0x9a3048)
          : (orange ? (U.chance(0.5) ? 0xff7a30 : 0xffb060) : 0x6fbfd8),
        U.rand(0.035, 0.085), U.rand(3.5, 8), 0.995, -0.05);
    }
    vfx.ashTimer += dt;
    while (vfx.ashTimer > 0.16) {
      vfx.ashTimer -= 0.16;
      const a = U.rand(0, U.PI2);
      const r = U.rand(4, 28);
      emitParticle(Math.cos(a) * r, U.rand(1, 9), Math.sin(a) * r,
        U.rand(-0.15, 0.15), U.rand(-0.4, -0.12), U.rand(-0.15, 0.15),
        0x8a8f99, U.rand(0.02, 0.05), U.rand(4, 9), 1, -0.02);
    }

    /* 漂浮岩石 */
    if (W.floatingRocks) {
      W.floatingRocks.forEach((r) => {
        r.mesh.position.y = r.baseY + Math.sin(time * r.speed + r.phase) * 1.2;
        r.mesh.rotation.y += dt * 0.05;
        r.mesh.rotation.x += dt * 0.02;
      });
    }
    /* 火盆闪烁 */
    if (W.brazierLights) {
      W.brazierLights.forEach((b) => {
        const f = 1 + Math.sin(time * 7 + b.phase) * 0.12 + Math.sin(time * 13.7 + b.phase * 2) * 0.08;
        b.light.intensity = b.base * f;
        b.flame.material.opacity = 0.75 * f;
        b.flame.scale.setScalar(3.4 * (0.96 + f * 0.05));
      });
    }
    if (W.emberLight) {
      W.emberLight.intensity = playerPos ? 0.9 + Math.sin(time * 3.1) * 0.25 : 1.1;
      if (playerPos) W.emberLight.position.set(playerPos.x, playerPos.y + 2.6, playerPos.z);
    }
    if (W.moonGlow) W.moonGlow.material.opacity = 0.3 + Math.sin(time * 0.6) * 0.04;

    /* 闪光精灵 */
    for (let i = vfx.flashes.length - 1; i >= 0; i--) {
      const f = vfx.flashes[i];
      f.life -= dt;
      if (f.follow) f.sp.position.copy(f.follow);
      if (f.life <= 0) {
        scene.remove(f.sp); f.mat.dispose(); vfx.flashes.splice(i, 1);
        continue;
      }
      const t = f.life / f.max;
      f.mat.opacity = t;
      const s = f.size * (1.2 - t * 0.25);
      f.sp.scale.set(s, s, 1);
    }
    /* 刀光 */
    for (let i = vfx.arcs.length - 1; i >= 0; i--) {
      const a = vfx.arcs[i];
      a.life -= dt;
      if (a.life <= 0) {
        scene.remove(a.m); a.mat.dispose(); vfx.arcs.splice(i, 1);
        continue;
      }
      const t = a.life / a.max;
      a.mat.opacity = t * t * 0.6;
      const s = a.radius * (1.06 - t * 0.1);
      a.m.scale.set(s, 1, s);
    }
    /* 冲击波 */
    for (let i = vfx.rings.length - 1; i >= 0; i--) {
      const r = vfx.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        scene.remove(r.m); r.mat.dispose(); vfx.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.max;
      const e = U.easeOutQuart(t);
      const s = 0.4 + e * r.maxR;
      r.m.scale.set(s, s, s);
      r.mat.opacity = (1 - t) * 0.85;
    }
    /* 传送门 */
    for (let i = vfx.portals.length - 1; i >= 0; i--) {
      const p = vfx.portals[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.ring); scene.remove(p.beam);
        p.ringMat.dispose(); p.beamMat.dispose(); p.ring.geometry.dispose();
        vfx.portals.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.max;
      const s = 0.3 + U.easeOutCubic(Math.min(1, t * 2)) * 2.2;
      p.ring.scale.set(s, s, s);
      p.ringMat.opacity = 0.8 * (1 - t);
      p.beamMat.opacity = 0.5 * (1 - t * t);
      p.beam.scale.set(1.9 * (0.8 + t * 0.4), 5.6 * (0.9 + t * 0.2), 1);
    }
    /* 残影 */
    for (let i = vfx.ghosts.length - 1; i >= 0; i--) {
      const g = vfx.ghosts[i];
      if (g.life <= 0) continue;
      g.life -= dt;
      g.mat.opacity = Math.max(0, (g.life / g.max)) * 0.3;
      if (g.life <= 0) g.group.visible = false;
    }
  };

  /* 对外 API */
  W.emitParticle = emitParticle;
  W.emitBurst = emitBurst;
  W.emitDirectional = emitDirectional;
  W.flash = flash;
  W.slashArc = slashArc;
  W.shockwave = shockwave;
  W.telegraphRing = telegraphRing;
  W.telegraphSector = telegraphSector;
  W.portal = portal;
  W.afterimage = afterimage;
  W.setFlash = setFlash;
  W.setDissolve = setDissolve;
  W.makeSwordTrail = makeSwordTrail;
  W.makeGlowTexture = makeGlowTexture;
  W.isLowSpec = function () { return lowSpec; };

  /* 共享材质（供投射物等） */
  W.createProjectileMesh = function (color, size) {
    const group = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(64), color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.set(size * 2.6, size * 2.6, 1);
    group.add(sprite);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.55, 0), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
    }));
    group.add(core);
    group.userData.spin = core;
    return group;
  };
})();
