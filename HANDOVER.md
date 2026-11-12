# DeepSeek Harness 2026-11-12 改动手册

本文件面向接手本工作区的 AI 或开发者。它汇总 master 最近两次功能提交与本次工作区提交，说明改了什么、代码放在哪、各目录负责什么、如何编译与验证。

仓库的 `verify-repository-references` 禁止在维护文件中写 commit id，所以本文只写提交标题，不写哈希；需要哈希时执行 `git log -2`。

## 0. 快速结论

已提交的两次功能：

1. `feat(session): 支持永久删除已存会话`
2. `feat(composer): 支持钉住文件引用与终端选中`

本次提交的功能：

1. 文件停靠区支持放在会话左侧（`editorSide`），并在通用设置中提供切换行。
2. 文件树随停靠区镜像到编辑器左侧；分栏首次打开文件时默认展示文件树。
3. 新增 VS Code 风格快速打开（`Cmd/Ctrl+P`），支持最近文件、工作区按名搜索、绝对路径存在性检查。
4. 文件快捷键改为 `Cmd/Ctrl+Shift+E`，再按一次收起；文件树与文件页共享同一开关状态。
5. 文件标签右键菜单新增“复制文件名 / 复制文件名（带后缀）”。
6. 文件停靠区在左侧时，窗口尺寸变化按比例缩放停靠区宽度，会话保持占比。
7. macOS 侧边栏收起时，左侧停靠区的标签栏避让红绿灯和前置控件。
8. 新增实验插件 `@deepseek-ai/dsh-notify-command`，在等待用户、回合结束、回合失败时执行配置的命令。

## 1. 目录与文件职责地图

