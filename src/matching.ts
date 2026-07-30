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
  acceptsPartnerWithChildren?: boolean;
  allowsSmoking?: boolean;
  religion?: string;
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

export type MatchResult = {
  eligible: boolean;
  score: number;
  compatibilityScore: number;
  coverage: number;
  placement: "kindred-picks" | "connect" | "explore" | "none";
  exclusions: string[];
  components: MatchComponentScores;
  explanationKeys: string[];
  scoringVersion: "kindredcube-v1";
};

const finalWeights = {
  culturalValues: 27,
  intentions: 18,
  lifestyle: 13.5,
  languages: 13.5,
  culturalDiscovery: 9,
  location: 9,
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
  const culturalValues = normalized((cvi ?? 0.62) * 0.67 + (values ?? 0.6) * 0.22 + (personality ?? 0.6) * 0.11);
  const intentions = overlap(viewer.relationshipGoals, candidate.relationshipGoals) ?? 0.62;
  const lifestyle = lifestyleSimilarity(viewer, candidate) ?? 0.62;
  const languages = overlap(viewer.languages, candidate.languages) ?? 0.6;
  const culturePreference = candidate.culture && viewer.culturePreferences?.length
    ? viewer.culturePreferences.some((item) => item.toLowerCase() === candidate.culture!.toLowerCase()) ? 1 : 0.45
    : 0.65;
  const communities = overlap(viewer.communities, candidate.communities) ?? 0.6;
  const culturalDiscovery = normalized(culturePreference * 0.7 + communities * 0.3);
  const location = locationSimilarity(viewer, candidate) ?? (candidate.readyToMeet ? 0.72 : 0.62);

  const compatibilityScore =
    culturalValues * finalWeights.culturalValues +
    intentions * finalWeights.intentions +
    lifestyle * finalWeights.lifestyle +
    languages * finalWeights.languages +
    culturalDiscovery * finalWeights.culturalDiscovery +
    location * finalWeights.location;
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
  const score = Math.round((compatibilityScore + readiness) * 10) / 10;
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
