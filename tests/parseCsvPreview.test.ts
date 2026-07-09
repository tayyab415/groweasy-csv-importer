import { describe, it, expect } from "vitest";
import { parseCsvPreview } from "../app/lib/parseCsv";

describe("parseCsvPreview", () => {
  it("parses headers and rows", () => {
    const { headers, rows, totalRows } = parseCsvPreview("name,email\nJohn,j@x.com");
    expect(headers).toEqual(["name", "email"]);
    expect(rows).toEqual([["John", "j@x.com"]]);
    expect(totalRows).toBe(1);
  });

  it("preserves extra cells when a row is wider than the header", () => {
    const { headers, rows } = parseCsvPreview("name\nAlice,alice@example.com");
    // widened to the widest row, so the extra cell is shown, not dropped
    expect(headers.length).toBe(2);
    expect(rows[0]).toEqual(["Alice", "alice@example.com"]);
  });

  it("dedupes duplicate headers to match the backend", () => {
    const { headers } = parseCsvPreview("phone,phone,email\n1,2,a@b.com");
    expect(headers).toEqual(["phone", "phone_2", "email"]);
  });

  it("labels blank headers positionally", () => {
    const { headers } = parseCsvPreview("name,,email\nA,x,a@b.com");
    expect(headers[1]).toBe("Column 2");
  });

  it("returns empty for empty input", () => {
    expect(parseCsvPreview("").totalRows).toBe(0);
  });

  it("throws on structurally malformed CSV (unterminated quote)", () => {
    expect(() => parseCsvPreview('name,note\nJohn,"busy call later\nJane,ok')).toThrow(/malformed/i);
  });
});
