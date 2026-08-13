---
id: research-2026-08-14-dsh-dev-actions-host-selection
type: research
date: 2026-08-14
---

# Research: DSH Dev Actions host selection

**Backend:** codex-sub-agents
**Scope:** Public DSH topic repositories and current extension/install surfaces.

## Summary

`dsh-better-sidebar` is the appropriate host shell: it exposes a documented client-side tab registry, already owns a session-scoped panel surface, and has a maintained host/client package layout. A companion package avoids duplicating its terminal and layout while keeping Flutter-specific process controls separately maintainable.

## Findings

- `dsh-better-sidebar` documents `ctx.betterSidebar.registerTab()` and a client-only extension contract in its `AGENTS.md`; external tabs receive session id and workspace cwd.
- Its README documents official profile installation with `dsh plugin --profile web add dsh-better-sidebar` and current npm release `0.10.3`.
- `dsh-web-review` is a suitable future optional visual-review companion but does not provide a process/device adapter.
- `dsh-work` is an Electron private-beta product whose renderer intentionally does not accept ordinary user-installed bundles, so it is not a suitable base for an ordinary DSH Web plugin.

## Recommendation

Ship `dsh-dev-actions` as a small companion package dependent on `dsh-better-sidebar`. Keep the initial capability restricted to Flutter device discovery and explicit run controls. Do not fork an existing workbench or add dynamic arbitrary-shell execution.
