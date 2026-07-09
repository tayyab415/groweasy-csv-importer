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

  it("splits whitespace-separated phone numbers", () => {
    const out = normalizeRecord(
      rec({ mobile_without_country_code: "9876543210 9123456780" }),
    );
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
    expect(out.record?.crm_note).toContain("9123456780");
  });

  it("regroups multiple space-formatted numbers instead of shattering them", () => {
    const out = normalizeRecord(rec({ mobile_without_country_code: "98765 43210 91234 56780" }));
    expect(out.record).not.toBeNull();
    expect(out.record?.mobile_without_country_code).toBe("98765 43210");
    expect(out.record?.crm_note).toContain("91234 56780");
  });

  it("splits hyphen-glued distinct numbers but keeps a formatted single number", () => {
    const glued = normalizeRecord(rec({ mobile_without_country_code: "9876543210-9123456780" }));
    expect(glued.record?.mobile_without_country_code).toBe("9876543210");
    expect(glued.record?.crm_note).toContain("9123456780");

    const formatted = normalizeRecord(rec({ mobile_without_country_code: "+91 98765 43210" }));
    // Country code is split out into country_code; the local number is preserved intact.
    expect(formatted.record?.country_code).toBe("+91");
    expect(formatted.record?.mobile_without_country_code).toBe("98765 43210");
    expect(formatted.record?.crm_note).toBe("");
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

  it("splits newline-separated emails cleanly (no glued fragments)", () => {
    const out = normalizeRecord(rec({ email: "a@b.com\nc@d.com" }));
    expect(out.record?.email).toBe("a@b.com");
    expect(out.record?.crm_note).toContain("c@d.com");
    expect(out.record?.crm_note).not.toContain("nc@d.com");
  });

  it("splits AI-escaped (\\n) newline-separated emails", () => {
    const out = normalizeRecord(rec({ email: "a@b.com\\nc@d.com" }));
    expect(out.record?.email).toBe("a@b.com");
    expect(out.record?.crm_note).toContain("c@d.com");
    expect(out.record?.crm_note).not.toContain("nc@d.com");
  });

  it("escapes line breaks so the record stays one CSV row", () => {
    const out = normalizeRecord(rec({ email: "a@b.com", description: "line1\nline2\r\nline3" }));
    expect(out.record?.description).not.toMatch(/[\r\n]/);
    expect(out.record?.description).toContain("\\n");
  });

  it("discards a hallucinated email not present in the source row", () => {
    const out = normalizeRecord(rec({ name: "Alice", email: "fake@evil.com" }), "Alice, some notes");
    expect(out.record).toBeNull();
    expect(out.skipReason).toMatch(/no email or mobile/i);
  });

  it("keeps an email that appears in the source row", () => {
    const out = normalizeRecord(rec({ email: "real@x.com" }), "Real Person real@x.com Mumbai");
    expect(out.record?.email).toBe("real@x.com");
  });

  it("discards a hallucinated phone but keeps a source-backed one", () => {
    const fake = normalizeRecord(rec({ mobile_without_country_code: "1112223333" }), "no number here");
    expect(fake.record).toBeNull();
    const real = normalizeRecord(rec({ mobile_without_country_code: "9876543210" }), "call 9876543210");
    expect(real.record?.mobile_without_country_code).toBe("9876543210");
  });

  it("splits a country code out of the mobile when country_code is empty", () => {
    const out = normalizeRecord(
      rec({ mobile_without_country_code: "+91 98765 43210" }),
      "lead +91 98765 43210",
    );
    expect(out.record?.country_code).toBe("+91");
    expect(out.record?.mobile_without_country_code).toBe("98765 43210");
  });

  it("strips the country code from mobile even when country_code is already set", () => {
    const out = normalizeRecord(
      rec({ country_code: "+91", mobile_without_country_code: "+91 98765 43210" }),
      "+91 98765 43210",
    );
    expect(out.record?.country_code).toBe("+91");
    expect(out.record?.mobile_without_country_code).toBe("98765 43210");
  });

  it("rejects a fabricated phone assembled from digits spanning separate cells", () => {
    // unit=12345, zip=67890 must NOT validate a fake "1234567890" mobile.
    const out = normalizeRecord(
      rec({ name: "Alice", mobile_without_country_code: "1234567890" }),
      ["Alice", "12345", "67890"],
    );
    expect(out.record).toBeNull();
    expect(out.skipReason).toMatch(/no email or mobile/i);
  });

  it("accepts a real phone that lives within a single source cell", () => {
    const out = normalizeRecord(
      rec({ mobile_without_country_code: "9876543210" }),
      ["Alice", "call 9876543210", "Mumbai"],
    );
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
  });

  it("strips labels and conjunctions from phone values", () => {
    const out = normalizeRecord(
      rec({ mobile_without_country_code: "Call 9876543210 or 9123456780" }),
      "Call 9876543210 or 9123456780",
    );
    expect(out.record?.mobile_without_country_code).toBe("9876543210");
    expect(out.record?.crm_note).toContain("9123456780");
    expect(out.record?.crm_note).not.toMatch(/\bor\b/);
  });

  it("does not move a lead_owner email into notes (no source over-reach)", () => {
    const out = normalizeRecord(
      rec({ email: "lead@x.com", lead_owner: "owner@corp.com" }),
      "lead@x.com owner@corp.com",
    );
    expect(out.record?.email).toBe("lead@x.com");
    expect(out.record?.lead_owner).toBe("owner@corp.com");
    expect(out.record?.crm_note).not.toContain("owner@corp.com");
  });
});
