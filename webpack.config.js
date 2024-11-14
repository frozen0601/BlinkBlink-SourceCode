require('dotenv').config();
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const mode = process.env.NODE_ENV || 'development';

const commonConfig = {
    module: {
        rules: [{ test: /\.ts$/, include: /src/, use: [{ loader: 'ts-loader' }] }],
    },
    resolve: { extensions: ['.ts', '.js'] },
    mode,
};

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
};

const rendererConfig = {
    ...commonConfig,
    entry: {
        unified: './src/renderer/unified.ts'  // We only need unified now
    },
    target: 'electron-renderer',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'unified.js',
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/renderer/unified.html', to: 'unified.html' },
                { from: 'src/renderer/styles/overlay.css', to: 'overlay.css' },
                { from: 'src/renderer/styles/dashboard.css', to: 'dashboard.css' },
                { from: 'src/renderer/styles/unified.css', to: 'unified.css' },
                { from: 'assets/icon.png', to: 'icon.png' },
                { from: 'assets/rolling_eyes.gif', to: 'rolling_eyes.gif' },
            ],
        }),
    ],
};

module.exports = [mainConfig, rendererConfig];