| 目录 / 文件 | 职责 |
| --- | --- |
| `packages/client/ui-layout/` | 三栏框架：侧边栏、会话中栏、文件停靠区右栏；列宽求解、拖拽手柄、全屏与窗口适配 |
| `packages/client/ui-layout/src/client/AppFrame.tsx` | 框架根组件：grid 顺序、拖拽、`data-editor-side`、视口 ResizeObserver |
| `packages/client/ui-layout/src/client/stores.ts` | 布局偏好：侧边栏/停靠区宽度、`setViewportWidth`、面板开关报告 |
| `packages/client/ui-layout/src/client/columns.ts` | 列宽常量与 `computeColumns` 求解（最小 300px、最大 70%、中栏保护 400px） |
| `packages/client/ui-layout/src/client/service.ts` | `ctx.layout` 服务：面板选择、侧边栏切换、`editorSide` |
| `packages/client/ui-settings-general/` | 设置页；`EditorSideRow.tsx` 是“编辑器区位置”设置行 |
| `packages/client/ui-sidebar-right/` | 文件停靠区：dockkit 面板、文件/终端标签、标签右键菜单、标签栏避让 |
| `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx` | 面板呈现、全屏、每 Session 的停靠内容 |
| `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css` | 面板滑动、左侧镜像、macOS 红绿灯避让、全屏规则 |
| `packages/client/ui-sidebar-right/src/client/file-name.ts` | 复制文件名时的叶子名与去扩展名规则 |
| `packages/client/ui-sidebar-files/` | 文件树、文件页、快速打开、文件搜索与最近文件 |
| `packages/client/ui-sidebar-files/src/client/index.ts` | 文件类型注册、`workspace.files` 与 `workspace.quickOpen` 快捷键、快速打开服务接线 |
| `packages/client/ui-sidebar-files/src/client/FileNavigator.tsx` | 文件树本体：搜索框、树、分隔条、宽度拖拽、左右侧镜像 |
| `packages/client/ui-sidebar-files/src/client/face.ts` | 树的非 React 面：目录列表/监听、滚动、定位当前文件、展示状态、搜索、宽度测量 |
| `packages/client/ui-sidebar-files/src/client/store.ts` | 每分栏的树状态：展开、宽度、开关、搜索、查询 |
| `packages/client/ui-sidebar-files/src/client/QuickOpen.tsx` | `Cmd+P` 面板 UI：输入、方向键、回车打开、最近文件与空结果 |
| `packages/client/ui-sidebar-files/src/client/quick-open.ts` | 最近文件存储（`sidebarFiles.recentFiles`）与行列格式化 |
| `packages/client/ui-sidebar-documentpreview/` | 文件预览框架；`PreviewFrame.tsx` 决定正文与文件树的左右顺序 |
| `packages/client/ui-sidebar-documentpreview/src/client/code/` | 代码预览选区；钉住文件引用的来源之一 |
| `packages/client/ui-sidebar-terminal/` | 终端标签；终端选中文本可钉入输入框 |
| `packages/client/ui-conversation/` | 会话输入、队列、草稿附件；`input-pins.ts` 是钉住引用的客户端服务 |
| `packages/client/ui-chat/` | 消息渲染；`UserContent.tsx` 画文件引用卡片和终端选中卡片 |
| `packages/client/ui-attachment/` | 草稿附件栏；引用 chip 与终端 chip 的排版 |
| `packages/api/session-controller/` | 会话远程 API：快照、命令、删除会话、钉住引用的校验与提交 |
| `packages/api/workspace-files/` | 工作区文件 Remote：`stat`、`list`、`search`、`read`、文件监听 |
| `packages/session/session-persistence/` | 持久化后端接口；可选 `remove()` 在这里声明 |
| `packages/session/session-persistence-jsonl/` | JSONL 后端；实现按 Session 目录删除全部格式代际 |
| `packages/session/session-projection-cache/` | 投影缓存；`forget()` 清理已删除会话的检查点 |
| `packages/llm/llm/src/content.ts` | LLM 内容块类型；`file-reference` 与 `terminal-selection` 在这里定义并投影为文本 |
| `packages/attachment/attachment/` | 附件/输入类型与校验；接受两种钉住引用 |
| `packages/experimental/notify-command/` | 新增实验插件：按事件执行外部通知命令 |
| `packages/bundle/base/cordis.patch.yml` | 基础 profile 的插件组成；notify-command 在这里挂载并默认留空 |
| `packages/util/workspace-path/` | 文件地址语法：`dsh-resource://file/...` 的构造与解析、绝对路径判定 |
| `apps/cli/` | CLI 入口与 profile 启动；`composition.md` 是插件组成文档 |
| `apps/desktop/` | Electron 桌面壳与打包；`.desktop-build/` 是本地产物（不要提交） |
| `apps/web/` | Web shell 的 Vite 构建 |
| `scripts/` | 构建、文档、校验、打包脚本 |
| `docs/` | 文档站点与生成目录；改持久化/事件/配置后要同步生成物 |
| `snapshots/` | 无密钥回放快照；模型可见输出变化时更新 |

## 2. 已提交功能：永久删除已存会话

提交标题：`feat(session): 支持永久删除已存会话`。

