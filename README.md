# DSH 快捷动作

**让 AI 把你会重复做的开发操作，主动变成对话旁边的一键按钮。**

[English](README.en.md) | [安装](#两分钟安装) | [参与开发](CONTRIBUTING.md) | [路线图](#欢迎一起开发)

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek-Harness-4b73ff)](https://github.com/deepseek-ai/deepseek-harness)
[![DSH Plugin](https://img.shields.io/badge/topic-dsh--plugin-238636)](https://github.com/topics/dsh-plugin)
[![Release](https://img.shields.io/github/v/release/skitse/dsh-dev-actions)](https://github.com/skitse/dsh-dev-actions/releases)
[![CI](https://github.com/skitse/dsh-dev-actions/actions/workflows/ci.yml/badge.svg)](https://github.com/skitse/dsh-dev-actions/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/skitse/dsh-dev-actions)](LICENSE)

你在让 AI 开发时，经常会遇到这些小麻烦：

- 每次改完 Flutter 页面，都要重新找设备 ID，再输入 `flutter run -d ...`；
- 每次改完登录，都要再次描述同一套登录、授权回调和退出登录验收；
- 每次出问题，都要重复提醒 AI“先复现并记录证据，不要只说构建通过”；
- dev server、聚焦测试、日志命令明明刚用过，下一轮还要回终端、找目录、重新输入。

`dsh-dev-actions` 会让当前模型在正常工作中主动发现这些重复模式，并把它们维护成“快捷动作”。你不需要自己整理快捷方式，也不需要先提醒 AI 做按钮；只要在需要时点一下。

<p align="center">
  <img src="docs/assets/dev-actions-panel.png" width="420" alt="DSH 快捷动作面板，展示命令、Prompt 和 AI 指令三种可复用动作">
</p>

## 它到底能做什么

| AI 发现的重复操作 | 自动留下的入口 | 你点击后 |
| --- | --- | --- |
| `flutter run -d chrome`、启动 dev server、聚焦测试、日志命令 | **命令**按钮 | 在当前项目运行，可看日志、可停止 |
| “重新验收登录和授权流程” | **Prompt**按钮 | 作为一轮新的用户消息发给当前 AI |
| “先复现再修复”“改完必须真实验收” | **AI 指令**按钮 | 先填入输入框，由你检查或修改后发送 |

最关键的区别是：**这不是用户手工维护的命令面板，而是 AI 在开发 loop 中主动维护的操作记忆。**

模型负责发现、更新、去重和淘汰入口；用户始终保留执行权。模型创建命令并不会运行命令，创建 Prompt 也不会偷偷发送。

## 两分钟安装

需要 Node.js 22.19+（或 24+）。如果你平时只用 `npx @deepseek-ai/dsh web`，先安装 DSH CLI 和它管理插件所需的 pnpm：

```sh
npm install --global @deepseek-ai/dsh@0.1.0-rc.6 pnpm@10.32.1
```

然后安装插件：

```sh
dsh plugin --profile web add dsh-better-sidebar@^0.10.3 \
  https://github.com/skitse/dsh-dev-actions/releases/latest/download/dsh-dev-actions.tgz
```

重启 `dsh web` 并刷新浏览器，在 Better Sidebar 的“新建标签页”菜单中选择“快捷动作”。

源码开发同样需要 Node.js 22.19+ 和 pnpm 10：

```sh
git clone https://github.com/skitse/dsh-dev-actions.git
cd dsh-dev-actions
pnpm install
pnpm build
dsh plugin --profile web add dsh-better-sidebar@^0.10.3 link:"$(pwd)"
```

> 项目正在跟随 DSH developer preview 快速迭代，插件版本会固定兼容的 DSH RC 范围。

## 它如何主动工作

插件为当前 AI 注册一段持续生效的行为指引和四个固定工具。模型在开发过程中发现有复用价值的操作时，会调用 `dev_action_upsert`；相同 stable key 会更新原动作，不会越积越乱。

它会判断：

- 这个操作是否很可能再次使用；
- 是否能省掉路径、设备 ID、参数、窗口切换或重复措辞；
- 应该跨项目会话保留，还是只用于当前验收；
- 已有入口是否过时，需要更新或隐藏。

动作支持工作区和会话两种范围，以及固定、隐藏、恢复、使用次数、验收通过和问题反馈。`dev-actions-maintainer` Skill 可让 AI 对整个动作库做一次集中整理，但日常主动发现不依赖用户调用 Skill。

## 适合哪些开发

- **Flutter / iOS / Android**：记住设备与启动参数，一键运行、热启动或测试；
- **Web 前端**：启动 dev server、运行 E2E、打开重复验收 Prompt；
- **后端与容器**：启动服务、跑迁移检查、查看日志、执行聚焦测试；
- **Xcode 与原生开发**：保存项目固定的构建、测试和模拟器命令；
- **任何 AI 开发流程**：沉淀反复出现的验收步骤和协作指令。

它不为每个框架重写一套工作台。不同项目只需让 AI 把自己的高频入口放进同一个小面板。

## 安全与控制

- 动作内容和复用理由始终完整可见，执行或发送必须由用户点击；
- 客户端提交 action ID 和内容版本指纹，内容更新后必须刷新并重新检查；
- 命令只在 Session 绑定的权威工作区中运行；
- 命令复用 DSH 的受管 Shell 与 Session 沙箱策略，清理凭据环境并管理进程树；
- AI 指令默认只进入可编辑输入框；
- schema、长度、数量和作用域均有固定边界，模型不能生成新的特权执行器。

详细设计和验证方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 欢迎一起开发

这个插件最有价值的部分会来自不同开发者的真实工作流。现在尤其欢迎：

- Flutter 设备发现、可选择运行目标和热重载体验；
- dev server URL 自动识别与 Web 预览联动；
- Xcode、Android、Docker、测试框架的动作建议策略；
- 参数化动作、动作模板、导入导出和团队共享；
- 风险提示、无障碍、多语言和面板交互改进；
- 与其他 DSH 插件协作的通用动作协议。

不必先理解整个 DSH。可以从带有 [`good first issue`](https://github.com/skitse/dsh-dev-actions/labels/good%20first%20issue) 或 [`help wanted`](https://github.com/skitse/dsh-dev-actions/labels/help%20wanted) 的任务开始；明确需求可提交[场景提案](https://github.com/skitse/dsh-dev-actions/issues/new?template=workflow.yml)，还在探索的想法可以参加[真实工作流征集](https://github.com/skitse/dsh-dev-actions/discussions/4)。

## 开发验证

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

发布前还要在真实 DSH Web profile 中验证 client boot、模型工具调用、三种动作、跨会话持久化、日志和停止流程。当前版本已完成“模型创建动作 -> 面板出现 -> 用户点击 -> 命令执行 -> 日志返回”的浏览器 E2E。

## 当前边界

本插件只解决“把重复操作变成一触即达的入口”。它不是远程 IDE，也不负责远程访问、设备画面流或任意 GUI 自动化；这些能力未来可以由专门插件提供，并与快捷动作协作。
