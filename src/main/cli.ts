/**
 * Command-line flags.
 *
 * Because a second launch is handed to the already-running instance, these
 * double as a remote control: binding `blinkblink --take-break` to a desktop
 * shortcut starts a break in the running app rather than launching a second
 * copy of it.
 */

export interface CliIntent {
    /** Start a break immediately. */
    takeBreak: boolean
    /** Open the settings window. */
    openSettings: boolean
    /** Open the statistics window. */
    openStats: boolean
    /** Start without showing anything — used by the autostart entry. */
    hidden: boolean
    /** A disk image to install over this bundle, for rehearsing the macOS update. */
    tryInstall: string | null
}

/** Reads `--try-install <path>` or `--try-install=<path>`. */
function readTryInstall(argv: readonly string[]): string | null {
    const index = argv.findIndex((argument) => argument === '--try-install' || argument.startsWith('--try-install='))
    if (index === -1) return null

    const inline = argv[index].split('=').slice(1).join('=')
    if (inline) return inline

    const next = argv[index + 1]
    return next && !next.startsWith('--') ? next : null
}

export function parseArgv(argv: readonly string[]): CliIntent {
    const flags = new Set(argv.map((argument) => argument.toLowerCase()))
    return {
        takeBreak: flags.has('--take-break'),
        openSettings: flags.has('--settings'),
        openStats: flags.has('--stats'),
        hidden: flags.has('--hidden'),
        tryInstall: readTryInstall(argv),
    }
}

export const CLI_HELP = `BlinkBlink — Healthy Eyes, Happy Life

Usage: blinkblink [options]

  --take-break   Start a break now (in the already-running instance, if any)
  --settings     Open the settings window
  --stats        Open the statistics window
  --hidden       Start in the background without opening any window
  --help         Show this message

  --try-install <file.dmg>
                 macOS only. Runs the real in-place update against this app,
                 using the given disk image, and prints what happened. Quit
                 BlinkBlink first, then run it from the installed bundle:

                   /Applications/BlinkBlink.app/Contents/MacOS/BlinkBlink \\
                     --try-install ~/Downloads/BlinkBlink-<newer>-arm64.dmg

                 This is the only faithful rehearsal: macOS decides whether an
                 app may replace its own bundle from the identity of the process
                 asking, so a shell script testing the same commands is testing
                 the terminal's permissions, not BlinkBlink's.
`