行为：会话列表的右键菜单新增“删除会话”，确认后永久删除，而不是归档；仍打开的会话拒绝删除；删除后清理工作区里的归档/置顶成员关系并广播 `api-session/removed`；投影缓存的检查点行一并清理，避免新会话 id 继承旧检查点。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/api/session-controller/src/index.ts` | 新增 `delete` 远程端点：拒绝打开中的会话、清理工作区关系、发移除事件 |
| `packages/api/session-controller/src/types.ts` | 删除请求/响应类型 |
| `packages/client/ui-workspace/src/client/session-actions/DeleteSession.tsx` | 删除菜单项与确认弹窗 |
| `packages/client/ui-workspace/src/client/session-actions/context-menus.tsx` | 会话右键菜单接入删除动作 |
| `packages/client/ui-workspace/src/client/contract/slots.ts` | 菜单动作的 slot 契约 |
| `packages/session/session-persistence/src/index.ts` | 后端可选的 `remove()` 契约 |
| `packages/session/session-persistence-jsonl/src/index.ts` | JSONL 删除入口：按 Session 目录删除全部格式代际并清理冷日志缓存 |
| `packages/session/session-persistence-jsonl/src/storage.ts` | 文件系统删除实现 |
| `packages/session/session-projection-cache/src/index.ts` | `forget()`：删除后移除检查点行 |
| `packages/extensions/liveshare/src/endpoint-classification.ts` | `session/delete` 归为 owner-only |
| `docs/persistence-*.md`、`docs/subsystems/session*.md` | 持久化接口、投影与会话文档同步 |

## 3. 已提交功能：钉住文件引用与终端选中

提交标题：`feat(composer): 支持钉住文件引用与终端选中`。

行为：

- 输入框可以钉住文件引用（路径 + 1-based 行范围）和终端选中文本（原文 + 捕获目录）。
- LLM 内容块新增 `file-reference` 与 `terminal-selection`；请求组装时投影为路径文本和 `<terminal_selection>` 元素。
- attachment 与 session-controller 校验两种输入；非法路径或行范围返回 `gateway/bad-request`；命令提交仍带钉住引用时明确失败。
- 新增客户端服务 `ctx.inputPins`：文件侧边栏按选区钉住、终端按选中文本钉住。
- 草稿附件栏显示引用/终端 chip，改为换行排列；用户消息渲染引用卡片（可跳转文件）和终端选中卡片。
- 侧边栏选中范围、快捷键与按钮接入钉住动作。
- 新增持久化类型变更确认记录 `docs/persistence-changes/2026-11-12-pinned-prompt-references/` 并重新生成目录、事件矩阵和文档图。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/llm/llm/src/content.ts` | 新增两种内容块类型与请求投影 |
| `packages/llm/llm/src/types.ts`、`index.ts` | 类型导出与流处理 |
| `packages/attachment/attachment/src/types.ts`、`index.ts` | 输入类型与校验 |
| `packages/api/session-controller/src/commands.ts`、`types.ts`、`index.ts` | 提交时接受并校验钉住引用；命令提交拒绝残留引用 |
| `packages/client/ui-conversation/src/client/input-pins.ts` | `ctx.inputPins` 客户端服务 |
| `packages/client/ui-conversation/src/client/service.ts`、`input/hub.ts`、`skeleton/InputBar.tsx` | 输入框接线、草稿、提交 |
| `packages/client/ui-attachment/src/client/ComposerAttachments.tsx`、`FileCard.tsx` | 草稿附件 chip 排版 |
| `packages/client/ui-chat/src/client/chat/UserContent.tsx`、`MessageItem.tsx` | 用户消息里的引用卡片与终端卡片 |
| `packages/client/ui-sidebar-documentpreview/src/client/code/selection.ts`、`CodeBody.tsx` | 代码选区与钉住动作 |
| `packages/client/ui-sidebar-terminal/src/client/face.ts`、`terminal.tsx` | 终端选中文本与钉住动作 |
| `packages/client/ui-sidebar-right/src/client/file-indicator.tsx`、`service.ts` | 侧边栏当前文件指示 |
| `packages/session/session-log-export/src/markdown.ts` | 日志导出渲染两种卡片 |
| `docs/persistence-changes/2026-11-12-pinned-prompt-references/` | 持久化类型的双语确认记录与 schema |

## 4. 本次提交：文件停靠区左侧布局

行为：

