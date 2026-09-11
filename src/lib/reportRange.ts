/**
 * Date-range resolution shared by the fee reports page and its export route.
 *
 * The two used to carry their own copy of this logic, which is how an export
 * could disagree with the preview it was launched from. The filter form also
 * keeps four date controls alive at once (from/to, month, financial year), so
 * the precedence below decides which one a request actually means: the most
 * specific control the user filled in wins, with an explicit from/to range
 * ahead of a month that may simply be left over from an earlier filter.
 */

export type ReportRangeParams = Record<string, string | string[] | undefined>;

export type ReportRange = {
  start: Date;
  end: Date;
  /** Which control the range came from; `all` means nothing was filtered. */
  source: "range" | "month" | "fy" | "all";
};

const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);

export function paramValue(params: ReportRangeParams, key: string, fallback = "") {
  const raw = params[key];
  return typeof raw === "string" ? raw.trim() : fallback;
}

/**
 * `new Date("2026-09-01")` is UTC midnight, but everything else here - and every
 * date a user picks - is local, so in IST that silently dropped the first five
 * and a half hours of the opening day. Both ends are built in local time.
 */
function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(value: string) {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveReportRange(params: ReportRangeParams): ReportRange {
  const from = paramValue(params, "from");
  const to = paramValue(params, "to");
  const month = paramValue(params, "month");
  const fy = paramValue(params, "fy");

  const rangeStart = from ? startOfDay(from) : null;
  const rangeEnd = to ? endOfDay(to) : null;
  if (rangeStart || rangeEnd) {
    return { start: rangeStart ?? MIN_DATE, end: rangeEnd ?? MAX_DATE, source: "range" };
  }

  if (month) {
    const monthDate = new Date(`${month}-01T00:00:00.000`);
    if (!Number.isNaN(monthDate.getTime())) {
      return {
        start: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
        end: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999),
        source: "month",
      };
    }
  }

  const startYear = Number(fy);
  if (fy && Number.isFinite(startYear)) {
    return {
      start: new Date(startYear, 3, 1),
      end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
      source: "fy",
    };
  }

  return { start: MIN_DATE, end: MAX_DATE, source: "all" };
}

export function withinReportRange(dateValue: unknown, range: ReportRange) {
  if (!dateValue) return false;
  const date = new Date(dateValue as string | number | Date);
  if (Number.isNaN(date.getTime())) return false;
  return date >= range.start && date <= range.end;
}

export function reportRangeLabel(range: ReportRange, params: ReportRangeParams) {
  if (range.source === "range") {
    const from = paramValue(params, "from");
    const to = paramValue(params, "to");
    return `${from || "Start"} to ${to || "Today"}`;
  }
  if (range.source === "month") {
    return range.start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }
  if (range.source === "fy") {
    const startYear = range.start.getFullYear();
    return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
  }
  return "All time";
}
