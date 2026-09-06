export type GstFilter = "all" | "gst" | "non_gst";

export type ColumnType = "text" | "money" | "number" | "date" | "datetime" | "percent" | "badge";

export type DetailColumn = {
  key: string;
  label: string;
  type?: ColumnType;
  align?: "left" | "right";
};

export type DetailTable = {
  id: string;
  title: string;
  subtitle?: string;
  columns: DetailColumn[];
  rows: Record<string, any>[];
  /** Money totals rendered in the modal footer, keyed by column. */
  totals?: Record<string, number>;
  footnote?: string;
};

export type CoachConversionRow = {
  coachId: string;
  coach: string;
  scheduled: number;
  done: number;
  converted: number;
  noShow: number;
  rate: number;
};

export type FeesAnalytics = {
  generatedAt: string;
  range: { from: string; to: string; label: string };
  gst: GstFilter;
  kpis: Record<string, number>;
  coachConversion: CoachConversionRow[];
  tables: Record<string, DetailTable>;
};
