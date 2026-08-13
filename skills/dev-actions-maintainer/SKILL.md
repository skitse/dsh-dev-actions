---
name: dev-actions-maintainer
description: Review and maintain the current workspace's reusable Dev Actions when the user asks to organize, refresh, or audit their shortcuts.
---

# Dev Actions Maintainer

Use the installed Dev Actions tools to keep a concise, current action library for this workspace.

1. Call `dev_action_list` with hidden actions included.
2. Identify repeated commands, acceptance checks, prompts, and habitual AI instructions from the current development context.
3. Add or update only high-value entries with `dev_action_upsert`; reuse stable keys.
4. Retire entries that reference obsolete scripts, devices, paths, or workflows with `dev_action_retire`.
5. Never include credentials, destructive operations, or one-off commands.
6. Do not execute any action. The panel always leaves execution or sending to the user.
