import { describe, expect, it } from "vitest";
import { PERCENT_STEPS, bucketLast, litDots, niceStep } from "./dot-scale";

describe("niceStep", () => {
  it("rounds up to the next round step", () => {
    expect(niceStep(2.7)).toBe(3);
    expect(niceStep(39.5 / 10)).toBe(4);
    expect(niceStep(0)).toBe(1);
  });

  it("keeps percentage scales on divisors of 100", () => {
    expect(niceStep(100 / 7, PERCENT_STEPS)).toBe(20);
    expect(niceStep(34 / 7, PERCENT_STEPS)).toBe(5);
  });
});

describe("litDots", () => {
  it("never lets small positive values read as zero", () => {
    expect(litDots(0.4, 3, 10)).toBe(1);
    expect(litDots(0, 3, 10)).toBe(0);
    expect(litDots(null, 3, 10)).toBe(0);
    expect(litDots(-2, 3, 10)).toBe(0);
  });

  it("clamps to the available rows", () => {
    expect(litDots(100, 3, 10)).toBe(10);
  });
});

describe("bucketLast", () => {
  it("keeps the newest value and passes short series through", () => {
    const items = Array.from({ length: 90 }, (_, i) => i);
    const buckets = bucketLast(items, 14);
    expect(buckets).toHaveLength(14);
    expect(buckets.at(-1)).toBe(89);
    expect(bucketLast([1, 2, 3], 14)).toEqual([1, 2, 3]);
  });
});
