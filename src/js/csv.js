// ─────────────────────────────────────────────────────────────────
//  csv.js — dependency-free CSV/TSV parsing for the roster import.
//
//  Handles quoted fields (commas/newlines inside quotes), escaped
//  quotes ("" → "), CRLF or LF line endings, and auto-detects the
//  delimiter (comma, semicolon or tab — the three a spreadsheet export
//  produces). Returns the header row plus data rows as objects keyed by
//  header, so the import UI can map columns by name.
// ─────────────────────────────────────────────────────────────────

/**
 * Guess the delimiter from the first line by counting candidates
 * outside quotes. Comma wins ties.
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parse delimited text into a matrix of string cells.
 * @param {string} text
 * @param {string} [delimiter] defaults to auto-detected
 * @returns {string[][]}
 */
export function parseRows(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row unless the input ended on a newline.
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse into { headers, rows } where each row is an object keyed by the
 * trimmed header. Fully blank lines are dropped.
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const matrix = parseRows(text).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  if (!matrix.length) return { headers: [], rows: [] };

  const headers = matrix[0].map((h) => h.trim());
  const rows = matrix.slice(1).map((cells) => {
    /** @type {Record<string, string>} */
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

/**
 * Best-effort auto-mapping of source headers to a set of target field
 * keys, using per-field alias lists (case/space/accent-insensitive).
 * @param {string[]} headers
 * @param {Record<string, string[]>} aliases target key → accepted header aliases
 * @returns {Record<string, string>} target key → matched header ("" if none)
 */
export function autoMap(headers, aliases) {
  const norm = (/** @type {string} */ s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const normHeaders = headers.map((h) => ({ raw: h, key: norm(h) }));
  /** @type {Record<string, string>} */
  const mapping = {};
  for (const [target, names] of Object.entries(aliases)) {
    const wanted = names.map(norm);
    const hit = normHeaders.find((h) => wanted.includes(h.key));
    mapping[target] = hit ? hit.raw : "";
  }
  return mapping;
}
