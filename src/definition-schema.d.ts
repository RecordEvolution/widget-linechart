/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export type Title = string;
export type Subtitle = string;
/**
 * This will apply a proper time series x-Axis. Check if your x-values are timestamps.
 */
export type TimeseriesChart = boolean;
export type XAxisLabel = string;
export type YAxisLabel = string;
/**
 * When multiple charts are drawn, then they will be layed out horizontically or vertically.
 */
export type VerticalLayout = boolean;
/**
 * The name for this data series
 */
export type Label = string;
/**
 * Determines the draw order of the series. Dataseries with lower numbers are drawn on top of ones with higher numbers.
 */
export type DrawOrder = number;
/**
 * If two dataseries have the same 'Chart' name, they will be drawn in the same chart. Otherwise they will get their own chart. If the name ends with #pivot# then a separat chart will be drawn for each pivoted dataseries.
 */
export type Chart = string;
export type DrawingStyle = "bar" | "line" | "bubble";
/**
 * To disable points, set this to 0.
 */
export type PointRadius = number;
export type PointStyle =
  | "circle"
  | "cross"
  | "crossRot"
  | "dash"
  | "line"
  | "rect"
  | "rectRounded"
  | "rectRot"
  | "star"
  | "triangle";
/**
 * The inner color of the bars if you chose Drawing Type 'bar' or the inner colors of the points if you chose Drawing Type 'line'.
 */
export type PointOrBarColor = string;
export type LineColor = string;
/**
 * In case of Drawing Type 'bar' this determines the bar's border line width.
 */
export type LineWidth = number;
/**
 * Specify dash length and space-between-dashes length like this: [10, 5].
 */
export type LineDashStyle = string;
/**
 * Check this box to turn a line chart into an area chart.
 */
export type LineAreaFill = boolean;
/**
 * Valid only for Bubble Chart type.
 */
export type PointRadius1 = number;
/**
 * You can specify a column in the input data to autogenerate dataseries for each distinct entry in this column. E.g. if you have a table with columns [city, timestamp, temperature] and specify 'city' as pivot column, then you will get a line for each city.
 */
export type PivotColumn = string;
/**
 * The data used to draw this data series.
 */
export type Data = {
  /**
   * If timeseries is checked in the settings, then this should be an ISO String date like 2023-11-04T22:47:52.351152+00:00. But this works with many other formats as well.
   */
  x: string;
  y: number;
  r?: PointRadius1;
  pivot?: PivotColumn;
  [k: string]: unknown;
}[];
export type Dataseries = {
  label: Label;
  order?: DrawOrder;
  chartName?: Chart;
  type: DrawingStyle;
  radius?: PointRadius;
  pointStyle?: PointStyle;
  backgroundColor?: PointOrBarColor;
  borderColor?: LineColor;
  borderWidth?: LineWidth;
  borderDash?: LineDashStyle;
  fill?: LineAreaFill;
  data?: Data;
  [k: string]: unknown;
}[];

export interface ConfigureTheChart {
  settings?: GlobalSettings;
  dataseries?: Dataseries;
  [k: string]: unknown;
}
export interface GlobalSettings {
  title?: Title;
  subTitle?: Subtitle;
  timeseries?: TimeseriesChart;
  xAxisLabel?: XAxisLabel;
  yAxisLabel?: YAxisLabel;
  columnLayout?: VerticalLayout;
  [k: string]: unknown;
}
