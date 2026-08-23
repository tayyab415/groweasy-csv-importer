import { describe, it, expect } from "vitest";
import { parseCsv } from "../server/services/csvParser";

describe("Health & CSV Ingestion Sanity Check", () => {
  it("verifies basic CSV parser health", () => {
    const csvData = "first_name,last_name,email,phone\nJohn,Doe,john@example.com,1234567890";
    const result = parseCsv(csvData);

    expect(result.headers).toEqual(["first_name", "last_name", "email", "phone"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].data.first_name).toBe("John");
    expect(result.rows[0].data.email).toBe("john@example.com");
  });

  it("handles empty lines and whitespace resilience", () => {
    const csvData = " name , email \n\n Alice , alice@example.com \n ";
    const result = parseCsv(csvData);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].data.name).toBe("Alice");
  });
});
