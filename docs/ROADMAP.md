# Roadmap and open questions

Written after the September 2026 maintenance pass. Ordered roughly by
value-for-effort, with an honest assessment of moving off Electron at the end.

## Near term

### 1. macOS code signing — highest user-visible payoff

Everything else about the release pipeline is automated now; this is the one
remaining manual papercut, and it is a payment problem rather than an
engineering one. $99/year for the Apple Developer Program buys:

- No more `xattr -c /Applications/BlinkBlink.app` on the download page. That
  instruction almost certainly costs installs — it asks a stranger to paste a
  Terminal command to disarm a security warning.
- Notification action buttons on macOS. The app currently detects that it is
  unsigned and defaults to its own reminder toast, which is arguably nicer
  anyway, but the system-notification option stays second class without it.
- Squirrel.Mac auto-updates, replacing the "download the DMG and drag it
  yourself" flow in `updater.ts`.

The release workflow already reads `MAC_CSC_LINK` and friends. Add the secrets
and it signs; nothing else needs to change.

### 2. Localisation

`settings.language` exists, is persisted, and does nothing — the picker offers
only English. Either wire up a real string catalogue or remove the control.
Leaving a setting that visibly does nothing is worse than not having it.

The strings are few (roughly 60 across the overlay, settings, tray and
tutorial). A minimal `t(key)` over JSON catalogues would be enough; there is no
need for a framework.

### 3. A "Winky" gentle-reminder mode

Already promised on the releases README. The reminder toast added in this pass
is most of the plumbing: a small always-on-top, non-focus-stealing window with
its own renderer. A gentler alternative to the full-screen overlay would reuse
that window and add the character art.

### 4. Break history and better statistics

The store keeps only current and best streaks. A rolling log of break outcomes
(completed/skipped, timestamp) would support a weekly view, an adherence
percentage, and "you skip most breaks on Thursday afternoons". Keep it local;
"Privacy First" is on the marketing site and should stay true.

### 5. Idle detection

`powerMonitor.getSystemIdleTime()` is available and unused. A break that fires
while you are away from the desk is a break wasted — and worse, it starts the
next 20 minutes from the wrong point. Suppressing a break after N minutes of
input idleness, and restarting the work interval on return, is maybe 30 lines
and noticeably improves the core feature.

### 6. Reverse-DNS application ID

`build.appId` is `blinkblink`. Convention is `com.blinkblink.app`, and macOS in
particular keys notification permissions and login items off the bundle ID.

Deliberately **not** changed in this pass: NSIS derives its uninstall registry
key from `appId`, so changing it would make the next Windows installer install
alongside the old copy rather than upgrading it. Doing this properly means a
major version with an NSIS migration that removes the old entry, plus accepting
that macOS users lose their "start at login" setting once. Worth it eventually,
not worth it for a patch release.

---

## Moving off Electron

The short answer: **not now**, and the reasons are specific rather than
sentimental.

### What Electron actually costs here

Measured on this machine (Electron 38, packaged Linux x64 build, idle in the
tray with no windows open):

|                        |                                   |
| ---------------------- | --------------------------------- |
| Disk, unpacked         | 298 MB                            |
| Installer, `.deb`      | 89 MB                             |
| Installer, `.AppImage` | 126 MB                            |
| Memory, idle           | **249 MB PSS across 5 processes** |

The memory number is the one that should sting. PSS already accounts for shared
pages, so it is not an artefact of counting Chromium five times. A quarter of a
gigabyte, resident all day, for an app whose entire job is to subtract one from
a number every second and show a message every twenty minutes. That is a real
criticism and the strongest argument for moving.

### What a migration would actually involve

Tauri v2 is the credible target: Rust core, system webview, ~10 MB bundles,
typically 40–90 MB resident.

The renderer largely survives — the HTML and CSS carry over, and the TypeScript
in `src/core/` is deliberately free of Electron imports, so the schedule maths,
settings validation, timer planning and stats reducer all port unchanged along
with their 97 tests. That was worth doing regardless of whether this migration
ever happens.

What has to be rewritten is everything in `src/main/`: roughly 1,500 lines of
window management, tray, IPC, storage, autostart and updater logic, in a
language the project does not currently use.

### The four risks, in order

1. **Linux WebKitGTK.** Tauri uses the system webview: WebView2 on Windows and
   WKWebView on macOS are both fine, but Linux means WebKitGTK — a genuinely
   different engine from Chromium, with its own CSS quirks and notably weaker
   support for transparent windows. Linux is already the weakest platform here,
   and this migration would make its rendering path the least tested one. The
   packaging split between `webkit2gtk-4.0` (older Debian/Ubuntu) and `4.1`
   (Fedora, current Ubuntu) is a separate, ongoing distribution headache.

2. **The overlay is the hard part, and it is all platform-specific.** A
   full-screen, always-on-top, click-through-resistant window on every monitor,
   above other apps' full-screen windows, with native vibrancy on macOS and DWM
   acrylic on Windows. In Electron this is `setAlwaysOnTop(win, 'screen-saver')`
   plus a `vibrancy` option. In Tauri it is the `window-vibrancy` crate plus, in
   all likelihood, hand-written Objective-C and Win32 for the window levels.
   This is exactly the surface that was broken and has just been fixed and
   covered by tests.

3. **The bugs come back.** The three problems reported at the start of this
   pass — Windows painting white, Linux misbehaving, notifications not working
   — were all platform-integration bugs, not application-logic bugs. A rewrite
   discards the fixes and the tests that pin them, on a stack with less
   documentation and fewer people who have hit the same walls.

4. **Effort against a solo maintainer's time.** Realistically two to four weeks
   of focused work, plus a long tail of platform-specific bugs found by users
   rather than by you. This project went ten months without a commit; that is
   the honest budget to plan against.

### What would change the answer

Revisit if any of these becomes true:

- Users start reporting memory use as a reason they uninstalled. That turns an
  aesthetic concern into a product problem.
- You want to add features whose cost is dominated by the runtime — a
  persistent HUD, always-visible countdown, or anything that runs continuously
  rather than every twenty minutes.
- Tauri's Linux story consolidates on a single WebKitGTK version, or Tauri gains
  a first-class always-on-top-above-fullscreen API for all three platforms.
- You find you enjoy Rust enough that the rewrite is its own reward. Not a joke
  — for a personal project that is a legitimate reason, and probably the most
  likely one to actually happen.

### If you do decide to go

Do it in this order, and stop if a gate fails:

1. **Spike the overlay first, before anything else.** One Tauri window,
   full-screen, always on top, on two monitors, with vibrancy on macOS and
   acrylic on Windows, and a clickable button. If that takes more than a couple
   of days, you have your answer.
2. Port `src/core/` to Rust, or keep it in TypeScript in the webview. The tests
   in `tests/` become the specification either way.
3. Tray, then storage, then autostart, then the updater.
4. Ship both side by side for one release cycle. Electron builds are cheap now
   that the whole pipeline is a tag away.

### The cheaper alternative

If the goal is a smaller footprint rather than leaving Electron, the achievable
wins are modest and worth knowing about:

- Electron's own binary is ~250 MB of the 298 MB unpacked, so trimming app code
  barely moves disk usage. Removing the unused locale `.pak` files saves ~10 MB.
- The idle process count (5) is mostly Chromium's fixed cost: main, GPU, network
  and utility processes exist whether or not a window is open.
- Keeping Electron current is the highest-value maintenance here — Chromium's
  memory work lands for free with each major version. Dependabot now groups
  Electron and its packager so they upgrade together.

Expect that to reach maybe 200 MB idle. It does not change the category.
