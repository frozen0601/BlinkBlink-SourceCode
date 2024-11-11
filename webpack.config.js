// webpack.config.js

const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

const mainConfig = {
    entry: './src/main.ts',
    target: 'electron-main',
    module: {
        rules: [{ test: /\.ts$/, include: /src/, use: [{ loader: 'ts-loader' }] }],
    },
    resolve: { extensions: ['.ts', '.js'] },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.js',
    },
    mode: 'development',
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
    entry: './src/dashboard.ts',
    target: 'electron-renderer',
    module: {
        rules: [{ test: /\.ts$/, include: /src/, use: [{ loader: 'ts-loader' }] }],
    },
    resolve: { extensions: ['.ts', '.js'] },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'dashboard.js',
    },
    mode: 'development',
}

module.exports = [
    mainConfig,
    {
        ...rendererConfig,
        plugins: [
            new CopyPlugin({
                patterns: [
                    { from: 'src/overlay.html', to: 'overlay.html' },
                    { from: 'src/dashboard.html', to: 'dashboard.html' },
                    { from: 'src/settings.html', to: 'settings.html' },
                    { from: 'src/about.html', to: 'about.html' },
                    { from: 'src/styles/dashboard.css', to: 'dashboard.css' },
                    { from: 'src/styles/overlay.css', to: 'overlay.css' },
                    { from: 'src/styles/settings.css', to: 'settings.css' },
                    { from: 'src/styles/about.css', to: 'about.css' },
                    { from: 'src/styles/stats.css', to: 'stats.css' },
                    { from: 'src/stats.html', to: 'stats.html' },
                    { from: 'assets/icon.png', to: 'icon.png' },
                ],
            }),
        ],
    },
]
