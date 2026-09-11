# Notes for Claude

## Orientation

BlinkBlink is an Electron tray app that enforces the 20-20-20 rule. Read
`docs/ARCHITECTURE.md` before changing anything structural — particularly the
sections on window backdrops and reminders, which encode platform behaviour
that is easy to "simplify" back into a bug.

Three repositories are involved:

| Repository                              | Role                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `frozen0601/BlinkBlink-SourceCode`      | This one. Source and CI.                                                                 |
| `frozen0601/BlinkBlink-Releases`        | Holds the GitHub Releases and their installers. No source.                               |
| `BlinkBlinkApp/BlinkBlinkApp.github.io` | Vue marketing site. Reads the newest non-draft release from the GitHub API at page load. |

Because the site reads the releases repository live, publishing a release is
what updates the version and the download links — no site deploy needed for
that. Changes to the site's own code are different: GitHub Pages serves its
`gh-pages` branch, which only moves when someone runs `npm run deploy` there.
Merging to the site's `main` publishes nothing.

## Where things go

- Logic that answers "given this state, what should happen" → `src/core/`,
  with a unit test. No Electron imports there, ever; that constraint is what
  makes the tests possible and would make a future Tauri port survivable.
- Anything calling an Electron API → `src/main/`.
- One renderer entry point per window in `src/renderer/`, registered in
  `webpack.config.js`.

## Before you say something works

```bash
npm run verify              # typecheck, lint, format, unit tests
npm run test:e2e:headless   # Playwright against the real app, under Xvfb
```

This is a desktop app whose bugs were all platform-integration bugs. Unit tests
did not catch any of them and will not catch the next one. If you change window
options, backdrop handling, the reminder, or anything in the packaging config,
run the app and look at it:

```bash
npx electron-builder --dir
BLINKBLINK_PACKAGED_PATH=release/linux-unpacked/blinkblink \
  xvfb-run -a npx playwright test tests/e2e/packaged.spec.ts
```

`--take-break`, `--settings` and `--stats` exist partly so tests can drive the
app without a tray to click.

## Things that will bite you

- **CSS `backdrop-filter` cannot blur the desktop.** Electron documents this
  explicitly. It only sees the window's own contents. Native vibrancy (macOS)
  and DWM acrylic (Windows 11 22H2+) are the only real options; everywhere else
  the honest answer is a scrim. Do not "restore" the blur filter.
- **`backgroundMaterial` needs a transparent `backgroundColor`.** Otherwise
  Electron's default opaque `#FFF` is painted over the material. This was the
  Windows "dead white" bug.
- **`closable: false` is a no-op on Linux.** The overlay guards `close` events
  instead.
- **Do not set `type: 'notification'` on Linux windows.** Several window
  managers treat that type as non-interactive.
- **`skipTaskbar` does not keep a Linux window out of alt-tab.** It is
  documented as unsupported on Linux, does nothing at all on Wayland, and KWin's
  switcher ignores it on X11 too — that reads
  `_KDE_NET_WM_STATE_SKIP_SWITCHER`, which Electron cannot set. The overlay is
  created `focusable: false` on Linux instead, which takes it out of window
  management altogether; the price is that it never receives key events, so
  `windows.ts` registers Escape as a global shortcut while the overlay is up.
  Remove one and the other becomes a bug. Full screen is a separate fix, for
  covering the panel. All confirmed on Fedora with Plasma.
- **macOS notification action buttons need a signed app** _and_
  `NSUserNotificationAlertStyle: alert`. Unsigned builds silently omit the
  button. This is why the in-app toast is the default.
- **`app.setLoginItemSettings` does nothing on Linux.** Autostart there is an
  XDG desktop entry; see `src/main/autostart.ts`.
- **`build.appId` must match `APP_USER_MODEL_ID` in `appSetup.ts`.** Windows
  drops toasts when they disagree, silently. Do not change `appId` casually —
  NSIS derives its uninstall key from it, so changing it breaks in-place
  upgrades. See the roadmap.
- **Renderers are sandboxed with a strict CSP.** No inline `<script>`, no inline
  event handler attributes. Add renderer code as a file and a webpack entry.

## Releasing

`npm version patch && git push --follow-tags`. Everything else is CI. Full
detail, including the required secrets, is in `docs/RELEASING.md`.

## Style

Prettier owns formatting (4 spaces, no semicolons, single quotes, 140 columns);
run `npm run format`. Comments should explain _why_ — particularly for the
platform workarounds, which look arbitrary without their reason attached.
