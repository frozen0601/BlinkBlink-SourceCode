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
}

export function parseArgv(argv: readonly string[]): CliIntent {
    const flags = new Set(argv.map((argument) => argument.toLowerCase()))
    return {
        takeBreak: flags.has('--take-break'),
        openSettings: flags.has('--settings'),
        openStats: flags.has('--stats'),
        hidden: flags.has('--hidden'),
    }
}

export const CLI_HELP = `BlinkBlink — Healthy Eyes, Happy Life

Usage: blinkblink [options]

  --take-break   Start a break now (in the already-running instance, if any)
  --settings     Open the settings window
  --stats        Open the statistics window
  --hidden       Start in the background without opening any window
  --help         Show this message
`
