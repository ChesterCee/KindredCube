export type MatchingSignals = {
  id: string;
  gender?: string;
  age?: number;
  culture?: string;
  seeking?: string[];
  requiredRelationshipGoals?: string[];
  minAge?: number;
  maxAge?: number;
  blockedIds?: string[];
  suspended?: boolean;
  visible?: boolean;
  contactVerified?: boolean;
  idVerified?: boolean;
  selfieVerified?: boolean;
  meetupVerified?: boolean;
  profileCompleteness?: number;
  recentlyActive?: boolean;
  cvi?: number[];
  personality?: string;
  values?: string[];
  relationshipGoals?: string[];
  interests?: string[];
  communities?: string[];
  languages?: string[];
  culturePreferences?: string[];
  lifestyle?: Record<string, string>;
  hasChildren?: boolean;
  wantsChildren?: string;
  acceptsPartnerWithChildren?: boolean;
  allowsSmoking?: boolean;
  religion?: string;
  religionDifferenceOpenness?: 1 | 2 | 3 | 4 | 5;
  politics?: string;
  compatibilityResponses?: Record<
    string,
    {
      category:
        | "coreValues"
        | "faithSpirituality"
        | "relationships"
        | "ethics"
        | "conflictPersonality"
        | "lifestyle"
        | "ambition"
        | "politicsSociety";
      value: 1 | 2 | 3 | 4 | 5;
    }
  >;
  essentialReligions?: string[];
  distanceKm?: number;
  maximumDistanceKm?: number;
  openToRelocate?: boolean;
  readyToMeet?: boolean;
};

export type MatchComponentScores = {
  culturalValues: number;
  intentions: number;
  lifestyle: number;
  languages: number;
  culturalDiscovery: number;
  location: number;
  readiness: number;
};

export type CompatibilityCategoryScores = {
  coreValues: number;
  faithSpirituality: number;
  relationships: number;
  ethics: number;
  conflictPersonality: number;
  lifestyle: number;
  ambition: number;
  politicsSociety: number;
};

export type MatchResult = {
  eligible: boolean;
  score: number;
  compatibilityScore: number;
  coverage: number;
  placement: "kindred-picks" | "connect" | "explore" | "none";
  exclusions: string[];
  components: MatchComponentScores;
  categoryScores: CompatibilityCategoryScores;
  explanationKeys: string[];
  scoringVersion: "kindredcube-v1";
};

const compatibilityWeights = {
  coreValues: 20,
  faithSpirituality: 20,
  relationships: 20,
  ethics: 15,
  conflictPersonality: 10,
  lifestyle: 7,
  ambition: 5,
  politicsSociety: 3,
} as const;

const normalized = (value: number) => Math.max(0, Math.min(1, value));
const normalizedWords = (items: string[] | undefined) =>
  new Set((items || []).map((item) => item.trim().toLowerCase()).filter(Boolean));

function overlap(first?: string[], second?: string[]) {
  const left = normalizedWords(first);
  const right = normalizedWords(second);
  if (!left.size || !right.size) return null;
  let shared = 0;
  left.forEach((item) => {
    if (right.has(item)) shared += 1;
  });
  return shared / Math.max(1, Math.min(left.size, right.size));
}

function vectorSimilarity(first?: number[], second?: number[]) {
  if (!first?.length || !second?.length || first.length !== second.length) return null;
  const averageDifference = first.reduce(
    (sum, value, index) => sum + Math.abs(value - second[index]!),
    0,
  ) / first.length;
  return normalized(1 - averageDifference);
}

function lifestyleSimilarity(first: MatchingSignals, second: MatchingSignals) {
  const keys = new Set([
    ...Object.keys(first.lifestyle || {}),
    ...Object.keys(second.lifestyle || {}),
  ]);
  const comparable = [...keys].filter(
    (key) => first.lifestyle?.[key] && second.lifestyle?.[key],
  );
  const exact = comparable.filter(
    (key) => first.lifestyle?.[key] === second.lifestyle?.[key],
  ).length;
  const interestScore = overlap(first.interests, second.interests);
  const lifestyleScore = comparable.length ? exact / comparable.length : null;
  if (interestScore === null && lifestyleScore === null) return null;
  return normalized((interestScore ?? 0.6) * 0.45 + (lifestyleScore ?? 0.6) * 0.55);
}

