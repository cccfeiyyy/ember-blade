// .dev/qa/run-v2-qa.mjs — 《余烬之刃》v2.0 无头 Chrome 真实浏览器验收主运行器
// 用法：
//   node .dev/qa/run-v2-qa.mjs                      # 全量
//   node .dev/qa/run-v2-qa.mjs --only=00,03         # 只跑指定套件（id 前缀）
//   node .dev/qa/run-v2-qa.mjs --headed             # 有头模式（调试用）
//   node .dev/qa/run-v2-qa.mjs --shots=.dev/qa/selftest-shots --tag=selftest
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser, sleep } from './lib/chrome.mjs';
import { QAContext } from './lib/qa.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const scenariosDir = path.join(__dirname, 'scenarios');

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
const args = { only: '', shots: '', out: '', tag: '', headed: false, baseUrl: '', noArchive: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  let k, v;
  if (eq >= 0) { k = a.slice(2, eq); v = a.slice(eq + 1); }
  else { k = a.slice(2); v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : ''; }
  if (k === 'headed') args.headed = true;
  else if (k === 'only') args.only = v;
  else if (k === 'shots') args.shots = v;
  else if (k === 'out') args.out = v;
  else if (k === 'tag') args.tag = v;
  else if (k === 'base-url') args.baseUrl = v;
  else if (k === 'no-archive') args.noArchive = true;
}

if (!fs.existsSync(path.join(repoRoot, 'index.html'))) {
  console.error('找不到 index.html：', path.join(repoRoot, 'index.html'));
  process.exit(3);
}

/* ---------------- 构建信息 ---------------- */
function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}
function maxMtime(dir) {
  let max = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { max = Math.max(max, fs.statSync(p).mtimeMs); } catch {} }
    }
  };
  try { walk(dir); } catch {}
  return max;
}
const indexPath = path.join(repoRoot, 'index.html');
const indexStat = fs.statSync(indexPath);
const buildStart = {
  file: 'index.html',
  size: indexStat.size,
  mtime: new Date(indexStat.mtimeMs).toISOString(),
  sha256: sha256File(indexPath),
  srcMaxMtime: maxMtime(path.join(repoRoot, '.dev', 'src')) ? new Date(maxMtime(path.join(repoRoot, '.dev', 'src'))).toISOString() : null,
  runAt: new Date().toISOString(),
};
buildStart.stale = !!(buildStart.srcMaxMtime && buildStart.mtime < buildStart.srcMaxMtime);
const tag = args.tag || ('v2-' + buildStart.sha256.slice(0, 8));
const shotsDir = path.resolve(repoRoot, args.shots || path.join('production', 'qa', 'screenshots'));
const outDir = path.resolve(repoRoot, args.out || path.join('.dev', 'qa', 'results'));
const diagnosticsDir = path.join(repoRoot, 'production', 'qa', 'diagnostics');
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(diagnosticsDir, { recursive: true });

/* ---------------- 工具 ---------------- */
function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}
const STATUS_ICON = { PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCK', WARN: 'WARN', SKIP: 'SKIP', ERROR: 'ERROR', INFO: 'INFO' };

function summarize(results) {
  const all = [];
  for (const sc of results.scenarios) all.push(...sc.checks);
  const count = (s) => all.filter((c) => c.status === s).length;
  return {
    total: all.length,
    PASS: count('PASS'), FAIL: count('FAIL'), BLOCKED: count('BLOCKED'),
    WARN: count('WARN'), SKIP: count('SKIP'), ERROR: count('ERROR'), INFO: count('INFO'),
    scenarios: results.scenarios.length,
  };
}

/* ---------------- 主流程 ---------------- */
let browser = null;
let exitCode = 0;
const startedAt = Date.now();
const results = {
  kind: 'v2-qa-run',
  tool: 'run-v2-qa.mjs',
  tag,
  build: buildStart,
  env: {
    node: process.version,
    platform: process.platform,
    chrome: process.env.QA_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: !args.headed,
    viewport: '1280x720',
    baseUrl: '',
    swiftshader: true,
  },
  startedAt: new Date().toISOString(),
  scenarios: [],
  console: { errors: [], warnings: [] },
  screenshots: [],
  diagnostics: {},
};

async function loadScenarios() {
  const files = fs.readdirSync(scenariosDir).filter((f) => f.endsWith('.mjs')).sort();
  const out = [];
  const only = args.only ? args.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
  for (const f of files) {
    if (only && !only.some((p) => f.startsWith(p) || f.includes(p))) continue;
    const mod = await import(pathToFileURL(path.join(scenariosDir, f)).href);
    if (mod && mod.default) out.push(mod.default);
  }
  return out;
}

async function writeResults(final = {}) {
  results.finishedAt = new Date().toISOString();
  results.durationMs = Date.now() - startedAt;
  results.durationText = fmtDuration(results.durationMs);
  results.summary = summarize(results);
  Object.assign(results, final);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const latest = path.join(outDir, 'latest.json');
  fs.writeFileSync(latest, JSON.stringify(results, null, 2));
  if (!args.noArchive) fs.writeFileSync(path.join(outDir, `run-${stamp}.json`), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, 'summary.md'), buildSummaryMd(results));
  return latest;
}

