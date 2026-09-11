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
- Linux asks for real full screen once the window is shown. Sizing a window to
  the screen and marking it always-on-top is not the same request: a Plasma
  panel set to stay visible lives in its own layer and keeps its strip of the
  desktop. `_NET_WM_STATE_FULLSCREEN` is the one every desktop understands, and
  the screen-sized bounds stay underneath it as the fallback. macOS is excluded
  deliberately — its full screen means a new Space, with an animation and a
  window that no longer floats over other apps.

The overlay still appears in the Linux task switcher, and that is not fixable
from inside the app. `skipTaskbar` is unsupported on Linux (and inert on
Wayland), KWin's alt-tab ignores it on X11 as well, and the one lever that does
work — `focusable: false` — takes the window out of window management along with
its keyboard events, which would cost the overlay its Escape-to-skip. Users who
want it gone can add a KWin rule: **System Settings → Window Management → Window
Rules**, match `blinkblink`, set _Skip switcher_ to Force / Yes.

## Reminders

The default is the OS notification centre. It looks native, stacks and
dismisses with everything else, and does not paint a window over what the user
is doing — which for something firing every twenty minutes matters more than
the feature list.

macOS renders notification action buttons only for an app that is both code
signed and declares `NSUserNotificationAlertStyle: alert`. BlinkBlink ships
unsigned, so the "Skip this break" button is not drawn there. Confirmed on a
real unsigned build: the notification itself is delivered normally, only the
button is missing, and the settings window says so on macOS rather than leaving
it to be found.

`reminderStyle: 'in-app'` switches to BlinkBlink's own toast window, which
behaves the same on all three platforms and always carries its actions. The
system path also falls back to the toast when the platform reports it cannot
deliver at all.

The one failure neither path can detect is suppression — Focus, Do Not Disturb,
or notification permission denied. The OS reports the notification as shown and
draws nothing; the toast is the answer for anyone in that position.

The toast dismisses with a button rather than a key. It is deliberately
`focusable: false` so it cannot steal what is being typed, and a window that
cannot take focus never receives key events, so an Escape handler there would
never fire.

## Settings and storage

Everything entering the store is normalised by `core/settings.ts` —
`normalizeSettings` coerces types, clamps numbers into ranges the timer can
honour, and drops malformed schedule entries. It runs on data arriving over IPC
from the settings window _and_ on data read back from disk, so a store written
by an older version cannot put the timer into a state it does not understand.

`store.ts` carries a `schemaVersion` and migrates forward on startup.

## Bundled sounds

`assets/sounds` ships Ogg Opus, copied into the package as `extraResources` and
played by the renderer from a `file://` URL. They were uncompressed WAV until
0.2.3 and accounted for 7.8 MB of every installer; the same 23 sounds are 540 KB
as Opus. To add one, convert it the same way:

```bash
ffmpeg -i new-sound.wav -vn -c:a libopus -b:a 96k -vbr on -application audio assets/sounds/new-sound.opus
```

`-vn` matters: some of these files arrived with cover art attached, which ffmpeg
will otherwise dutifully carry over.

The chosen sound is stored as a filename, so upgrading finds `.wav` names for
files that no longer exist. `normalizeSoundName` rewrites the extension on read
— the basenames did not change — which keeps the user's choice instead of
silently resetting it.

## Updates

`resolveUpdateDelivery` in `core/platform.ts` decides who installs an update,
from the packaging format rather than the platform:

| Build                | Delivery   | What happens                                        |
| -------------------- | ---------- | --------------------------------------------------- |
| Windows NSIS         | `in-app`   | electron-updater downloads and installs it.         |
| Linux AppImage       | `in-app`   | Same, replacing the AppImage file.                  |
| macOS                | `assisted` | The DMG lands in Downloads; the user drags it over. |
| Linux snap, deb, rpm | `external` | snap/apt/dnf own it. The app only says so.          |

macOS is `assisted` because Squirrel.Mac refuses to update an unsigned app.
deb and rpm are `external` by choice, not by limitation: electron-updater can
install both, but only by shelling out to `dpkg`/`rpm` behind `pkexec`, over
files the distribution's package manager considers its own.

On Linux, electron-updater's default is the AppImage updater — it only picks
deb or rpm when electron-builder's `package-type` file says so. So the AppImage
check is what keeps a `pkexec` prompt away from someone who installed the deb.

The AppImage artifact deliberately has **no version in its filename**. The
updater replaces the running file, and when the name carries a version it
writes the new one beside the old and deletes the old — moving the app, and
breaking any launcher pointing at it. A stable name updates in place. Existing
installs still get renamed once, on their first update, which is why
`syncAutostart` rewrites the autostart entry when its `Exec` line no longer
matches the running executable.

### The macOS artifacts

Two DMGs, arm64 and x64, replacing the single universal build 0.2.0 shipped.
Universal doubles every download for a machine that can only run half of it,
and the reason for it has been checked and does not hold: clients on 0.1.2 pick
the first asset ending in `.dmg` with no architecture check, but every build up
to 0.1.2 was arm64-only — the release's own disk image carries fifteen arm64
Mach-O headers and no x86_64 one. Those users are all on Apple Silicon, and the
arm64 DMG is the one they get, first by name and first by upload.

`updateArch` is the safety net. `process.arch` reports the build, not the
machine, so an x64 build on an Apple Silicon Mac says `x64` and would be handed
an x64 update for ever afterwards. Electron's `runningUnderARM64Translation`
overrides it, so a machine that ends up on the wrong build is carried back on
its next update rather than stuck in Rosetta.

No macOS `.zip`. Only Squirrel.Mac reads it, and Squirrel.Mac cannot update an
unsigned app, so it was 205 MB of every release that nobody downloaded. Signing
would bring it back.

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
