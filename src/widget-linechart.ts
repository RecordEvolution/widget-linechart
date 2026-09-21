import { html, css, LitElement, PropertyValueMap } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'

import * as echarts from 'echarts/core'
import {
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    GridComponent
} from 'echarts/components'
import { LineChart, BarChart, ScatterChart } from 'echarts/charts'
import { UniversalTransition, LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import tinycolor, { ColorInput } from 'tinycolor2'

echarts.use([
    GridComponent,
    TitleComponent,
    ToolboxComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    LineChart,
    BarChart,
    ScatterChart,
    CanvasRenderer,
    UniversalTransition,
    LegacyGridContainLabel
])

import { ChartConfiguration } from './definition-schema'
import { EChartsOption, SeriesOption } from 'echarts'
import { TitleOption } from 'echarts/types/dist/shared'

type Theme = {
    theme_name: string
    theme_object: any
}

type SeriesOptionX = SeriesOption & {
    minDate?: number
    maxDate?: number
    drawOrder: number
    xAxisIndex?: number
    yAxisIndex?: number
    // Which value axis (0 = primary, 1 = secondary) this series belongs to,
    // independent of orientation. In a vertical chart the value axes are the
    // y axes (left/right), in a horizontal one they are the x axes (bottom/top),
    // so xAxisIndex/yAxisIndex alone cannot be read without knowing the
    // orientation — this field can.
    valueAxisIndex?: number
}
@customElement('widget-linechart-versionplaceholder')
export class WidgetLinechart extends LitElement {
    @property({ type: Object })
    inputData?: ChartConfiguration

    @property({ type: Object })
    theme?: Theme

    @property({ type: Object })
    timeRange?: { start: number; end: number }

    @state()
    private canvasList: Map<
        string,
        {
            echart?: echarts.ECharts
            series: SeriesOptionX[]
            doomed?: boolean
            element?: HTMLDivElement
            drawing: boolean
            lastUpdateTime?: number
            updateIntervals?: number[]
            lastMaxTimestamp?: number
            lastConfig?: string
        }
    > = new Map()

    @state() private themeBgColor?: string
    @state() private themeTitleColor?: string
    @state() private themeSubtitleColor?: string
    @query('.chart-container')
    chartContainer?: HTMLDivElement

    boxes?: HTMLDivElement[]
    origWidth: number = 0
    origHeight: number = 0
    template: EChartsOption
    modifier: number = 1
    version: string = 'versionplaceholder'
    resizeObserver?: ResizeObserver
    updateThresholdMs: number = 300
    private maxIntervalSamples: number = 3

    constructor() {
        super()

        this.template = {
            // ECharts paints the registered theme's own canvas `backgroundColor`
            // (chalk = `rgba(41,52,65,1)`) as an opaque slab over the wrapper's
            // background, so the tile shows the theme colour behind the chart and
            // the host's `--re-tile-background-color` everywhere else. Keeping the
            // canvas transparent lets the wrapper show through; it already falls
            // back to the theme's colour when nothing overrides it, so no theme
            // loses its background. Set here rather than filtered out of
            // registerTheme() — theme registration is global by name, so another
            // widget on the page can re-register the same theme with it.
            backgroundColor: 'transparent',
            title: {
                text: 'Temperature Change in the Coming Week',
                left: 'center',
                top: 0,
                textStyle: {
                    fontSize: 14
                }
            } as TitleOption,
            tooltip: {
                trigger: 'axis'
            },
            legend: {
                right: 0,
                top: 0
            },
            grid: {
                top: 30,
                bottom: 20,
                left: 20,
                right: 0,
                containLabel: true // ensures labels are not cut off
            },
            toolbox: {
                show: true,
                feature: {
                    // dataZoom: {
                    //     yAxisIndex: 'none'
                    // },
                    // dataView: { readOnly: false },
                    restore: {}
                    // saveAsImage: {}
                }
            },
            dataZoom: [
                {
                    show: false,
                    realtime: true
                    // start: 30,
                    // end: 70,
                    // No axis index here: which axis carries the zoomed
                    // dimension depends on the orientation, so applyData()
                    // names it on every build.
                }
            ],
            xAxis: {
                type: 'value', // value, time, log, category
                name: 'Time',
                nameGap: 27,
                nameLocation: 'middle',
                axisLine: {
                    lineStyle: {
                        width: undefined
                    }
                },
                axisLabel: {
                    fontSize: 14
                }
            },
            // index 0 = left (primary) axis, index 1 = right (secondary) axis.
            // Must stay function-free: the template is copied via structuredClone.
            yAxis: [
                {
                    type: 'value',
                    nameLocation: 'middle',
                    name: 'Temperature (°C)',
                    nameGap: 30,
                    position: 'left',
                    axisLabel: {
                        fontSize: 14
                    },
                    axisLine: {
                        lineStyle: {
                            width: undefined
                        }
                    },
                    scale: false
                },
                {
                    type: 'value',
                    position: 'right',
                    show: false,
                    name: '',
                    nameGap: 30,
                    axisLabel: {
                        fontSize: 14
                    },
                    axisLine: {
                        lineStyle: {
                            width: undefined
                        }
                    },
                    splitLine: {
                        show: false
                    },
                    scale: false
                }
            ],
            series: [
                {
                    name: 'Highest',
                    type: 'line',
                    symbolSize: 8,
                    lineStyle: {
                        width: 2,
                        type: 'solid',
                        color: 'green'
                    },
                    data: [10, 11, 13, 11, 12, 12, 9]
                } as SeriesOption,
                {
                    name: 'Lowest',
                    type: 'line',
                    symbolSize: 8,
                    lineStyle: {
                        width: 2,
                        type: 'solid'
                    },
                    data: [1, -2, 2, 5, 3, 2, 0]
                } as SeriesOption
            ]
        } as EChartsOption
    }

    update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (changedProperties.has('inputData')) {
            this.cachedXAxisType = undefined
            this.cachedYAxisType = undefined
        }
        if (changedProperties.has('inputData') && this.chartContainer) {
            // const drawingStates = Array.from(this.canvasList).map(([key, chart]) => chart.drawing)
            // if (drawingStates.every((d) => !d)) {
            this.transformData()
            this.applyData()
            // } else {
            //     console.log('skipping linechart draw')
            // }
        }

        if (changedProperties.has('theme')) {
            this.registerTheme(this.theme)
            this.deleteCharts()
            this.transformData()
            this.applyData()
        }
        super.update(changedProperties)
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.registerTheme(this.theme)
        this.transformData()
        this.applyData()
        // Add ResizeObserver for chart container
        if (this.chartContainer) {
            this.resizeObserver = new ResizeObserver(() => {
                this.canvasList.forEach((chart) => {
                    chart.echart?.resize()
                })
            })
            this.resizeObserver.observe(this.chartContainer)
        }
    }

    registerTheme(theme?: Theme) {
        const cssTextColor = getComputedStyle(this).getPropertyValue('--re-text-color').trim()
        const cssBgColor = getComputedStyle(this).getPropertyValue('--re-tile-background-color').trim()
        this.themeBgColor = cssBgColor || this.theme?.theme_object?.backgroundColor
        this.themeTitleColor = cssTextColor || this.theme?.theme_object?.title?.textStyle?.color
        this.themeSubtitleColor =
            cssTextColor || this.theme?.theme_object?.title?.subtextStyle?.color || this.themeTitleColor

        if (!theme || !theme.theme_object || !theme.theme_name) return

        // Filter out component keys that would trigger warnings about unregistered components
        const excludeKeys = ['parallel', 'geo', 'timeline', 'visualMap', 'markPoint']
        const filteredTheme = Object.fromEntries(
            Object.entries(theme.theme_object).filter(([key]) => !excludeKeys.includes(key))
        )
        echarts.registerTheme(theme.theme_name, filteredTheme)
    }

    /** True when bars grow to the right instead of upwards (axis.orientation). */
    isHorizontal(): boolean {
        return this.inputData?.axis?.orientation === 'horizontal'
    }

    /**
     * Index of the measured y-value inside a data point's `value` tuple.
     *
     * A point is stored as `[x, y, r]` for a vertical chart. A horizontal chart
     * swaps the first two entries to `[y, x, r]`, because ECharts always maps
     * tuple index 0 to the x axis and index 1 to the y axis — and in a
     * horizontal chart the measured value is what belongs on the x axis.
     */
    private valueIndex(): number {
        return this.isHorizontal() ? 0 : 1
    }

    /** Index of the x-value (category/timestamp) inside a data point's `value` tuple. */
    private categoryIndex(): number {
        return this.isHorizontal() ? 1 : 0
    }

    /**
     * Formatter for the on-chart value labels (styling.showValueLabels).
     * Rounds to two decimals to match the numeric axis labels, and leaves
     * categorical y-values untouched.
     */
    private valueLabelFormatter(valueIdx: number) {
        return (params: any) => {
            const raw = Array.isArray(params?.value) ? params.value[valueIdx] : params?.value
            if (raw === undefined || raw === null || raw === '') return ''
            const num = Number(raw)
            return isNaN(num) ? String(raw) : String(Math.round(num * 100) / 100)
        }
    }

    transformData() {
        if (!this?.inputData?.dataseries?.length) return

        const horizontal = this.isHorizontal()
        const valueIdx = this.valueIndex()
        const categoryIdx = this.categoryIndex()

        // reset all existing chart dataseries
        this.canvasList.forEach((chartM) => {
            chartM.series = []
            chartM.doomed = true
        })
        this.inputData.dataseries.sort((a, b) => (a.advanced?.drawOrder ?? 0) - (b.advanced?.drawOrder ?? 0))
        this.inputData.dataseries.forEach((ds) => {
            ds.advanced ??= {}
            ds.advanced.chartName ??= ''

            ds.data ??= []

            // pivot data
            const distincts = [...new Set(ds.data.map((d) => d.pivot ?? ''))].sort()
            const derivedBgColors = tinycolor(ds.backgroundColor as ColorInput | undefined)
                .monochromatic(distincts.length)
                .map((c: any) => c.toHexString())
            const derivedBdColors = tinycolor(ds.borderColor as ColorInput | undefined)
                .monochromatic(distincts.length)
                .map((c: any) => c.toHexString())
            //sd
            distincts.forEach((piv, i) => {
                const prefix = piv ?? ''
                const label = ds.label ?? ''
                const name = prefix + (!!prefix && !!label ? ' - ' : '') + label
                const lineColor = ds.borderColor
                    ? ds.advanced?.chartName?.includes('#split#')
                        ? ds.borderColor
                        : derivedBdColors[i]
                    : undefined
                const fillColor = ds.backgroundColor
                    ? ds.advanced?.chartName?.includes('#split#')
                        ? ds.backgroundColor
                        : derivedBgColors[i]
                    : undefined
                const data = distincts.length === 1 ? ds.data : ds.data?.filter((d) => d.pivot === piv)
                // The value tuple is [x, y, r] for a vertical chart and [y, x, r]
                // for a horizontal one — ECharts always reads index 0 as the x
                // axis, and in a horizontal chart the measured value lives there.
                const toTuple = (x: any, y: any, r: any) => (horizontal ? [y, x, r] : [x, y, r])
                let data2 = this.inputData?.axis?.timeseries
                    ? (data?.map((d) => ({
                          name: d.x,
                          value: toTuple(new Date(d.x ?? '').getTime(), d.y, d.r)
                      })) ?? [])
                    : (data?.map((d) => ({ name: d.x, value: toTuple(d.x, d.y, d.r) })) ?? [])

                let minDate: number = 0,
                    maxDate: number = 0,
                    extraData: (string | number | undefined)[][] = []
                if (this.xAxisType() === 'time' && data2) {
                    const dates = data2.map((d: any) => d.value[categoryIdx] as number)
                    minDate = Math.min(...dates)
                    maxDate = Math.max(...dates)
                    // extraData = (pds?.data as any[][])?.filter((d: any) => d[0] < minDate) ?? []
                    // data2.unshift(...extraData) // add old data to the beginning of the new data
                    // data2 = [...extraData, ...data2] // leave old data in for smooth shifting animation and delete after draw
                }
                const valueAxisIndex = ds.yAxis === 'right' ? 1 : 0
                const pds: SeriesOptionX = {
                    id: name,
                    name: name,
                    minDate,
                    maxDate,
                    type: ds.type ?? 'line',
                    lineStyle: {
                        color: lineColor,
                        width: ds.styling?.borderWidth ?? 2,
                        type: ds.styling?.borderDash ?? 'solid'
                    },
                    smooth: false,
                    itemStyle: {
                        color: fillColor,
                        borderColor: lineColor,
                        borderWidth: ds.styling?.borderWidth ?? 2
                    },
                    areaStyle: ds.styling?.fill ? { color: fillColor } : undefined,
                    symbol: ds.styling?.pointStyle ?? 'circle',
                    symbolSize: (d: any[]) => d[2] ?? 0,
                    showSymbol: ds.styling?.pointStyle === 'none' ? false : true,
                    label: {
                        show: ds.styling?.showValueLabels ?? false,
                        // Bars grow upwards when vertical and rightwards when
                        // horizontal, so the label sits past the growing end.
                        position: horizontal ? 'right' : 'top',
                        fontSize: 12,
                        formatter: this.valueLabelFormatter(valueIdx)
                    },
                    data: data2 ?? [],
                    drawOrder: ds.advanced?.drawOrder ?? 0,
                    valueAxisIndex: valueAxisIndex,
                    // The secondary value axis is the right y axis when vertical
                    // and the top x axis when horizontal.
                    xAxisIndex: horizontal ? valueAxisIndex : 0,
                    yAxisIndex: horizontal ? 0 : valueAxisIndex
                }
                let chartName = ds.advanced?.chartName ?? ''
                chartName = chartName.replace('#split#', prefix)

                const chart = this.setupChart(chartName)

                // Ensure unique id per chart (ECharts requires unique ids)
                const existingIds = chart?.series.map((s) => s.id) ?? []
                let seriesId = name
                let suffix = 2
                while (existingIds.includes(seriesId)) {
                    seriesId = `${name}_${suffix++}`
                }
                pds.id = seriesId

                chart?.series.push(pds)
            })
        })

        const doomedCharts: string[] = []
        // remove all doomed charts
        this.canvasList.forEach((chart, label) => {
            if (!chart.doomed) return
            chart.echart?.dispose()
            chart.element?.remove()
            doomedCharts.push(label)
        })

        doomedCharts.forEach((label) => this.canvasList.delete(label))
        this.canvasList = new Map(
            [...this.canvasList.entries()].sort(([labelA, va], [labelB, vb]) => {
                const orderA = va.series?.[0].drawOrder ?? 0
                const orderB = vb.series?.[0].drawOrder ?? 0
                if (orderA !== orderB) {
                    return orderA - orderB
                }
                return labelA.localeCompare(labelB)
            })
        )

        // Resize remaining charts if any were removed
        if (doomedCharts.length > 0) {
            this.canvasList.forEach((chart) => {
                chart.echart?.resize()
            })
        }
    }

    // cached per inputData change — cleared in update(), see xAxisType()/yAxisType()
    private cachedXAxisType?: 'value' | 'category' | 'time'
    private cachedYAxisType?: 'value' | 'category'

    xAxisType(): 'value' | 'log' | 'category' | 'time' | undefined {
        if (this.cachedXAxisType) return this.cachedXAxisType
        if (this.inputData?.axis?.timeseries) {
            this.cachedXAxisType = 'time'
            return this.cachedXAxisType
        }
        this.cachedXAxisType = 'value'
        for (const ds of this.inputData?.dataseries ?? []) {
            const point = ds.data?.find((d) => d.x !== undefined && d.x !== null)
            if (point) {
                this.cachedXAxisType = !isNaN(Number(point.x)) ? 'value' : 'category'
                break
            }
        }
        return this.cachedXAxisType
    }

    yAxisType(): 'value' | 'log' | 'category' | undefined {
        if (this.cachedYAxisType) return this.cachedYAxisType
        this.cachedYAxisType = 'value'
        for (const ds of this.inputData?.dataseries ?? []) {
            const point = ds.data?.find((d) => d.y !== undefined && d.y !== null)
            if (point) {
                this.cachedYAxisType = !isNaN(Number(point.y)) ? 'value' : 'category'
                break
            }
        }
        return this.cachedYAxisType
    }

    calculateAnimationDuration(chart: any, label: string): number {
        const now = Date.now()
        const isSingleSeries = chart.series.length === 1
        // Only apply adaptive animation for single series charts
        if (!isSingleSeries || !this.inputData?.axis?.timeseries) {
            return this.updateThresholdMs
        }

        // Find the newest timestamp in the current chart data
        let maxTimestamp = 0
        if (this.xAxisType() === 'time') {
            for (const series of chart.series) {
                const seriesData = series.data as any[]
                for (const point of seriesData || []) {
                    const timestamp = point.value?.[0] || 0
                    if (timestamp > maxTimestamp) {
                        maxTimestamp = timestamp
                    }
                }
            }
        } else {
            // For non-time series, use the current time as proxy
            maxTimestamp = now
        }

        // Only track update if the data actually changed (new timestamp)
        chart.lastMaxTimestamp = chart.lastMaxTimestamp ?? 0
        const dataChanged = maxTimestamp > chart.lastMaxTimestamp
        if (dataChanged) {
            chart.updateIntervals ??= []
            if (chart.lastUpdateTime > 0) {
                const timeSinceLastUpdate = now - chart.lastUpdateTime
                chart.updateIntervals.push(timeSinceLastUpdate)
                if (chart.updateIntervals.length > this.maxIntervalSamples) {
                    chart.updateIntervals.shift()
                }
            }
            chart.lastUpdateTime = now
            chart.lastMaxTimestamp = maxTimestamp
        }

        // Calculate average update interval
        const avgInterval =
            chart.updateIntervals && chart.updateIntervals.length > 0
                ? chart.updateIntervals.reduce((a: number, b: number) => a + b, 0) /
                  chart.updateIntervals.length
                : this.updateThresholdMs
        return avgInterval
    }

    applyData() {
        const modifier = 1
        // Sort chartContainer children by drawOrder and label
        if (!this.chartContainer) return
        const horizontal = this.isHorizontal()
        for (const canvas of this.canvasList.values()) {
            if (canvas.element) this.chartContainer.appendChild(canvas.element)
        }
        this.canvasList.forEach((chart, label) => {
            chart.series.sort((a, b) => ((a.name as string) > (b.name as string) ? 1 : -1))

            // Visibility controls
            const showLegend = this.inputData?.axis?.showLegend ?? true
            const showTitle = this.inputData?.axis?.showTitle ?? true
            const showXAxis = this.inputData?.axis?.showXAxis ?? true
            const showYAxis = this.inputData?.axis?.showYAxis ?? true
            const showBox = this.inputData?.axis?.showBox ?? false

            // Track config changes to determine if full rebuild needed
            const currentConfig = JSON.stringify({
                showLegend,
                showTitle,
                showXAxis,
                showYAxis,
                showBox,
                xAxisLabel: this.inputData?.axis?.xAxisLabel,
                yAxisLabel: this.inputData?.axis?.yAxisLabel,
                xAxisZoom: this.inputData?.axis?.xAxisZoom,
                yAxisScaling: this.inputData?.axis?.yAxisScaling,
                yAxisLabelRight: this.inputData?.axis?.yAxisLabelRight,
                yAxisScalingRight: this.inputData?.axis?.yAxisScalingRight,
                xAxisType: this.xAxisType(),
                yAxisType: this.yAxisType(),
                // Flipping the orientation swaps which option key holds the
                // single category axis and which holds the value-axis array,
                // so it must force a notMerge rebuild rather than a merge.
                orientation: this.inputData?.axis?.orientation ?? 'vertical',
                seriesCount: chart.series.length,
                seriesNames: chart.series.map((s) => s.name).join(','),
                seriesAxes: chart.series.map((s) => s.valueAxisIndex ?? 0).join(','),
                seriesLabels: chart.series.map((s) => ((s as any).label?.show ? 1 : 0)).join(',')
            })
            const configChanged = chart.lastConfig !== currentConfig
            chart.lastConfig = currentConfig

            // Always build the option from the template — never from getOption().
            //
            // getOption() returns every component normalized to an *array*, while
            // everything below treats the single-instance ones (title, xAxis, grid,
            // legend, toolbox) as plain objects. `{ ...option.grid }` on an array
            // yields `{ '0': grid }`, which ECharts then deep-merges back into its
            // stored option — burying a copy one level deeper on *every* update. The
            // stored option grew one level per frame until zrender's recursive
            // merge()/clone() ran out of stack, so any board left open on a live
            // time series eventually died with "Maximum call stack size exceeded".
            // Assignments like `option.title.text` landed on the array object for the
            // same reason and were silently dropped, which is why the title, axis
            // name, legend and zoom toolbox stopped tracking config on that path.
            //
            // A template clone carries only the keys we actually set, so a merge
            // update still preserves ECharts-side state (zoom position, animation
            // continuity) — and it skips deep-cloning every series' data each frame.
            // `configChanged` still decides merge vs. rebuild via notMerge below.
            const option: any = window.structuredClone(this.template)

            // Title
            option.title.text = label
            option.title.show = showTitle

            // Axis
            option.xAxis.name = this.inputData?.axis?.xAxisLabel ?? ''
            option.xAxis.type = this.xAxisType()
            option.xAxis.show = showXAxis
            if (this.xAxisType() === 'time') {
                // Use provided timeRange if available and valid, otherwise calculate from data
                const dataMin = chart.series
                    .map((s) => s.minDate ?? Infinity)
                    .reduce((a, b) => Math.min(a, b), Infinity)
                const dataMax = chart.series.map((s) => s.maxDate ?? 0).reduce((a, b) => Math.max(a, b), 0)

                const timeRangeStart = Number(this.timeRange?.start)
                const timeRangeEnd = Number(this.timeRange?.end)

                const axisMin = !isNaN(timeRangeStart) ? timeRangeStart : dataMin
                const axisMax = !isNaN(timeRangeEnd) ? timeRangeEnd : dataMax

                option.xAxis = {
                    ...option.xAxis,
                    min: axisMin !== Infinity ? axisMin : new Date().getTime() - 1 * 24 * 60 * 60 * 1000,
                    max: axisMax !== 0 ? axisMax : new Date().getTime()
                }
            }

            const showZoom = this.inputData?.axis?.xAxisZoom ?? false
            option.dataZoom[0].show = showZoom
            option.toolbox.show = showZoom

            // Y axes: index 0 = left (primary), index 1 = right (secondary).
            // The template holds an array; normalize anyway so a template edit
            // that drops down to a single axis object cannot silently break this.
            const yAxes: any[] = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis ?? {}]
            while (yAxes.length < 2) yAxes.push({})
            option.yAxis = yAxes

            const hasValueLabels = chart.series.some((s) => !!(s as any).label?.show)
            const rightAxisUsed = chart.series.some((s) => (s.valueAxisIndex ?? 0) === 1)
            const leftAxisUsed =
                chart.series.length === 0 || chart.series.some((s) => (s.valueAxisIndex ?? 0) === 0)
            const showLeftAxis = showYAxis && leftAxisUsed
            const showRightAxis = showYAxis && rightAxisUsed

            const yAxisLabel = this.inputData?.axis?.yAxisLabel ?? ''
            const yAxisLabelRight = this.inputData?.axis?.yAxisLabelRight ?? ''
            const hasYAxisLabel = showLeftAxis && !!yAxisLabel
            const hasYAxisLabelRight = showRightAxis && !!yAxisLabelRight

            const yType = this.yAxisType()
            const numericAxisLabel = ['value', 'log'].includes(yType ?? '')
                ? { fontSize: 14, formatter: (value: number) => Math.round(value * 100) / 100 }
                : undefined

            Object.assign(yAxes[0], {
                type: yType,
                name: yAxisLabel,
                scale: this.inputData?.axis?.yAxisScaling ?? false,
                show: showLeftAxis,
                position: 'left',
                nameLocation: 'end',
                nameGap: 10,
                nameTextStyle: { align: 'left' },
                axisLine: { show: true }
            })
            if (numericAxisLabel) yAxes[0].axisLabel = numericAxisLabel

            Object.assign(yAxes[1], {
                type: yType,
                name: showRightAxis ? yAxisLabelRight : '',
                scale: this.inputData?.axis?.yAxisScalingRight ?? false,
                show: showRightAxis,
                position: 'right',
                nameLocation: 'end',
                nameGap: 10,
                nameTextStyle: { align: 'right' },
                axisLine: { show: true },
                splitLine: { show: false }
            })
            if (numericAxisLabel) yAxes[1].axisLabel = numericAxisLabel

            // Orientation swap. Everything above builds one category axis (the
            // x-values) and a two-entry array of value axes (the y-values). A
            // vertical chart puts them where they were built; a horizontal one
            // moves the category axis onto `yAxis` and the value axes onto
            // `xAxis`. The axis *labels* keep their meaning either way:
            // 'X-Axis Label' names the x-value dimension wherever it is drawn.
            if (horizontal) {
                const catAxis: any = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
                option.yAxis = {
                    ...catAxis,
                    position: 'left',
                    // Read top-to-bottom, so the first data point is the top
                    // bar — the convention for ranked horizontal bar charts.
                    inverse: true,
                    // 'start' is the top of an inverted axis, which keeps the
                    // axis name clear of the value axis running along the bottom.
                    // When a secondary value axis is in use it is drawn along
                    // the top, so the name has to clear its tick labels too.
                    nameLocation: 'start',
                    nameGap: showRightAxis ? 30 : 10,
                    nameTextStyle: { align: 'left' }
                }
                option.xAxis = yAxes.map((axis: any, index: number) => ({
                    ...axis,
                    position: index === 0 ? 'bottom' : 'top',
                    nameLocation: 'middle',
                    nameGap: 27,
                    nameTextStyle: { align: 'center' }
                }))
            }

            // Point the zoom at the one axis that carries the x-value
            // dimension: `xAxis` when vertical, `yAxis` when horizontal (the
            // orientation swap above moved it there).
            //
            // Both keys are written on every build, and neither may name an
            // axis the option does not declare. ECharts resolves these indices
            // to axis components when the option is merged and dereferences
            // them again in its dataZoom processor without checking, so an
            // index with no axis behind it — a hard-coded one, or one left over
            // from the other orientation on a merge update — crashes the chart
            // with "Cannot set properties of undefined (setting
            // '__dzAxisProxy')". The vertical layout declares a single x axis,
            // so the only valid target is index 0.
            option.dataZoom[0].xAxisIndex = horizontal ? undefined : [0]
            option.dataZoom[0].yAxisIndex = horizontal ? [0] : undefined

            option.series = chart.series
            option.legend.show = showLegend

            // Dynamic grid padding based on visible elements
            // Add extra top space when Y-axis label is shown at 'end' position.
            // The right axis name and the legend both live in the top-right corner,
            // so reserve an extra row when both are visible.
            const topPadding =
                (showTitle || hasYAxisLabel || hasYAxisLabelRight ? 30 : 0) +
                (showLegend && hasYAxisLabelRight ? 25 : 0)
            // An ECharts slider dataZoom is ~30px thick and sits outside the
            // grid's own bookkeeping, so nothing reserves room for it. Left
            // unaccounted it is drawn straight over the plot, clipping the foot
            // of every bar and washing out the axis labels underneath.
            const ZOOM_THICKNESS = 40
            const zoomPadBottom = showZoom && !horizontal ? ZOOM_THICKNESS : 0
            const zoomPadRight = showZoom && horizontal ? ZOOM_THICKNESS : 0
            option.grid = {
                ...option.grid,
                show: showBox,
                backgroundColor: 'transparent',
                borderWidth: showBox ? 1 : 0,
                borderColor: this.themeTitleColor ?? '#ccc',
                top: topPadding,
                // The category axis sits at the bottom when vertical and on the
                // left when horizontal; the value axis is the other way round.
                // The zoom slider is not accounted for by `containLabel`, so its
                // thickness has to be reserved here as well — see ZOOM_THICKNESS.
                bottom: ((horizontal ? showLeftAxis : showXAxis) ? 20 : 0) + zoomPadBottom,
                left: (horizontal ? showXAxis : showLeftAxis) ? 20 : 0,
                // A horizontal chart grows towards the right edge, so the last
                // axis tick and any value label printed past the end of a bar
                // need room that `containLabel` does not reserve for them.
                right: (horizontal ? (hasValueLabels ? 45 : 15) : 0) + zoomPadRight,
                containLabel: showXAxis || showYAxis
            }

            // Anchor the slider to the edge whose dimension it zooms: the bottom
            // for a vertical chart, the right-hand side for a horizontal one
            // (where it controls the y axis and ECharts draws it upright).
            if (showZoom) {
                Object.assign(
                    option.dataZoom[0],
                    horizontal
                        ? { right: 0, top: topPadding, bottom: 20, left: undefined }
                        : { bottom: 0, left: undefined, right: undefined, top: undefined }
                )
            }

            // Calculate animation duration based on update frequency
            const animationDuration = this.updateThresholdMs //this.calculateAnimationDuration(chart, label)
            option.animation = true
            option.animationEasing = 'linear'
            option.animationDuration = animationDuration
            option.animationDurationUpdate = animationDuration
            chart.drawing = true
            chart.echart?.setOption(option, { notMerge: configChanged, lazyUpdate: true })
            // chart.echart?.resize()
        })
    }

    // ECharts positions a slider dataZoom against the grid rect from *before*
    // `containLabel` insets the plot to make room for the axis labels, so the
    // slider comes out shifted towards the label side by exactly that inset and
    // its window no longer lines up with the data above it. The real plot rect
    // only exists after a render, so this runs on the chart's 'finished' event
    // and pins the slider to it. The pin itself triggers another render and
    // thus another 'finished'; the already-aligned check ends that recursion.
    private alignZoomSlider(echart: echarts.ECharts) {
        if (!(this.inputData?.axis?.xAxisZoom ?? false)) return
        const model = (echart as any).getModel?.()
        const rect = model?.getComponent('grid')?.coordinateSystem?.getRect?.()
        const dz = model?.getComponent('dataZoom', 0)?.option
        if (!rect || !dz) return
        // The slider tracks the zoomed dimension: the plot's width along the
        // bottom when vertical, its height along the right edge when horizontal.
        const pin: Record<string, number> = this.isHorizontal()
            ? { top: rect.y, height: rect.height }
            : { left: rect.x, width: rect.width }
        if (Object.keys(pin).every((k) => Math.abs(pin[k] - dz[k]) < 0.5)) return
        echart.setOption({ dataZoom: [pin] }, { lazyUpdate: true })
    }

    deleteCharts() {
        this.canvasList.forEach((chart, label) => {
            chart.echart?.dispose()
            chart.element?.remove()
            this.canvasList.delete(label)
        })
    }

    setupChart(label: string) {
        const existingChart = this.canvasList.get(label)

        if (existingChart) {
            delete existingChart.doomed
            return existingChart
        }

        if (!this.chartContainer) {
            // console.warn('Chart container not found')
            return
        }
        const newContainer = document.createElement('div')
        newContainer.setAttribute('name', label)
        newContainer.setAttribute('class', 'sizer')
        this.chartContainer.appendChild(newContainer)

        const newChart = echarts.init(newContainer, this.theme?.theme_name)
        const chart = {
            echart: newChart,
            series: [] as SeriesOptionX[],
            element: newContainer,
            drawing: false,
            lastUpdateTime: 0,
            updateIntervals: [],
            lastMaxTimestamp: 0
        }
        // One 'finished' handler per chart, registered here rather than in
        // applyData(). applyData() runs on every data tick, so registering
        // there added a handler per tick and never removed one: a board left
        // open on a live series accumulated one closure per update, all of them
        // invoked on every subsequent render.
        newChart.on('finished', () => {
            chart.drawing = false
            this.alignZoomSlider(newChart)
        })
        this.canvasList.set(label, chart)

        return chart
    }

    disconnectedCallback() {
        if (this.resizeObserver && this.chartContainer) {
            this.resizeObserver.unobserve(this.chartContainer)
            this.resizeObserver.disconnect()
        }
        super.disconnectedCallback()
    }

    static styles = css`
        :host {
            display: block;
            font-family: sans-serif;
            box-sizing: border-box;
            position: relative;
            margin: auto;
            container-type: size;
        }

        .paging:not([active]) {
            display: none !important;
        }

        .wrapper {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding: 2cqh 2cqw;
            box-sizing: border-box;
            gap: 12px;
        }

        .sizer {
            flex: 1;
            overflow: hidden;
            position: relative;
        }

        .chart-container {
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
        }

        header {
            display: flex;
            flex-direction: column;
        }
        h3 {
            margin: 0;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        p {
            margin: 10px 0 0 0;
            max-width: 300px;
            font-size: 14px;
            line-height: 17px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .chart {
            width: 600px; /* will be overriden by adjustSizes */
            height: 230px;
        }

        .columnLayout {
            flex-direction: column;
        }

        .no-data {
            font-size: 20px;
            display: flex;
            height: 100%;
            width: 100%;
            text-align: center;
            align-items: center;
            justify-content: center;
        }
    `

    render() {
        return html`
            <div
                class="wrapper"
                style="background-color: ${this.themeBgColor}; color: ${this.themeTitleColor}"
            >
                <header class="paging" ?active=${this.inputData?.title || this.inputData?.subTitle}>
                    <h3 class="paging" ?active=${this.inputData?.title}>${this.inputData?.title}</h3>
                    <p
                        class="paging"
                        ?active=${this.inputData?.subTitle}
                        style="color: ${this.themeSubtitleColor}"
                    >
                        ${this.inputData?.subTitle}
                    </p>
                </header>
                <div class="paging no-data" ?active=${this.canvasList.size === 0}>No Data</div>
                <div
                    class="chart-container ${this?.inputData?.axis?.columnLayout ? 'columnLayout' : ''}"
                ></div>
            </div>
        `
    }
}
