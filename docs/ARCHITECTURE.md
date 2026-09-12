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

### Staying out of the Linux task switcher

Full screen alone left the overlay listed in alt-tab — confirmed on Fedora with
Plasma, where the panel was covered but the break screen could still be tabbed
away from. A break the user can tab out of is not a break.

`skipTaskbar` does not fix it. KWin's switcher reads
`_KDE_NET_WM_STATE_SKIP_SWITCHER` from the window's `_NET_WM_STATE`
(`NET::SkipSwitcher` in KWindowSystem); `skipTaskbar` writes only
`_NET_WM_STATE_SKIP_TASKBAR` and `_NET_WM_STATE_SKIP_PAGER`, which the switcher
ignores — and on Wayland `skipTaskbar` is documented as doing nothing at all.
Electron exposes no way to set an arbitrary atom, so that route needs a native
module or an `xprop` call timed between window creation and mapping.

So the overlay is created `focusable: false` on Linux
(`overlayBypassesWindowManager` in `core/platform.ts`). Electron then maps it
with override-redirect: the window manager never manages it, which means always
on top, on every workspace, and — the point — absent from the switcher entirely.

Verified rather than assumed: running the packaged app under Xvfb and reading
the overlay window with `xwininfo` reports `Override Redirect State: yes`, and
it still does after the `setFullScreen(true)` call, so the two Linux fixes do
not undo each other.

```bash
xwininfo -id "$(xwininfo -root -children | grep -i blinkblink | head -1 | awk '{print $1}')"
```

The cost is keyboard input: an unmanaged window never takes focus, so it gets no
key events. The break screen does not mind — it is meant to be hard to get out
of, and Skip is a button. There is deliberately no Escape handler.

**This is an X11 mechanism, and Electron does not default to X11.** That
assumption was wrong twice over, and it is the reason two rounds of "fixed"
changed nothing on Fedora. Electron 38 selects its Wayland backend the moment
`WAYLAND_DISPLAY` is set, with no flag and no hint. Measured against a headless
Weston: with no switches the app loads `ozone/platform/wayland` and creates no
X11 window at all.

Wayland has no override-redirect and no protocol for staying out of a switcher,
and a Wayland client cannot raise itself back afterwards either, so on that
backend the overlay is listed whatever it asks for. The override-redirect path
above works on X11 and on XWayland — which is why the app moves itself there.

The backend can only be chosen on the process command line:

| How                                           | Result                 |
| --------------------------------------------- | ---------------------- |
| nothing, on a Wayland session                 | Wayland                |
| `app.commandLine.appendSwitch` from `main.ts` | Wayland — too late     |
| `ELECTRON_OZONE_PLATFORM_HINT=x11`            | Wayland — ignored      |
| `--ozone-platform=x11` on the command line    | X11, override-redirect |

#### Re-executing onto X11

That last row is what the app does: on a Wayland session with an X display to
land on, it spawns a copy of itself carrying `--ozone-platform=x11` and stands
down. `core/x11Relaunch.ts` decides and builds the child's command line and
environment; `main/x11Relaunch.ts` does the spawning.

This shipped once before and killed every AppImage with `SIGBUS`:

```
#12 dlopen@GLIBC_2.2.5 (libc.so.6)
#13 notify (BlinkBlink-x86_64.AppImage + 0x4951)
#14 main (BlinkBlink-x86_64.AppImage + 0x5d55)
```

Those low offsets are the AppImage type-2 runtime, not Electron: the child died
in the loader before any of this app's code ran. An AppImage mounts its
squashfs over FUSE and points `LD_LIBRARY_PATH`, `PATH` and half a dozen others
into `/tmp/.mount_*`. `app.relaunch` hands the child that environment, the
parent exits, the mount disappears, and the child maps a library out of a
filesystem that is no longer there.

Four things keep that from happening again:

- **The child's environment is scrubbed.** `childEnvironment` drops `APPDIR`,
  `APPIMAGE`, `ARGV0` and `OWD` outright and filters every `:`-separated path
  list entry by entry, so nothing points into the parent's mount. The child's
  own runtime rebuilds all of it against its own fresh mount.
- **The child's working directory is set.** AppRun chdirs into the mount, and a
  child sitting there keeps it busy.
- **Failure is not fatal.** The parent watches the child for 1.5 s. If it errors
  or exits in that window the parent carries on running, on Wayland. The worst
  case is an overlay in alt-tab, never an app that will not open — which is what
  the first version got wrong by exiting immediately.
- **It cannot loop.** The child carries `--ozone-platform=x11` on its command
  line _and_ `BLINKBLINK_X11_RELAUNCH=1` in its environment. Either alone stops
  a second relaunch.

