import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
    {
        ignores: ['dist/**', 'release/**', 'node_modules/**', 'coverage/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },
    {
        // Renderer scripts that run as plain <script> tags in the browser context.
        files: ['src/renderer/**/*.js'],
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                requestAnimationFrame: 'readonly',
                Audio: 'readonly',
                Event: 'readonly',
            },
        },
    },
    {
        files: ['tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // CommonJS build scripts, which webpack loads directly.
        files: ['*.mjs', '*.js', 'webpack.config.js'],
        languageOptions: {
            globals: {
                __dirname: 'readonly',
                require: 'readonly',
                module: 'writable',
                process: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    }
)
