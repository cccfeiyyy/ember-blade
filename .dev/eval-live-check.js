(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(1500);
  const info = { href: location.href, title: document.title, ready: !!window.__READY, hasDebug: !!window.__DEBUG };
  try {
    const d = window.__DEBUG;
    info.version = d.version;
    info.modeBefore = d.state().mode;
    d.start(); await sleep(700);
    info.modeAfterStart = d.state().mode;
    d.chooseBlessing(0); d.tick(1.4); d.god(true);
    d.spawnEnemy('wraith', 0, 3.2); d.tick(1.2); d.attack('light'); d.tick(0.5);
    const s = d.state();
    info.game = { mode: s.mode, wave: s.wave, hp: s.hp, enemies: s.enemiesAlive, version: d.version };
  } catch (e) { info.evalError = String(e && e.message || e); }
  info.errors = (window.__ERRORS || []).slice(0, 8);
  return info;
})()
