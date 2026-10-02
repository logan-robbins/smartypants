# Smartypants（架构图）

[English](README.md)

**在 AI 编程代理写代码的同时，自动维护一张实时架构图——代码偏离你的设计时立即告警。**

你的代理会忘记你要求过什么，Smartypants 不会。它接入 Claude Code、Codex、Pi、Muse Code 和
Grok Build 的钩子（hooks），在每一轮对话中保持一张分层的系统架构图，并在改动违背你描述的设计时标红。

[**在线演示**](https://logan-robbins.github.io/smartypants/) · [安装](#安装) · [对比](#对比) · [数据去向](#数据去向)

![设计面试变成架构图，随后出现偏移告警](docs/hero.gif)

- **实时，而不是快照。** 提示、编辑和每轮结束都会在后台更新架构图，代理无需等待。
- **对照你说过的话检查偏移。** 对话中的决策与约束以 IntentCode 保存（每个设计约 200 token）。每轮结束时一次批量检查
  git 中的改动；违背决策、约束或边界的代码会被标红。
- **为已有项目补全架构图。** 读取代码以及 compose、Kubernetes、Helm、Terraform：真实服务名、调用关系和网络边界，约一分钟，成本约一美分。
- **像资深工程师画的图。** 用户在顶部、存储在底部，请求路径从左到右，边界用虚线框表示。每个方框有清楚的名字和一句说明；
  点击查看**为什么**需要它。

## 安装

```sh
npm install -D @logan-robbins/smartypants
npx smartypants init        # 为所有宿主写入钩子与配置；已有代码时自动补全架构图
npx smartypants serve       # 打开输出的地址
```

**默认模型是 Claude，沿用你的 Claude Code 登录方式。** Smartypants 以无界面方式调用本机的 `claude` CLI（无工具、无设置、每次一个回答），
所以 Claude Code 能用的方式都能直接用，无需额外 key：`ANTHROPIC_API_KEY`、Bedrock / Vertex / Foundry、`ANTHROPIC_BASE_URL` 网关，
或 `claude` 登录。没有 Claude Code 的宿主可用 `init --flavor codex|pi|grok|meta`。

**加上 Jev（可选，推荐）。** Jev 约 0.2 秒回答每轮的小问题，成本不到一美分的零头，只有需要写入时才调用 Claude：
在 [console.typesafe.ai/keys](https://console.typesafe.ai/keys) 登录并创建 API key，在启动代理的 shell 中
`export TYPESAFE_API_KEY=...`（或写入 dotenv 并设置 `"envFile"`，或填入 Claude Code 插件的 “Typesafe (Jev) API key” 设置），然后重启代理会话。
没有它时这些问题也由 Claude 回答（每次约 3 秒、1–2 美分）。

插件：`/plugin marketplace add logan-robbins/smartypants` 然后 `/plugin install smartypants@smartypants`（Claude Code）·
`codex plugin marketplace add logan-robbins/smartypants`（Codex）· `pi install git:github.com/logan-robbins/smartypants`（Pi）·
`npx skills add logan-robbins/smartypants`。

**没有 API key？** 先看演示：`npx smartypants demo youtube-top-k && npx smartypants serve`。

## 对比

| | **Smartypants** | Archify | drawio-skill | Whiteboard | GitDiagram · DeepWiki |
|---|---|---|---|---|---|
| 代理工作时自动更新 | **每一轮（钩子）** | 需手动请求 | 需手动请求 | 需手动请求 | 需手动请求 |
| 记住你的意图 | **是（IntentCode）** | 仅对话上下文 | 否 | 决策日志 | 否 |
| 偏移检测 | **每轮，对照意图** | 前后对比 | 图对比 | 否 | 否 |
| 已有仓库 + Helm/k8s/compose/TF | **是，后台** | 仓库 | 代码 + IaC | 仓库 | 仓库 |

## 数据去向

没有 `smartypants.config.json` 的项目不会发送任何数据。默认的 `claude` 构建器会把设计对话、组件名、每轮结束时的改动 diff
以及（补全时）关键源文件通过你自己的 Claude Code 发送给 Claude，沿用它现有的账号、服务商和数据条款；Smartypants 从不读取或保存 Claude 凭据。
使用 `meta` 构建器时数据发送到 **api.meta.ai**，其默认档 `muse-spark-1.3-contributor` **可能被用于训练**（`"model": "muse-spark-1.3"` 可退出）。

更多内容见 [英文 README](README.md)。

## 许可证

[Apache-2.0](LICENSE)。可自由使用、修改和分发；任何副本或衍生作品须保留 [NOTICE](NOTICE)。
