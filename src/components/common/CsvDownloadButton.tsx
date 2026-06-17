"use client";

type CsvDownloadButtonProps = {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  label: string;
  className?: string;
};

function escapeCsvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function CsvDownloadButton({
  filename,
  headers,
  rows,
  label,
  className = "",
}: CsvDownloadButtonProps) {
  function download() {
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <button
      type="button"
      onClick={download}
      className={className || "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"}
    >
      {label}
    </button>
  );
}