The single-instance lock is taken _after_ the handover resolves, not before: a
parent holding it would turn its own replacement away.

Verified on a real AppImage, launched with no flags against a headless Weston
with `DISPLAY` also set — FUSE is available here, so this can be tested
properly now:

```
[app] handed over to a copy running on XWayland
pid 8535: ...AppImage --take-break --ozone-platform=x11
overlay window 0x200003  Override Redirect State: yes
```

**Known cost, measured and not yet solved.** The discarded process's Electron
main exits, but its AppImage runtime — the FUSE server for its own mount —
stays asleep in `fuse_dev_do_read` instead of unmounting, so each launch on a
Wayland session leaves behind one ~2.5 MB process and one `/tmp/.mount_*`
directory until the session ends. A normal launch with no handover tears both
down correctly, so this is the handover's doing. Nothing was found holding the
mount open: no process has an fd, a mapping or a working directory inside it.
Worth another look; not worth blocking the fix, since the alternative is a
break screen anyone can tab away from.

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

## Statistics

`core/breakHistory.ts` keeps one row per day — breaks taken, breaks skipped,
and both again per hour of the day — and derives every view the statistics
window draws. It is local; nothing here is sent anywhere.

Size was the deciding constraint, because electron-store rewrites the whole
JSON file on every break. A working day is about 145 bytes, so roughly 37 KB a
year; `RETAIN_DAYS` (400) of daily rows are kept and anything older is folded
into one row per month, which stops the file growing at around 50 KB however
long the app is installed.

Two decisions worth keeping:

- **"Offered", not "scheduled".** The week reads "39 of 44", where 44 is every
  break the app actually put in front of someone. Working out what a schedule
  _would_ have produced means guessing at hours the machine was asleep, and a
  denominator nobody can check is worse than a smaller true one.
- **Only hours that saw a break appear.** That is what makes the hour view
  correct for someone on a schedule: the app never offered a break at 3am, so
  3am is never shown as a perfect hour.

The sentence under the count is assembled from the numbers, not written: each
clause has a threshold — three skips before the afternoon is blamed, a clear
lead over second place before an hour is named — so it can only say something
the rows support.

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

### Installing a macOS update

Squirrel.Mac will not update an unsigned app, so BlinkBlink fetched the DMG and
asked the user to drag it over the running one. It now does that drag itself:
`main/macInstall.ts` mounts the image, checks the bundle inside it, copies it
next to the installed one and swaps the two, then restarts.

The order is what makes it safe. The copy lands in `BlinkBlink.app.new-<pid>`,
so nothing installed is touched until it is complete; the installed bundle is
then renamed to `.old-<pid>`, and only the rename that follows is irreversible.
If that one fails, the `.old` is renamed back and the working app is where it
was. Anything earlier failing leaves a stray directory that is cleaned up on the
way out.

It refuses rather than improvises: a development build, an app not running from
a `.app`, one running from the mounted image itself, a folder it cannot write
to, a bundle whose identifier is not ours, or a version that is not newer. Every
refusal falls back to the old behaviour — open the disk image, point at the
install guide — with the reason shown.

`ditto` does the copy, not `cp`: it keeps the bundle's symlinks and extended
attributes, which a plain copy flattens. `xattr -cr` on the copy is what stops
the quarantine flag the download picked up putting the new app back behind
Gatekeeper.

No administrator password is involved. `/Applications` is group-writable by
`admin`, which the person who installed the app almost always is, and the swap
is two renames inside a directory they already own. A standard user, or an app
installed somewhere read-only, fails the `W_OK` check and gets the manual path.

The open question is **App Management**, the TCC protection macOS 13 added over
modifying app bundles. Apple's carve-out is for an app updating itself, matched
by code signature — and BlinkBlink is unsigned, which is the case the rule does
not describe. Either macOS treats an unsigned bundle as unprotected and the
rename simply works, or it refuses with `EPERM` and the app falls back to the
drag. Both are handled; which one happens is not knowable from here.

It cannot be settled by a script either, because TCC judges the process doing
the asking: `tools/try-mac-inplace-install.sh` run from a terminal tests the
terminal's permission. `--try-install <dmg>` exists for this — it runs the real
`installFromDmg` from the installed binary against its own bundle, which is the
case macOS is actually deciding on.

**Nothing on this path has been run on a real Mac.** There is no macOS runner
here, so the checks and the fallbacks are written to be the part that holds.

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

`--try-install <dmg>` is not one of these. It is handled before the
single-instance lock precisely so it is _not_ handed to the running instance:
see "Installing a macOS update" for why the identity of the calling process is
the whole point.
