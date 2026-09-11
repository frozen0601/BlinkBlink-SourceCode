import { _electron as electron, ElectronApplication, Page } from 'playwright'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { DEFAULT_SETTINGS } from '../../src/core/settings'
import { Settings } from '../../src/core/types'

export interface LaunchOptions {
    /** Extra command-line arguments passed after the app path. */
    args?: string[]
    /** Settings to seed into a fresh store before the app starts. */
    settings?: Partial<Settings>
    /**
     * Anything else to seed into the store — the break history, the streak
     * counters, the version marker. Merged over the defaults written below.
     */
    store?: Record<string, unknown>
    /**
     * A built executable to run instead of the source tree.
     *
     * Set by the packaged smoke test: only a real package exercises the asar
     * layout and `process.resourcesPath`, where the bundled sounds live.
     */
    executablePath?: string
}

export interface LaunchedApp {
    app: ElectronApplication
    /** Everything the main process wrote to stdout/stderr. */
    output: () => string
    close: () => Promise<void>
}

const projectRoot = path.resolve(__dirname, '..', '..')

/**
 * Launches the app against a throwaway config directory.
 *
 * `XDG_CONFIG_HOME` decides where Electron puts `userData` on Linux, so
 * pointing it at a temporary directory both isolates the test from the
 * developer's real settings and lets the store be seeded up front.
 */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'blinkblink-e2e-'))
    const userData = path.join(configHome, 'blinkblink')
    fs.mkdirSync(userData, { recursive: true })

    fs.writeFileSync(
        path.join(userData, 'config.json'),
        JSON.stringify({
            schemaVersion: 3,
            settings: { ...DEFAULT_SETTINGS, ...options.settings },
            // Skip the first-run walkthrough; it is exercised separately.
            hasCompletedFirstRun: true,
            ...options.store,
        }),
        'utf-8'
    )

    const chunks: string[] = []

    const app = await electron.launch({
        ...(options.executablePath
            ? { executablePath: options.executablePath, args: options.args ?? [] }
            : { args: [projectRoot, ...(options.args ?? [])] }),
        cwd: projectRoot,
        env: {
            ...process.env,
            XDG_CONFIG_HOME: configHome,
            // Keeps DevTools out of the way of window-count assertions.
            BLINKBLINK_NO_DEVTOOLS: '1',
        },
    })

    app.process().stdout?.on('data', (data) => chunks.push(String(data)))
    app.process().stderr?.on('data', (data) => chunks.push(String(data)))

    return {
        app,
        output: () => chunks.join(''),
        close: async () => {
            await app.close().catch(() => undefined)
            fs.rmSync(configHome, { recursive: true, force: true })
        },
    }
}

/** Waits for a renderer window whose URL contains `fragment`. */
export async function waitForWindow(app: ElectronApplication, fragment: string, timeoutMs = 20_000): Promise<Page> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        for (const window of app.windows()) {
            if (window.url().includes(fragment)) {
                await window.waitForLoadState('domcontentloaded')
                return window
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }

    throw new Error(
        `Timed out waiting for a window matching "${fragment}". Open windows: ${app
            .windows()
            .map((w) => w.url())
            .join(', ')}`
    )
}

/** Parses a CSS colour into RGBA components. */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } {
    const match = /rgba?\(([^)]+)\)/.exec(value)
    if (!match) return { r: 0, g: 0, b: 0, a: 0 }
    const parts = match[1].split(',').map((part) => Number(part.trim()))
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
}