function locationSimilarity(first: MatchingSignals, second: MatchingSignals) {
  const distance = second.distanceKm;
  const maximum = first.maximumDistanceKm;
  if (distance === undefined || maximum === undefined) return null;
  if (distance <= maximum) return normalized(1 - (distance / Math.max(1, maximum)) * 0.55);
  return first.openToRelocate || second.openToRelocate ? 0.55 : 0;
}

function responseDistanceCompatibility(first: number, second: number) {
  const distance = Math.abs(first - second);
  if (distance <= 0) return 1;
  if (distance === 1) return 0.75;
  if (distance === 2) return 0.5;
  if (distance === 3) return 0.25;
  return 0;
}

function categoryResponseCompatibility(
  first: MatchingSignals,
  second: MatchingSignals,
  category: keyof CompatibilityCategoryScores,
) {
  const firstResponses = first.compatibilityResponses || {};
  const secondResponses = second.compatibilityResponses || {};
  const sharedKeys = Object.keys(firstResponses).filter(
    (key) =>
      firstResponses[key]?.category === category &&
      secondResponses[key]?.category === category &&
      typeof firstResponses[key]?.value === "number" &&
      typeof secondResponses[key]?.value === "number",
  );
  if (!sharedKeys.length) return null;
  const total = sharedKeys.reduce(
    (sum, key) =>
      sum + responseDistanceCompatibility(firstResponses[key]!.value, secondResponses[key]!.value),
    0,
  );
  return normalized(total / sharedKeys.length);
}

function sameText(first?: string, second?: string) {
  return Boolean(first?.trim() && second?.trim() && first.trim().toLowerCase() === second.trim().toLowerCase());
}

function religionCompatibility(first: MatchingSignals, second: MatchingSignals) {
  const responseScore = categoryResponseCompatibility(first, second, "faithSpirituality");
  const sameReligion = sameText(first.religion, second.religion);
  const firstOpen = first.religionDifferenceOpenness;
  const secondOpen = second.religionDifferenceOpenness;
  const oneRequiresSameFaith = firstOpen === 1 || secondOpen === 1;
  const oneStronglyPrefersSameFaith = firstOpen === 2 || secondOpen === 2;
  const bothOpen = (firstOpen ?? 4) >= 4 && (secondOpen ?? 4) >= 4;

  let ruleScore: number | null = null;
  if (first.religion && second.religion) {
    if (sameReligion && oneRequiresSameFaith) ruleScore = 1;
    else if (sameReligion) ruleScore = 0.88;
    else if (oneRequiresSameFaith) ruleScore = 0.12;
    else if (oneStronglyPrefersSameFaith) ruleScore = 0.32;
    else if (bothOpen) ruleScore = 0.78;
    else ruleScore = 0.58;
  }

  if (responseScore === null && ruleScore === null) return 0.62;
  return normalized((responseScore ?? ruleScore ?? 0.62) * 0.55 + (ruleScore ?? responseScore ?? 0.62) * 0.45);
}

function normalizedKidsPreference(value?: string) {
  const normalizedValue = value?.trim().toLowerCase() || "";
  if (!normalizedValue) return "";
  if (normalizedValue.includes("don't") || normalizedValue.includes("dont") || normalizedValue.includes("does not") || normalizedValue === "no") return "no";
  if (normalizedValue.includes("open") || normalizedValue.includes("unsure") || normalizedValue.includes("not sure")) return "open";
  if (normalizedValue.includes("yes") || normalizedValue.includes("want")) return "yes";
  return normalizedValue;
}

function childrenCompatibility(first: MatchingSignals, second: MatchingSignals) {
  const firstWant = normalizedKidsPreference(first.wantsChildren);
  const secondWant = normalizedKidsPreference(second.wantsChildren);
  if (!firstWant || !secondWant) return null;
  if (firstWant === secondWant) return firstWant === "open" ? 0.76 : 0.94;
  if ((firstWant === "yes" && secondWant === "no") || (firstWant === "no" && secondWant === "yes")) return 0.1;
  if (firstWant === "open" || secondWant === "open") return 0.62;
  return 0.45;
}

function relationshipIntentionCompatibility(first: MatchingSignals, second: MatchingSignals) {
  const intentOverlap = overlap(first.relationshipGoals, second.relationshipGoals);
  if (intentOverlap !== null) return intentOverlap;
  return null;
}

