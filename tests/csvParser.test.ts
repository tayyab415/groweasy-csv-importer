import { describe, it, expect } from "vitest";
import { parseCsv } from "../server/services/csvParser";

describe("parseCsv", () => {
  it("parses headers and rows with 1-based indexing", () => {
    const csv = "name,email\nJohn,john@x.com\nJane,jane@y.com";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["name", "email"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ row: 1, data: { name: "John", email: "john@x.com" } });
    expect(rows[1].row).toBe(2);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'name,note\nJohn,"busy, call later"';
    const { rows } = parseCsv(csv);
    expect(rows[0].data.note).toBe("busy, call later");
  });

  it("gives blank headers positional names", () => {
    const csv = "name,,email\nJohn,x,john@x.com";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["name", "column_2", "email"]);
    expect(rows[0].data.column_2).toBe("x");
  });

  it("makes duplicate headers unique so no column is overwritten", () => {
    const csv = "phone,phone,email\n111,222,a@b.com";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["phone", "phone_2", "email"]);
    expect(rows[0].data).toEqual({ phone: "111", phone_2: "222", email: "a@b.com" });
  });

  it("keeps generated header names unique even against pre-existing suffixes", () => {
    const csv = "phone,phone,phone_2\n1,2,3";
    const { headers, rows } = parseCsv(csv);
    expect(new Set(headers).size).toBe(3); // all unique
    expect(headers[0]).toBe("phone");
    expect(rows[0].data[headers[1]]).toBe("2");
    expect(rows[0].data[headers[2]]).toBe("3");
  });

  it("skips fully empty rows", () => {
    const csv = "name,email\nJohn,john@x.com\n\n,\nJane,jane@y.com";
    const { rows } = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.data.name)).toEqual(["John", "Jane"]);
  });

  it("returns empty result for empty input", () => {
    expect(parseCsv("").rows).toHaveLength(0);
  });

  it("throws on structurally malformed CSV (unterminated quote)", () => {
    expect(() => parseCsv('name,note\nJohn,"busy call later\nJane,ok')).toThrow(/malformed/i);
  });

  it("tolerates jagged rows (too few / too many fields)", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n3,4,5,6");
    expect(rows).toHaveLength(2);
  });

  it("keeps extra cells when a row is wider than the header", () => {
    const { rows } = parseCsv("name\nAlice,alice@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0].data.name).toBe("Alice");
    // the extra cell (the email) must be preserved, not dropped
    expect(Object.values(rows[0].data)).toContain("alice@example.com");
  });

  it("accepts a valid single-column CSV (no false delimiter failure)", () => {
    const { headers, rows } = parseCsv("email\na@b.com\nc@d.com");
    expect(headers).toEqual(["email"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].data.email).toBe("a@b.com");
  });
});
