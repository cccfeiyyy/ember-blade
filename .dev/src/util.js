/* ============================================================
   余烬之刃 — 工具库
   ============================================================ */
(function () {
  const G = window.G;

  const U = {
    PI2: Math.PI * 2,
    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    invLerp(a, b, v) { return (v - a) / (b - a); },
    /* 帧率无关阻尼 */
    damp(a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    dampAngle(a, b, lambda, dt) {
      let d = U.wrapAngle(b - a);
      return a + d * (1 - Math.exp(-lambda * dt));
    },
    wrapAngle(a) {
      a = (a + Math.PI) % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      return a - Math.PI;
    },
    angleDiff(a, b) { return U.wrapAngle(b - a); },
    rand(a = 0, b = 1) { return a + Math.random() * (b - a); },
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
    sign(v) { return v < 0 ? -1 : 1; },
    smoothstep(a, b, v) { const t = U.clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); },

    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
    easeInCubic(t) { return t * t * t; },
    easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); },
    easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    easeOutElastic(t) {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    pulse(t, freq) { return Math.sin(t * Math.PI * 2 * freq); },

    formatTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    },
    formatScore(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },

    removeFrom(arr, item) {
      const i = arr.indexOf(item);
      if (i >= 0) arr.splice(i, 1);
      return i >= 0;
    },
    /* 临时向量池（减少 GC） */
    _v: [],
    v(i) {
      if (!this._v[i]) this._v[i] = new THREE.Vector3();
      return this._v[i];
    },
    /* 圆形范围判断（XZ平面） */
    distXZ(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); },
  };

  /* 世界坐标 / 朝向工具 */
  U.yawOf = function (dirX, dirZ) { return Math.atan2(dirX, dirZ); };
  U.dirFromYaw = function (yaw, out) {
    out = out || new THREE.Vector3();
    out.set(Math.sin(yaw), 0, Math.cos(yaw));
    return out;
  };
  /* 在扇形内：中心朝向 centerYaw，半角 halfArc（弧度） */
  U.inCone = function (cx, cz, centerYaw, dx, dz, dist, halfArc) {
    if (dist > 0.0001) {
      const targetYaw = Math.atan2(dx, dz);
      if (Math.abs(U.wrapAngle(targetYaw - centerYaw)) > halfArc) return false;
    }
    return true;
  };

  G.util = U;
})();
