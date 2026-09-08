const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

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
    output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
    plugins: [
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
