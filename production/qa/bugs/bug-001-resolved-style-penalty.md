# bug-001（已修复验证）：受击不扣除风格分

| 字段 | 内容 |
| --- | --- |
| 编号 | QA-ITER1-01 / bug-001 |
| 严重级别 | S3（一般，非阻断；影响风格评级回馈与 S 级维持难度） |
| 状态 | **RESOLVED / VERIFIED FIXED**（最终构建复验通过） |
| 发现构建 | `C1AAD092364A0A242337914970F985E04F2EF896CF192AD77D31A6A2F5839525`（旧构建，已作废） |
| 修复构建 | `8CD795A8CED3878F2AF71E5506AC708D259ADC0B0DA6A006B8A5C3D87CD6468B`（最终构建） |
| 模块 | 战斗 / 风格评级（SYS-08） |
| 环境 | Windows Chrome 无头 + `file://` + SwiftShader；`__DEBUG` 白盒 |
| 发现日期 | 2026-10-19 |

## 期望行为（设计依据）

`design/gdd/parry-style-system.md` §4.4：**受击惩罚：−10 风格分**（不直接清空，保留操作容错）。

## 实际行为（旧构建）

`damagePlayer` 命中路径未扣风格分，只有 `game.js updateStyle` 的自然衰减；受击后风格分只随时间缓慢下降，玩家「冒险/受伤」的评级反馈缺失。

## 最小复现步骤（旧构建）

1. 打开 `index.html`，点击「开始战斗」，选择任意初始祝福进入 `mode=playing`。
2. 执行：`__DEBUG.god(false);`
3. 执行：`__DEBUG.style(20);` → 读 `__DEBUG.state().style.points`（≈20，C 级）。
4. 执行：`__DEBUG.damagePlayer(5); __DEBUG.tick(0.2);`
5. 读 `__DEBUG.state().style.points` / `state().hp`。

**旧构建实际**：HP 正常扣血（100→95），但风格分只发生约 -1.2 的自然衰减（如 42.4→41.2），未出现 -10。
**最终构建实测**：风格分 46.6 → 36.6（-10），HP 100→95 —— 符合设计。

## 修复与验证

- 修复：最终构建 `damagePlayer` 实际命中路径新增 `addStyle(-10)`。
- 验证用例：`STYLE-03b`（套件 02-parry-style-execute）→ **PASS**。
- 证据：`production/qa/diagnostics/style-experiment.json` 中 `playerDamage` 字段：
  - `before.points = 46.6`，`after.points = 36.6`，`hp = 95`
- 回归：同套件 STYLE-01/02/02b/02c/03/04 全部 PASS；全局控制台零错误。

## 备注

- 该缺陷不影响游戏可运行性与主流程，属于体验/评级反馈类问题，故定级 S3。
- 建议 design-docs 侧同步确认文档中其他旧数值（如弹反窗口 0.18s）与最终实现（0.20s，Lead 确认为预期）保持一致，避免未来误读。