- 新增用户偏好 `editorSide`：`left` 或 `right`，持久化在 localStorage 的 `layout.editorSide`。
- 左侧时框架 grid 顺序改为 `sidebar | rightbar | center`，会话在中栏，文件停靠区在会话左侧；右侧时保持原来的 `sidebar | center | rightbar`。
- 停靠区的拖拽手柄跟随内侧边缘：左侧时向右拖变宽，右侧时向右拖变窄。
- 左侧时，窗口尺寸变化按同一比例缩放停靠区宽度（`setViewportWidth(width, scaleRightbar)`），会话保持占比；右侧时仍保留像素偏好，由中栏吸收变化。
- 设置页“编辑器区位置”行可切换左侧/右侧。
- 停靠区在左侧时，面板从左侧滑入，分隔条、悬浮卡片、描边方向全部镜像。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/client/ui-layout/src/client/index.ts` | 创建 `editorSide` 持久化 store，注入 `AppFrame` 与 `LayoutController` |
| `packages/client/ui-layout/src/client/AppFrame.tsx` | grid 顺序、`data-editor-side`、拖拽方向、视口 ResizeObserver 传入 `scaleRightbar` |
| `packages/client/ui-layout/src/client/stores.ts` | `setViewportWidth` 的比例缩放；`rightbar` 偏好 |
| `packages/client/ui-layout/src/client/service.ts` | `ILayout.editorSide` 与 `setEditorSide` |
| `packages/client/ui-settings-general/src/client/EditorSideRow.tsx` | 设置行 |
| `packages/client/ui-settings-general/src/client/index.ts` | 设置行注册 |
| `packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css` | 左侧锚定、滑入方向、`--dsh-dockkit-strip-inline-start` |
| `packages/client/ui-sidebar-documentpreview/src/client/PreviewFrame.tsx` | 预览正文与文件树的顺序由 CSS `order` 和 `data-files-navigator-side` 决定 |
| `packages/client/ui-sidebar-files/src/client/FileNavigator.tsx` | 读取 `useEditorSide`，标记侧别，翻转拖拽与方向键 |
| `packages/client/ui-sidebar-files/src/client/FilesBody.module.css` | 左侧时 `order: -1`、右边框、右分隔条、左悬浮位置 |

注意：`AppFrame` 只在 `editorSide === 'left'` 时给 `setViewportWidth` 传 `true`；不要把它改成全局行为，否则右侧默认布局的像素偏好会一起变。

## 5. 本次提交：文件树与文档预览

行为：

- 文件树默认展示：分栏第一次 attach 预览时写入 `open: true`；用户手动隐藏后，同一分栏的后续标签保持隐藏。
- 文件树在左侧停靠区时位于编辑器左侧，分隔条在其右缘；在右侧时保持原样。
- 文件页（“文件”标签）仍然铺满整页，不受左右侧影响。
- 预览里的文件树打开一个文件时，不再原位替换当前预览，而是在同一分栏新开标签（浮动分栏仍走默认放置）。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/client/ui-sidebar-files/src/client/face.ts` | `attach()` 默认展示；`editorSide` hook；`isShown` |
| `packages/client/ui-sidebar-files/src/client/FileNavigator.tsx` | 左右侧标记、分隔条方向、宽度拖拽方向 |
| `packages/client/ui-sidebar-files/src/client/FilesBody.module.css` | 左侧 `order`、边框、分隔条、overlay 位置 |
| `packages/client/ui-sidebar-documentpreview/src/client/PreviewFrame.tsx` | 文件树在正文前/后的 DOM 顺序与打开行为 |
| `packages/client/ui-sidebar-documentpreview/src/client/TextPreview.module.css` | 预览内容行的 flex 布局 |

## 6. 本次提交：快速打开（Cmd/Ctrl+P）

行为：

