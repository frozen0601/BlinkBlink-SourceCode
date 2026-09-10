const path = require('path')
const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')

/**
 * Whether this build was produced with real macOS signing credentials.
 *
 * Baked in at build time because the app has to know at *runtime*, on the
 * user's machine, whether it may promise a notification action button — and an
 * environment variable set on a CI runner is long gone by then. The release
 * workflow sets this only when a signing certificate was actually supplied.
 */
const isSignedBuild = process.env.BLINKBLINK_SIGNED === '1'

/**
 * Runtime dependencies are required from `node_modules` rather than bundled.
 *
 * Two reasons. Bundling duplicated every dependency — once inside `main.js` and
 * again in the asar, which ships `node_modules` regardless. And `ajv`, reached
 * through electron-store, builds `require()` paths at runtime that webpack
 * cannot see statically; leaving these external means such requires resolve
 * normally instead of against a bundle that never contained them.
 */
const runtimeExternals = Object.fromEntries(
    Object.keys(require('./package.json').dependencies ?? {}).map((name) => [name, `commonjs ${name}`])
)

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
const isProduction = mode === 'production'

const commonConfig = {
    mode,
    // Source maps in development only: a production `.map` would ship the full
    // TypeScript source inside the installer for no benefit.
    devtool: isProduction ? false : 'source-map',
    module: {
        rules: [{ test: /\.ts$/, include: path.resolve(__dirname, 'src'), use: [{ loader: 'ts-loader' }] }],
    },
    resolve: { extensions: ['.ts', '.js'] },
    stats: 'minimal',
    // These budgets are aimed at pages served over a network. Everything here
    // is loaded from local disk, and the only thing over the limit is an icon.
    performance: { hints: false },
}

/** Static assets the renderer loads at runtime, copied next to the bundles. */
const rendererAssets = [
    { from: 'src/renderer/overlay.html', to: 'overlay.html' },
    { from: 'src/renderer/settings.html', to: 'settings.html' },
    { from: 'src/renderer/about.html', to: 'about.html' },
    { from: 'src/renderer/stats.html', to: 'stats.html' },
    { from: 'src/renderer/progress.html', to: 'progress.html' },
    { from: 'src/renderer/tutorial.html', to: 'tutorial.html' },
    { from: 'src/renderer/reminder.html', to: 'reminder.html' },
    { from: 'src/renderer/tutorial.js', to: 'tutorial.js' },
    { from: 'src/renderer/styles', to: '.' },
    { from: 'assets/icon.png', to: 'icon.png' },
    { from: 'assets/rolling_eyes.gif', to: 'rolling_eyes.gif' },
    { from: 'assets/screenshots/tray_dark_windows.png', to: 'tray_dark_windows.png' },
    { from: 'assets/screenshots/tray_light_windows.png', to: 'tray_light_windows.png' },
    { from: 'assets/screenshots/tray_dark_mac.png', to: 'tray_dark_mac.png' },
    { from: 'assets/screenshots/tray_light_mac.png', to: 'tray_light_mac.png' },
]

const mainConfig = {
    ...commonConfig,
    name: 'main',
    entry: { main: './src/main/main.ts' },
    target: 'electron-main',
    externals: runtimeExternals,
    output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.BLINKBLINK_SIGNED': JSON.stringify(isSignedBuild ? '1' : '0'),
            // Not a secret — it ships inside every binary — but it still has to
            // reach the build. Absent, the app sends no telemetry at all, which
            // is what local builds and forks get.
            'process.env.APTABASE_API_KEY': JSON.stringify(process.env.APTABASE_API_KEY ?? ''),
        }),
        new CopyPlugin({
            patterns: [
                { from: 'assets/icon.png', to: 'icon.png' },
                { from: 'assets/icon.ico', to: 'icon.ico' },
                { from: 'assets/icon.icns', to: 'icon.icns' },
            ],
        }),
    ],
}

const preloadConfig = {
    ...commonConfig,
    name: 'preload',
    entry: { preload: './src/main/preload.ts' },
    target: 'electron-preload',
    output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
}

const rendererConfig = {
    ...commonConfig,
    name: 'renderer',
    entry: {
        overlay: './src/renderer/overlay.ts',
        settings: './src/renderer/settings.ts',
        stats: './src/renderer/stats.ts',
        about: './src/renderer/about.ts',
        progress: './src/renderer/progress.ts',
        reminder: './src/renderer/reminder.ts',
    },
    // Renderers run sandboxed with context isolation, so they get no Node
    // globals; building for the web target keeps webpack from emitting any.
    target: 'web',
    output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
    plugins: [new CopyPlugin({ patterns: rendererAssets })],
}

module.exports = [mainConfig, preloadConfig, rendererConfig]
