# Copilot Instructions for widget-linechart

## Architecture Overview

IronFlock widget: Lit 3.x web component rendering ECharts line/bar/scatter charts with time series support. Part of a multi-widget ecosystem (`widget-*` repos) sharing identical patterns.

**Key files:**

- `src/widget-linechart.ts` - Main LitElement component
- `src/definition-schema.json` - JSON Schema → auto-generates dashboard forms
- `src/definition-schema.d.ts` - Generated types (never edit manually)
- `demo/index.html` - Dev harness with auto-randomizing test data

## Critical: Version-Tagged Custom Elements

Source uses `versionplaceholder` replaced at build time via `@rollup/plugin-replace` in `vite.config.ts`:

```typescript
@customElement('widget-linechart-versionplaceholder')  // Becomes: widget-linechart-1.6.24
```

**Never hardcode versions** - the demo imports `package.json` to construct the tag dynamically.

## Schema-Driven Development

The dashboard auto-generates config UI from `definition-schema.json`. Custom extensions:

- `"type": "color"` → color picker
- `"order": N` → field ordering
- `"dataDrivenDisabled": true` → field cannot be data-bound from IoT sources
- `"condition"` → conditional field visibility

**Workflow:** Edit schema → `npm run types` → import generated types in component.

## Component API (universal across all widgets)

```typescript
@property({ type: Object }) inputData?: InputData  // From schema
@property({ type: Object }) theme?: { theme_name: string, theme_object: any }
```

Theme files in `demo/themes/` for testing.

## ECharts: Modular Imports Required

Always use tree-shaken imports. This widget uses multiple chart types:

```typescript
import * as echarts from 'echarts/core'
import { LineChart, BarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([GridComponent, LineChart, BarChart, ScatterChart, CanvasRenderer, ...])
```

## Linechart-Specific Features

- **Chart types:** `line`, `bar`, `scatter` (controlled via `dataseries[].type`)
- **Time series:** Set `axis.timeseries: true` for proper date x-axis parsing
- **Multi-chart:** Use `advanced.chartName` to group series into separate charts; `#split#` in name auto-creates per-pivot charts
- **Draw order:** `advanced.drawOrder` controls z-index layering within a chart
- **Pivot/Split:** `data[].pivot` auto-generates series per distinct value (e.g., one line per city)
- **tinycolor2:** Used for color manipulation (lighten/darken theme colors)

## Commands

| Command           | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `npm run start`   | Dev server at localhost:8000/demo/                      |
| `npm run build`   | Production build to dist/                               |
| `npm run types`   | Regenerate types from schema (run after schema changes) |
| `npm run release` | Build → bump patch → git push → tag                     |
| `npm run link`    | Link to local RESWARM/frontend for integration testing  |

## Build Config Notes (vite.config.ts)

- `process.env.NODE_ENV` must be `'production'` for ECharts optimization
- `tslib` alias needed: `tslib: 'tslib/tslib.es6.js'`
- Additional dep: `tinycolor2` for color utilities

## Platform Registration (post-release)

```sql
select swarm.f_update_widget_master('{"package_name": "widget-linechart", "version": "X.Y.Z"}'::jsonb);
```

## Testing Tips

In `demo/index.html`, modify `keyPathsToRandomize` array to auto-test specific data paths every second.
Example paths: `'dataseries.0.data.2.y'`, `'title'`
