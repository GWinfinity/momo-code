# MOMO CODE 终端操作指南

> 面向初学用户 — 从零开始在终端使用 momo-code

---

## 一、安装

### Windows 用户（推荐）
```powershell
# PowerShell 中运行
irm https://momozi.cc/install.ps1 | iex
```
安装完成后自动进入配置向导。

### macOS / Linux 用户
```bash
curl -fsSL https://momozi.cc/install | bash
```

### 源码安装（所有平台）
```bash
git clone https://github.com/momozi1996/momo-code.git
cd momo-code/packages/opencode
npm install
npm run build
```

### 验证安装
```bash
momo --version
```
输出 `1.0.0` 即安装成功。

---

## 二、配置 API Key

momo-code 需要 AI 模型的 API Key 才能工作。**（必填）**

### 方式 1：交互式向导（推荐）
```bash
momo /setup
```
按提示选择服务商、输入 API Key，配置自动保存到 `~/.momo/momo.jsonc`。

### 方式 2：环境变量 — 通用 Key
```bash
export MOMO_API_KEY=sk-你的API密钥
```

### 方式 3：环境变量 — 指定服务商
```bash
export MOMO_OPENAI_API_KEY=sk-你的OpenAI密钥
export MOMO_ANTHROPIC_API_KEY=sk-ant-你的Anthropic密钥
export MOMO_DEEPSEEK_API_KEY=sk-你的DeepSeek密钥
```

### 支持的 AI 服务商
| 服务商 | 环境变量 | 推荐模型 |
|--------|---------|---------|
| DeepSeek | `MOMO_DEEPSEEK_API_KEY` | deepseek-chat |
| OpenAI | `MOMO_OPENAI_API_KEY` | gpt-4.1 |
| Anthropic (Claude) | `MOMO_ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| Google (Gemini) | `MOMO_GOOGLE_API_KEY` | gemini-2.0-flash |
| MiniMax | `MOMO_MINIMAX_API_KEY` | MiniMax-Text-01 |
| Moonshot (Kimi) | `MOMO_MOONSHOT_API_KEY` | moonshot-v1-8k |
| Zhipu (GLM) | `MOMO_ZHIPU_API_KEY` | glm-4-flash |
| OpenRouter | `MOMO_OPENROUTER_API_KEY` | anthropic/claude-sonnet-4 |
| 其他 OpenAI 兼容 | `MOMO_API_KEY` | — |

### 指定服务商
```bash
export MOMO_PROVIDER=deepseek     # 用 DeepSeek
export MOMO_PROVIDER=openai       # 用 OpenAI
export MOMO_PROVIDER=anthropic    # 用 Claude
```

### 指定模型 / Tier
```bash
export MOMO_MODEL=ultra      # Claude Sonnet 4
export MOMO_MODEL=standard   # GPT-4.1
export MOMO_MODEL=lite       # GPT-4.1-mini
```

### 让配置永久生效
编辑 `~/.zshrc`（或 `~/.bashrc`、Windows 系统环境变量）：
```bash
# momo-code 配置
export MOMO_API_KEY=sk-你的API密钥
export MOMO_PROVIDER=deepseek
export MOMO_MODEL=standard
```

### 配置文件 `~/.momo/momo.jsonc`
也可以直接编辑配置文件（`momo /setup` 会自动生成）：
```jsonc
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "providers": {
    "deepseek": {
      "apiKey": "sk-你的密钥",
      "baseUrl": "https://api.deepseek.com/v1",
      "defaultModel": "deepseek-chat"
    }
  }
}
```

---

## 三、基础命令

### 首次配置（交互式向导）
```bash
momo /setup
```
按提示选择服务商（DeepSeek / OpenAI / Anthropic 等），输入 API Key，配置自动保存。

### 查看帮助
```bash
momo --help
```
显示所有可用命令。

---

### 交互式对话（推荐用法）
```bash
momo
```
直接进入多轮对话模式，支持上下文记忆。输入消息按 Enter 发送，`Ctrl+C` 退出。
特殊命令：`/clear` 清除历史，`/help` 查看 REPL 命令。

### 打开 Web 工作台
```bash
momo web
```
在浏览器中打开可视化工作台，包含 Chat、Graph、Sim、Optim 等面板。

### 单轮对话
```bash
momo "写一个 Python 函数，计算斐波那契数列"
```
输出：AI 的回复（流式输出，逐字显示），完成后自动退出。

```bash
momo "解释一下 React useEffect 的用法"
```

---

## 四、进阶命令

### 切换 AI 服务商或模型

**用环境变量**：
```bash
MOMO_PROVIDER=anthropic momo "写一个 TypeScript 接口"
MOMO_MODEL=ultra momo "设计一个分布式系统架构"
```

**或同时指定**：
```bash
MOMO_PROVIDER=openai MOMO_MODEL=standard momo "修复这个 bug"
```

---

## 五、经验进化系统（/evolve）

这是 momo-code 的独特功能：通过运行 `/evolve`，它会从你的使用经验中**自动学习策略**，并在下次对话时**自动注入**到 AI 的指令中，让它更擅长你的编码风格。

### 5.1 生成示例经验
```bash
momo /evolve --demo
```
用 9 条模拟信号生成初始经验，适合第一次体验。

**输出示例**：
```
🧬 momo Experience Evolution
  Tactics: 2  Promoted: 0  Verdict: ~
  Storage: ~/.momo/experience/
