import { describe, expect, it } from "vitest";
import { aggregateKbEffectiveness, kbArticleFlag, type KbEffectiveness, type KbUsageRow } from "./kb-effectiveness";

const resolved = (csat: number | null = null) => ({ ai_resolved: true, status: "resolved", csat_score: csat });
const escalated = () => ({ ai_resolved: false, status: "escalated", csat_score: null });

describe("aggregateKbEffectiveness", () => {
  it("counts surfaced vs cited, and resolves only over cited + ai_resolved tickets", () => {
    const data: KbUsageRow[] = [
      { article_id: "a", cited: true, ticket: resolved() },
      { article_id: "a", cited: true, ticket: escalated() },
      { article_id: "a", cited: false, ticket: resolved() }, // surfaced, not cited
    ];
    const e = aggregateKbEffectiveness(data).get("a")!;
    expect(e.surfaced).toBe(3);
    expect(e.cited).toBe(2);
    expect(e.resolved).toBe(1);
    expect(e.resolveRate).toBe(50);
  });

  it("averages CSAT over cited rated tickets and counts negatives", () => {
    const data: KbUsageRow[] = [
      { article_id: "a", cited: true, ticket: resolved(5) },
      { article_id: "a", cited: true, ticket: resolved(2) },
      { article_id: "a", cited: true, ticket: resolved(null) }, // unrated — excluded from avg
    ];
    const e = aggregateKbEffectiveness(data).get("a")!;
    expect(e.avgCsat).toBe(3.5); // (5 + 2) / 2
    expect(e.negativeCsat).toBe(1);
  });

  it("keeps articles separate and tolerates a missing ticket", () => {
    const data: KbUsageRow[] = [
      { article_id: "a", cited: false, ticket: null },
      { article_id: "b", cited: true, ticket: resolved() },
    ];
    const map = aggregateKbEffectiveness(data);
    expect(map.get("a")!.resolveRate).toBeNull(); // never cited
    expect(map.get("a")!.avgCsat).toBeNull();
    expect(map.get("b")!.resolveRate).toBe(100);
  });
});

describe("kbArticleFlag", () => {
  const base = (): KbEffectiveness => ({
    article_id: "a",
    surfaced: 10,
    cited: 10,
    resolved: 9,
    negativeCsat: 0,
    avgCsat: 4.6,
    resolveRate: 90,
  });
  const eff = (over: Partial<KbEffectiveness> = {}): KbEffectiveness => ({ ...base(), ...over });

  it("returns null below the 3-cited signal threshold", () => {
    expect(kbArticleFlag(eff({ cited: 2, resolved: 0, resolveRate: 0 }))).toBeNull();
  });

  it("flags review on any negative CSAT", () => {
    expect(kbArticleFlag(eff({ negativeCsat: 1 }))).toBe("review");
  });

  it("flags review when resolve rate is below 50%", () => {
    expect(kbArticleFlag(eff({ resolved: 4, resolveRate: 40 }))).toBe("review");
  });

  it("marks a clean high resolver a workhorse", () => {
    expect(kbArticleFlag(eff())).toBe("workhorse");
  });

  it("stays neutral in the middle band", () => {
    expect(kbArticleFlag(eff({ resolved: 6, resolveRate: 60 }))).toBeNull();
  });
});