function compatibilityCategoryScores(viewer: MatchingSignals, candidate: MatchingSignals): CompatibilityCategoryScores {
  const responseOr = (category: keyof CompatibilityCategoryScores, fallback: number) =>
    categoryResponseCompatibility(viewer, candidate, category) ?? fallback;

  const cvi = vectorSimilarity(viewer.cvi, candidate.cvi);
  const values = overlap(viewer.values, candidate.values);
  const personality = viewer.personality && candidate.personality
    ? viewer.personality === candidate.personality ? 0.8 : 0.65
    : null;
  const coreValues = responseOr(
    "coreValues",
    normalized((cvi ?? 0.62) * 0.62 + (values ?? 0.6) * 0.28 + (personality ?? 0.6) * 0.1),
  );
  const faithSpirituality = religionCompatibility(viewer, candidate);
  const children = childrenCompatibility(viewer, candidate);
  const intentions = relationshipIntentionCompatibility(viewer, candidate);
  const relationships = normalized(
    responseOr("relationships", (intentions ?? 0.62) * 0.72 + (children ?? 0.62) * 0.28),
  );
  const ethics = responseOr("ethics", normalized((values ?? 0.6) * 0.72 + (overlap(viewer.communities, candidate.communities) ?? 0.6) * 0.28));
  const conflictPersonality = responseOr("conflictPersonality", normalized((personality ?? 0.62) * 0.65 + (values ?? 0.6) * 0.35));
  const lifestyle = responseOr("lifestyle", lifestyleSimilarity(viewer, candidate) ?? 0.62);
  const ambition = responseOr(
    "ambition",
    normalized((values ?? 0.6) * 0.55 + (overlap(viewer.relationshipGoals, candidate.relationshipGoals) ?? 0.62) * 0.45),
  );
  const politicsSociety = responseOr(
    "politicsSociety",
    viewer.politics && candidate.politics ? (sameText(viewer.politics, candidate.politics) ? 0.82 : 0.55) : 0.62,
  );

  return {
    coreValues: Math.round(coreValues * 100),
    faithSpirituality: Math.round(faithSpirituality * 100),
    relationships: Math.round(relationships * 100),
    ethics: Math.round(ethics * 100),
    conflictPersonality: Math.round(conflictPersonality * 100),
    lifestyle: Math.round(lifestyle * 100),
    ambition: Math.round(ambition * 100),
    politicsSociety: Math.round(politicsSociety * 100),
  };
}

function weightedCompatibilityScore(categories: CompatibilityCategoryScores) {
  return Object.entries(compatibilityWeights).reduce(
    (sum, [key, weight]) => sum + (categories[key as keyof CompatibilityCategoryScores] / 100) * weight,
    0,
  );
}