```

---

### 5.2 查看学到的策略
```bash
momo /evolve --list
```

**输出示例**：
```
📚 Learned Tactics

  DRAFT (1)
    ✎ tac_global_dd04ac2f  Apply accepted edits with verification
       winRate=0.750  α=3 β=1  uses=2

  ACTIVE (1)
    ✓ tac_global_d57a5d64  Ensure tests pass after bash changes
       winRate=0.857  α=6 β=1  uses=5
```

| 状态 | 含义 |
|------|------|
| `DRAFT` | 草稿策略，还在观察期 |
| `ACTIVE` | 已激活策略，会在对话中自动注入 |

---

### 5.3 测试策略注入
```bash
momo /evolve --inject "Run tests after making changes"
```
查看哪些 ACTIVE 策略会被注入到对话中。

---

### 5.4 从当前项目自动学习（真正执行测试）
```bash
# 先进入你的项目目录
cd /path/to/your/project

# 然后运行（会自动执行 npm test 和 tsc 类型检查）
momo /evolve --auto
```

这会：
1. 执行 `npm test` → 根据结果记录 pass/fail
2. 执行 `npx tsc --noEmit` → 检查类型错误
3. 自动学习并更新策略

---

### 5.5 手动添加信号
```bash
momo /evolve --solidify tac_global_d57a5d64 pass
```
手动确认某个策略是好的（`pass`）或坏的（`fail`）。

---

## 六、策略优化（/fine-tune）

对 `/evolve` 学到的策略进行统计优化和状态提升。

### 6.1 诊断当前状态
```bash
momo /fine-tune
```

**输出示例**：
```
🔬 /fine-tune Diagnosis
  Tactics: 2 total
    draft: 2  active: 0  promoted: 0  retired: 0
  Ledger:  1 entries

  💡 Need more tactics. Run: momo /evolve --demo
```

---

### 6.2 执行策略优化
```bash
momo /fine-tune run
```

**输出示例**：
```
🏋️ /fine-tune Training
  Run ID: run_xxxxxx

  Step 1/5: 📚 Curriculum
    Gold: 0  Replay: 1  Hard-negative: 0
  Step 2/5: 🧪 Baseline Eval
    pass@1: 75.0%
  Step 3/5: ⚡ Train (Priors)
    1 status transition(s)
  Step 5/5: 🔒 Ratchet Gate
    Δ = +0.0%  regressions: 0

  ✓ Ratchet PASS — candidate staged
```

---

### 6.3 查看运行记录
```bash
momo /fine-tune status
```

**输出示例**：
```
📊 /fine-tune Status
  run_xxxxxx  🟡 staged  7/4/2026
```

---

### 6.4 提升策略（将 candidate 转为正式）
```bash
momo /fine-tune promote run_xxxxxx
```
把优化后的候选策略提升为正式策略。

**输出**：
```
✅ Promoted run_xxxxxx → tactics.json
```

---

## 七、查看模型列表

### 列出所有可用的 AI 模型
```bash
momo models list
```

**输出示例**：
```
Available Models
================

Built-in Tiers:
  Ultra:    claude-sonnet-4, gpt-5, gemini-2.5-pro
  Standard: claude-sonnet-4, gpt-4.1, gemini-2.5-flash
  Lite:     claude-haiku, gpt-4.1-mini, gemini-2.5-flash-lite
```

---

## 八、完整工作流示例

### 日常编码工作流
```bash
# 1. 配置 API
export MOMO_API_KEY=sk-你的密钥
export MOMO_MODEL=standard

# 2. 先运行 evolve 学习
momo /evolve --demo

# 3. 正常编码对话
momo "帮我写一个 Express.js 的中间件"

# 4. 从项目自动学习（进入你的项目目录后）
cd my-project
momo /evolve --auto

# 5. 优化策略
momo /fine-tune run

# 6. 查看状态并提升
momo /fine-tune status
momo /fine-tune promote run_xxxxxx

# 7. 继续对话，此时学到的策略会自动注入
momo "再帮我优化一下那个中间件"
```

---

## 九、文件存储位置

momo-code 在你的电脑上存储以下文件：

```
~/.momo/
├── momo.jsonc              # 配置文件
├── experience/
│   ├── tactics.json        # 学到的策略
│   └── ledger.jsonl        # 操作日志
├── sessions/               # 会话记录
├── finetune/
│   └── runs/               # 训练记录
└── prompts/                # 自定义系统提示
```

---

## 十、常见问题

### Q: 提示 "No API key configured"
```bash
export MOMO_API_KEY=sk-你的密钥
```

### Q: 提示 "Build output not found"
```bash
cd packages/opencode
npm run build
```

### Q: `/evolve --auto` 运行测试很慢
这是正常的，它在真正执行 `npm test` 和类型检查。可以设置超时：
```bash
# 测试简单项目，缩短超时
# 目前默认 120 秒，暂不支持自定义
```

### Q: 怎么知道 tactic 是否被注入了？
运行对话时，如果 `~/.momo/experience/tactics.json` 中有 `ACTIVE` 状态的策略，它们会自动注入到 system prompt 中。你可以用 `/evolve --inject` 测试哪些策略会被选中。

---

*文档版本: v1.0.0 | 适用于 momo-code main 分支*
