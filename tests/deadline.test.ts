import { describe, expect, it } from "vitest";
import { resolveDeadline } from "../src/utils/deadline";
const NOW = 1_800_000_000;
describe("explicit deadlines with legacy compatibility", () => {
  it("keeps defaults and legacy minute/timestamp behavior", () => {
    expect(resolveDeadline({}, 20, NOW)).toBe(NOW + 1200);
    expect(resolveDeadline({ deadline: 0 }, 20, NOW)).toBe(NOW + 1200);
    expect(resolveDeadline({ deadline: 30 }, 20, NOW)).toBe(NOW + 1800);
    expect(resolveDeadline({ deadline: NOW + 120 }, 20, NOW)).toBe(NOW + 120);
  });
  it("accepts explicit timestamps with less than 60 seconds remaining", () => {
    expect(resolveDeadline({ deadlineTimestamp: NOW + 1 }, 20, NOW)).toBe(NOW + 1);
  });
  it("supports fractional explicit minutes to the nearest second", () => {
    expect(resolveDeadline({ deadlineMinutes: 0.5 }, 20, NOW)).toBe(NOW + 30);
  });
  it.each([
    NOW - 1,
    NOW,
    NOW + 0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects expired or invalid timestamp %s", (value) => {
    expect(() => resolveDeadline({ deadlineTimestamp: value }, 20, NOW)).toThrow();
  });
  it.each([0, -1, 0.001, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    "rejects invalid explicit minutes %s",
    (value) => {
      expect(() => resolveDeadline({ deadlineMinutes: value }, 20, NOW)).toThrow();
    },
  );
  it.each([
    { deadline: 30, deadlineMinutes: 30 },
    { deadlineTimestamp: NOW + 60, deadlineMinutes: 1 },
    { deadline: 0, deadlineTimestamp: NOW + 60 },
  ])("rejects conflicting fields", (input) => {
    expect(() => resolveDeadline(input, 20, NOW)).toThrow("only one");
  });
  it("documents the unresolved legacy ambiguity rather than reinterpreting it", () => {
    expect(resolveDeadline({ deadline: NOW - 1 }, 20, NOW)).toBe(NOW + (NOW - 1) * 60);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid configured default %s",
    (value) => {
      expect(() => resolveDeadline({}, value, NOW)).toThrow();
    },
  );
});
