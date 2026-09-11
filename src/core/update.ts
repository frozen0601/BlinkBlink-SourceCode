/**
 * Choosing which release asset to offer.
 *
 * Pure so it can be tested: the update path is the one part of the app that
 * cannot be exercised by running it, since it needs a newer release to exist.
 */

export interface ReleaseAsset {
    name: string
    browser_download_url: string
}

export interface ReleaseSummary {
    tag_name: string
    draft: boolean
    prerelease: boolean
    published_at: string
    assets: ReleaseAsset[]
}

/** Strips a leading `v` and any build metadata, returning `null` if unparseable. */
export function parseVersion(value: string): [number, number, number] | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim())
    if (!match) return null
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** True when `candidate` is a strictly higher version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
    const a = parseVersion(candidate)
    const b = parseVersion(current)
    if (!a || !b) return false

    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true
        if (a[i] < b[i]) return false
    }
    return false
}

/**
 * The newest published release.
 *
 * Sorted by version rather than publication date so that re-publishing an old
 * release cannot advertise it as an update, and drafts and prereleases are
 * excluded outright.
 */
export function pickLatestRelease(releases: ReleaseSummary[]): ReleaseSummary | null {
    const usable = releases
        .filter((release) => !release.draft && !release.prerelease && parseVersion(release.tag_name) !== null)
        .sort((a, b) => (isNewerVersion(a.tag_name, b.tag_name) ? -1 : 1))

    return usable[0] ?? null
}

/**
 * The architecture an update should be chosen for.
 *
 * `process.arch` reports the build that is running, not the machine. An x64
 * build on an Apple Silicon Mac runs under Rosetta and says `x64`, so taking it
 * at face value would hand that machine an x64 update, and the next one, for
 * ever — a permanent Rosetta trap entered by one wrong download. Electron's
 * `runningUnderARM64Translation` is the flag that gets someone back out.
 */
export function updateArch(processArch: string, underArm64Translation: boolean): string {
    return underArm64Translation ? 'arm64' : processArch
}

/**
 * The asset matching this machine's architecture.
 *
 * macOS releases carry both an Intel and an Apple Silicon build, and handing
 * over the wrong one means either an app that will not launch at all (arm64 on
 * Intel) or a needless trip through Rosetta. Releases published before the
 * architecture appeared in filenames have a single unsuffixed asset, which is
 * the second choice here.
 */
export function pickAssetForArch(assets: ReleaseAsset[], extension: string, arch: string): ReleaseAsset | null {
    const candidates = assets.filter((asset) => asset.name.toLowerCase().endsWith(extension.toLowerCase()))
    if (candidates.length === 0) return null

    const exact = candidates.find((asset) => new RegExp(`[-_.]${arch}\\b`, 'i').test(asset.name))
    if (exact) return exact

    const unsuffixed = candidates.find((asset) => !/[-_.](arm64|x64|x86_64|amd64|aarch64)\b/i.test(asset.name))
    return unsuffixed ?? candidates[0]
}
