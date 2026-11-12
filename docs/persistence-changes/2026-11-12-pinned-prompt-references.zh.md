---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-12-pinned-prompt-references

[English](2026-11-12-pinned-prompt-references.md) | 中文

## 概述

向持久化 Session 日志新增两种用户输入的内容变体：`file-reference`（工作区相对或绝对路径，可带 1-based 行范围）与 `terminal-selection`（终端选中原文及其捕获目录）。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-12-pinned-prompt-references
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-27-retry-control-input"
    after: "61bd9d25e64c8ae3eab7ced246223387b8de3b636a699f78c7e7f41bf412d940"
    decision: same-version
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "eed2d8e9f529bddaf645a9618f7b184af2f94cc99925f87e139c67a7b864a959"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "d5c8a4706487a06002097888f147248bd042a92f9d30244424e31ad1ed32e660"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "966765d85cf86e4ed360faa3f4355668e663a5e51740074fd55c563fa60aa610"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-27-retry-control-input"
    after: "335cd7ff3995d7927e0dbc2909c1bfcf028c0ea98a35c5c0dd79e8a88ae1d757"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-27-retry-control-input"
    after: "cdb2da4cdd15a9e8e2303cc814a930cc59a9c367cf0065914269f4e287886897"
    decision: same-version
  - root: "event:system/message"
    previous: "2026-09-16-session-format-v4"
    after: "dfc9cc2a0c7b7683e0ddaa02c2aeb03cf245cfd127663cac9463f974ebbf86bd"
    decision: same-version
  - root: "event:team/message/queued"
    previous: "2026-09-16-session-format-v4"
    after: "215c6add1259fac8ca3b09b5d55dffb69e6abb87b0fb7d26e51866a9862f24f8"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-10-05-ptc-operation-metadata"
    after: "07a3438d00221a976353849d877e92754be7e1d944e14802bf8287742f981b09"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-16-session-format-v4"
    after: "db40c5cfde22d7e80f983129990bb97063ca6cb3db216564490fcee9fffb931b"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-27-retry-control-input"
    after: "794f265f1cee7599d9282b7c55edf1be774a5f560317d514498a674643a542d8"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有内容块不变：两种变体使用新的 `type` 判别值，旧记录保持原有结构与语义，当前读取方原样恢复。变体只出现在用户钉住引用或终端选中的新记录中。请求组装在发送时把路径／行范围投影为文本、把终端选中包装为 `<terminal_selection>` 元素，因此库里存的是引用而不是文件副本。头部版本保持不变，因为判别值不会与已有内容块混淆：改动前的写入方不会产生这些标签，缺少该变体的版本也无法把它们误读成已知变体。旧版本不支持读取更新版本的日志，未知内容标签会被跳过或拒绝，而不会映射到已有内容块。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/llm/llm/tests packages/attachment/attachment/tests packages/api/session-controller/tests packages/session/session-persistence/tests packages/session/session-persistence-jsonl/tests packages/session/session-projection-cache/tests packages/session-query/session-log-export/tests：101 个测试文件通过，2429 个用例通过，1 个跳过。该次运行中唯一的失败是 session-persistence-jsonl 的 zstd 生成冲突用例，在本改动的持久化编辑被还原后同样失败。pnpm exec vitest run packages/client/ui-chat/tests packages/client/ui-workspace/tests packages/client/ui-sidebar-right/tests packages/client/ui-sidebar-terminal/tests packages/client/ui-sidebar-documentpreview/tests：301 个测试文件、3936 个用例通过。

<a id="dev-note"></a>
## 开发备注

无。
