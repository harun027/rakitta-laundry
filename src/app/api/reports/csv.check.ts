/* Runnable check for the FR31 formula-injection guard.
 *   node src/app/api/reports/csv.check.ts
 */

import assert from "node:assert/strict";
import { csvCell, csvDocument, csvRow, safeFilename } from "./csv.ts";

// FR31: every spreadsheet formula trigger is neutralised.
for (const payload of ["=1+1", "+1", "-1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
  // Unwrap the RFC 4180 quoting first: Excel does the same before deciding
  // whether the cell is a formula, which is why quoting alone is no defence.
  const unquoted = csvCell(payload).replace(/^"|"$/g, "");
  assert.equal(unquoted.startsWith("'"), true, `must neutralise ${JSON.stringify(payload)}`);
}

// The classic DDE payload survives as text, not as a formula.
assert.equal(csvCell("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");

// Ordinary values are left alone.
assert.equal(csvCell("Budi Santoso"), "Budi Santoso");
assert.equal(csvCell(40000), "40000");
assert.equal(csvCell(null), "");

// Quoting still escapes separators and embedded quotes.
assert.equal(csvCell('Bilas "extra", wangi'), '"Bilas ""extra"", wangi"');
assert.equal(csvRow(["a", "b,c"]), 'a,"b,c"');

// UTF-8 BOM + CRLF so Excel opens Indonesian text correctly.
const doc = csvDocument([["Bagian"], ["Nilai Order"]]);
assert.equal(doc.startsWith("﻿"), true, "must start with a UTF-8 BOM");
assert.equal(doc, "﻿Bagian\r\nNilai Order\r\n");

assert.equal(safeFilename('laporan "utama"/2026.csv'), "laporan-utama-2026.csv");

console.log("FR31 CSV export guards PASSED.");