export function scoreMatch(viewer: MatchingSignals, candidate: MatchingSignals): MatchResult {
  const exclusions: string[] = [];
  if (viewer.blockedIds?.includes(candidate.id) || candidate.blockedIds?.includes(viewer.id)) exclusions.push("blocked");
  if (candidate.suspended) exclusions.push("safety_restricted");
  if (candidate.visible === false) exclusions.push("not_visible");
  if (candidate.contactVerified === false) exclusions.push("contact_not_verified");
  if (viewer.seeking?.length && candidate.gender && !viewer.seeking.includes(candidate.gender)) exclusions.push("gender_preference");
  if (candidate.seeking?.length && viewer.gender && !candidate.seeking.includes(viewer.gender)) exclusions.push("reciprocal_gender_preference");
  if (candidate.age !== undefined && viewer.minAge !== undefined && candidate.age < viewer.minAge) exclusions.push("below_age_range");
  if (candidate.age !== undefined && viewer.maxAge !== undefined && candidate.age > viewer.maxAge) exclusions.push("above_age_range");
  if (
    candidate.distanceKm !== undefined &&
    viewer.maximumDistanceKm !== undefined &&
    candidate.distanceKm > viewer.maximumDistanceKm &&
    !viewer.openToRelocate &&
    !candidate.openToRelocate
  ) exclusions.push("distance");
  if (viewer.acceptsPartnerWithChildren === false && candidate.hasChildren) exclusions.push("children_preference");
  if (
    viewer.allowsSmoking === false &&
    candidate.lifestyle?.Smoke &&
    !["never", "no"].includes(candidate.lifestyle.Smoke.toLowerCase())
  ) exclusions.push("smoking_preference");
  if (
    viewer.essentialReligions?.length &&
    candidate.religion &&
    !viewer.essentialReligions.some((religion) => religion.toLowerCase() === candidate.religion!.toLowerCase())
  ) exclusions.push("religion_preference");
  if (
    viewer.requiredRelationshipGoals?.length &&
    candidate.relationshipGoals?.length &&
    overlap(viewer.requiredRelationshipGoals, candidate.relationshipGoals) === 0
  ) exclusions.push("relationship_goal");

  const cvi = vectorSimilarity(viewer.cvi, candidate.cvi);
  const values = overlap(viewer.values, candidate.values);
  const personality = viewer.personality && candidate.personality
    ? viewer.personality === candidate.personality ? 0.8 : 0.65
    : null;
  const categoryScores = compatibilityCategoryScores(viewer, candidate);
  const culturalValues = categoryScores.coreValues / 100;
  const intentions = categoryScores.relationships / 100;
  const lifestyle = lifestyleSimilarity(viewer, candidate) ?? 0.62;
  const languages = overlap(viewer.languages, candidate.languages) ?? 0.6;
  const culturePreference = candidate.culture && viewer.culturePreferences?.length
    ? viewer.culturePreferences.some((item) => item.toLowerCase() === candidate.culture!.toLowerCase()) ? 1 : 0.45
    : 0.65;
  const communities = overlap(viewer.communities, candidate.communities) ?? 0.6;
  const culturalDiscovery = normalized(culturePreference * 0.45 + communities * 0.25 + (categoryScores.ethics / 100) * 0.3);
  const location = locationSimilarity(viewer, candidate) ?? (candidate.readyToMeet ? 0.72 : 0.62);

  const compatibilityScore = weightedCompatibilityScore(categoryScores);
  const readiness =
    (candidate.idVerified ? 3 : 0) +
    (candidate.selfieVerified ? 2 : 0) +
    (candidate.meetupVerified ? 2 : 0) +
    normalized((candidate.profileCompleteness ?? 0) / 100) * 2 +
    (candidate.recentlyActive ? 1 : 0);
  const knownFields = [
    cvi,
    values,
    personality,
    overlap(viewer.relationshipGoals, candidate.relationshipGoals),
    lifestyleSimilarity(viewer, candidate),
    overlap(viewer.languages, candidate.languages),
    viewer.culturePreferences?.length ? culturePreference : null,
    overlap(viewer.communities, candidate.communities),
    locationSimilarity(viewer, candidate),
  ].filter((value) => value !== null).length;
  const coverage = Math.round((knownFields / 9) * 100);
  const score = Math.round(Math.min(100, compatibilityScore + readiness) * 10) / 10;
  const eligible = exclusions.length === 0;
  const placement = !eligible || score < 55
    ? "none"
    : score >= 85 && coverage >= 75
      ? "kindred-picks"
      : score >= 75 && coverage >= 65
        ? "connect"
        : score < 75 && coverage >= 55
          ? "explore"
          : "none";
  const explanations = [
    [culturalValues, "shared_values"],
    [intentions, "aligned_intentions"],
    [lifestyle, "compatible_lifestyle"],
    [languages, "shared_languages"],
    [culturalDiscovery, "cultural_common_ground"],
    [location, "practical_distance"],
  ] as const;
  return {
    eligible,
    score,
    compatibilityScore: Math.round(compatibilityScore * 10) / 10,
    coverage,
    placement,
    exclusions,
    components: {
      culturalValues: Math.round(culturalValues * 100),
      intentions: Math.round(intentions * 100),
      lifestyle: Math.round(lifestyle * 100),
      languages: Math.round(languages * 100),
      culturalDiscovery: Math.round(culturalDiscovery * 100),
      location: Math.round(location * 100),
      readiness: Math.round(readiness * 10) / 10,
    },
    categoryScores,
    explanationKeys: explanations
      .filter(([value]) => value >= 0.7)
      .sort((first, second) => second[0] - first[0])
      .slice(0, 3)
      .map(([, key]) => key),
    scoringVersion: "kindredcube-v1",
  };
}

export function rankMatches<T>(
  viewer: MatchingSignals,
  candidates: T[],
  toSignals: (candidate: T) => MatchingSignals,
) {
  return candidates
    .map((candidate) => ({ candidate, result: scoreMatch(viewer, toSignals(candidate)) }))
    .filter(({ result }) => result.eligible && result.placement !== "none")
    .sort((first, second) => second.result.score - first.result.score);
}