- `Cmd+P`（Web 上是 `Cmd+Alt+P`）打开快速打开面板。
- 空查询显示当前 Session 的最近文件；输入后 150ms 防抖搜索工作区，按名称/相对路径匹配，只列文件。
- 输入绝对路径时不再做工作区搜索：用 `workspaceFiles.stat` 检查该路径是否为存在的普通文件，存在就显示一行，不存在则什么都不显示（也不显示“没有匹配的文件”）。
- 支持 POSIX `/a/b`、Windows 盘符 `C:\a\b`、UNC `\\server\share\x`，内部统一成 `/`。
- 打开文件走 `dsh-resource://file/session/<sessionId>/<path>`，绝对路径同样可用；打开后进入最近文件。
- 文件标签快捷键改为 `Cmd/Ctrl+Shift+E`；再按一次收起文件页或隐藏文件树。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/client/ui-sidebar-files/src/client/index.ts` | `workspace.quickOpen` 快捷键、最近文件同步、搜索/绝对路径 stat、overlay 注册 |
| `packages/client/ui-sidebar-files/src/client/QuickOpen.tsx` | 面板 UI、键盘导航、空状态 |
| `packages/client/ui-sidebar-files/src/client/QuickOpen.module.css` | 面板样式 |
| `packages/client/ui-sidebar-files/src/client/quick-open.ts` | 最近文件记录、行格式化 |
| `packages/client/ui-sidebar-files/src/client/locales.ts` | 快速打开文案（8 种语言） |
| `packages/client/ui-sidebar-files/src/client/index.ts` | 文件树命令改为 `KeyE + primary + shift`，二次按压切换 |
| `packages/client/ui-sidebar-files/tests/quick-open.client.spec.tsx` | 面板与最近文件测试 |
| `packages/client/ui-sidebar-files/tests/apply.client.spec.ts` | 快捷键、绝对路径、文件页开关测试 |

注意：`workspaceFiles.stat` 只接受普通文件；目录、缺失路径、非普通文件都会失败，因此列表为空。工作区搜索仍由 `workspaceFiles.search` 提供，两者不要混用。

## 7. 本次提交：文件标签复制菜单

行为：文件标签右键菜单新增“复制文件名”（去掉最后一个扩展名）和“复制文件名（带后缀）”，复制成功/失败都有 toast。

关键文件：

| 文件 | 作用 |
| --- | --- |
| `packages/client/ui-sidebar-right/src/client/file-name.ts` | 叶子名、去扩展名规则 |
| `packages/client/ui-sidebar-right/src/client/index.ts` | 右键菜单项与剪贴板写入 |
| `packages/client/ui-sidebar-right/src/client/locales.ts` | 8 种语言文案 |

## 8. 本次提交：notify-command 实验插件

行为：在 Agent 等待人工决定（审批或提问）、回合结束、回合失败时执行一条配置好的命令；命令收到 stdin JSON，不阻塞回合。

- 插件：`packages/experimental/notify-command/`
- 配置字段：`onWaiting`、`onTurnEnd`、`onError`、`timeoutMs`、`shell`、`cwd`
- 事件：`approval/request`、`user-questions/request`（等待）；`agent/turn-stopping`（回合结束）；`agent/error`（失败）
- 默认挂在 `packages/bundle/base/cordis.patch.yml`，三条命令默认空字符串，不配置就不执行
- 跳过 subagent 会话；POSIX shell；失败只写日志，不进入模型或用户界面
- 文档：`packages/experimental/notify-command/README.md` 与中文版

## 9. 本次提交的生成物与文档

以下文件是源码改动的生成结果或同步文档，不要手改英文生成区：

| 文件 | 来源 |
| --- | --- |
| `packages/bundle/base/package.json`、`cordis.patch.yml` | 基础 profile 增加 notify-command |
| `apps/cli/composition.md` | profile 组成图 |
| `docs/config-catalog*.md` | 配置目录（notify-command 字段） |
| `docs/event-producer-consumer*.md` | 事件矩阵（删除会话等） |
| `packages/client/ui-layout/README*.md` | 布局行为（editorSide、比例缩放、红绿灯避让） |
| `packages/client/ui-sidebar-files/README*.md` | 文件树默认展示、快速打开、左右镜像 |
| `packages/client/ui-sidebar-right/README*.md` | 复制文件名、左侧锚定 |
| `pnpm-lock.yaml`、`tsconfig.base.json`、`tsconfig.host.json` | 新插件与工作区依赖 |
| `.agents/skills/dsh-doc/references/packages.md`、`scripts/verify-package-readme-model-experience.ts` | 新包登记 |

## 10. 编译与运行

环境：Node >= 24.9，pnpm 11.28.5（`packageManager` 固定）。

```sh
pnpm install
pnpm run build:artifacts   # 生成 lib/types、lib 运行时包、Web shell
pnpm run typecheck         # Host + Client 类型检查
pnpm run build:check       # 聚合测试/脚本对当前构建产物的类型检查
pnpm run lint
pnpm run test:docs
```

Web：

```sh
pnpm run dev:web           # build:artifacts + tsc/tsdown/vite watcher + dsh web
pnpm dsh web --port 3099   # 只用已构建产物起一个服务
```

桌面：

```sh
pnpm run dev:desktop       # 构建后启动 Electron
pnpm run start:desktop     # 跳过构建启动
```

macOS 未签名打包：

```sh
pnpm --filter @deepseek-ai/dsh-desktop run package:mac:arm64:unsigned
```

如果当前 pnpm 是原生可执行文件，打包脚本会把 `npm_execpath` 当 JavaScript 入口执行并报 `SyntaxError`；改用仓库内的 JS 入口：

```sh
npm_execpath="$PWD/node_modules/pnpm/bin/pnpm.cjs" \
  node --import tsx apps/desktop/scripts/package-target.ts mac-arm64 --unsigned
