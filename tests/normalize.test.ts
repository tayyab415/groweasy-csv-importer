import { describe, it, expect } from "vitest";
import { normalizeRecord } from "../server/lib/normalize";
import { emptyCrmRecord } from "../shared/crm";

function rec(partial: Partial<ReturnType<typeof emptyCrmRecord>>) {
  return { ...emptyCrmRecord(), ...partial };
}

describe("normalizeRecord", () => {
  it("skips records with neither email nor mobile", () => {
    const out = normalizeRecord(rec({ name: "John" }));
    expect(out.record).toBeNull();
    expect(out.skipReason).toMatch(/no email or mobile/i);
  });

  it("keeps a record that has only an email", () => {
    const out = normalizeRecord(rec({ name: "John", email: "a@b.com" }));
    expect(out.record).not.toBeNull();
    expect(out.record?.email).toBe("a@b.com");
  });

  it("keeps a record that has only a mobile", () => {
    const out = normalizeRecord(rec({ mobile_without_country_code: "9876543210" }));
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
  });

  it("invalidates unknown crm_status and data_source", () => {
    const out = normalizeRecord(
      rec({ email: "a@b.com", crm_status: "MAYBE", data_source: "unknown_src" }),
    );
    expect(out.record?.crm_status).toBe("");
    expect(out.record?.data_source).toBe("");
  });

  it("preserves valid enum values", () => {
    const out = normalizeRecord(
      rec({ email: "a@b.com", crm_status: "SALE_DONE", data_source: "eden_park" }),
    );
    expect(out.record?.crm_status).toBe("SALE_DONE");
    expect(out.record?.data_source).toBe("eden_park");
  });

  it("blanks an unparseable created_at but keeps a valid one", () => {
    const bad = normalizeRecord(rec({ email: "a@b.com", created_at: "not-a-date" }));
    expect(bad.record?.created_at).toBe("");
    const good = normalizeRecord(rec({ email: "a@b.com", created_at: "2026-05-13 14:20:48" }));
    expect(good.record?.created_at).toBe("2026-05-13 14:20:48");
    expect(Number.isNaN(new Date(good.record!.created_at).getTime())).toBe(false);
  });

  it("keeps the first email and moves the rest to crm_note", () => {
    const out = normalizeRecord(rec({ email: "first@x.com, second@y.com; third@z.com" }));
    expect(out.record?.email).toBe("first@x.com");
    expect(out.record?.crm_note).toContain("second@y.com");
    expect(out.record?.crm_note).toContain("third@z.com");
  });

  it("keeps the first mobile and moves the rest to crm_note", () => {
    const out = normalizeRecord(
      rec({ mobile_without_country_code: "9876543210 / 9123456780" }),
    );
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
    expect(out.record?.crm_note).toContain("9123456780");
  });

  it("blanks placeholder contact values and skips when nothing real remains", () => {
    const out = normalizeRecord(rec({ name: "X", email: "N/A", mobile_without_country_code: "not provided" }));
    expect(out.record).toBeNull();
  });

  it("keeps a 7-digit phone number (does not over-blank short numbers)", () => {
    const out = normalizeRecord(rec({ mobile_without_country_code: "1234567" }));
    expect(out.record).not.toBeNull();
    expect(out.record?.mobile_without_country_code).toBe("1234567");
  });

  it("blanks a placeholder email but keeps the row when the mobile is real", () => {
    const out = normalizeRecord(rec({ email: "-", mobile_without_country_code: "9876543210" }));
    expect(out.record).not.toBeNull();
    expect(out.record?.email).toBe("");
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
  });

  it("escapes line breaks so the record stays one CSV row", () => {
    const out = normalizeRecord(rec({ email: "a@b.com", description: "line1\nline2\r\nline3" }));
    expect(out.record?.description).not.toMatch(/[\r\n]/);
    expect(out.record?.description).toContain("\\n");
  });
});
