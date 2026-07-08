import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCrmRecord } from "../shared/crm";

// Mock the AI extractor so the pipeline can be tested without network calls.
vi.mock("../server/services/geminiExtractor", () => ({
  extractRecords: vi.fn(),
}));

import { extractRecords } from "../server/services/geminiExtractor";
import { runImport } from "../server/services/importPipeline";

const mockExtract = vi.mocked(extractRecords);

describe("runImport skip reasons", () => {
  beforeEach(() => mockExtract.mockReset());

  it("reports a failed AI batch as an extraction failure, not a contactless row", async () => {
    mockExtract.mockResolvedValue([{ row: 1, record: emptyCrmRecord(), failed: true }]);
    const result = await runImport("name\nAlice");
    expect(result.totalImported).toBe(0);
    expect(result.totalSkipped).toBe(1);
    expect(result.skipped[0].reason).toMatch(/extraction failed/i);
  });

  it("reports a genuinely contactless row with the no-contact reason", async () => {
    mockExtract.mockResolvedValue([
      { row: 1, record: { ...emptyCrmRecord(), name: "Alice" }, failed: false },
    ]);
    const result = await runImport("name\nAlice");
    expect(result.totalSkipped).toBe(1);
    expect(result.skipped[0].reason).toMatch(/no email or mobile/i);
  });

  it("imports a row that has usable contact info", async () => {
    mockExtract.mockResolvedValue([
      { row: 1, record: { ...emptyCrmRecord(), name: "Alice", email: "a@b.com" }, failed: false },
    ]);
    const result = await runImport("name,email\nAlice,a@b.com");
    expect(result.totalImported).toBe(1);
    expect(result.records[0].email).toBe("a@b.com");
  });
});
