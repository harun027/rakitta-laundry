/* CSV writing for FR31 exports.
 *
 * Spreadsheets treat a cell that begins with =, +, -, @, TAB or CR as a
 * formula, so a customer name like "=cmd|'/c calc'!A1" becomes code the moment
 * an owner opens the file. Every cell is neutralised with a leading apostrophe
 * before it is quoted — quoting alone does NOT stop this, because Excel strips
 * the quotes before it looks at the first character.
 *
 * Self-check: node src/app/api/reports/csv.check.ts
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  if (/[",;\n\r\t]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** BOM so Excel reads it as UTF-8; CRLF line endings per RFC 4180. */
export function csvDocument(lines: readonly (readonly unknown[])[]): string {
  return "﻿" + lines.map(csvRow).join("\r\n") + "\r\n";
}

/** Safe for a Content-Disposition filename: ASCII, no quotes, no separators. */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "laporan.csv";
}
