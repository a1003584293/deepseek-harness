---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-12-pinned-prompt-references

English | [中文](2026-11-12-pinned-prompt-references.zh.md)

## Summary

Adds two user-authored prompt content variants to the persisted Session log: `file-reference` (a workspace-relative or absolute path with an optional 1-based line range) and `terminal-selection` (verbatim selected terminal text plus its capture directory).

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

No existing block changes: both variants carry new `type` discriminants, so earlier records keep their schema and meaning and current readers restore them unchanged. The variants appear only where a user pinned a reference or terminal selection, and only in newly written records. Request assembly projects them to path/range text and a `<terminal_selection>` element at send time, so the stored content stays a reference rather than a second copy of the file. The header version stays the same because the discriminant cannot be confused with an existing block: no producer emits these tags before this change, and a release without them cannot reinterpret them as a known variant. Earlier releases do not support reading newer logs; unknown content tags are skipped or refused there rather than mapped onto an existing block.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/llm/llm/tests packages/attachment/attachment/tests packages/api/session-controller/tests packages/session/session-persistence/tests packages/session/session-persistence-jsonl/tests packages/session/session-projection-cache/tests packages/session-query/session-log-export/tests: 101 test files passed, 2429 tests passed, 1 skipped. The single failure in that run, a zstd generation-conflict test in session-persistence-jsonl, reproduces unchanged with this change's persistence edits reverted. pnpm exec vitest run packages/client/ui-chat/tests packages/client/ui-workspace/tests packages/client/ui-sidebar-right/tests packages/client/ui-sidebar-terminal/tests packages/client/ui-sidebar-documentpreview/tests: 301 test files, 3936 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
