export const DEV_ACTIONS_SKILL_NAME = 'dev-actions-maintainer'
export const DEV_ACTIONS_SKILL_DESCRIPTION = 'Review, deduplicate, and refresh the reusable Dev Actions for the current workspace.'
export const DEV_ACTIONS_SKILL_CONTENT = `# Dev Actions Maintainer

Use the installed Dev Actions tools to keep a concise, current action library for this workspace.

1. Call dev_action_list with hidden actions included.
2. Identify repeated commands, acceptance checks, prompts, and habitual AI instructions from the current development context.
3. Add or update only high-value entries with dev_action_upsert; reuse stable keys.
4. Retire entries that reference obsolete scripts, devices, paths, or workflows with dev_action_retire.
5. Never include credentials, destructive operations, or one-off commands.
6. Do not execute any action. The panel always leaves execution or sending to the user.`
