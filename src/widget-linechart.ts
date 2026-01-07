import { html, css, LitElement, PropertyValueMap } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

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

import { InputData } from './definition-schema'
import { EChartsOption, SeriesOption } from 'echarts'
import { TitleOption } from 'echarts/types/dist/shared'

type Theme = {
    theme_name: string
    theme_object: any
}

type SeriesOptionX = SeriesOption & { minDate?: number; maxDate?: number; drawOrder: number }
@customElement('widget-linechart-versionplaceholder')
export class WidgetLinechart extends LitElement {
    @property({ type: Object })
    inputData?: InputData

    @property({ type: Object })
    theme?: Theme

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
        }
    > = new Map()

    @state() private themeBgColor?: string
    @state() private themeTitleColor?: string
    @state() private themeSubtitleColor?: string

    boxes?: HTMLDivElement[]
    origWidth: number = 0
    origHeight: number = 0
    template: EChartsOption
    modifier: number = 1
    version: string = 'versionplaceholder'
    chartContainer: HTMLDivElement | null | undefined
    resizeObserver?: ResizeObserver
    updateThresholdMs: number = 300
    private maxIntervalSamples: number = 3

    constructor() {
        super()

        this.template = {
            title: {
                text: 'Temperature Change in the Coming Week',
                left: 20,
                top: 0,
                textStyle: {
                    fontSize: 14
                }
            } as TitleOption,
            tooltip: {
                trigger: 'axis'
            },
            legend: {
                right: '10%',
                top: 0
            },
            grid: {
                backgroundColor: 'rgba(0, 255, 0, 0.1)',
                top: 30,
                bottom: 20,
                left: 20,
                right: 10,
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
                    realtime: true,
                    // start: 30,
                    // end: 70,
                    xAxisIndex: [0, 1]
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
            yAxis: {
                type: 'value',
                nameLocation: 'middle',
                name: 'Temperature (°C)',
                nameGap: 30,
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
        this.chartContainer = this.shadowRoot?.querySelector('.chart-container')
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
        const excludeKeys = [
            'parallel',
            'geo',
            'timeline',
            'visualMap',
            'markPoint'
        ]
        const filteredTheme = Object.fromEntries(
            Object.entries(theme.theme_object).filter(([key]) => !excludeKeys.includes(key))
        )
        echarts.registerTheme(theme.theme_name, filteredTheme)
    }

    transformData() {
        if (!this?.inputData?.dataseries?.length) return

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
                let data2 = this.inputData?.axis?.timeseries
                    ? (data?.map((d) => ({ name: d.x, value: [new Date(d.x ?? '').getTime(), d.y, d.r] })) ??
                      [])
                    : (data?.map((d) => ({ name: d.x, value: [d.x, d.y, d.r] })) ?? [])

                let minDate: number = 0,
                    maxDate: number = 0,
                    extraData: (string | number | undefined)[][] = []
                if (this.xAxisType() === 'time' && data2) {
                    const dates = data2.map((d: any) => d.value[0] as number)
                    minDate = Math.min(...dates)
                    maxDate = Math.max(...dates)
                    // extraData = (pds?.data as any[][])?.filter((d: any) => d[0] < minDate) ?? []
                    // data2.unshift(...extraData) // add old data to the beginning of the new data
                    // data2 = [...extraData, ...data2] // leave old data in for smooth shifting animation and delete after draw
                }
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
                    symbolSize: (d: any[]) => d[2] ?? 4,
                    showSymbol: ds.styling?.pointStyle === 'none' ? false : true,
                    data: data2 ?? [],
                    drawOrder: ds.advanced?.drawOrder ?? 0
                }
                let chartName = ds.advanced?.chartName ?? ''
                chartName = chartName.replace('#split#', prefix)

                const chart = this.setupChart(chartName)
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
    }

    xAxisType(): 'value' | 'log' | 'category' | 'time' | undefined {
        if (this.inputData?.axis?.timeseries) return 'time'
        const onePoint = this.inputData?.dataseries?.[0]?.data?.[0]
        if (!isNaN(Number(onePoint?.x))) return 'value'
        return 'category'
    }

    yAxisType(): 'value' | 'log' | 'category' | undefined {
        const onePoint = this.inputData?.dataseries?.[0]?.data?.[0]
        if (!isNaN(Number(onePoint?.y))) return 'value'
        return 'category'
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
        for (const canvas of this.canvasList.values()) {
            if (canvas.element) this.chartContainer.appendChild(canvas.element)
        }
        this.canvasList.forEach((chart, label) => {
            chart.series.sort((a, b) => ((a.name as string) > (b.name as string) ? 1 : -1))

            const option: any = chart.echart?.getOption() ?? window.structuredClone(this.template)
            // Title
            option.title.text = label
            // option.title.textStyle.fontSize = 25 * modifier

            // Axis
            option.xAxis.name = this.inputData?.axis?.xAxisLabel ?? ''
            if (this.xAxisType() === 'time') {
                const axisMax = chart.series.map((s) => s.maxDate ?? 0).reduce((a, b) => Math.max(a, b), 0)
                const axisMin = chart.series
                    .map((s) => s.minDate ?? Infinity)
                    .reduce((a, b) => Math.min(a, b), Infinity)
                // console.log('Setting xAxis time range', label, new Date(axisMin), new Date(axisMax))
                option.xAxis = {
                    ...option.xAxis,
                    min: axisMin ?? new Date().getTime() - 1 * 24 * 60 * 60 * 1000, // 1 days ago,
                    max: axisMax ?? new Date().getTime() // today
                }
            }
            option.dataZoom[0].show = this.inputData?.axis?.xAxisZoom ?? false
            option.toolbox.show = this.inputData?.axis?.xAxisZoom ?? false
            // option.xAxis.axisLine.lineStyle.width = 2 * modifier
            // option.xAxis.axisLabel.fontSize = 20 * modifier
            option.xAxis.type = this.xAxisType()
            option.yAxis.type = this.yAxisType()

            option.yAxis.name = this.inputData?.axis?.yAxisLabel ?? ''
            // option.yAxis.axisLine.lineStyle.width = 2 * modifier
            // option.yAxis.axisLabel.fontSize = 20 * modifier
            option.yAxis.scale = this.inputData?.axis?.yAxisScaling ?? false
            if (['value', 'log'].includes(option.yAxis.type))
                option.yAxis.axisLabel = {
                    'font-size': 14,
                    formatter: (value: number) => Math.round(value * 100) / 100
                }

            const notMerge = option.series.length !== chart.series.length
            option.series = chart.series
            // console.log('Applying data to chart', label, option)
            if (chart.series.length <= 1) option.legend.show = false

            // Calculate animation duration based on update frequency
            const animationDuration = this.calculateAnimationDuration(chart, label)
            option.animation = true
            option.animationEasing = 'linear' // Use linear easing for predictable timing
            option.animationDuration = animationDuration
            option.animationDurationUpdate = animationDuration // Explicitly set update animation
            chart.echart?.on('finished', () => (chart.drawing = false))
            chart.drawing = true
            chart.echart?.setOption(option, { notMerge, lazyUpdate: true })
            // chart.echart?.resize()
        })
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
