# 参与开发 DSH 快捷动作

感谢你愿意把真实开发流程带进这个插件。项目优先解决一类具体问题：**让 AI 主动发现值得重复使用的操作，同时把执行权留给用户。**

## 最适合贡献的内容

- 新的真实场景：Flutter、Xcode、Android、Web、后端、Docker、测试和日志；
- 更好的动作体验：参数、设备选择、URL 发现、模板、分享、风险提示；
- DSH 插件互操作：让其他插件注册、更新或消费快捷动作；
- 面板交互、无障碍、中文和英文文案；
- 生命周期、并发、安全边界和真实浏览器测试。

如果你还不确定应该改哪里，先提交一个[场景提案](https://github.com/skitse/dsh-dev-actions/issues/new?template=workflow.yml)，说明“你每天重复做什么”和“理想的一键入口是什么”。

## 产品原则

1. 模型可以主动维护入口，但不能因为创建入口而执行它。
2. 用户点击前必须看见准确内容和用途。
3. 模型只提供经过验证的数据，不生成新的特权工具或执行器。
4. 优先使用 DSH 现有的 Session、Shell、沙箱、存储和 Prompt 通路。
5. 面板应该短小、稳定、可恢复，不成为第二个复杂 IDE。
6. 构建成功不是用户验收；面向 UI 的改动需要真实 DSH 浏览器验证。

## 架构地图

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 系统提示、模型工具、Host API、受管命令执行 |
| `src/action-store.ts` | workspace/session 动作持久化、去重和并发串行化 |
| `src/storage.ts` | DSH storage-domain schema |
| `src/client/DevActionsPanel.tsx` | Better Sidebar 面板和用户操作 |
| `src/client/api.ts` | 会话绑定、Prompt、草稿和 Host API 客户端 |
| `skills/dev-actions-maintainer/SKILL.md` | 显式动作库审计流程 |
| `tests/` | schema、wire 和存储边界测试 |

## 本地开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

将 checkout 链接到测试 profile：

```sh
dsh plugin --profile web add dsh-better-sidebar@^0.10.3 link:"$(pwd)"
```

重启 `dsh web` 后至少验证：

1. 启动页面的 boot manifest 含 `dsh-dev-actions`；
2. Better Sidebar 的新标签菜单含“快捷动作”；
3. 模型能调用 `dev_action_upsert`，且调用本身不执行动作；
4. command 可运行、停止并显示日志；
5. prompt 只在点击后发送，instruction 只填入草稿；
6. workspace 动作跨会话存在，session 动作不会泄漏；
7. 修改后的 action revision 会拒绝旧页面点击。

## Pull Request

- 一个 PR 聚焦一个可解释的问题；
- 说明用户场景、行为变化和验证证据；
- 行为修复需要回归测试，UI 改动附截图；
- 不提交本机路径、会话日志、密钥、凭据或 `.playwright-cli` 产物；
- 不把远程部署、Tunnel、设备流或完整 IDE 功能塞入核心插件。

项目使用 MIT License。提交代码即表示你同意按该许可证发布贡献。
