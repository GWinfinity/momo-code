
```markdown
███╗   ███╗ ██████╗ ███╗   ███╗ ██████╗    ██████╗ ██████╗ ██████╗ ███████╗
████╗ ████║██╔═══██╗████╗ ████║██╔═══██╗  ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██╔████╔██║██║   ██║██╔████╔██║██║   ██║  ██║     ██║   ██║██║  ██║█████╗  
██║╚██╔╝██║██║   ██║██║╚██╔╝██║██║   ██║  ██║     ██║   ██║██║  ██║██╔══╝  
██║ ╚═╝ ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝  ╚██████╗╚██████╔╝██████╔╝███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝    ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝

```

# MOMO CODE 🔥v2.0.0
<div align="center">

<!-- 开源标准状态徽章 -->

[![发布版本](https://img.shields.io/github/v/release/momozi1996/momo-code?label=Release&color=orange)](https://github.com/momozi1996/momo-code/releases)
[![Star收藏](https://img.shields.io/github/stars/momozi1996/momo-code?style=flat)](https://github.com/momozi1996/momo-code/stargazers)
[![Fork分支](https://img.shields.io/github/forks/momozi1996/momo-code)](https://github.com/momozi1996/momo-code/forks)
[![开源协议](https://img.shields.io/github/license/momozi1996/momo-code)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![NPM包版本](https://img.shields.io/npm/v/%40momo%2Fcli)](https://www.npmjs.com/package/@momo/cli)
[![AtomGIt Star](https://atomgit.com/momozi1996/momo-code/star/badge.svg)](https://atomgit.com/momozi1996/momo-code)

</div>
<br/>

<!-- 导航图标，URL占位和英文文档统一 -->
<a href="https://momozi.cc" target="_blank">
  <img src="https://img.shields.io/badge/website-momozi.cc-blue" alt="官方网站"/>
</a>
&nbsp;&nbsp;
<a href="https://huggingface.co/momozi" target="_blank">
  <img src="https://cdn.jsdelivr.net/npm/simple-icons@v12/icons/huggingface.svg" width="24" alt="Hugging Face"/>
</a>
&nbsp;&nbsp;
<a href="./README.md" target="_self">
  <img src="https://img.shields.io/badge/docs-EN-orange" alt="English"/>
</a>
<p>
  <a href="https://momozi.cc">官方网站</a> · 
  <a href="https://huggingface.co/momozi">Hugging Face</a> · 
  <a href="./README.md">English Docs</a>
</p>
</div>


> **AI-powered coding agent that evolves with you.**  
> Built on [opencode](https://github.com/sst/opencode) with a unique dual-speed self-evolution system based on [Pioneer Agent](https://arxiv.org/abs/2604.09791).

### ⚠️ Experimental / Active Development

**v2.0 重大架构升级中。** 当前版本引入了 Pi 框架集成、RSI 自进化循环和 JEV 决策层。v1.x 的 `/evolve`、`/fine-tune` 等命令继续兼容，但内部实现将逐步迁移到新架构。

---

## 🚀 v2.0 新特性

### 1. Pi 框架集成（Extension 模式）
- 以 npm 依赖形式集成 `@earendil-works/pi-coding-agent@1.1.0`，**非 fork**
- 6 个 momo 专属 Pi 扩展：
  - `experience` — 自动注入历史验证过的战术
  - `rsi` — 采集工具调用结果与会话指标
  - `permissions` — 敏感操作（写入/危险命令）Y/n 确认
  - `decisions` — L0 决策胶囊实时显示
  - `cot` — 思维链面板（⌃T 折叠/展开）
  - `brand` — momo 品牌 Banner

### 2. 统一 CLI 入口
```bash
momo                              # 进入交互式 REPL（默认）
momo "帮我写一个快速排序"          # 单次任务模式
momo exec "任务描述"               # 显式单次执行
momo --json "任务描述"             # JSONL 结构化输出
momo /evolve --demo               # v1.x 遗留命令（兼容）
```

### 3. 交互式 REPL
- `>` prompt 交互输入
- `/help` `/exit` `/cot` 内置命令
- `⌃T` — 展开/折叠思维链
- `⌃O` — 切换工具详情
- `⌃C` — 中断退出

### 4. JEV 决策层（Judgment-Evaluation-Verification）
- 5 个决策门：tool / tactic / route / diff / promote
- 影子模式：并行记录 JEV 决策与 LLM 决策，校准 ECE
- 支持多后端：TypeSafe（推荐）、Kev、Laya-MLX、规则降级

### 5. RSI 自进化循环（3 级）
| 层级 | 范围 | 自动化程度 |
|------|------|-----------|
| R1 Product | 提示词补丁、战术参数 | 全自动 |
| R2 Strategy | L0 决策模型权重 | 自动 + 校准门 |
| R3 Mechanism | 评估器本身 | 仅生成提案，需人工 Review |

- 预算控制：日限额、成本上限、并发实验数
- 安全开关：`touch ~/.momo/STOP` 立即停止

### 6. momo-bench 评估框架
- 三层切分：selection(60%) / holdout(30%) / canary(10% 冻结)
- 晋升门：7 个反向测试防止作弊
- 任务隔离：快照 + 验证器分离 + 预算限制

---
## 📈 Star History

![Star History Chart](https://api.star-history.com/svg?repos=momozi1996/momo-code\&type=Date) 

>自动更新的 Star 涨幅线（由  [star-history.com](https://star-history.com)提供）。2026-10-17 快照：**1,162 Stars**（2026-06-16 创建 → 2026-07 末 181 → 2026-08 末 394 → 2026-09 末 884 → 2026-10-17 1,162）。

---

## Architecture
| Two-Speed Evolution Algorithm | System Technical Architecture |
|------|----------|
|<img width="1672" height="941" alt="AG" src="https://github.com/momozi1996/momo-code/blob/main/pic/AG_200.png" />|<img width="1672" height="941" alt="SS" src="https://github.com/momozi1996/momo-code/blob/main/pic/SS_200.png" />|
|<img width="1672" height="941" alt="AG" src="https://github.com/user-attachments/assets/bb127413-b647-4c7e-bd5d-696f348f8f31" />|<img width="1672" height="941" alt="SS" src="https://github.com/user-attachments/assets/176ccbff-1a24-4a81-9b77-c6e22e757760" />|

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Experience Fast Loop (`/evolve`)](#experience-fast-loop-evolve)
- [Self-Evolution Training (`/fine-tune`)](#self-evolution-training-fine-tune)
- [v2.0 Architecture](#v20-architecture)
- [Migrating from Claude Code](#migrating-from-claude-code)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Changelog](#changelog)
- [License](#license)

## Features

* **25+ LLM 服务商** — Deepseek、智谱（GLM）、Moonshot（Kimi）、Claude、GPT-4、Gemini、豆包、OpenRouter、Groq、Mistral 等。`\chat` 命令仅使用 OpenAI 兼容协议
* **自定义服务商** — 通过 `MOMO_CUSTOM_*` 环境变量接入任意 OpenAI 兼容 API
* **模型分档** — 零配置选择：`ultra` / `standard` / `lite`
* **交互式 REPL** — v2.0 原生 TTY 界面，带思维链面板、决策胶囊与键盘快捷键
* **Pi 框架集成** — v2.0 扩展模式 agent 运行时，含 6 个 momo 专属扩展
* **JEV 决策层** — 影子模式 L0 决策模型，带 ECE 校准
* **RSI 自进化** — 3 级递归改进（R1/R2/R3），带预算护栏与 STOP 保护
* **momo-bench** — 3 层评估（selection/holdout/canary）+ 7 个反向测试
* **经验快循环（**`/evolve`**）** — 基于 KEP 协议的秒级提示词注入；成功经验经 Thompson 采样自动提炼与选择
* **自进化训练（**`/fine-tune`**）** — 基于蒙特卡洛图搜索（MCGS）+ LoRA 的小时级权重改进
* **自我精炼（**`/refine`**）** — 复盘会话轨迹，提出小而基于证据的改进建议（战术 / 提示词补丁），仅在人工批准后生效
* **递归子代理（**`/agent`**）** — RLM 式任务分解：规划 → 并行子进程 → 合成，带深度 / 预算护栏
* **图引擎（**`/graph`**）** — 把长时任务建模为可恢复的子代理 DAG：LLM 规划依赖图、并行执行、重试、`/sim` 世界智能体节点
* **长时任务（**`/goal`**&#x20;+&#x20;**`/heartbeat`**&#x20;+&#x20;**`/daemon`**）** — 持久目标注入每个会话、定时任务、多小时自主运行的守护循环
* **仿真智能体（**`/sim`**）** — LLM 驱动控制持久的 Genesis 物理世界：智能体向长期存活的命名空间写入 Python（RLM 风格），技能以代码形式从 `~/.momo/sim/skills/` 加载
* **语音输入（**`/voice`**）** — 说出你的需求：麦克风录音（sounddevice）→ OpenAI 兼容 STT（Whisper/Groq）→ 编码会话
* **Claude Code 互操作** — 无缝迁移，继承 `.claude/` 配置、MCP 服务器与提示词
* **本地优先** — 你的代码永远不会离开你的机器。开源、可审计
* **Effect 驱动** — 基于 Effect 构建，代码组合式、类型安全

## Installation

### 环境要求

* **macOS** 或 **Linux**（Windows 请用 WSL）
* **Node.js** ≥ 20.0.0 — 从 [https://nodejs.org](https://nodejs.org) 安装
* **git** 与 **curl**

  检查：

```
node -v   # 应输出 v20.x 或更高
npm -v
git --version
curl --version
```

### 一键安装（推荐）
```
curl -fsSL https://momozi.cc/install | bash
```

安装器会：
1. 将仓库克隆到 `~/.momo/lib/momo-code`
2. 执行 `npm install` + `npm run build`（约 30-60 秒）
3. 在 `~/.momo/bin/momo` 生成启动脚本
4. 将 `~/.momo/bin` 追加到 `~/.zshrc` 或 `~/.bashrc` 的 PATH
   **打开新终端**（或执行 `source ~/.zshrc`），然后：
```
momo --version    # 1.0.0
momo --help
```
若提示 `command not found: momo`，说明 PATH 未生效 — 见 [INSTALL.md](./INSTALL.md#troubleshooting)。

### 源码安装（手动）

```
git clone https://github.com/momozi1996/momo-code.git
cd momo-code/packages/opencode
npm install                # 安装全部依赖，含 TypeScript + Pi 框架
npm run build              # 编译 TS + 修复 ESM 导入
npm run smoke              # 运行冒烟测试（23 项检查）
node bin/momo --version
```

> **注意：**若  `npm install` 无法获取 `@earendil-works/pi-coding-agent`（网络问题），CLI 会自动回退到  **momo Native REPL**（模拟模式）。其余功能不受影响。

### 通过 npm
npm 包将在 v1.1 发布。v1.0 请使用上面的 **一键安装** 。

### 卸载

```
\# 删除安装产物
rm -rf \~/.momo

\# 移除 shell rc 中的 PATH 行
sed -i.bak '/# momo Code CLI/,+1d' \~/.zshrc    # zsh
sed -i.bak '/# momo Code CLI/,+1d' \~/.bashrc   # bash
```

## Quick Start

### 1. 配置 API Key
```
\# 通用 Key（适用于任意服务商）
export MOMO\_API\_KEY=your-api-key

\# 或指定服务商
export MOMO\_ANTHROPIC\_API\_KEY=sk-ant-...
export MOMO\_OPENAI\_API\_KEY=sk-...
```

### 2. 开始编码


```
\# 交互式 REPL（v2.0 默认）
momo

\# 单次任务
momo "Refactor auth to use Effect"

\# 使用模型档位
momo --model ultra "Complex architecture review"
momo --model standard "Fix the login bug"
momo --model lite "Quick code review"

\# JSONL 结构化输出（v2.0）
momo --json "Generate a todo app"

\# 遗留单次执行（v1.x 兼容）
momo -p anthropic "task"
```

### 3. 首次运行

首次运行 momo 会创建 `~/.momo/`：

```
\~/.momo/
├── momo.jsonc          # 配置
├── sessions/           # 历史
├── experience/         # 学到的战术（自动创建）
│   ├── tactics.json
│   └── ledger.jsonl
├── rsi-meta.json       # RSI 循环元数据（v2.0）
└── STOP                # 安全停止文件（创建即停止 RSI）
```

## Usage

### 模型档位

| 档位         | 适用场景      |
| ---------- | --------- |
| `ultra`    | 复杂任务、大上下文 |
| `standard` | 日常编码      |
| `lite`     | 快速任务、低延迟  |

### CLI 选项

```
momo \[options] \[prompt]
Options:
&#x20; \--model, -m \<id>       Model ID 或档位
&#x20; \--provider, -p \<name>  服务商
&#x20; \--json                 JSONL 结构化输出（v2.0）
&#x20; \--help                 显示帮助
&#x20; \--version              显示版本
```

## CLI Commands

### 交互式 REPL（v2.0）

```
momo                     # 进入交互式 REPL
momo "prompt"            # 单次任务（自动检测 TTY）
momo exec "prompt"       # 显式单次运行
momo --json "prompt"     # JSONL 事件流输出
```

**REPL 内置命令：**

| 命令         | 说明         |
| ---------- | ---------- |
| `/help`    | 显示帮助       |
| `/exit`    | 退出 REPL    |
| `/cot`     | 切换思维链显示    |
| **键盘快捷键：** |            |
| 快捷键        | 动作         |
| ---------- | --------   |
| `⌃T`       | 展开 / 折叠思维链 |
| `⌃O`       | 切换工具详情     |
| `⌃C`       | 中断 / 退出    |

### 编码会话（遗留模式）


```
momo                     # 显示帮助与 Banner
momo "prompt"            # 单次任务
momo --model claude-sonnet-4 "task"
```

### 经验快循环（`/evolve`）

```
momo /evolve                       # 默认设置运行进化
momo /evolve --mode=explore        # 偏向探索新战术
momo /evolve --mode=harden         # 偏向已验证高胜率战术
momo /evolve --mode=convention-only # 仅约定类战术
momo /evolve --list                # 显示所有已学战术
momo /evolve --inject              # 为当前任务注入战术
momo /evolve --solidify            # 应用裁决，更新统计
```

### 自进化训练（`/fine-tune`）

```
momo /fine-tune              # 诊断，显示训练提案
momo /fine-tune run          # 执行训练流水线
momo /fine-tune run --dry-run # 预览，不实际执行
momo /fine-tune status       # 查看训练状态
momo /fine-tune promote      # 将候选晋升到生产
```

### 自我精炼（`/refine`）

复盘近期会话轨迹，提出小而可审阅的改进。未经人工批准不会应用任何改动。

```
momo /refine                 # 从近期会话生成提案
momo /refine list            # 列出提案
momo /refine show \<id>       # 查看证据与内容
momo /refine approve \<id>    # 批准（评审门）
momo /refine apply \<id>      # 应用：战术→草稿，补丁→提示词文件
momo /refine reject \<id>     # 拒绝
```

### 递归子代理（`/agent`）

RLM 式递归：模型把复杂任务分解，子代理以子 `momo` 进程运行（尽可能并行），合成器合并结果。

```
momo /agent "Refactor the provider layer and update all callers and tests"
```

护栏：`MOMO_RLM_MAX_DEPTH`（3）、`MOMO_RLM_BUDGET`（8）、`MOMO_RLM_TIMEOUT_MS`（300000）。

### 图引擎（`/graph`）

把长时任务转成**有向无环图（DAG）**，由自包含的子代理任务组成。模型规划 DAG（含真实依赖），节点以子 `momo` 进程运行 —— 按拓扑层级并行，依赖输出向下游传递 —— 失败节点重试，最后由 LLM 合成报告。状态在每批后持久化到 `~/.momo/graphs/<id>.json`，因此运行可跨重启存活。

```
momo /graph run "Design + implement + test a persistence layer"   # 规划 → 执行 → 合成
momo /graph resume \<id>        # 从断点继续长时运行
momo /graph status \<id>        # 节点状态与输出
momo /graph list               # 最近运行
```

规划器可以把节点标记为 `"kind": "sim"`—— 这些节点通过 `/sim run` 变成驱动 Genesis 世界的仿真智能体，因此一个图可以混合编码子代理与物理实验。
护栏：`MOMO_GRAPH_MAX_NODES`（12）、`MOMO_GRAPH_MAX_RETRIES`（2）、`MOMO_GRAPH_CONCURRENCY`（默认取 `MOMO_RLM_BUDGET`）。

### 长时任务（`/goal`、`/schedule`、`/heartbeat`、`/daemon`）

```
momo /goal add "Ship v2.0" "with full test coverage"   # 持久目标
momo /goal list | log \<id> "progress" | done \<id>      # 管理目标
momo /schedule add --every=60m "run tests and report"  # 定时任务
momo /schedule add --at=07:30 "daily standup summary"  # 每日任务
momo /heartbeat            # 运行一次到期任务
momo /daemon               # 前台循环（Ctrl+C 停止）
```

活动目标会注入每个聊天会话。守护进程设计上前台运行 —— 可用 nohup/systemd/Task Scheduler 后台化。预算护栏：`MOMO_DAEMON_MAX_RUNS`、`MOMO_DAEMON_MAX_HOURS`（24）。

### 仿真智能体（`/sim`）

LLM 驱动的智能体，控制持久的 [Genesis](https://genesis-embodied-ai.github.io/) 物理世界。需要安装 `genesis-world` 的 Python（`pip install genesis-world`）。


```
momo /sim doctor                      # 检查 python/genesis/provider 环境
momo /sim run "Stack the red cube on the blue cube"   # LLM 控制循环
momo /sim run "\<task>" --steps=40 --viewer            # 预算步数 + 实时查看器
momo /sim exec "print(42)"            # 一次性世界 REPL
momo /sim exec --file=scene.py        # 在新世界中运行脚本
momo /sim skills                      # 列出已安装世界技能
momo /sim eval --tasks=tasks.json     # 批量评估（每个 episode 全新世界）
```

原理：CLI 启动一个持久的 Python 进程（`python/genesis_world/server.py`）持有 Genesis 场景。每个循环步，模型回复 `{"thought": ..., "code": ...}`；代码在持久世界命名空间中运行（`gs`、`scene`、`step(n)`，变量跨步存活）。技能是放入 `~/.momo/sim/skills/` 的普通 `.py` 文件 —— 自动加载进每个世界。仿真运行记录为轨迹，馈入 `/refine` 自改进循环。

环境变量：`MOMO_SIM_PYTHON`、`MOMO_SIM_BACKEND`（cpu/gpu）、`MOMO_SIM_MAX_STEPS`（20）、`MOMO_SIM_SERVER`。

### 推理驱动参数优化（`/optim`）

由**代码理解 + 显式推理**驱动的参数调优（灵感来自 [optim-agent](https://optim-agent.github.io/optim-agent/)）。智能体先读代码，推断每个参数的物理 / 业务含义，然后携带显式 `_reasoning`（为什么选这个点）和 `_note`（对目标地形的定性观察，作为跨试验持久草稿纸）提出配置。无效提案降级为随机采样 ——**不稳定的智能体永远不会搞崩一次研究**。


```
momo /optim scan src/serve.py --param=threshold:0.05:0.95   # 读代码 → 语义地图
momo /optim init quality --target=src/serve.py \\
&#x20; \--param=threshold:0.05:0.95 --param=budget:10:200:int,log \\
&#x20; \--metric=score --direction=max --cmd="python eval.py --threshold {threshold}"
momo /optim semantics quality approve     # 人工评审门
momo /optim run quality --trials=20       # 推理驱动循环
momo /optim history quality               # 完整推理轨迹
```

评估器：`--cmd`（业务命令，从 stdout 解析指标）或 `--sim`（在 Genesis 世界做实验，遵循 ESTOP）。研究持久化在 `~/.momo/optim/studies/<name>/` 下并自动恢复。详见 [docs/optim.md](docs/optim.md)。

环境变量：`MOMO_OPTIM_HISTORY`（5）、`MOMO_OPTIM_N_INIT`（2）、`MOMO_OPTIM_TIMEOUT`（300）。

### 本地服务器与仪表盘（`serve`）

零依赖本地 HTTP 服务器，把 momo 的状态暴露为 JSON API + SSE 实时流，带单文件仪表盘（无需构建）。

```
momo serve                      # http://127.0.0.1:4097（仪表盘在 /）
momo serve --port=8080 --token=s3cret
```

* API：`GET /api/sessions|goals|schedule`、`GET /api/optim/studies[/:name[/trials]]`、`GET /api/sim/observe`、SSE `GET /api/optim/studies/:name/stream`
* 动作：`POST /api/optim/studies/:name/run`、`POST /api/sim/estop|resume`、`POST /api/chat`
* 仪表盘标签页：Overview / Sessions / **Optim（实时推理轨迹 + 最优结果图表）** / Sim（ESTOP 控制）/ Schedule & Goals / Chat
* 默认仅绑定回环地址；非回环监听需 `--token`（Bearer 鉴权，浏览器 EventSource 回退用 `?token=`）
  环境变量：`MOMO_SERVE_PORT`（4097）、`MOMO_SERVE_HOST`（127.0.0.1）、`MOMO_SERVE_TOKEN`。

### 语音输入（`/voice`）
说出需求代替打字。录音需要 `pip install sounddevice scipy`，以及一个 OpenAI 兼容的语音转文字端点。

```
momo /voice                       # 录音 5 秒 → 转写 → 作为 prompt 运行
momo /voice --seconds=10 --lang=zh
momo /voice --file=meeting.mp3    # 转写音频文件 → 运行
momo /voice transcribe --file=x.wav  # 仅打印转写结果
```

```
export MOMO\_STT\_API\_KEY=sk-...       # 回退到 MOMO\_OPENAI\_API\_KEY / MOMO\_API\_KEY
export MOMO\_STT\_MODEL=whisper-1      # 默认
\# Groq（快速、慷慨的免费额度）：
export MOMO\_STT\_BASE\_URL=https://api.groq.com/openai/v1
export MOMO\_STT\_MODEL=whisper-large-v3
```

### 模型管理

```
momo models list         # 列出所有模型
momo models info \<id>    # 查看模型详情
momo models providers    # 查看可用服务商
```

## Configuration

### 配置文件（`~/.momo/momo.jsonc`）

```
{
&#x20; "\$schema": "https://momozi.cc/config.json",
&#x20; "model": "standard",
&#x20; "provider": "anthropic",
&#x20; "inheritClaudeCode": true,
&#x20; "evolve": {
&#x20;   "enabled": true,
&#x20;   "auto": false,
&#x20;   "clusterThreshold": 10,
&#x20;   "budgetUSD": 50
&#x20; }

}
```

### v2.0 配置 Schema（`momo.jsonc` v2）

v2.0 引入扩展配置 schema，支持 Pi 运行时、JEV、RSI 与 UI 设置：

| Section      | Key                  | 说明                                 | 默认值                    |
| ------------ | -------------------- | ---------------------------------- | ---------------------- |
| `runtime`    | `engine`             | Agent 引擎：`pi` 或 `legacy`           | `pi`                   |
| `decision`   | `mode`               | JEV 模式：`shadow`/`enforce`/`off`    | `shadow`               |
| `decision`   | `points`             | 启用的决策门                             | `["tactic-relevance"]` |
| `experience` | `maxInjectedTactics` | 每个提示注入的最大战术数                       | `3`                    |
| `rsi`        | `mode`               | RSI 模式：`observe`/`auto`/`off`      | `observe`              |
| `rsi`        | `maxCampaignCostUsd` | 单次实验成本上限                           | `5`                    |
| `rsi`        | `stopFile`           | 停止信号文件路径                           | `~/.momo/STOP`         |
| `ui`         | `thinking`           | 思维链显示：`collapsed`/`expanded`/`off` | `collapsed`            |

## Experience Fast Loop (`/evolve`)

经验快循环（KEP — Knowledge Embedding Protocol）是 momo 独特的**秒级**学习系统。与 `/fine-tune` 用数小时更新模型权重不同，`/evolve` 通过提示词注入在**数秒内**完成学习与应用。

### 工作原理

1. **Observe（观察）** — 从会话中提取信号（测试通过 / 失败、编辑接受 / 拒绝、用户纠正）
2. **Distill（提炼）** — 把成功模式转化为紧凑的 Tactic 卡片
3. **Select（选择）** — 通过 **Thompson 采样**（贝叶斯探索 / 利用）排序战术
4. **Inject（注入）** — 将 top-k 战术插入当前任务的系统提示词
5. **Solidify（固化）** — 应用裁决，更新 Beta 分布统计
6. **Promote（晋升）** — 高置信战术晋级到 `/fine-tune` 课程

### 三类 KEP 资产

| 资产         | 说明                     |
| ---------- | ---------------------- |
| **Tactic** | 紧凑策略卡：触发条件、动作步骤、检查项、护栏 |
| **Case**   | 注入战术后成功的任务记录           |
| **Ledger** | 追加式审计日志（JSONL）         |

### 战术统计（Beta 分布）

每个战术跟踪一个 Beta (α, β) 分布：
* α = 1 + 胜场数，β = 1 + 败场数
* **Thompson 采样**：探索 / 利用平衡
* **UCB1**：备选选择策略

### 进化模式

| 模式                | 行为           |
| ----------------- | ------------ |
| `balanced`（默认）    | 常规探索 / 利用权衡  |
| `explore`         | 偏向新战术，更宽采样   |
| `harden`          | 偏向已验证战术，更紧选择 |
| `convention-only` | 仅约定类战术       |

### 存储

学到的战术存储在 `~/.momo/experience/`：

* `tactics.jsonl` — 全部战术记录
* `ledger.jsonl` — 全部操作审计日志

### 环境变量
| 变量             | 说明   | 默认值                  |
| -------------- | ---- | -------------------- |
| `MOMO_XP_MODE` | 进化模式 | `balanced`           |
| `MOMO_XP_DIR`  | 存储目录 | `~/.momo/experience` |

## Self-Evolution Training (`/fine-tune`)

权重慢循环通过微调改进 momo 的**模型权重**，以小时级时间尺度运行。

### 工作原理
1. **Signal Mining** — 从会话中提取学习信号
2. **Curriculum Synthesis** — 构建训练数据（Gold / 硬负样本 / Replay 切片）
3. **Monte Carlo Graph Search（MCGS）** — 探索训练流水线空间
4. **LoRA Fine-tuning** — 训练候选模型
5. **Ratchet Gate** — 确保单调改进

### 命令

```
momo /fine-tune              # 诊断，显示提案
momo /fine-tune run          # 执行训练
momo /fine-tune run --dry-run # 预览
momo /fine-tune status       # 查看状态
momo /fine-tune promote      # 晋升候选
```

### 配置

| 变量                       | 说明     | 默认值     |
| ------------------------ | ------ | ------- |
| `MOMO_EVOLVE_ENABLED`    | 启用自进化  | `true`  |
| `MOMO_EVOLVE_AUTO`       | 自动触发训练 | `false` |
| `MOMO_EVOLVE_BUDGET_USD` | 最大训练预算 | `50`    |

## v2.0 Architecture

### Pi 扩展架构

momo v2.0 将 Pi 作为 **npm 依赖**（非 fork）集成，向 Pi 的 `AgentSessionRuntime` 加载 6 个自定义扩展：


```
Pi AgentSessionRuntime
├── momo-brand          # 启动时显示 ASCII Banner
├── momo-experience     # 向系统提示词注入战术
├── momo-permissions    # 写入/危险操作的 Y/n 门
├── momo-decisions      # 显示 L0 决策胶囊
├── momo-cot            # 思维链面板（⌃T 切换）
└── momo-rsi            # 记录 tool\_result + agent\_settled
```

### JEV 决策层

影子模式 L0 决策模型，5 个决策门：

| 门                                 | 用途                          |
| --------------------------------- | --------------------------- |
| `tool`                            | 允许 / 确认 / 阻止工具执行            |
| `tactic`                          | 是否注入战术                      |
| `route`                           | 选择模型档位（ultra/standard/lite） |
| `diff`                            | 自动应用 diff 或请求人工审查           |
| `promote`                         | 批准 RSI 候选晋升                 |
| **校准：** enforce 模式接管前 ECE < 0.05。 |                             |

### RSI 三级循环
| 层级                                     | 范围         | 频率    | 人工审查   |
| -------------------------------------- | ---------- | ----- | ------ |
| R1 Product                             | 提示词补丁、战术参数 | 每次会话  | 无      |
| R2 Strategy                            | L0 决策模型权重  | 每个校准门 | 门触发    |
| R3 Mechanism                           | 评估器本身      | 罕见    | **必须** |
| 安全：`touch ~/.momo/STOP` 立即停止所有 RSI 活动。 |            |       |        |

### momo-bench 评估

防止过拟合的三层数据切分：
| 切分                     | 比例  | 用途              |
| ---------------------- | --- | --------------- |
| selection              | 60% | 战术优化            |
| holdout                | 30% | 门验证             |
| canary                 | 10% | 冻结 —— 自动流水线永不可见 |
| 晋升门含 **7 个反向测试**（防作弊）： |     |                 |



1. 明显损坏的战术 → 拒绝
2. 删除测试来通过 → 拒绝
3. 退出码非零却伪造分数 → 拒绝
4. 与基线完全相同 → 无结论
5. 成本下降且无回归 → 接受
6. 数据不足 → 无结论
7. 开发集提升但 holdout 受损 → 拒绝

### 项目结构（v2.0）

```
packages/opencode/src/
├── cli/                 # v1.x 遗留命令（/evolve /fine-tune）
├── config/              # momo.jsonc v2 schema + resolver
├── decision/            # DecisionPort 类型契约
├── evolve/              # Evolution + EvolutionCandidate
├── experience/          # KEP 快循环 + 闭环链
├── jev/                 # JEV 决策层
├── momo-bench/          # 3 层评估 + 门
├── pi-extensions/       # 6 个 Pi 扩展
├── provider/            # 19 个 LLM 服务商集成
├── repl/                # 交互式 TTY REPL
├── rsi/                 # 3 级自进化循环
├── runtime/             # TaskResult + 事件信封
├── session/             # 提示词路由
├── test/                # Smoke + 集成测试
└── effect/              # Effect 工具集
```

## Migrating from Claude Code

零摩擦迁移：

1. **配置继承**（默认开启）— `~/.claude/settings.json` 自动合并
2. **MCP 服务器**（默认开启）— `.claude/mcp/` 开箱即用
3. **提示词**（默认开启）— `.claude/prompts/` 直接可用

```
\# 关闭继承

export MOMO\_CLAUDE\_CODE\_INHERIT=false
export MOMO\_ONLY=1
```

## Environment Variables

| 变量                                               | 说明                                            | v2.0 |
| ------------------------------------------------ | --------------------------------------------- | ---- |
| `MOMO_API_KEY`                                   | 通用 API Key                                    |      |
| `MOMO_HOME`                                      | 主目录（默认：`~/.momo`）                             |      |
| `MOMO_MODEL`                                     | 默认模型 / 档位                                     |      |
| `MOMO_PROVIDER`                                  | 默认服务商                                         |      |
| `MOMO_UI_DECISION_CHIPS`                         | 显示决策胶囊                                        | ✅    |
| `MOMO_UI_EVIDENCE_BAR`                           | 显示证据条                                         | ✅    |
| `MOMO_RSI_ENABLED`                               | 启用 RSI 信号记录                                   | ✅    |
| `MOMO_RSI_MAX_PROMOTIONS_PER_DAY`                | 每日晋升上限                                        | ✅    |
| `MOMO_RSI_MAX_COST`                              | 单次实验成本上限（USD）                                 | ✅    |
| `MOMO_XP_MODE`                                   | 进化模式（balanced/explore/harden/convention-only） |      |
| `MOMO_XP_DIR`                                    | 经验存储目录                                        |      |
| `MOMO_SESSION_RECORD`                            | 设为 `false` 关闭会话轨迹记录                           |      |
| `MOMO_RLM_MAX_DEPTH`                             | 子代理递归上限（默认：3）                                 |      |
| `MOMO_RLM_BUDGET`                                | 单次编排最大子代理数（默认：8）                              |      |
| `MOMO_DAEMON_INTERVAL`                           | 守护进程轮询秒数（默认：60）                               |      |
| `MOMO_DAEMON_MAX_RUNS` / `MOMO_DAEMON_MAX_HOURS` | 守护进程预算护栏                                      |      |
| `MOMO_SIM_PYTHON`                                | 仿真世界服务器的 Python 可执行文件                         |      |
| `MOMO_SIM_BACKEND`                               | Genesis 后端：cpu 或 gpu（默认：cpu）                  |      |
| `MOMO_SIM_MAX_STEPS`                             | LLM 控制循环最大步数（默认：20）                           |      |
| `MOMO_STT_API_KEY`                               | /voice 的 STT Key（OpenAI 兼容）                   |      |
| `MOMO_STT_BASE_URL` / `MOMO_STT_MODEL`           | STT 端点 / 模型（默认：OpenAI whisper-1）              |      |
| `MOMO_VOICE_SECONDS`                             | 默认录音时长（默认：5）                                  |      |
| `MOMO_EVOLVE_ENABLED`                            | 启用自进化                                         |      |
| `MOMO_EVOLVE_BUDGET_USD`                         | 训练预算                                          |      |
| `MOMO_ANTHROPIC_API_KEY`                         | Anthropic Key                                 |      |
| `MOMO_OPENAI_API_KEY`                            | OpenAI Key                                    |      |
| `MOMO_OPENROUTER_API_KEY`                        | OpenRouter Key                                |      |
| 完整列表：`src/env.ts`                                |                                               |      |

## Architecture

### 双速进化
```
┌─────────────────────────────────────────────────────────┐
│                    momo Code                             │
├─────────────────────┬───────────────────────────────────┤
│  经验快循环           │  权重慢循环                       │
│  (/evolve)          │  (/fine-tune)                     │
├─────────────────────┼───────────────────────────────────┤
│  时间尺度：秒        │  时间尺度：小时                     │
│  机制：提示词注入     │  机制：LoRA 微调                   │
│  选择：Thompson/UCB  │  搜索：蒙特卡洛图搜索（MCGS）       │
│  存储：JSONL         │  训练：LoRA                        │
│  (\~/.momo/xp/)      │  门：Ratchet 检查                  │
│  桥接：晋升战术       │  存储：模型注册表                   │
│   → 训练课程         │                                   │
└─────────────────────┴───────────────────────────────────┘
```

### 服务商层

```
User Request
&#x20;   |
&#x20;   v
resolveModel("standard") → BUILTIN\_TIERS.standard
&#x20;   \|                           \[claude-sonnet, gpt-4.1, ...]
&#x20;   v
getCredentials() → MOMO\_\*\_API\_KEY env
&#x20;   |
&#x20;   v
Provider Factory → baseUrl, headers, timeout
&#x20;   |
&#x20;   v
createModel() → LanguageModel adapter
&#x20;   |
&#x20;   v
wrapSSE() → Streaming with 8min timeout
```

## Test Results

* **TypeScript**：`tsc --noEmit` — **0 错误**
* **冒烟测试**：23/23 项通过
* **CLI 已验证**：REPL、`/evolve`、`/fine-tune`、`models`、`help`
* 
## Changelog

### v2.0.0 (2026-10-11)
**新增：**
* Pi 框架集成（`@earendil-works/pi-coding-agent@1.1.0`）作为扩展依赖
* 交互式 REPL，带思维链面板、决策胶囊与键盘快捷键
* JEV 决策层 — 5 个决策门，影子模式 + ECE 校准
* RSI 3 级自进化循环（R1/R2/R3），带预算护栏与 STOP 保护
* momo-bench — 3 层评估（selection/holdout/canary）+ 7 个反向测试
* 6 个 Pi 扩展：experience、rsi、permissions、decisions、cot、brand
* DecisionPort 类型契约（choice/bool/score/abstain）
* TaskResult + EventEnvelope 类型，用于结构化日志
* EvolutionCandidate 接口，带 CAS 晋升保护
* 经验闭环链（TaskExposure → TaskOutcome → Solidify）
* momo.jsonc v2 配置 schema，带优先级 resolver

  **变更：**
* 重写 `bin/momo` 为统一入口（REPL / Pi / 遗留回退）
* 版本：0.1.1 → 1.0.0
* 为所有占位随机数据添加 `[SIMULATED]` 警告
* 新增 `NOTICE` 文件声明独立版权
* LICENSE：澄清为第三方依赖（Pi 是依赖，不是 fork）

### v1.0.0 (2026-06-16)

**新增：**

* 经验快循环（`/evolve`）— KEP 协议 + Thompson 采样
* 权重慢循环（`/fine-tune`）— MCGS 训练流水线
* CLI 命令系统 — `/evolve`、`/fine-tune`、`models`、`help`
* 跨 provider/evolve/experience/cli 层的 53 个 TypeScript 模块
* 双速进化架构
* 战术选择的 Beta 分布跟踪
* 双速桥接（晋升战术 → fine-tune 课程）
  **变更：**
* 产品名： → momo Code
* bin/momo：CJS → ESM 命令路由器
* package.json：生产级 exports、files 白名单

## 🗺 Roadmap
> 公开路线图，欢迎在  [Discussions](https://github.com/momozi1996/momo-code/discussions) 讨论与投票。

* **v2.0 收尾** — 完成 v1.x 遗留命令（`/evolve`、`/fine-tune`）向新架构的迁移，稳定 REPL 与 JEV 校准
* **npm 发布** — `@momo/cli` 上架 npm（规划于 v1.1 /v2.1）
* **更多服务商** — 持续扩展 25+ LLM 服务商与自定义接入体验
* **团队共享经验库** — 经验库（`~/.momo/experience/`）支持导出 / 导入与团队同步（讨论中）
* **GUI / 插件化** — 桌面端与插件系统的社区投票候选（见 [Discussions Ideas](https://github.com/momozi1996/momo-code/discussions)）

## 🤝 Community
| 入口                                                                         | 用途                      |
| -------------------------------------------------------------------------- | ----------------------- |
| [Discussions](https://github.com/momozi1996/momo-code/discussions)         | 提问、分享工作流、功能投票、成果展示      |
| [Wiki](https://github.com/momozi1996/momo-code/wiki)                       | 完整文档：安装、CLI 参考、核心概念、FAQ |
| [Issues](https://github.com/momozi1996/momo-code/issues)                   | Bug 反馈与功能请求             |
| [Security policy](https://github.com/momozi1996/momo-code/security/policy) | 安全漏洞上报                  |
| [momozi.cc](https://momozi.cc)                                             | 官方网站                    |
| [Hugging Face](https://huggingface.co/momozi)                              | 模型与实验                   |

## 🙏 Acknowledgements
* [opencode](https://github.com/sst/opencode) — 基础 agent 框架
* [Pioneer Agent](https://arxiv.org/abs/2604.09791) — 双速自进化方法论
* [Pi Coding Agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — v2.0 agent 运行时（npm 依赖，非 fork）
* [Genesis](https://genesis-embodied-ai.github.io/) — 物理仿真后端（`/sim`）
* [Effect](https://effect.website/) — 组合式、类型安全的 TypeScript 基础
* [optim-agent](https://optim-agent.github.io/optim-agent/) — `/optim` 推理驱动优化的灵感来源

## 🤝 Contributing
欢迎贡献！开始前请阅读：
* [AGENTS.md](./AGENTS.md) — AI 协作约定
* [docs/build-release.md](./docs/build-release.md) — 构建、测试与发布流程
* [USE\_RESTRICTIONS.md](./USE_RESTRICTIONS.md) — 使用限制

开发流程速览：
```
git clone https://github.com/momozi1996/momo-code.git
cd momo-code/packages/opencode
npm install
npm run build
npm run smoke          # 23 项冒烟检查
npm run typecheck      # TypeScript 类型检查
```
提交 PR 前请确保：测试通过、类型检查 0 错误、CHANGELOG.md 已更新、通过品牌检查（`bash scripts/check-rebrand.sh`）。遇到问题先去 [Discussions](https://github.com/momozi1996/momo-code/discussions) 搜索或提问。

## License
[MIT](LICENSE) — 第三方归属见 [NOTICE](NOTICE)。
另见 [USE\_RESTRICTIONS.md](USE_RESTRICTIONS.md) 与 [SECURITY.md](SECURITY.md)。
