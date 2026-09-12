/**
 * Deciding whether — and how — to restart the app onto X11.
 *
 * Electron 38 selects its Wayland backend the moment `WAYLAND_DISPLAY` is set:
 * no flag, no hint, and `ELECTRON_OZONE_PLATFORM_HINT` is ignored. Wayland has
 * no override-redirect and no protocol for staying out of a task switcher, so
 * the break overlay is listed in alt-tab there whatever it asks for. The only
 * thing that moves it is `--ozone-platform=x11` on the process command line,
 * and the backend is read before the main script runs — so the app has to
 * re-execute itself.
 *
 * The first attempt at that shipped and killed every AppImage with SIGBUS. This
 * module is the reason why, written down as code: an AppImage mounts its
 * squashfs over FUSE and points half a dozen environment variables into
 * `/tmp/.mount_*`. Handing that environment to a child and then exiting pulls
 * the mount out from under the child's dynamic loader.
 */

/** Variables an AppImage injects that only make sense inside its own mount. */
const APPIMAGE_ONLY = ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD'] as const

/**
 * Variables holding `:`-separated paths that an AppImage prepends its mount to.
 *
 * Anything here is filtered entry by entry rather than dropped: the rest of the
 * value is the system's own, and the child still needs it.
 */
const PATH_LISTS = [
    'LD_LIBRARY_PATH',
    'PATH',
    'XDG_DATA_DIRS',
    'XDG_CONFIG_DIRS',
    'PYTHONPATH',
    'PYTHONHOME',
    'PERLLIB',
    'GSETTINGS_SCHEMA_DIR',
    'QT_PLUGIN_PATH',
    'GST_PLUGIN_SYSTEM_PATH',
    'GST_PLUGIN_PATH',
    'LD_PRELOAD',
] as const

/** Set on the child so a relaunch can never happen twice, whatever else fails. */
export const RELAUNCH_MARKER = 'BLINKBLINK_X11_RELAUNCH'

export interface RelaunchFacts {
    platform: string
    /** `WAYLAND_DISPLAY` — Electron picks its Wayland backend when this is set. */
    waylandDisplay?: string
    /** `DISPLAY` — there is an X server, or XWayland, to land on. */
    display?: string
    /** `ELECTRON_OZONE_PLATFORM_HINT`, if set. */
    ozoneHint?: string
    /** The process arguments, to spot a backend that was asked for explicitly. */
    argv: readonly string[]
    /** The marker from a previous relaunch, if this process is already the child. */
    marker?: string
}

/**
 * Whether this process should hand over to one running on X11.
 *
 * Every condition is a reason not to, and two of them independently prevent a
 * loop: the child's command line carries `--ozone-platform=x11`, and its
 * environment carries the marker. Either alone is enough.
 */
export function shouldRelaunchOntoX11(facts: RelaunchFacts): boolean {
    if (facts.platform !== 'linux') return false
    // Already the relaunched process.
    if (facts.marker) return false
    // Already on X11; nothing to move.
    if (!facts.waylandDisplay) return false
    // No XWayland to land on. Forcing the backend here would mean an app that
    // does not start at all, which is worse than one listed in alt-tab.
    if (!facts.display) return false
    // Someone asked for a backend. Respect it — this is the way back to Wayland.
    if (facts.ozoneHint) return false
    if (facts.argv.some((argument) => argument.startsWith('--ozone-platform'))) return false
    return true
}

/**
 * Where every AppImage mount point is created, whatever its random suffix.
 *
 * A filename prefix rather than a directory, which is why it is matched
 * differently from `$APPDIR` below.
 */
const MOUNT_PREFIX = '/tmp/.mount_'

function isInsideMount(entry: string, appDir?: string): boolean {
    if (entry.startsWith(MOUNT_PREFIX)) return true
    if (!appDir) return false
    // A directory prefix: `/opt/app` must not swallow `/opt/app-other`.
    return entry === appDir || entry.startsWith(`${appDir}/`)
}

/** Removes every `:`-separated entry that points inside the AppImage mount. */
function withoutMountEntries(value: string, appDir?: string): string {
    return value
        .split(':')
        .filter((entry) => entry !== '' && !isInsideMount(entry, appDir))
        .join(':')
}

/**
 * The environment to give the replacement process.
 *
 * Everything pointing inside the AppImage mount is removed, because the parent
 * unmounts it on the way out and a child still referencing it dies in the
 * loader with SIGBUS — which is exactly what happened the first time this was
 * tried. The child's own AppImage runtime rebuilds all of it against its own
 * fresh mount, so taking these away costs nothing.
 *
 * `appDir` is `$APPDIR`; `/tmp/.mount_` catches a stale mount from an earlier
 * run that the current environment still mentions.
 */
export function childEnvironment(env: Readonly<Record<string, string | undefined>>, appDir?: string): Record<string, string> {
    const result: Record<string, string> = {}

    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) continue
        if ((APPIMAGE_ONLY as readonly string[]).includes(key)) continue

        if ((PATH_LISTS as readonly string[]).includes(key)) {
            const cleaned = withoutMountEntries(value, appDir)
            // An emptied variable is dropped rather than set to "", which some
            // loaders read as "the current directory".
            if (cleaned) result[key] = cleaned
            continue
        }

        result[key] = value
    }

    result[RELAUNCH_MARKER] = '1'
    return result
}

/** The command line for the replacement: this process's, plus the backend. */
export function childArguments(argv: readonly string[]): string[] {
    return [...argv.slice(1), '--ozone-platform=x11']
}
