require('dotenv').config()
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

const mode = process.env.NODE_ENV || 'development'

const commonConfig = {
    module: {
        rules: [{ test: /\.ts$/, include: /src/, use: [{ loader: 'ts-loader' }] }],
    },
    resolve: { extensions: ['.ts', '.js'] },
    mode,
}

const mainConfig = {
    ...commonConfig,
    entry: './src/main/main.ts',
    target: 'electron-main',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.js',
    },
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

const rendererConfig = {
    ...commonConfig,
    entry: {
        overlay: './src/renderer/overlay.ts',
    },
    target: 'electron-renderer',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'overlay.js',
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/renderer/styles/shared.css', to: 'shared.css' },
                { from: 'src/renderer/overlay.html', to: 'overlay.html' },
                { from: 'src/renderer/styles/overlay.css', to: 'overlay.css' },
                { from: 'src/renderer/settings.html', to: 'settings.html' },
                { from: 'src/renderer/styles/settings.css', to: 'settings.css' },
                { from: 'src/renderer/about.html', to: 'about.html' },
                { from: 'src/renderer/styles/about.css', to: 'about.css' },
                { from: 'src/renderer/stats.html', to: 'stats.html' },
                { from: 'src/renderer/styles/stats.css', to: 'stats.css' },
                { from: 'src/renderer/progress.html', to: 'progress.html' },
                { from: 'src/renderer/tutorial.html', to: 'tutorial.html' },
                { from: 'src/renderer/styles/tutorial.css', to: 'tutorial.css' },
                { from: 'src/renderer/tutorial.js', to: 'tutorial.js' },
                { from: 'assets/icon.png', to: 'icon.png' },
                { from: 'assets/screenshots/tray_dark_windows.png', to: 'tray_dark_windows.png' },
                { from: 'assets/screenshots/tray_light_windows.png', to: 'tray_light_windows.png' },
                { from: 'assets/screenshots/tray_dark_mac.png', to: 'tray_dark_mac.png' },
                { from: 'assets/screenshots/tray_light_mac.png', to: 'tray_light_mac.png' },
                { from: 'assets/rolling_eyes.gif', to: 'rolling_eyes.gif' },
            ],
        }),
    ],
}

const preloadConfig = {
    ...commonConfig,
    entry: './src/main/preload.ts',
    target: 'electron-preload',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'preload.js',
    },
}

module.exports = [mainConfig, preloadConfig, rendererConfig]
