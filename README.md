# DSH Dev Actions

`dsh-dev-actions` is a small companion plugin for [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). It keeps the usual DeepSeek Harness conversation loop intact while placing a Flutter run surface beside it: choose a device, run, hot reload, restart, stop, inspect output, and return a concise acceptance signal.

It does not replace the terminal, project workflow, or Human-in-the-Loop. It removes the repetitive path/device/terminal steps when the user wants to inspect a change.

## Scope

The initial release supports a Flutter workspace whose `pubspec.yaml` is at the session workspace root:

- reads `flutter devices --machine` to populate the device selector;
- runs `flutter run -d <selected-device>` in the session workspace;
- keeps the process and bounded output in the current DSH host process;
- sends `r`, `R`, or `SIGINT` only through explicit UI buttons;
- gives an agent a small `dev_action_offer` tool to highlight a suggested user action without passing shell commands or device IDs.

Web, Xcode, simulator streaming, remote hosts, certificate management, and arbitrary command execution are deliberately out of scope for this release.

## Install

Install the maintained sidebar host first, then this companion:

```sh
dsh plugin --profile web add dsh-better-sidebar@^0.10.3
dsh plugin --profile web add dsh-dev-actions@^0.1.0
dsh --profile web --dump-config
dsh web
```

Restart a running `dsh web` process and hard-refresh the browser after installation. `Dev Actions` appears in the sidebar's add-tab menu for a selected session.

For local development, use a profile dependency pointing at this checkout after building it. The package expects the same published DSH RC line as `dsh-better-sidebar`.

## Agent Use

After changing a Flutter screen, an agent can offer a human verification entry point:

```text
dev_action_offer({
  action: "flutter.run",
  message: "The login screen was updated. Run it on an iPhone Simulator to verify the layout."
})
```

The panel resolves the real device IDs independently. The user may run the app, inspect output, choose **Verified**, or select **Report issue**. The latter is intentionally explicit: this release does not silently resume or steer an agent session from browser-side code.

## Security Boundary

- The host uses the session's authoritative workspace directory when available.
- The model never supplies a raw command, a device ID, or a path to `dev_action_offer`.
- Only `flutter run`, `r`, `R`, and stop are exposed in this release.
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
