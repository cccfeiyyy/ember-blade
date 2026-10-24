# .dev/qa —— 《余烬之刃》v2.0 无头浏览器验收工具

本目录为 QA 专用测试框架（零 npm 依赖，Node 24），只读取游戏产物，**不修改** `index.html` / `.dev/src` / `README.md` / 设计文档。

## 运行

```powershell
# 全量（收到 V2_BUILD_READY 后执行）
node .dev/qa/run-v2-qa.mjs

# 只跑指定套件（id 或文件名前缀，逗号分隔）
node .dev/qa/run-v2-qa.mjs --only=00,03

# 自检/调试：不污染正式截图目录
node .dev/qa/run-v2-qa.mjs --only=00 --shots .dev/qa/selftest-shots --tag selftest --no-archive

# 有头模式观察
node .dev/qa/run-v2-qa.mjs --headed --only=00
```

## 产物

| 路径 | 内容 |
| --- | --- |
| `.dev/qa/results/latest.json` | 最近一次运行的机器可读结果（每条 check 的状态/detail/证据） |
| `.dev/qa/results/run-*.json` | 历史运行归档 |
| `.dev/qa/results/summary.md` | 自动生成的汇总草稿（供 `production/qa/qa-report-v2.md` 整理） |
| `production/qa/screenshots/<tag>-<suite>-<name>.png` | 截图证据 |
| `production/qa/diagnostics/probe.json` | 能力探针：`__DEBUG` 能力表、内部对象关键字、DOM/源码 id、localStorage |
| `production/qa/diagnostics/*.json` | 各实验原始数据（parry/boss/endless…） |
| `production/qa/diagnostics/index-at-probe.html` | 测试时 `index.html` 的只读副本（便于回溯） |

## 目录结构

```
.dev/qa/
├─ run-v2-qa.mjs          # 主运行器：构建校验 → 启动 Chrome → 逐套件执行 → 汇总/退出码
├─ lib/
│  ├─ chrome.mjs          # 无头 Chrome 启动 + CDP 客户端（截图/键鼠/日志/异常捕获）
│  ├─ qa.mjs              # QA 上下文：断言/证据/__DEBUG/DOM/存储/性能/探针
│  └─ flows.mjs           # 可复用流程：开局、祝福检测与选择、清波、白盒快照
└─ scenarios/
   ├─ 00-probe.mjs                    # 构建探针 + 标题/开始 + 首波
   ├─ 01-blessing.mjs                 # 回响祝福三选一/波次间/生效
   ├─ 02-parry-style-execute.mjs      # Q 格挡/精准弹反、D→S 风格、处决
   ├─ 03-boss.mjs                     # Boss 50% 二阶段/赤红/剑雨/三连冲击波/突进/胜利
   ├─ 04-enemies-drops.mjs            # 精英词缀/爆裂者/掉落
   ├─ 05-endless-persistence.mjs      # 无尽模式/localStorage 最高纪录/跨刷新
   ├─ 06-pause-settings.mjs           # 暂停/反转Y/画质/灵敏度/音量/持久化
   ├─ 07-endings-console-perf.mjs     # 死亡/胜利/重开/控制台零报错/性能粗测
   └─ 08-regression-v1.mjs            # v1 核心玩法回归
```

## 设计要点

- **真实浏览器**：`--headless=new` + SwiftShader WebGL；每轮独立临时 profile，`localStorage` 从空开始。
- **确定性推进**：优先使用 `window.__DEBUG.tick(秒)` 推进逻辑，减少真实等待与抖动；截图前等待 rAF 渲染当前状态。
- **能力自适应**：先跑 `00-probe` 输出 `__DEBUG` 能力表与 DOM 快照；用例优先用行为/UI 断言，白盒仅作辅助；缺失钩子标 `BLOCKED` 而非伪造 PASS。
- **时序机制**（精准弹反 / Boss 攻击）：在页面内用 tick + 合成键盘事件做定时判定，记录状态直方图作为证据。
- **零报错门禁**：`Runtime.exceptionThrown` / `console.error` / `Log.entryAdded(error)` 全量捕获；全局检查（`99-console-global`）不通过则结论 FAIL。
- **构建一致性**：运行前后比对 `index.html` SHA-256；若测试期间被重新构建，结果作废并提示重跑。
- **不修改被参照的工具**：`.dev/cdp.mjs` 保持原样。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 全量 PASS |
| 1 | PASS_WITH_CONCERNS（有 WARN/BLOCKED，无 FAIL） |
| 2 | FAIL（存在 FAIL/ERROR 或控制台错误） |
| 3 | HARNESS_ERROR（Chrome/CDP/页面未就绪等执行层问题） |
