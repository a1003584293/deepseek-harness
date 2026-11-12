---
description: "Run one configured command when the agent waits for you, ends a turn, or fails, so desktop notifications can follow agent state without reading the transcript."
kind: "package-reference"
---

# @deepseek-ai/dsh-notify-command

English | [中文](README.zh.md)

## Summary

Runs up to three operator-configured commands at the moments an agent needs attention: a pending approval or user question, the turn-end boundary, and a turn-level failure. Each command receives one JSON payload on stdin, runs as a managed subprocess in the Session workspace, and never blocks the turn it reports.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## Use this package
<a id="use-this-package"></a>

Mounted in a Host profile; the commands are the whole configuration.

```yaml
- name: '@deepseek-ai/dsh-notify-command'
  config:
    onWaiting: 'python /Users/me/notify.py waiting'
    onTurnEnd: 'python /Users/me/notify.py stop'
    onError: 'python /Users/me/notify.py error'
```

| Field | Default | Meaning |
|---|---|---|
| `onWaiting` | `''` | Command for a pending approval or user question; blank disables it |
| `onTurnEnd` | `''` | Command for the turn-end boundary; blank disables it |
| `onError` | `''` | Command for a turn-level failure; blank disables it |
| `timeoutMs` | `10000` | Deadline after which the managed process is terminated |
| `shell` | `/bin/sh` | Shell that runs the command line with `-c` |
| `cwd` | `''` | Fallback working directory when the Session has none; blank uses the Host process directory |

The payload carries the Claude Code hook names VS Code writes — `hook_event_name` (`Notification`, `Stop`, or `ErrorOccurred`) and `session_id` — so one notification script reads both producers; a failure also carries `error.message` as serialized JSON. It repeats the DSH-native `event` (`waiting`, `turn-end`, or `error`), `sessionId`, `cwd`, and `time`, plus event-specific fields: `kind`, `tool`, and `reason` for a wait, `turn` for turn end, and `turn`, `step`, `message`, and `error` for a failure. `DSH_NOTIFY_EVENT` and `DSH_NOTIFY_SESSION` are also exported. A failed start, nonzero exit, or timeout is logged and never reaches the model or the user.

## Model Experience

None, as the commands are host-side notifications and construct no model input.

#### KV Cache effect

None; notification commands do not change model requests.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **No Windows support** — the command runs through the configured POSIX shell with `-c`.
- **Subagent Sessions are skipped** — only root Sessions notify.
- **Fire-and-forget** — the plugin reports the moment; it never waits for or inspects the command.
- **Turn-level failures only** — a tool returning an error result does not notify; only a failure that ends the turn does.

### Dev Note
<a id="dev-note"></a>

Working context for maintainers: the waiting listeners run on `approval/request` and `user-questions/request` waterfalls and always delegate with `next()`, so another answerer still owns the decision.
