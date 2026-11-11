export type Cell = string | number | null | undefined;

/**
 * One CSV cell (RFC 4180 quoting). Text starting with = + - @ (or tab/CR) gets a leading apostrophe so
 * Excel/Sheets never run customer-supplied text (names, notes) as a formula. Numbers are written as-is.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows → CSV text: UTF-8 BOM (so Excel shows Kiswahili/emoji correctly) and CRLF line endings. */
export function toCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
