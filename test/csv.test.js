import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parseRows,
  detectDelimiter,
  autoMap,
} from "../src/js/csv.js";

describe("csv parser", () => {
  it("parses a header + rows into keyed objects", () => {
    const { headers, rows } = parseCsv(
      "first_name,last_name,enrollment\nAna,García,S-101\nLuis,Martínez,S-102\n",
    );
    expect(headers).toEqual(["first_name", "last_name", "enrollment"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      first_name: "Ana",
      last_name: "García",
      enrollment: "S-101",
    });
  });

  it("honors quoted fields with embedded commas and escaped quotes", () => {
    const rows = parseRows('a,"García, M.","He said ""hi"""');
    expect(rows[0]).toEqual(["a", "García, M.", 'He said "hi"']);
  });

  it("handles quoted newlines and CRLF line endings", () => {
    const { rows } = parseCsv('name,note\r\nAna,"line1\nline2"\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("line1\nline2");
  });

  it("drops fully blank lines", () => {
    const { rows } = parseCsv("a,b\n1,2\n\n3,4\n");
    expect(rows).toHaveLength(2);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b,c")).toBe(",");
  });

  it("parses semicolon-delimited exports", () => {
    const { headers, rows } = parseCsv("a;b\n1;2\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("auto-maps headers case/accent/space-insensitively", () => {
    const map = autoMap(["First Name", "Apellidos", "Cédula", "extra"], {
      first_name: ["first name", "nombre"],
      last_name: ["apellidos", "last name"],
      national_id: ["cedula", "national id"],
      gender: ["gender", "sexo"],
    });
    expect(map).toEqual({
      first_name: "First Name",
      last_name: "Apellidos",
      national_id: "Cédula",
      gender: "",
    });
  });

  it("returns empty results for blank input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});
