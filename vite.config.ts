import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import replace from '@rollup/plugin-replace'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
    server: { open: '/demo/', port: 8000 },
    optimizeDeps: { exclude: ['echarts', 'tinycolor2'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [replace({ versionplaceholder: pkg.version, preventAssignment: true })],
    build: {
        lib: { entry: 'src/widget-linechart.ts', formats: ['es'], fileName: 'widget-linechart' },
        sourcemap: true,
        rollupOptions: {
            external: [/^echarts/, 'tinycolor2'],
            output: { banner: '/* @license Copyright (c) 2026 Record Evolution GmbH. All rights reserved.*/' }
        }
    }
})
