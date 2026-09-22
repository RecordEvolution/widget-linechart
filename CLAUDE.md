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
| `npm run release` | `npm version patch`: preflight guards (on `main`, clean tree, not behind `origin/main`, generated files current, build passes) → commit + bare-semver tag → `git push --follow-tags` → waits on the CI publish. Also `release:minor` / `release:major`. |

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
3. Import the generated root type in `widget-linechart.ts`. Its name is derived from the schema's root `title` — `"Chart Configuration"` yields `ChartConfiguration` — so renaming the root title renames the exported interface.

#### `aiSelection` — widget-catalog routing hints

The schema root carries an `aiSelection` block. It is *not* JSON Schema and describes no config field; it exists so the IronFlock AI's Widget Builder can pick the right widget for a given shape of data, using knowledge only the widget author has. It is inert everywhere else: `json2ts` ignores it (the generated `.d.ts` is byte-identical with and without it), the dashboard config editor renders only `schema.properties`, and the AI service's `validate_widget` validates configs against the schema — unknown Draft-7 keywords are skipped.

```jsonc
"aiSelection": {
  "dataShape": "…what columns this widget consumes and what each one means…",
  "useWhen":   ["…a situation, naming the properties that express it…"],
  "notFor":    ["…a situation this widget is wrong for, naming the widget to use instead…"]
}
```

Rules of thumb when maintaining it:

- `notFor` is the high-value half and the part plain descriptions always omit. Every entry should name the widget that *should* be used, otherwise it rejects without routing.
- Write for an LLM that has no other documentation: describe the visible result and the user's intent, not the implementation.
- Prefer entries that discriminate against a *neighbouring* widget. "Not for free text" is cheap; "state durations over time belong in widget-statehistory, not a bar chart" is what prevents a wrong pick.
- Keep it in sync when a property changes what the chart can do — `axis.orientation` and `dataseries[].type` are both referenced from `useWhen`.

### Component API (universal across all widget-* repos)

```ts
@property({ type: Object }) inputData?: ChartConfiguration                     // shape from schema
@property({ type: Object }) theme?: { theme_name: string; theme_object: any }  // ECharts theme

Theming: `registerTheme()` resolves colours as a `var(--re-text-color, <theme value>)` / `var(--re-tile-background-color, <theme value>)` chain rather than reading the host's custom properties through `getComputedStyle`. The host property still wins over `theme_object`, but nothing is snapshotted, so a board style edit repaints the tile live. ECharts cannot resolve a `var()` chain (it paints to a canvas), so the few canvas colours go through `resolvedTextColor()`, which reads the property at the point of use.

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
- `axis.orientation`: `vertical` (default) | `horizontal`. Horizontal swaps which option key holds the category axis and which holds the two-entry value-axis array, inverts the category axis so the first point is on top, and stores data points as `[y, x, r]` instead of `[x, y, r]` (ECharts always maps tuple index 0 to the x axis). `axis.xAxisLabel`/`yAxisLabel` keep naming the x-value and y-value dimensions in both orientations. Changing it forces a `notMerge` rebuild via the config fingerprint.
- `axis.xAxisZoom` shows an ECharts slider `dataZoom`. The slider is ~30px thick and sits **outside** the grid's `containLabel` bookkeeping, so `applyData()` reserves `ZOOM_THICKNESS` of grid padding for it — at the bottom when vertical, on the right when horizontal — and anchors it to that edge. Without the reservation the slider is drawn over the plot, clipping the foot of every bar.
- `dataseries[].styling.showValueLabels` prints each point's y-value on the chart (`series.label`), positioned `top` when vertical and `right` when horizontal, rounded to two decimals to match the numeric axis labels.
- `advanced.chartName` groups series into separate ECharts instances; the literal `#split#` in the name auto-creates one chart per pivot value.
- `data[].pivot` auto-generates one series per distinct pivot value (e.g. one line per city).
- `advanced.drawOrder` controls z-index layering within a chart.
- Performance: data-only updates use `setOption()` merge mode; full rebuilds happen only when a config fingerprint changes; resizing is driven by `ResizeObserver`; animation duration adapts to observed update interval.

## Demo / dev harness

`demo/index.html` is the live-update harness; `demo/verify.html` renders a fixed grid of configurations (vertical/horizontal, with and without value labels, single and dual value axis) side by side for visual regression checks, and `demo/verify-zoom.html` covers zoom-slider placement (bar/line/horizontal, short and long legends). Neither is published — `package.json`'s `files` list covers only `dist`, `src` and the thumbnails.

`demo/index.html` It contains a `keyPathsToRandomize` array used to mutate specific data paths every second (e.g. `'dataseries.0.data.2.y'`) — handy for verifying live updates and animation behavior.

## Platform registration after release

After `npm run release` publishes a new version, register it on the platform with:

```sql
select swarm.f_update_widget_master('{"package_name": "widget-linechart", "version": "X.Y.Z"}'::jsonb);
```
