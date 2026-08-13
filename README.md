# DSH Dev Actions

`dsh-dev-actions` is a small companion plugin for [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). It lets an agent turn a useful repeated development command into a visible, user-approved action card beside the normal DeepSeek Harness conversation.

It does not replace the terminal, project workflow, or Human-in-the-Loop. It removes the repetitive path/device/terminal steps when the user wants to inspect a change.

## Scope

The initial release is deliberately generic:

- shows the exact command and the agent's reason before execution;
- executes only a user-clicked, agent-proposed command in the current session workspace;
- keeps bounded output and a stop control in the panel;
- gives the agent `dev_action_offer` and `dev_action_feedback_read` to propose an action and retrieve explicit user verification.

Flutter, Web, Xcode, Docker, and test commands are examples that use the same primitive. Simulator streaming, remote hosts, certificate management, action persistence, and autonomous model execution are deliberately out of scope for this release.

## Install

Install the maintained sidebar host first, then this companion:

```sh
dsh plugin --profile web add dsh-better-sidebar@^0.10.3
dsh plugin --profile web add dsh-dev-actions@^0.1.0
dsh --profile web --dump-config
dsh web
```

Restart a running `dsh web` process and hard-refresh the browser after installation. `Dev Actions` appears in the sidebar's add-tab menu for a selected session.

For local development, use a profile dependency pointing at this checkout after building it. The package expects the same published DSH RC line as `dsh-better-sidebar`. Test against the exact profile and host URL you intend to use: the plugin follows DSH's trusted-host and same-origin request boundary, including a configured LAN/tunnel authority.

## Agent Use

After changing a Flutter screen, an agent can offer a human verification entry point:

```text
dev_action_offer({
  label: "Run iOS simulator",
  command: "flutter run -d 'iPhone 16 Pro'",
  reason: "The login screen was updated and needs a visual check."
})
```

The user may inspect the command, run it, inspect output, choose **Verified**, or select **Report issue**. Feedback is retained for the current agent and can be read with `dev_action_feedback_read`; this release does not silently resume or steer an agent session from browser-side code.

## Security Boundary

- The host requires the session's authoritative attached workspace directory and never accepts a browser-provided path.
- The model may propose a raw command, but it cannot execute it by proposing it: the command remains a visible action card until the user clicks **Run**.
- The browser can execute only a previously stored action ID; it cannot substitute a command or workspace path.
- Output is bounded to 128 KiB and stays local to the current DSH host process.
- This package assumes the DSH Web host is used on a trusted local machine. It should not be exposed directly to an untrusted network.

## Verification

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

Before publishing, test an actual Flutter workspace: open the panel, select a device, run, observe output, hot reload after an edit, stop, and confirm the panel does not access a different session's workspace.
