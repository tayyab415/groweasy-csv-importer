import { describe, it, expect, vi } from "vitest";
import { rateLimit } from "../server/lib/rateLimit";

function mockReqRes(ip: string) {
  const req = { headers: {}, ip, socket: {} } as any;
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as any;
  return { req, res };
}

describe("rateLimit", () => {
  it("allows up to `max` requests then returns 429", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3 });
    const next = vi.fn();
    let last: any;
    for (let i = 0; i < 4; i++) {
      const { req, res } = mockReqRes("1.2.3.4");
      last = res;
      mw(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3); // first 3 pass
    expect(last.statusCode).toBe(429); // 4th blocked
    expect(last.headers["Retry-After"]).toBeDefined();
  });

  it("tracks limits per IP independently", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();
    const a = mockReqRes("10.0.0.1");
    const b = mockReqRes("10.0.0.2");
    mw(a.req, a.res, next);
    mw(b.req, b.res, next);
    expect(next).toHaveBeenCalledTimes(2); // different IPs both allowed once
  });

  it("keys on req.ip and ignores spoofed X-Forwarded-For", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 });
    const next = vi.fn();
    // Same resolved req.ip but attacker rotates X-Forwarded-For — must NOT
    // create a fresh bucket, so the second request is still blocked.
    const r1 = mockReqRes("5.5.5.5");
    r1.req.headers["x-forwarded-for"] = "1.1.1.1";
    const r2 = mockReqRes("5.5.5.5");
    r2.req.headers["x-forwarded-for"] = "2.2.2.2";
    mw(r1.req, r1.res, next);
    mw(r2.req, r2.res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r2.res.statusCode).toBe(429);
  });
});
