const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
    entry: './src/main.ts',
    target: 'electron-main',
    module: {
        rules: [
            {
                test: /\.ts$/,
                include: /src/,
                use: [{ loader: 'ts-loader' }],
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.js',
    },
    mode: 'development',
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/overlay.html', to: 'overlay.html' },
                { from: 'src/stats.html', to: 'stats.html' },
                { from: 'src/settings.html', to: 'settings.html' },
                { from: 'src/icon.png', to: 'icon.png' },
                // { from: 'src/icon_alert.png', to: 'icon_alert.png' },
                // Add other assets if necessary
            ],
        }),
    ],
}
