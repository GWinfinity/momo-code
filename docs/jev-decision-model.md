# JEV 决策模型使用说明（StartLux / Bamboo Relay）

momo Code 的 JEV（Judgment-Evaluation-Verification）决策层是一个 L0 快速决策层：在工具调用等关键节点，用专门的决策类小模型对"共享状态"做结构化判断（选项 / 评分 / 是非），与主大模型的决策并行记录，用于校准（ECE）与后续的 enforce 接管。

本文介绍如何为 JEV 接入 StartLux-Decision（27B AutoThink，经 Bamboo Relay 网关，当前测试期免费）。

## 1. 获取 API Key

1. 在 Bamboo 控制台创建 API Key（需要有 `default` 组权限，零余额可用）。
2. 保存为环境变量 `BAMBOO_API_KEY`（或 `MOMO_DECISION_API_KEY`，后者优先）。

## 2. 配置（三选一，优先级 env > 桌面 gui.json > momo.jsonc > 默认）

### 方式 A：`~/.momo/momo.jsonc`

```jsonc
{
  "decision": {
    "provider": "bamboonode",                     // 决策模型提供方，关闭用 "off"
    "model": "startlux-decision-27b-autothink",   // StartLux 27B AutoThink
    "mode": "shadow",                             // shadow(只记录) / enforce / off
    "points": ["tool"],                           // 决策门: tool/tactic/route/diff/promote
    "deadlineMs": 1500,                           // 单次决策超时(毫秒)
    "rawLogging": "redacted"                      // 影子日志: full / redacted / none
  }
}
```

### 方式 B：环境变量

```bash
export BAMBOO_API_KEY="YOUR_BAMBOO_API_KEY"
export MOMO_DECISION_PROVIDER="bamboonode"        # 可选，默认 typesafe(空跑)
export MOMO_DECISION_MODE="shadow"                # 可选
export MOMO_DECISION_GATES="tool,promote"         # 可选，逗号分隔
```

### 方式 C：桌面版设置弹窗

桌面版设置（⚙ 或 `Ctrl+,`）中，"提供商 & 模型配置"弹窗内同时提供：

- **聊天大模型**：原有 provider 区块（Anthropic / OpenAI / Gemini / 自定义）
- **决策模型 (JEV)**：状态（影子模式 / 关闭）、模型名、API Key（可显隐）、API 地址

两套 API 并存配置，保存后写入 `~/.momo/gui.json` 的 `jev` 段，CLI 自动消费，无需手写配置。

## 3. 运行与观察

```bash
momo "你的任务"        # 正常会话即可，JEV 在后台并行工作
```

- 会话启动时会显示 `🧠 L0 Decision Backend: bamboonode (shadow, gates: tool)`。
- 设置 `MOMO_UI_DECISION_CHIPS=true` 后，每次工具调用会显示决策胶囊：
  `✓ tool 0.97 → JEV: allow → recorded only · 23ms`
- 影子记录追加到 `~/.momo/jev-shadow.jsonl`（JSONL，每行一条，含 JEV 答案与 LLM 实际决策，默认对 Bearer/token 类内容脱敏）。

## 4. 校准（ECE）

影子模式下 JEV 答案与 LLM 决策成对记录。ECE（期望校准误差）衡量"置信度是否诚实"，达标线 **ECE < 0.05** 后才考虑切 enforce：

```js
// 任意脚本中（Node 22+）
const { getJEVEngine } = await import("./packages/opencode/dist/jev/runtime.js")
getJEVEngine().getECE()          // 当前会话累计
```

## 5. 降级行为（重要）

决策层永远不会让任务失败。以下情况 JEV 一律 abstain，回退到 LLM/人工决策：

- 未配置 API Key、HTTP 错误、超时（默认 1500ms）
- StartLux 返回 `choice: null`（"以上皆非"胜出）
- `none_probability >= 0.2`（官方阈值：无合适选项）
- 返回了选项之外的值

## 6. 当前限制

- **enforce 模式暂无运行时消费方**：目前只有 tool 门在影子模式下真实记录；enforce 仅影响 `JEVEngine.decide()` 的返回值，桌面 UI 因此只提供 影子/关闭 两个状态。其余门（tactic/route/diff/promote）待接线。
- **已安装的 CLI 需重新构建**：`bin/momo` 运行 `dist/` 产物，源码改动需 `cd packages/opencode && npm run build` 后生效（开发态 tsx 直接跑 src 无此问题）。
- StartLux 端点不支持流式；单次决策为同步 HTTP，受 `deadlineMs` 约束。

## 7. 故障排查

| 现象 | 排查 |
|------|------|
| 启动显示 `noop` 后端 | 检查 `provider` 是否为 `bamboonode`、API Key 是否设置（env 是否传入会话） |
| 全部 abstain | 看 `jev-shadow.jsonl` 是否在增长；增长说明后端在工作但选择弃权（正常降级） |
| 401 | Bamboo Key 无效或无 `default` 组权限 |
| 记录文件无内容 | `rawLogging` 是否为 `none`；`MOMO_CONFIG_DIR` 是否指向了别的目录 |

## 8. 相关代码

- 后端与映射：`packages/opencode/src/jev/index.ts`（`createBamboonodeBackend`）
- 配置解析与引擎单例：`packages/opencode/src/jev/runtime.ts`（`resolveJEVConfig` / `getJEVEngine`）
- 运行时接线：`packages/opencode/src/pi-extensions/decisions.ts`（tool 门影子记录）
- 桌面桥接：`packages/opencode/src/cli/cmd/gui.ts`（`gui.json` 的 `jev` 段）
- 测试：`packages/opencode/src/test/jev.test.ts`
