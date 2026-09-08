# Follow-up needed on the marketing site

This repository now ships **more than one architecture per platform**, which
the download page in
[`BlinkBlinkApp/BlinkBlinkApp.github.io`](https://github.com/BlinkBlinkApp/BlinkBlinkApp.github.io)
is not yet equipped to handle. That site is a separate repository, so the
change has to be made there; the ready-to-apply patch is below.

## The problem

`src/components/sections/Download.vue` picks a download like this:

```ts
const assetExtension = platform === 'windows' ? '.exe' : '.dmg'
const asset = release.assets.find((a) => a.name.endsWith(assetExtension))
```

That was correct when a release carried exactly one `.dmg` and one `.exe`. A
release now contains:

```
BlinkBlink-<version>-arm64.dmg      BlinkBlink-<version>-x64.dmg
BlinkBlink-<version>-arm64.exe      BlinkBlink-<version>-x64.exe
```

`find` returns whichever the GitHub API happens to list first, so roughly half
of macOS visitors would be handed a build for the wrong processor. An Intel Mac
running an arm64 build fails outright; an Apple Silicon Mac running the x64
build works, but through Rosetta and slower.

Until this is fixed, the safe options are to publish only one architecture per
platform, or to point the download buttons straight at the Releases page.

## The patch

Replace `proceedWithDownload` and add a small architecture helper. The
detection uses the User-Agent Client Hints API where it exists, falls back to
the WebGL renderer string (which reports "Apple M1/M2/…" on Apple Silicon), and
otherwise assumes the majority case — while always offering the other build.

```ts
type Arch = 'arm64' | 'x64'

/**
 * Best-effort processor detection.
 *
 * `userAgentData` is Chromium-only, and Safari deliberately does not
 * distinguish Apple Silicon in its User-Agent, so the WebGL renderer string is
 * the practical fallback on macOS.
 */
async function detectArch(platform: 'windows' | 'macos'): Promise<Arch> {
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

    if (platform === 'macos') {
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

    return 'x64'
}

function pickAsset(assets: GitHubRelease['assets'], extension: string, arch: Arch) {
    const candidates = assets.filter((a) => a.name.endsWith(extension))
    return (
        candidates.find((a) => a.name.includes(`-${arch}.`)) ??
        // A release built before architectures were in the filenames.
        candidates.find((a) => !/-(arm64|x64)\./.test(a.name)) ??
        candidates[0]
    )
}
```

Then in `proceedWithDownload`:

```ts
const release = await getLatestReleaseFromGitHub()
const extension = platform === 'windows' ? '.exe' : '.dmg'
const arch = await detectArch(platform)
const asset = pickAsset(release.assets, extension, arch)

if (!asset) throw new Error(`No ${platform} version available`)

// Remember what was served, so the "wrong build?" link can offer the other one.
downloadedArch.value = arch
selectedPlatform.value = platform
showTutorial.value = true
window.location.href = asset.browser_download_url
```

Detection is a heuristic, so give people an escape hatch — somewhere near the
version line:

```vue
<p class="arch-note" v-if="downloadedArch">
  Downloaded the {{ downloadedArch === 'arm64' ? 'Apple Silicon' : 'Intel' }} build.
  <a href="https://github.com/frozen0601/BlinkBlink-Releases/releases/latest">
    Need a different one?
  </a>
</p>
```

## While you are in that file

Two smaller things worth fixing at the same time:

- **Linux downloads.** The page sends every Linux visitor to the Snap Store.
  Releases now also carry `.AppImage`, `.deb` and `.rpm`, and Fedora users in
  particular cannot use a snap without setting one up first. A "Linux" button
  offering all four would serve them better.

- **`onMounted` trusts `releases[0]`.** It reads the newest release from the
  unsorted array even though `getLatestReleaseFromGitHub` sorts by publication
  date just below it. Draft and prerelease entries are not filtered either, so
  a prerelease would be advertised as the current version. Reusing
  `getLatestReleaseFromGitHub()` there — and filtering `draft` and `prerelease`
  — makes the two paths agree.
