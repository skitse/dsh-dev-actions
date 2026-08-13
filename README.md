# DSH 快捷动作

`dsh-dev-actions` 是一个由 AI 主动维护、由用户决定何时触发的 DeepSeek Harness 快捷操作面板。它作为 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的 companion plugin 工作，把开发过程中值得重复使用的操作放到对话旁边，减少来回找路径、设备 ID、命令参数和重复措辞。

这不是一个需要用户反复整理的快捷启动器。插件会通过系统提示持续告诉当前 AI：只要发现一个操作具有明显复用价值，就应主动调用 `dev_action_upsert` 创建或更新对应按钮，不必等用户要求“把它做成按钮”。AI 负责识别和维护入口；执行、发送和验收仍由用户点击完成。

## 它能放什么

| 类型 | 典型用途 | 点击后的行为 |
| --- | --- | --- |
| 命令 | `flutter run`、启动 dev server、运行聚焦测试、打开模拟器、查看日志 | 在当前会话绑定的真实工作区执行，面板显示日志并可停止 |
| Prompt | “重新检查登录授权流程并修复剩余问题”一类可重复任务 | 通过 DSH 正式的 `session.prompt(..., 'queue')` 路径发送为新一轮用户消息 |
| AI 指令 | 用户经常重复的偏好、验收要求或协作方式 | 只填入当前会话输入框，留给用户检查和修改后发送 |

动作可以按“工作区”持久化，跨该项目的会话复用；也可以只属于当前会话，用于临时验收。AI 使用稳定 key 自动更新和去重，用户可以固定、隐藏、恢复、标记通过或反馈问题。反馈问题会唤起当前会话，AI 再通过 `dev_action_feedback_read` 读取具体内容继续处理。

## 主动维护机制

插件注册了一段稳定的 `systemPrompt.section(...)`，要求模型在正常开发 loop 中持续判断：

- 是否会再次用到这个命令、Prompt 或用户习惯性指令；
- 它是否能省掉路径、设备、参数、窗口切换或重复措辞；
- 应该跨工作区会话保留，还是只用于当前验收；
- 是否已有相同 stable key 的动作需要更新，而不是新增；
- 旧入口是否已经失效，需要隐藏。

同时提供一个可显式调用的 `dev-actions-maintainer` skill，用于让 AI 全面整理或审计当前动作库。日常主动发现依靠系统提示和工具，不要求用户先调用 skill。

模型可用工具：

- `dev_action_upsert`：新增或更新动作；
- `dev_action_list`：读取当前动作库；
- `dev_action_retire`：隐藏已经过时的动作；
- `dev_action_feedback_read`：读取用户的验收与问题反馈。

## 安装

当前 GitHub 仓库已经可用，但 `dsh-dev-actions` 尚未发布到 npm。请先使用本地链接安装，不要直接运行旧版 README 中的 npm 包命令。

```sh
git clone https://github.com/skitse/dsh-dev-actions.git
cd dsh-dev-actions
pnpm install
pnpm build

dsh plugin --profile web add dsh-better-sidebar@^0.10.3
dsh plugin --profile web add link:"$(pwd)"
dsh --profile web --dump-config
```

重启 `dsh web`，浏览器硬刷新后，在 Better Sidebar 的添加标签菜单中选择“快捷动作”。如果 DSH 使用自定义主目录，请为以上命令设置同一个 `DSH_HOME`。

## Flutter 示例

模型完成 Flutter 界面修改后，可以主动创建一个工作区动作：

```text
dev_action_upsert({
  key: "flutter.ios.run",
  kind: "command",
  label: "在 iOS 模拟器运行",
  content: "flutter run -d 'iPhone 16 Pro'",
  reason: "该项目每次界面修改后都需要在固定模拟器上验收。",
  scope: "workspace"
})
```

后续设备或命令变化时，模型继续使用 `flutter.ios.run`，Panel 会更新原按钮而不是堆出重复项。Web、Xcode、Docker、后端服务、聚焦测试和日志观察都使用同一个机制，不需要为每种框架开发一套插件。

## 安全边界

- AI 可以提出或更新动作，但不能因为提出动作而执行它。
- Panel 完整显示命令、Prompt 或指令内容及其复用理由。
- 浏览器提交服务器已经保存的 action ID 与内容版本指纹；动作有任何更新都会要求刷新并重新检查，不能替换命令或工作区路径。
- Host 只使用 Session 上记录的权威工作区，并对路径做 `realpath` 解析。
- 命令通过 DSH 自带的受管 Shell 和当前 Session 沙箱策略运行；环境会清除 credential-shaped 与 `DSH_*` 变量，停止操作终止并等待整棵进程树。
- Prompt 只会在用户点击“发送”后成为新一轮消息；AI 指令默认只进入可编辑输入框。
- 系统提示明确禁止把密钥、凭据、破坏性操作和一次性命令加入动作库。
- 命令输出保留最近 128 KiB；活动运行会在插件卸载或 DSH 退出时被终止并等待退出。
- Web API 沿用 DSH 已有的 Host 与同源请求边界，不新增任何部署配置。

插件不会自动点击任何按钮，也不会把模型生成的数据变成新的动态特权工具。模型只提供经过 schema 验证的动作数据；执行器、Prompt 通路和持久化边界都由插件固定实现。

## 开发与验证

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

发布前应在真实 DSH Web profile 中验证：client bundle 出现在 boot manifest（`exports["./package.json"]` 是 DSH 扫描包声明所必需的）；“快捷动作”标签可见；三种动作分别能运行、发送或填入输入框；工作区动作在新会话中仍存在；会话动作不会泄漏到其他会话；隐藏、恢复、固定、反馈和停止均正常。

## 当前边界

本版本只解决“让用户一触即达”，不重建 IDE、设备控制或 GUI 自动化。其他插件以后可以把自己的高频操作接入同一种动作模型，但不属于本插件当前职责。