function buildSummaryMd(r) {
  const s = r.summary;
  const lines = [];
  lines.push('# v2.0 QA 自动运行摘要');
  lines.push('');
  lines.push(`- 运行时间：${r.startedAt} → ${r.finishedAt}（${r.durationText}）`);
  lines.push(`- 构建：index.html size=${r.build.size} mtime=${r.build.mtime}`);
  lines.push(`- SHA-256：${r.build.sha256}`);
  lines.push(`- __DEBUG.version：${r.build.debugVersion || '未知'}（${(r.build.debugKeys || []).length} 个调试项）`);
  lines.push(`- 平台：${r.env.platform} / Chrome ${r.env.headless ? 'headless' : 'headed'} / 1280x720 / SwiftShader`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`| 用例状态 | 数量 |`);
  lines.push('| --- | --- |');
  for (const k of ['PASS', 'FAIL', 'BLOCKED', 'WARN', 'SKIP', 'ERROR', 'INFO']) lines.push(`| ${k} | ${s[k]} |`);
  lines.push(`| **总计** | **${s.total}** |`);
  lines.push('');
  lines.push('## 套件结果');
  lines.push('');
  lines.push('| 套件 | 标题 | 状态 | 检查 | FAIL | WARN | BLOCKED | 控制台错误 | 耗时 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const sc of r.scenarios) {
    const c = sc.checks || [];
    const n = (st) => c.filter((x) => x.status === st).length;
    lines.push(`| ${sc.id} | ${sc.title || ''} | ${sc.status} | ${c.length} | ${n('FAIL')} | ${n('WARN')} | ${n('BLOCKED')} | ${(sc.consoleErrors || []).length} | ${Math.round((sc.durationMs || 0) / 1000)}s |`);
  }
  lines.push('');
  lines.push('## 非 PASS 明细');
  lines.push('');
  for (const sc of r.scenarios) {
    const bad = (sc.checks || []).filter((c) => !['PASS', 'INFO', 'SKIP'].includes(c.status));
    if (!bad.length) continue;
    lines.push(`### ${sc.id} — ${sc.title || ''}（${sc.status}）`);
    for (const c of bad) {
      lines.push(`- **${c.status} ${c.id}** ${c.desc}`);
      if (c.detail) lines.push(`  - ${String(c.detail).slice(0, 900)}`);
      if (c.evidence) lines.push(`  - 证据：${c.evidence}`);
    }
    lines.push('');
  }
  lines.push('## 控制台错误');
  lines.push('');
  if ((r.console.errors || []).length) {
    for (const e of r.console.errors.slice(0, 100)) lines.push(`- [${e.kind}/${e.level}] ${String(e.text).slice(0, 500)}${e.url ? ' @ ' + e.url : ''}`);
  } else {
    lines.push('无 error / exception。');
  }
  lines.push('');
  if ((r.console.warnings || []).length) {
    lines.push('## 控制台警告');
    lines.push('');
    for (const w of r.console.warnings.slice(0, 50)) lines.push(`- [${w.kind}/${w.level}] ${String(w.text).slice(0, 300)}`);
    lines.push('');
  }
  lines.push('## 截图（' + (r.screenshots || []).length + '）');
  lines.push('');
  for (const p of (r.screenshots || [])) lines.push(`- ${p}`);
  lines.push('');
  lines.push('## 诊断数据');
  lines.push('');
  for (const [k, v] of Object.entries(r.diagnostics || {})) lines.push(`- ${k}: ${v}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const scenarios = await loadScenarios();
  if (!scenarios.length) {
    console.error('没有匹配的测试套件（--only=' + args.only + '）');
    process.exit(3);
  }
  // 自动化模式：加 ?qa 关闭指针锁定丢失自动暂停；并在就绪后显式 setAutoPause(false)
  const baseUrl = (args.baseUrl || pathToFileURL(indexPath).href) + (/\?/.test(args.baseUrl || '') ? '' : '?qa');
  results.env.baseUrl = baseUrl;
  results.env.autoPauseDisabled = true;

  console.log('=== 余烬之刃 v2.0 无头浏览器验收 ===');
  console.log('构建:', buildStart.file, buildStart.size, 'bytes', buildStart.mtime, 'sha256=' + buildStart.sha256.slice(0, 16));
  if (buildStart.stale) console.log('⚠ index.html 早于 .dev/src 最后修改时间（可能构建不新鲜）');
  console.log('URL:', baseUrl);
  console.log('套件:', scenarios.map((s) => s.id).join(', '));
  console.log('');

  browser = await launchBrowser({ headless: !args.headed });
  results.env.chromeVersion = browser.version && (browser.version.Browser || browser.version['User-Agent'] || '');
  const page = await browser.newPage();
  const ctx = new QAContext({ page, repoRoot, shotsDir, diagnosticsDir, tag, args });

  // 打开游戏并等待就绪
  try {
    await page.navigate(baseUrl, { waitReady: true, timeout: 60000 });
  } catch (e) {
    let failureShot = null;
    try { failureShot = await page.screenshot(path.join(shotsDir, `${tag}-00-load-failure.png`)); } catch {}
    results.loadError = String(e.message || e);
    results.console.errors = page.allErrors().map((x) => ({ kind: x.kind, level: x.level, text: x.text, url: x.url }));
    results.summary = summarize(results);
    results.screenshots = failureShot ? [path.relative(repoRoot, failureShot).split(path.sep).join('/')] : [];
    await writeResults({ verdict: 'BLOCKED', reason: '游戏页面未就绪：' + results.loadError });
    console.error('页面未就绪:', results.loadError);
    return 3;
  }

  // 记录运行时的构建调试信息
  const dbg = await ctx.debugInfo(true).catch(() => null);
  results.build.debugVersion = dbg && dbg.version;
  results.build.debugKeys = (dbg && dbg.keys) || [];
  // 关闭自动暂停（防止指针锁定丢失污染后续断言）
  try { results.build.autoPause = await ctx.eval(`(() => window.__DEBUG.setAutoPause ? window.__DEBUG.setAutoPause(false) : null)()`); } catch {}
  try { results.build.pauseInfo = await ctx.eval(`(() => window.__DEBUG.pauseInfo ? window.__DEBUG.pauseInfo() : null)()`); } catch {}

  // 逐套件执行
  for (const sc of scenarios) {
    const meta = { id: sc.id, title: sc.title || '', coverage: sc.coverage || [] };
    console.log(`\n--- [${sc.id}] ${sc.title} ---`);
    ctx.beginScenario(meta);
    const t0 = Date.now();
    try {
      await Promise.race([
        Promise.resolve(sc.run(ctx)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('套件超时（' + 300 + 's）')), 300000)),
      ]);
    } catch (e) {
      ctx.error(sc.id + '-ERROR', '套件执行异常', e && e.stack || e);
      console.error('套件异常:', sc.id, e && e.message);
    }
    const scResult = ctx.endScenario();
    results.scenarios.push(scResult);
    const fails = scResult.checks.filter((c) => c.status === 'FAIL').length;
    const blocked = scResult.checks.filter((c) => c.status === 'BLOCKED').length;
    const warn = scResult.checks.filter((c) => c.status === 'WARN').length;
    console.log(`  状态=${scResult.status} 检查=${scResult.checks.length} FAIL=${fails} BLOCKED=${blocked} WARN=${warn} 耗时=${Math.round((Date.now() - t0) / 1000)}s 控制台错误=${scResult.consoleErrors.length}`);
    for (const c of scResult.checks) {
      if (c.status === 'FAIL' || c.status === 'ERROR') console.log(`    [${c.status}] ${c.id} ${c.desc} :: ${String(c.detail || '').slice(0, 300)}`);
    }
    results.screenshots = ctx.screenshots.slice();
    results.diagnostics = { ...ctx.diagnostics };
    await writeResults({ verdict: 'RUNNING' });
  }

  // 全局控制台检查
  const allErrors = page.allErrors().map((x) => ({ kind: x.kind, level: x.level, text: x.text, url: x.url }));
  const allWarnings = page.allWarnings().map((x) => ({ kind: x.kind, level: x.level, text: x.text }));
  results.console.errors = allErrors;
  results.console.warnings = allWarnings;
  if (allErrors.length) {
    const globalChecks = [{
      id: 'CONSOLE-GLOBAL-01', desc: '全流程控制台零错误/异常', status: 'FAIL',
      detail: JSON.stringify(allErrors.slice(0, 10)).slice(0, 2000), time: new Date().toISOString(),
    }];
    results.scenarios.push({ id: '99-console-global', title: '全局控制台检查', coverage: ['CONSOLE-01'], status: 'FAIL', checks: globalChecks, consoleErrors: [], consoleWarnings: [], durationMs: 0 });
    console.log(`\n✗ 全局控制台错误 ${allErrors.length} 条`);
  } else {
    const globalChecks = [{ id: 'CONSOLE-GLOBAL-01', desc: '全流程控制台零错误/异常', status: 'PASS', detail: '无', time: new Date().toISOString() }];
    results.scenarios.push({ id: '99-console-global', title: '全局控制台检查', coverage: ['CONSOLE-01'], status: 'PASS', checks: globalChecks, consoleErrors: [], consoleWarnings: [], durationMs: 0 });
    console.log('\n✓ 全局控制台零错误');
  }

  // 构建一致性校验
  const endSha = sha256File(indexPath);
  results.build.sha256AfterRun = endSha;
  if (endSha !== buildStart.sha256) {
    results.build.changedDuringRun = true;
    results.scenarios.push({
      id: '99-build-integrity', title: '构建一致性', status: 'FAIL', consoleErrors: [], consoleWarnings: [], durationMs: 0,
      checks: [{ id: 'BUILD-INTEGRITY-01', desc: '测试期间 index.html 未被覆盖', status: 'FAIL', detail: `sha256 变化: ${buildStart.sha256.slice(0, 12)} -> ${endSha.slice(0, 12)}（结果需重跑）` }],
    });
    console.log('✗ index.html 在测试期间发生变化，结果作废；请重跑');
  }

  const s = summarize(results);
  let verdict = 'PASS';
  if (s.FAIL || s.ERROR || allErrors.length) verdict = 'FAIL';
  else if (s.BLOCKED || s.WARN) verdict = 'PASS_WITH_CONCERNS';
  results.verdict = verdict;
  results.summary = s;
  await writeResults({ verdict });
  console.log('\n=== 结果 ===');
  console.log(`用例: 总 ${s.total} / PASS ${s.PASS} / FAIL ${s.FAIL} / BLOCKED ${s.BLOCKED} / WARN ${s.WARN} / SKIP ${s.SKIP}`);
  console.log('结论:', verdict);
  console.log('结果文件:', path.join(outDir, 'latest.json'));
  console.log('摘要:', path.join(outDir, 'summary.md'));
  console.log('截图:', results.screenshots.length, '张 ->', path.relative(repoRoot, shotsDir));
  exitCode = verdict === 'PASS' ? 0 : verdict === 'PASS_WITH_CONCERNS' ? 1 : 2;
  return exitCode;
}

try {
  exitCode = await main();
} catch (e) {
  console.error('HARNESS ERROR:', e && e.stack || e);
  results.harnessError = String(e && e.stack || e);
  try { await writeResults({ verdict: 'HARNESS_ERROR' }); } catch {}
  exitCode = 3;
} finally {
  if (browser) await browser.dispose();
  console.log('\n退出码:', exitCode);
  process.exit(exitCode);
}
