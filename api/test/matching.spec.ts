import { describe, expect, it } from "vitest";
import { MatchingSignals, rankMatches, scoreMatch } from "../../src/matching";

const viewer: MatchingSignals = {
  id: "viewer",
  gender: "Woman",
  seeking: ["Man"],
  minAge: 28,
  maxAge: 38,
  maximumDistanceKm: 50,
  relationshipGoals: ["Long-term relationship"],
  interests: ["Walking", "Museums", "Travel"],
  values: ["Kindness", "Empathy", "Loyalty"],
  communities: ["Volunteering"],
  languages: ["English"],
  personality: "INFJ",
  lifestyle: { Smoke: "Never", Drink: "Socially" },
};

function candidate(overrides: Partial<MatchingSignals> = {}): MatchingSignals {
  return {
    id: "candidate",
    gender: "Man",
    seeking: ["Woman"],
    age: 32,
    visible: true,
    contactVerified: true,
    idVerified: true,
    profileCompleteness: 92,
    recentlyActive: true,
    distanceKm: 8,
    relationshipGoals: ["Long-term relationship"],
    interests: ["Walking", "Museums", "Travel"],
    values: ["Kindness", "Empathy", "Loyalty"],
    communities: ["Volunteering"],
    languages: ["English"],
    personality: "INFJ",
    lifestyle: { Smoke: "Never", Drink: "Socially" },
    ...overrides,
  };
}

describe("KindredCube matching constraints", () => {
  it("recommends a nearby reciprocal profile with aligned interests", () => {
    const result = scoreMatch(viewer, candidate());
    expect(result.eligible).toBe(true);
    expect(["connect", "kindred-picks"]).toContain(result.placement);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("excludes the wrong gender even when other signals are strong", () => {
    const result = scoreMatch(viewer, candidate({ gender: "Woman" }));
    expect(result.eligible).toBe(false);
    expect(result.exclusions).toContain("gender_preference");
  });

  it("excludes candidates outside the selected distance unless relocation is allowed", () => {
    const result = scoreMatch(viewer, candidate({ distanceKm: 120 }));
    expect(result.eligible).toBe(false);
    expect(result.exclusions).toContain("distance");
  });

  it("ranks the closer otherwise-equivalent profile first", () => {
    const candidates = [candidate({ id: "far", distanceKm: 35 }), candidate({ id: "near", distanceKm: 4 })];
    const ranked = rankMatches(viewer, candidates, (item) => item);
    expect(ranked[0]?.candidate.id).toBe("near");
  });
});
