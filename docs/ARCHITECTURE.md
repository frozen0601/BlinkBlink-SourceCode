# Architecture

## Layout

```
src/
  core/       Pure TypeScript. No Electron import anywhere.
  main/       The Electron main process; adapts core to the OS.
  renderer/   One entry point per window, plus HTML and CSS.
tests/        Unit tests for core; Playwright end-to-end tests for the app.
```

The split exists so the interesting logic can be tested without an app around
it. `src/core/` holds schedule maths, settings validation, timer planning, the
stats reducer, formatting and the platform capability decisions — everything
that used to be entangled with Electron and could therefore only be verified by
running the app and waiting twenty minutes.

If you add logic that could be described as "given this state, what should
happen", it belongs in `core/` with a test. If it calls an Electron API, it
belongs in `main/`.

## How a break happens

```
timer.ts                 plans and arms the next break
  │  appEvents 'reminder-due'   ─▶  reminder.ts   shows the toast
  │  appEvents 'break-due'      ─▶  controller.ts ─▶ windows.ts  shows the overlay
  │  appEvents 'timer-changed'  ─▶  tray.ts       refreshes the menu and title
  ▼
windows.ts   counts down once for all displays, then
controller.ts   records the outcome and re-plans the timer
```

`events.ts` is a small typed emitter. It exists because the timer needs to open
a window, the window's outcome feeds back into the timer, and the tray reflects
both — a cycle if those modules import each other directly. The previous code
routed these signals through `ipcMain.emit`, which made internal events
indistinguishable from messages sent by a renderer.

## Timer planning

`core/timer-plan.ts` answers one question: given the time, the settings and any
active skip, what should the timer do next? It returns `break` (arm at this
instant), `wait` (nothing to do until then; re-plan on arrival) or `idle`.

The `wait` state is what makes schedules work. Outside working hours the app
waits for the next stretch and _then_ starts a fresh work interval, rather than
firing a break the moment the day opens. A work interval that would overrun the
end of the working day produces a `wait` for the next stretch rather than a
truncated break at the boundary — the previous code cleared the timer at that
point and never re-armed it.

Schedules are evaluated by expanding "HH:mm" strings into concrete local `Date`
intervals around the reference instant, including one day of lookbehind. That
lookbehind is what makes overnight ranges (22:00 → 02:00) work: at 01:00 the
active interval began yesterday, and nothing in today's schedule entry says so.

A watchdog re-plans when the wall clock moves without matching time having
passed — a suspended laptop, a resumed VM, a manual clock change.
`powerMonitor` covers the common cases but does not fire everywhere.

## Being away from the machine

When a break comes due the timer checks `powerMonitor.getSystemIdleTime()`
against the threshold in `core/idle.ts`. Past it, the break is held rather than
shown, and the timer polls until input resumes and then plans a fresh work
interval — a break shown to an empty chair is missed, and it would also anchor
the next interval to the wrong moment, so the one after it arrives too early.

Two deliberate choices:

- Time away is **not** credited to the break streak. That counter means "breaks
  taken with the app"; awarding one for walking away would make it meaningless.
- An idle time that cannot be read counts as **present**, not away. Failing that
  way costs an unnecessary break; failing the other way silently stops breaks
  altogether, which is the whole feature.

## Window backdrops

Electron documents that CSS `backdrop-filter` applies only to a window's own web
contents; it can never blur the desktop behind the window. Only two platforms
can do that at all:

| Mode          | Where                        | How                                                                                                        |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `vibrancy`    | macOS                        | Native `vibrancy: 'fullscreen-ui'`                                                                         |
| `acrylic`     | Windows 11 22H2+             | `backgroundMaterial: 'acrylic'`, with `backgroundColor: '#00000000'` so DWM's material is not painted over |
| `translucent` | Windows 10, Linux            | A transparent window and a heavy CSS scrim                                                                 |
| `solid`       | Fallback, or user preference | An opaque window                                                                                           |

The mode is resolved in `core/platform.ts`, applied to the window options in
`main/windows.ts`, and passed to the renderer as a query parameter so the
correct styling is present on the very first paint.

Two platform notes worth keeping in mind when touching this:

- `closable: false` is documented as not implemented on Linux, so the overlay
  enforces it in a `close` handler instead of relying on the flag.
- Linux does **not** use `type: 'notification'`. That window type is meant for
  transient toasts and several window managers place it oddly or treat it as
  non-interactive, which is what made the Linux overlay unusable.

## Reminders

macOS renders notification action buttons only for an app that is both code
signed and declares `NSUserNotificationAlertStyle: alert`. BlinkBlink ships
unsigned, so its "Skip this break" button could never appear there, and
failures were silent.

The default is therefore BlinkBlink's own toast window, which behaves the same
on all three platforms and can always offer its actions. `reminderStyle:
'system'` opts into the OS notification centre, and falls back to the toast if
the platform cannot deliver.

## Settings and storage

Everything entering the store is normalised by `core/settings.ts` —
`normalizeSettings` coerces types, clamps numbers into ranges the timer can
honour, and drops malformed schedule entries. It runs on data arriving over IPC
from the settings window _and_ on data read back from disk, so a store written
by an older version cannot put the timer into a state it does not understand.

`store.ts` carries a `schemaVersion` and migrates forward on startup.

## Security posture

Every window runs with `contextIsolation: true`, `sandbox: true`, no node
integration, and a strict `Content-Security-Policy` meta tag. That is why the
renderer scripts live in separate files rather than inline `<script>` blocks,
and why the preload touches nothing beyond `contextBridge` and `ipcRenderer` —
a sandboxed preload cannot use `shell`, so `openExternal` is an IPC call that
the main process validates (http, https and mailto only).

`window.api` is declared once, in `src/renderer/global.d.ts`, typed from the
preload's own exported shape. Removing a method from the preload is therefore a
compile error in the pages that used it.

## Testing

```bash
npm run verify           # typecheck, lint, formatting, unit tests
npm run test             # unit tests only (fast)
npm run test:e2e         # Playwright, drives the real Electron app
npm run test:e2e:headless   # the same under Xvfb, for a headless machine
```

The end-to-end tests are what actually prove the platform work. A unit test can
say which backdrop mode _should_ be chosen; only a running app can show that
the overlay is not an opaque white rectangle, that the reminder toast appears
before the break, and that the Skip button can be clicked.

`tests/e2e/packaged.spec.ts` runs against a built package when
`BLINKBLINK_PACKAGED_PATH` is set. It is the only test that exercises the asar
layout and `process.resourcesPath`, where the bundled sounds live.

## Command-line flags

Because a second launch is handed to the running instance, these double as a
remote control — bind them to desktop shortcuts:

```
blinkblink --take-break    start a break now
blinkblink --settings      open settings
blinkblink --stats         open statistics
blinkblink --hidden        start in the background (used by the autostart entry)
```
