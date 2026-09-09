# Follow-up needed on the marketing site

Four changes are due in
[`BlinkBlinkApp/BlinkBlinkApp.github.io`](https://github.com/BlinkBlinkApp/BlinkBlinkApp.github.io).

**These are already implemented and verified** in
[`marketing-site-download-fix.patch`](marketing-site-download-fix.patch)
alongside this file. Apply it from a clone of the site:

```bash
git am /path/to/marketing-site-download-fix.patch
```

It passes `npm run type-check` and `npm run build` there, and the built page was
rendered in both locales to confirm no raw i18n keys and the new rows in place.
(`npm run lint` crashes on that repo before and after the change — an eslint
9.15 / typescript-eslint version mismatch, left alone deliberately.)

The rest of this file explains _why_ each change is needed, and stands as the
brief if you would rather redo it than apply the patch.

## Why this is a patch rather than a pull request

The site is a separate repository under a different owner, and three attempts
from Claude Code sessions all failed at the same place — the push, never the
work. The third attempt produced the precise diagnosis:

> push blocked by 403 (read-only installation)

So it is not a token or an authorisation link. **The Claude GitHub App's
installation on the `BlinkBlinkApp` organisation is read-only.** Reconnecting a
personal GitHub authorisation does not change it, because the limit is on the
app installation for that organisation rather than on the user.

Two ways out, either of which lands the change:

1. **Apply the patch from a clone on your own machine** and push it there. Your
   own git credentials have nothing to do with the app installation, so this
   route has no unknowns. Fastest, and the recommended one.
2. **Grant the Claude GitHub App write access** (Contents and Pull requests) to
   `BlinkBlinkApp/BlinkBlinkApp.github.io` in that organisation's GitHub
   settings. Worth doing only if you want future sessions to work on the site
   directly; it is not needed for this change.

Everything up to the push is already verified, so route 1 is `git am` plus a
push.

The site is bilingual: **every new string needs an entry in both
`src/i18n/locales/en.json` and `src/i18n/locales/zh.json`** (Traditional
Chinese).

## 1. macOS downloads must match the processor

`src/components/sections/Download.vue` picks a download like this:

```ts
const assetExtension = platform === 'windows' ? '.exe' : '.dmg'
const asset = release.assets.find((a) => a.name.endsWith(assetExtension))
```

`find` returns whichever `.dmg` the GitHub API lists first, with no
architecture check. The day a release carries two —

```
BlinkBlink-<version>-arm64.dmg      BlinkBlink-<version>-x64.dmg
```

— roughly half of macOS visitors get a build for the wrong processor, and an
arm64 build on an Intel Mac does not launch at all.

0.2.0 deliberately ships **one universal DMG** so that this cannot happen
today: users on 0.1.2 run an updater with the same no-architecture-check bug,
and that code is already on their machines. The fix below is what makes it safe
to go back to per-architecture builds later, and the `pickAsset` fallbacks
handle a universal asset correctly in the meantime.

**Windows is unaffected** — it ships x64 only, deliberately, because
electron-updater's `latest.yml` has no per-architecture entry and would hand
ARM64 installers to x64 machines on auto-update. Windows on ARM runs the x64
build under emulation. So only the macOS branch needs architecture detection.

```ts
type Arch = 'arm64' | 'x64'

/**
 * Best-effort processor detection.
 *
 * `userAgentData` is Chromium-only, and Safari deliberately does not
 * distinguish Apple Silicon in its User-Agent, so the WebGL renderer string is
 * the practical fallback on macOS.
 */
async function detectMacArch(): Promise<Arch> {
    const uaData = (navigator as any).userAgentData
    if (uaData?.getHighEntropyValues) {
        try {
            const { architecture } = await uaData.getHighEntropyValues(['architecture'])
            if (architecture === 'arm') return 'arm64'
            if (architecture === 'x86') return 'x64'
        } catch {
            /* fall through */
        }
    }

    try {
        const gl = document.createElement('canvas').getContext('webgl')
        const info = gl?.getExtension('WEBGL_debug_renderer_info')
        const renderer = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
        if (/Apple\s+M\d/i.test(renderer)) return 'arm64'
    } catch {
        /* fall through */
    }

    // Every Mac sold since 2020 is Apple Silicon.
    return 'arm64'
}

function pickAsset(assets: GitHubRelease['assets'], extension: string, arch: Arch) {
    const candidates = assets.filter((a) => a.name.toLowerCase().endsWith(extension))
    return (
        candidates.find((a) => new RegExp(`[-_.]${arch}\\b`, 'i').test(a.name)) ??
        // A release published before architectures were in the filenames.
        candidates.find((a) => !/[-_.](arm64|x64)\b/i.test(a.name)) ??
        candidates[0]
    )
}
```

Detection is a heuristic, so always offer the other build — a line near the
version info pointing at the releases page is enough.

The same logic, with the same fallbacks, lives in `src/core/update.ts` in the
app repository (`pickAssetForArch`) and is covered by tests there; worth keeping
the two consistent.

## 2. The install instructions should not tell people to run `xattr -c`

`src/components/TutorialOverlay.vue` shows the command in two places — the
displayed text around line 63, and the clipboard copy around line 178. Both
say:

```bash
xattr -c /Applications/BlinkBlink.app
```

That clears **every** extended attribute when only the quarantine flag is in
the way. Use the targeted form in both places:

```bash
xattr -d com.apple.quarantine /Applications/BlinkBlink.app
```

Better still, lead with the route that needs no Terminal at all: open the app,
let the first launch be refused, then approve it in System Settings under
Privacy & Security. Plenty of people will not paste a shell command from a
website, and they are right not to. Apple moves this UI between releases, so
describe it in words with a screenshot rather than promising an exact path.

## 3. Linux visitors are sent only to the Snap Store

The Linux button links to `https://snapcraft.io/blinkblink` and the label is
`download.downloadButton.linux` ("Get it on Snap Store"). Releases now also
carry `.AppImage`, `.deb` and `.rpm`. Fedora users in particular cannot use a
snap without setting one up first, and Fedora is where the maintainer now
develops.

Offer all four. The assets follow the same naming as the others, so they can be
found with `pickAsset(release.assets, '.rpm', 'x64')` and friends.

## 4. `onMounted` reads the wrong release

```ts
const releases = await getAllReleasesFromGitHub()
const latestRelease = releases[0] // unsorted, unfiltered
```

`getLatestReleaseFromGitHub()` right below it sorts by publication date, but
this path does not, and neither filters `draft` or `prerelease`. A prerelease
would be advertised as the current version on the banner while the download
buttons served something else.

Reuse `getLatestReleaseFromGitHub()` here, and have it filter
`draft`/`prerelease` and sort by **version** rather than publication date — so
that re-publishing an old release cannot advertise it as current. Again,
`pickLatestRelease` in the app's `src/core/update.ts` is the reference
implementation.
