---
id: research-2026-08-14-dsh-proactive-actions
type: research
date: 2026-08-14
---

# Research: DSH proactive reusable actions

**Backend:** codex-sub-agents
**Scope:** DSH system guidance, session prompting, durable storage, dynamic tools, and user confirmation boundaries.

## Summary

The existing plugin had only a session-memory command offer. DSH already supplies the required seams for the broader product: a continually assembled system-prompt section, ordinary queued session prompts, schema-validated storage domains, and scoped tool registration. Better Sidebar provides the suitable user surface and a safe composer-draft path.

## Key Files

| File | Purpose |
| --- | --- |
| `.scan-harness/packages/core/system-prompt/src/index.ts` | Ordered, disposable prompt sections assembled before model steps |
| `.scan-harness/packages/client/runtime/src/client/contract/session.ts` | Public `session.prompt` queue/steer contract |
| `.scan-harness/packages/storage/storage-domain/src/index.ts` | Durable schema-validated domain facility |
| `.scan-webui/packages/dsh-task-board/src/core/execution.ts` | Real client-side session prompting pattern |
| `.scan-sidebar/src/client/conversation-draft.ts` | Visible composer draft insertion |

## Findings

1. `ctx.systemPrompt.section()` is the correct always-on mechanism for teaching the current model to identify and maintain reusable actions. It is evaluated as part of prompt assembly and supports normal disposal (`.scan-harness/packages/core/system-prompt/src/index.ts:337-388`). A skill is useful for explicit full-library review, but is not sufficient for continual proactive behavior.
2. Prompt actions should use the public `session.prompt(content, 'queue')` operation, which is the same behavior surface used by the conversation UI (`.scan-harness/packages/client/runtime/src/client/contract/session.ts:29-42`, `.scan-harness/packages/client/runtime/src/client/sessions/session.ts:184-207`).
3. Durable action records belong in a `storageDomain` sidecar rather than the project tree or browser-only localStorage. Domain reads validate stored schemas, and writes become visible only after backend durability (`.scan-harness/packages/storage/storage-domain/src/index.ts:64-112`, `.scan-harness/packages/storage/storage-domain/src/domain.ts:1-53`).
4. Model-generated data must not define new executors. The plugin should keep a small fixed set of host-authored tools and accept validated action records as data. `ctx.tools.register(defineTool(...))` already owns schema and lifecycle enforcement (`.scan-harness/packages/core/tools/src/index.ts:1031-1115`).
5. Instruction actions should populate the visible composer draft by default. Better Sidebar already resolves the exact session input scope and appends without sending (`.scan-sidebar/src/client/conversation-draft.ts:1-32`).
6. Real prompt submission and shell execution are consequential and should remain explicit button actions. Destructive, secret-bearing, one-off, or unclear entries should never be proposed.

## Quality validation

- System prompt and model discovery: depth 4/4, verified in core source and task-board implementation.
- Prompt/session execution: depth 4/4, verified in public contract, concrete runtime, and task-board.
- Persistence: depth 3/4, storage-domain semantics verified; long-term migration behavior remains a future concern.
- Browser integration: depth 3/4, Better Sidebar service and composer paths verified; final proof still requires live DSH browser E2E.
- Security: depth 3/4, fixed executors and same-origin boundary verified; arbitrary shell commands remain inherently powerful and depend on visible user approval.

## Recommendations

- Implement three action kinds over one fixed record schema.
- Keep stable keys and bounded workspace/session libraries.
- Use system prompt guidance for proactive discovery and an optional skill for explicit audits.
- Persist records through `storageDomain` and expose only IDs through browser execution routes.
- Validate in the actual installed DSH profile, including the browser boot manifest and visible Panel.
