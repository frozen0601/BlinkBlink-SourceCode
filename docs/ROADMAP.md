# Roadmap and open questions

Written after the September 2026 maintenance pass. Ordered roughly by
value-for-effort, with an honest assessment of moving off Electron at the end.

## Near term

### 0. Marketing site — landed, but not yet deployed

The download page used to pick assets with
`assets.find(a => a.name.endsWith('.dmg'))` — first match wins, no architecture
check — send every Linux visitor to the Snap Store, advertise a prerelease as
the current version, and tell people to run `xattr -c`. All four are fixed and
merged to `main` on the site repository.

The `find` call was never immediately dangerous, because 0.2.0 ships a single
universal DMG precisely so that no client, old or new, can pick the wrong one.
It would become dangerous again the day macOS goes back to per-architecture
builds, which is why it was fixed ahead of that.

Two things are still open.

**The site has not been deployed since March 2025.** Its `gh-pages` branch —
what GitHub Pages actually serves — still holds a build from before any of this.
Release _data_ does update on its own, because the page reads the GitHub API at
load; the page's own _code_ does not, and reaches visitors only through
`npm run deploy` in that repository. Deploy **after** 0.2.0 is published, not
before: the merged change points the Linux button at the `.AppImage`, and no
published release carries one until 0.2.0 does.

**A follow-up redesign is open and unmerged** on
`claude/download-platform-options`. It gives all three platforms the same
"Other options" disclosure instead of the row of small links the first pass left
under the buttons, builds the options from the assets a release actually
carries, and labels the macOS builds "Apple Silicon" and "Intel chip" rather
than `arm64` and `x64`. It also makes the Linux button fall back to the Snap
Store when a release has no `.AppImage`, so the ordering constraint above stops
mattering. Worth merging before the deploy.

### 1. Make the macOS install less frightening — without paying Apple

The project earns nothing and has ~167 daily users, so $99/year for the Apple
Developer Program is not a sensible cost right now. There is no free substitute
— notarisation, the Mac App Store and Squirrel.Mac auto-update all require the
paid programme, and ad-hoc `codesign -s -` does not satisfy Gatekeeper for a
downloaded app. So the goal is to make the unsigned path as painless as it can
be, and let signing wait until it pays for itself.

**a. Publish a Homebrew tap.** This is the biggest win available for free. A
personal tap has none of the notability requirements of homebrew-cask proper,
and gives Mac users a one-line install _and_ upgrade path that never meets a
Gatekeeper dialog:

```bash
brew tap blinkblinkapp/tap
brew install --cask --no-quarantine blinkblink
brew upgrade --cask blinkblink          # updates, free, no Squirrel needed
```

It needs one small repository, `BlinkBlinkApp/homebrew-tap`, containing a cask
file with the version, the DMG URLs and their SHA-256 sums. The release
workflow can regenerate and commit that file on every release, so it stays in
step by itself. Worth doing before anything else on this list.

**b. Use the targeted quarantine command.** The download page currently says:

```bash
xattr -c /Applications/BlinkBlink.app        # clears every extended attribute
```

`xattr -d com.apple.quarantine /Applications/BlinkBlink.app` removes only the
quarantine flag, which is all that is in the way. Same number of steps, much
narrower blast radius, and easier to justify to a cautious user.

**c. Offer the Finder route as well as the Terminal one.** Many people will not
paste a shell command from a website, and are right not to. Gatekeeper can also
be cleared entirely through the UI — open the app, let it be refused, then
approve it in System Settings under Privacy & Security. Apple has moved this
around between releases, so the page should describe it in words with a
screenshot rather than promising an exact menu path.

**What signing would buy, when it becomes affordable:** no Gatekeeper step at
all, notification action buttons on macOS (the app detects it is unsigned and
defaults to its own toast instead — arguably nicer, but the system-notification
option stays second class), and real auto-updates in place of "download the DMG
and drag it yourself". The release workflow already reads `MAC_CSC_LINK` and
friends, so the day the certificate exists, adding the secrets is the whole
change.

### 1b. If you want the project to fund itself

Not a recommendation to monetise — just the honest arithmetic, since the
signing question keeps running into it.

$99/year is $8.25/month. At 167 daily users that is roughly one person in
seventy giving $1/month, or one in three hundred giving $5. For a free utility,
donation conversion is usually somewhere between 0.1% and 1%, so this is
plausible but not a certainty, and one donation so far suggests the current
funnel is the problem rather than the audience.

Cheap things that plausibly change it, roughly in order of effort:

- **Add GitHub Sponsors.** It takes no platform fee, and a `FUNDING.yml` puts a
  Sponsor button on the repository. The current links (Buy Me a Coffee, Ko-fi,
  PayPal) are buried in a tray submenu and in the About window, which almost
  nobody opens.
- **Ask once, at the right moment.** The natural point is a streak milestone —
  someone who has just been told they have taken 50 breaks is the most likely
  person to give. A single dismissible prompt, never repeated, would be more
  effective than three permanent menu entries and less annoying than either.
- **Fix discoverability before conversion.** 167 daily users is small for what
  this is. The Snap Store listing, a Homebrew tap, an /r/macapps post and a
  Product Hunt launch are all free, and doubling the user base doubles whatever
  the conversion rate turns out to be.

If none of that works, staying unsigned indefinitely is a perfectly reasonable
outcome — plenty of good open-source Mac apps ship exactly this way, and a
Homebrew tap makes it nearly invisible.

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

### 5. Reverse-DNS application ID

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
