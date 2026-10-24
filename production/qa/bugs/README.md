# 缺陷记录说明

## v2.0.2 修复构建（当前，sha256 `60714292965A126A2DAEC440B639AAFAE8F6ACF6123DB1D84022790085948F89`）

聚焦复验结论（只复验 DODGE + 08 回归）：
- 阻断/严重/一般/轻微未关闭缺陷：**0**
- `bug-002`（S4 翻滚可见部件穿地观察项）→ **CLOSED（已修复并复验）**
- `bug-001`（S3 受击不扣风格分）→ 已修复并在 v2.0.0/v2.0.1/v2.0.2 持续通过

v2.0.2 运行结果：47 checks（08+10+全局控制台），PASS 32 / FAIL 0 / WARN 0 / SKIP 0；控制台零错误。
- 结果：`.dev/qa/results/latest.json`（v2.0.1 归档 `.dev/qa/results/latest-v2.0.1.json`）
- 报告：`production/qa/qa-report-v2.0.1.md`（含 §附录 v2.0.2；v2.0.0 主报告：`production/qa/qa-report-v2.md`）
- 试玩：`production/playtests/playtest-v2.md`（含 v2.0.1/v2.0.2 补充观察）
- 证据：`production/qa/screenshots/v2.0.2-*`、`production/qa/diagnostics/{dodge-v202-experiment,dodge-midframe}.json`

## v2.0.1 修复构建（历史，sha256 `BB92E66C…4C68`）

- 全量 10 套件 265 checks：0 FAIL，1 WARN（环境性能）；该轮开放 1 个 S4（`bug-002`，后续 v2.0.2 修复关闭）。
- 归档：`production/qa/screenshots/v2.0.1-*`（39 张）、`production/qa/diagnostics-v2.0.1/`、`.dev/qa/results/latest-v2.0.1.json`。

## v2.0.0 最终构建（历史，sha256 `8CD795A8…D6468B`）

- 该轮全量验收未关闭缺陷 0（`bug-001` 已修复复验）。
- 证据归档：`production/qa/screenshots/v2-8cd795a8-*`、`production/qa/diagnostics-v2.0.0/`、`.dev/qa/results/latest-v2.0.0.json`。