```

产物：

```
apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/mac-arm64/DeepSeek Harness.app
```

打包流程内部会执行 `pnpm run build --profile local`，所以会重新生成全部客户端 bundle；不需要单独再跑一次。

## 11. 国内镜像

只在本地配置，不要写进仓库文件。

```sh
# npm / pnpm 包
pnpm config set registry https://registry.npmmirror.com

# 当前 shell 的 Electron / electron-builder / Native / Playwright 二进制
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
export npm_config_disturl=https://npmmirror.com/mirrors/node/
export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/
```

如果只安装依赖，第一条足够；打包桌面端时 Electron 与 electron-builder 的镜像通常都需要。

## 12. 本次验证命令

以下命令在本机通过：

```sh
pnpm exec vitest run packages/client/ui-sidebar-files packages/client/ui-layout packages/client/ui-sidebar-right packages/client/ui-sidebar-documentpreview
pnpm run build:check
pnpm run test:docs
```

结果：相关 106 个测试文件、1454 个用例通过；文档 21 项检查通过；打包冒烟通过。

## 13. 已知坑与修改指引

- **改布局顺序/宽度**：先看 `ui-layout/src/client/AppFrame.tsx` 与 `stores.ts`；列宽常量在 `columns.ts`。不要同时改 `AppFrame` 的 grid 和 CSS 的 `data-editor-side` 规则。
- **改停靠区样式**：`ui-sidebar-right/src/client/shell/SidebarRight.module.css`。左侧镜像、红绿灯避让、全屏规则都在这里；`data-platform='darwin'` 在 `html` 上，`data-editor-side` / `data-sidebar-collapsed` 在 frame 上。
- **改文件树**：`ui-sidebar-files`。树的非 React 状态在 `face.ts`，展示状态在 `store.ts`，UI 在 `FileNavigator.tsx` 与 `FilesBody.module.css`。
- **加文件操作**：标签菜单在 `ui-sidebar-right/src/client/index.ts`；文件地址构造统一走 `@deepseek-ai/dsh-util-workspace-path`。
- **改快速打开**：`ui-sidebar-files/src/client/index.ts`（搜索/快捷键）与 `QuickOpen.tsx`（UI）。绝对路径与相对搜索是两个分支。
- **改会话 API**：`packages/api/session-controller`；同步更新 `docs/config-catalog`、`docs/event-producer-consumer` 与 SDK 快照。
- **改持久化**：`packages/session/*`；持久化类型变化必须写 `docs/persistence-changes/` 并重新生成 schema/catalog。
- **改会话输入内容**：`packages/llm/llm/src/content.ts` 是内容块类型的唯一来源；客户端与服务端都要同步。
- **UI 改动后**：先重编 client bundle 再看效果。`dsh web` 在重编前启动会显示旧 JS；用 `pnpm run dev:web` 或重启服务。
- **不要手改生成文件**：`docs/config-catalog*.md`、`docs/event-producer-consumer*.md`、`docs/persistence-catalog*.md`、`docs/persistence-schema.json`、`apps/cli/composition.md` 由脚本生成。
- **测试里的默认值**：文件树现在默认展示，`files-navigator` 的测试辅助函数不再点击“显示”；新增测试不要假设默认隐藏。
- **窗口最大化**：只有左侧停靠区会按比例缩放；如果你改 `setViewportWidth` 的调用，请保留 `editorSide` 判断。
- **提交信息**：本仓库禁止在维护文件中写 commit id；写提交标题或 `git log` 命令。

## 14. 建议的下一步入口

- 想继续做文件编辑（`Cmd+S` 保存）：从 `ui-sidebar-documentpreview` 的预览渲染器与 `api/workspace-files` 的读取接口入手，需要新增 Host 写入端点、脏状态、冲突检测与保存快捷键，不能只改前端。
- 想做更多侧边栏布局：先扩展 `ILayout` 的显式偏好，再在 `AppFrame` 增加 grid 分支；不要在校验之外偷偷 `?? 默认值`。
- 想加通知方式：`packages/experimental/notify-command` 已提供命令钩子；新渠道应做成独立插件，不要改 agent-loop。
