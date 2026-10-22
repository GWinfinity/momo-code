# 3D 预览与 miora.design 相似性分析与规避指南

> 结论先行：momo 的 3D 预览与 miora.design 首页的 3D 区块目前是「范式相同、表达不同」，风险可控。共同部分属于 3D 查看器的通用交互模式（不构成版权保护对象），真正需要回避的是对 miora 独特表达的复刻（布局、配色、图标、文案、专有功能命名、素材）。

## 1. 对比对象

### 1.1 momo 的 3D 预览

- 位置：`packages/opencode/src/serve/workbench.html`（Sim 工作台，`momo serve` 的 `/workbench` 页面）
- 技术栈：three.js + OrbitControls + GLTFLoader，均为 MIT 许可
- 核心功能：
  - three.js 视口：透视相机、轨道控制（拖拽旋转 / 滚轮缩放 / 右键平移）、阻尼（`workbench.html:165-183`）
  - 场景元素：网格地面 `GridHelper`、坐标轴 `AxesHelper`、半球光 + 平行光（`workbench.html:181-187`）
  - GLB 网格加载：`loadMesh()` 从 `/api/sim/scene/mesh` 拉取 GLB（`workbench.html:208`）
  - 实时位姿流：SSE `/api/sim/poses/stream`，把 Genesis 世界位姿应用到场景节点（`workbench.html:244`）
  - 时间轴：play / pause / step / speed（`workbench.html:265` 附近）
  - 实体树 + 属性检查器（实体列表、link 数、位姿/速度检查）
  - 相机管理：增删、移动、快照、关键帧路径 + 跟随（`workbench.html:491`）
  - 仿真前预览：右侧抽屉写脚本，`scene/preview` 在真实世界中建场景、导出网格，不跑物理（`workbench.html:123`）
  - 视觉风格：深蓝背景（`#0a1424`）+ 橙色强调 + 等宽字体，左右双栏「工作台」布局

### 1.2 miora.design/home 的 3D 部分

来源：抓取 `https://miora.design/home` 与前端 bundle（`index-*.js`）关键词分析，未抓取其私有代码。

- 定位：AI 创意工作室（The Agentic Creative Studio with Memory），在画布上生成/展示图片、视频、UI/UX、3D 资产
- 3D 查看器功能（从 bundle 文案确认）：
  - 自动旋转转台（turntable 360° 预览）、hero reveal 相机预览、多轴展示、多视角参考图
  - 全景模式：自动旋转 / 重置视角 / 全屏 / 截图 / 下载 PNG / 缩放 / 俯仰 / 偏航
  - 重打光（选择光源方向）、六视图生成、动作生成、动画
  - GLB 上传、GLB / USDZ / 素材包导出
  - 背景与网格：白底 / 金属灰 / 地平线网格开关、白模 / 实体材质模式
  - 10 秒 corkscrew 转台视频（1 圈螺旋 + 推进）
- 视觉风格：明/暗双主题的创意工作室界面（React SPA）

## 2. 相似点与风险分级

| 项目 | 状态 | 风险 |
| --- | --- | --- |
| 3D 查看器范式：轨道旋转 / 缩放 / 网格地面 / 暗色画布 / GLB 展示 | 两者共有 | 低（行业通用，Sketchfab / Unity / Blender / model-viewer 同款，不受版权保护） |
| 「3D 预览 / 3D Preview」等通用文案 | 两者共有 | 低（通用术语） |
| three.js / OrbitControls / GLTFLoader | 两者都依赖 | 低（MIT 许可，允许商用） |
| 布局、配色、字体、图标体系 | momo 为深蓝+橙+等宽「工作台」风格，miora 为创意工作室风格 | 低（当前不混淆） |
| miora 专有功能命名：turntable / autoRotate / hero reveal / asset pack / 六视图 / 全景 / 重打光 | momo 源码检索为 0 命中 | 无（未复刻） |
| miora 特有交互编排：10s corkscrew 转台视频、多视角参考图、素材包导出 | momo 未实现 | 无（未复刻） |
| 逐字复制文案、搬运素材、复制代码 | 未发现 | 无 |

## 3. 怎么区分「相似」与「抄袭」

- 判据一：把两个页面截图并排，去掉 3D 视口本身，剩下的布局 / 配色 / 文案还像吗？
  - 不像 → 只是通用范式，无需处理。
  - 像 → 进入差异化流程。
- 判据二：逐项核对四类「独特表达」：
  1. 配色体系（色板、渐变、强调色）
  2. 字体 / 图标体系
  3. 面板布局与比例（栏目、间距、密度）
  4. 功能命名与营销文案
- 判据三：检索是否直接复刻了对方的专有内容：
  - 关键词：`turntable`、`autoRotate`、`hero reveal`、`asset pack`、`六视图`、`全景`、`重打光`、`corkscrew` 等
  - 若命中，需改写为自有术语或删掉。

## 4. 规避清单

### 4.1 代码与许可

- three.js、OrbitControls、GLTFLoader 均为 MIT，可放心使用（`workbench.html:67`、`workbench.html:133-135`）。
- 不从 miora 站点抓取任何代码、样式、模型、图片进入仓库。
- 在 README / NOTICE 标注第三方开源库来源与版本。

### 4.2 视觉差异化（可选项，最有效）

- 将「网格地面 + 坐标轴」这类最扎眼的共同元素做成可开关，或换成点阵地面 / 软阴影地面 / 隐藏坐标轴（`workbench.html:181`、`workbench.html:183`）。
- 设计自己的 HUD 图标与按钮文案，避免出现「自动旋转 / 全景 / 重打光 / 转台」等 miora 命名。
- 保持 momo 的等宽字体「工作台」身份，不迁移到 miora 的创意工作室风格。

### 4.3 术语与功能命名

- 使用自有命名体系：timeline / step / speed / camera path / preview script（momo 已有）。
- 新功能命名先做「miora 关键词检索」，避免撞名。

### 4.4 合规取证

- 保留独立实现记录（git history 本身即证据）。
- 代码注释中不写「参考了 miora 首页」这类表述。
- 功能对照分析只放在内部文档，不进入产品文案。

## 5. 法律底线

- 著作权保护「表达」不保护「思想 / 功能」：轨道旋转、滚轮缩放、网格地面等通用交互不受保护。
- 反不正当竞争兜底一般要求整体装潢近似 + 用户混淆来源；momo 与 miora 业务定位不同（物理仿真工作台 vs AI 创意生成），不构成混淆。
- 高风险行为只有四种：复刻代码、逐字抄文案、搬运素材、复制品牌元素（logo / 吉祥物 / 商标）。

## 6. 验证记录

- 检索日期：2026-09-01
- momo 源码检索命令（等价）：
  - 在 `packages/opencode/src/` 下检索 `turntable|autoRotate|hero reveal|heroReveal|asset pack|素材包|六视图|sixView|horizon grid|地平线网格|panorama|全景`：0 命中
- miora 分析基于公开页面源码与 bundle 文案，未下载 / 复制其私有实现。