# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command           | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `npm start`       | Vite dev server at http://localhost:8000/demo/ (build-watch + serve) |
| `npm run build`   | Production library build to `dist/`                                  |
| `npm run watch`   | `vite build --watch` only                                            |
| `npm run types`   | Regenerate `src/definition-schema.d.ts` from `definition-schema.json` (run after every schema change; never edit the `.d.ts` manually) |
| `npm run analyze` | Run custom-elements-manifest analyzer (LitElement)                   |
| `npm run link`    | Build, `npm link`, then link into `../RESWARM/frontend` for integration testing |
| `npm run unlink`  | Reverse of `link` and reinstall the published package                |
| `npm run release` | `build` → `types` → `npm version patch` (no `v` prefix) → push branch + tag → rebuild |

No test runner, no linter is configured. Node `>=24.9.0`, npm `>=10.0.2`.

## Architecture

This is one widget in the IronFlock multi-widget ecosystem (`widget-*` repos that share the same patterns). It is a Lit 3.x web component that renders ECharts line/bar/scatter charts and is consumed by the IronFlock dashboard.

### Entry point and version-tagged custom elements

`src/widget-linechart.ts` defines the single `LitElement` exported by the package. Its tag is registered with the literal string `versionplaceholder`:

```ts
@customElement('widget-linechart-versionplaceholder')
```

`vite.config.ts` runs `@rollup/plugin-replace` to substitute `versionplaceholder` with the current `package.json` version at build time, producing tags like `widget-linechart-1.6.32`. This lets multiple versions of the widget coexist on a dashboard. Never hardcode the version anywhere; `demo/index.html` reads `package.json` to construct the tag dynamically.

### Schema-driven configuration

The IronFlock dashboard auto-generates the widget's configuration UI from `src/definition-schema.json`. The flow is:

1. Edit `definition-schema.json` (custom keywords beyond JSON Schema: `"type": "color"` for color pickers, `"order": N` for field ordering, `"dataDrivenDisabled": true` to forbid IoT data binding, `"condition"` for conditional visibility).
2. Run `npm run types` to regenerate `src/definition-schema.d.ts`.
3. Import the generated `InputData` type in `widget-linechart.ts`.

### Component API (universal across all widget-* repos)

```ts
@property({ type: Object }) inputData?: InputData                              // shape from schema
@property({ type: Object }) theme?: { theme_name: string; theme_object: any }  // ECharts theme
@property({ type: Object }) timeRange?: { start: number; end: number }
```

Themes for local testing live in `demo/themes/`.

### ECharts integration

This widget always uses tree-shaken ECharts imports and registers them via `echarts.use([...])` at module top-level. Charts used: `LineChart`, `BarChart`, `ScatterChart`. Required components: `Grid`, `Title`, `Toolbox`, `Tooltip`, `Legend`, `DataZoom`. Renderer: `CanvasRenderer`. Features: `UniversalTransition`, `LegacyGridContainLabel`. `tinycolor2` is used for theme color manipulation (lighten/darken).

Internal state holds a `Map<chartName, { echart, series, ... }>` so a single component instance can manage multiple ECharts instances side by side (see "Multi-chart" below).

### Build pipeline (`vite.config.ts`)

- Library build: ES module, entry `src/widget-linechart.ts`, output `dist/widget-linechart.js`.
- `echarts` (regex `/^echarts/`) and `tinycolor2` are marked `external` and listed as `peerDependencies`. Consumers must install them; bundle is ~36KB instead of ~625KB.
- `process.env.NODE_ENV` is statically defined as `'production'` (required for ECharts optimization paths).
- `tslib` aliased to `tslib/tslib.es6.js` so the externalized output uses the ESM build.
- `optimizeDeps.exclude` lists the externals so Vite's dev server doesn't try to pre-bundle them.

CDN/import-map consumers must polyfill `window.process = { env: { NODE_ENV: 'production' } }` before loading ECharts (see README). echarts 6.0.0 must pair with zrender 6.0.0 exactly.

### Linechart-specific data features

- `dataseries[].type`: `line` | `bar` | `scatter`.
- `axis.timeseries: true` switches the x-axis to date parsing.
- `advanced.chartName` groups series into separate ECharts instances; the literal `#split#` in the name auto-creates one chart per pivot value.
- `data[].pivot` auto-generates one series per distinct pivot value (e.g. one line per city).
- `advanced.drawOrder` controls z-index layering within a chart.
- Performance: data-only updates use `setOption()` merge mode; full rebuilds happen only when a config fingerprint changes; resizing is driven by `ResizeObserver`; animation duration adapts to observed update interval.

## Demo / dev harness

`demo/index.html` is the only test harness. It contains a `keyPathsToRandomize` array used to mutate specific data paths every second (e.g. `'dataseries.0.data.2.y'`) — handy for verifying live updates and animation behavior.

## Platform registration after release

After `npm run release` publishes a new version, register it on the platform with:

```sql
select swarm.f_update_widget_master('{"package_name": "widget-linechart", "version": "X.Y.Z"}'::jsonb);
```
