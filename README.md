# \<widget-linechart>

This webcomponent follows the [open-wc](https://github.com/open-wc/open-wc) recommendation.

## Installation

```bash
npm i @record-evolution/widget-linechart
```

## Usage

### Bundled Application (Vite/Webpack)

When using a bundler, install the widget and its peer dependencies:

```bash
npm i @record-evolution/widget-linechart echarts@^6.0.0 tinycolor2@^1.6.0
```

Then import and use:

```html
<script type="module">
    import '@record-evolution/widget-linechart/widget-linechart.js'
</script>

<widget-linechart-1.6.27></widget-linechart-1.6.27>
```

The bundler will automatically deduplicate echarts across multiple widgets.

### CDN / Import Maps

For CDN usage without a bundler, configure an import map with all dependencies:

```html
<script>
    // Polyfill for Node.js process.env required by echarts
    window.process = { env: { NODE_ENV: 'production' } };
</script>

<script type="importmap">
    {
        "imports": {
            "echarts/core": "https://cdn.jsdelivr.net/npm/echarts@6.0.0/core.js",
            "echarts/charts": "https://cdn.jsdelivr.net/npm/echarts@6.0.0/charts.js",
            "echarts/components": "https://cdn.jsdelivr.net/npm/echarts@6.0.0/components.js",
            "echarts/renderers": "https://cdn.jsdelivr.net/npm/echarts@6.0.0/renderers.js",
            "echarts/features": "https://cdn.jsdelivr.net/npm/echarts@6.0.0/features.js",
            "zrender/": "https://cdn.jsdelivr.net/npm/zrender@6.0.0/",
            "tslib": "https://cdn.jsdelivr.net/npm/tslib@2.8.1/tslib.es6.mjs",
            "tinycolor2": "https://cdn.jsdelivr.net/npm/tinycolor2@1.6.0/+esm"
        }
    }
</script>

<script
    type="module"
    src="https://cdn.jsdelivr.net/npm/@record-evolution/widget-linechart@1.6.27/dist/widget-linechart.js"
></script>

<widget-linechart-1.6.27></widget-linechart-1.6.27>
```

**Note:** Version matching is critical - echarts 6.0.0 requires zrender 6.0.0 exactly.

## Dependencies

This widget has been optimized to externalize heavy dependencies:

- **echarts** (^6.0.0) - Chart rendering engine (~300KB)
- **tinycolor2** (^1.6.0) - Color manipulation utilities

Bundle size: ~36KB (down from 625KB with bundled echarts)

## Expected data format

Please take a look at the src/default-data.json to see what data is expected to make the widget show content.

## Features

- **Chart types:** line, bar, scatter (via `dataseries[].type`)
- **Time series:** Set `axis.timeseries: true` for date-based x-axis
- **Multi-chart:** Use `advanced.chartName` to split series into separate charts
- **Pivot/Split:** `data[].pivot` auto-generates series per distinct value
- **Adaptive animation:** Animation duration automatically matches data update frequency for smooth continuous transitions
- **Dynamic theming:** Supports ECharts theme objects

## Performance Optimizations

- Efficient data-only updates using `setOption()` merge mode
- Full rebuild only on configuration changes (detected via config fingerprinting)
- ResizeObserver-based chart resizing (no polling)
- Adaptive animation timing based on actual update intervals

## Tooling configs

For most of the tools, the configuration is in the `package.json` to reduce the amount of files in your project.

## Local Demo with Vite

```bash
npm start
```

To run a local development server that serves the basic demo at http://localhost:8000/demo/
