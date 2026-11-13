---
description: "当 agent 等待你输入、回答结束或任务失败时执行一条配置好的命令，让桌面通知跟随 agent 状态而无需阅读对话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-notify-command

[English](README.md) | 中文

## 概述

在 agent 需要关注的时刻执行最多三条操作员配置的命令：等待审批或提问、回答结束、任务失败。每条命令从 stdin 收到一份 JSON，作为托管子进程在 Session 工作区中运行，并且不会阻塞它报告的那个轮次。

## 目录

- [使用此包](#use-this-package)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

## 使用此包
<a id="use-this-package"></a>

在 Host profile 中挂载；命令就是全部配置。基于 base 的 profile 已经带有命令行，空命令即可，因此覆盖时按行 id 定位，只写命令：

```yaml
- id: notify-command
  config:
    onWaiting: 'python /Users/me/notify.py'
    onTurnEnd: 'python /Users/me/notify.py'
    onError: 'python /Users/me/notify.py'
```

`id` 是这次覆盖要定位的 Loader 行；只有 patch 要新增该插件时才需要 `name`。脚本从 stdin 读取 `hook_event_name`，所以命令行不需要再传事件参数。命令留空即关闭该时刻；省略 `timeoutMs`、`shell`、`cwd` 时使用下表的默认值。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `onWaiting` | `''` | 等待审批或提问时的命令；留空即关闭 |
| `onTurnEnd` | `''` | 回答结束时的命令；留空即关闭 |
| `onError` | `''` | 任务失败时的命令；留空即关闭 |
| `timeoutMs` | `10000` | 超过该时限后终止托管进程 |
| `shell` | `/bin/sh` | 用 `-c` 执行命令行的 shell |
| `cwd` | `''` | Session 没有工作目录时的回退目录；留空使用 Host 进程目录。正常 Session 不需要它 |

载荷同时携带 VS Code 写入的 Claude Code hook 字段——`hook_event_name`（`Notification`、`Stop` 或 `ErrorOccurred`）与 `session_id`，因此同一个通知脚本可以读取两种来源；`ds_harness: 1` 标记本来源，VS Code 不会发送它。失败时还带序列化为 JSON 字符串的 `error.message`。此外重复 DSH 自有字段 `event`（`waiting`、`turn-end` 或 `error`）、`sessionId`、`cwd`、`time`，以及事件相关字段：等待时的 `kind`、`tool`、`reason`，回答结束时的 `turn`，失败时的 `turn`、`step`、`message`、`error`。同时导出 `DSH_NOTIFY_EVENT` 与 `DSH_NOTIFY_SESSION`。启动失败、非零退出或超时只写日志，不会送到模型或用户界面。

## Model Experience

None, as the commands are host-side notifications and construct no model input.

#### KV Cache effect

None; notification commands do not change model requests.

## 已知限制与后续工作
<a id="known-limitations-and-deferred-work"></a>

- **不支持 Windows** —— 命令通过配置的 POSIX shell 以 `-c` 执行。
- **跳过子智能体 Session** —— 只有根 Session 会通知。
- **只负责触发** —— 插件只报告时刻，不等待也不检查命令结果。
- **只算轮次级失败** —— 工具返回错误结果不会通知，只有导致轮次失败才会。

### 开发备注
<a id="dev-note"></a>

维护者上下文：等待监听器挂在 `approval/request` 与 `user-questions/request` waterfall 上，并始终用 `next()` 委托，因此其他回答者仍然拥有决策权。
