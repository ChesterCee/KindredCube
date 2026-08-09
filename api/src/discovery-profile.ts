import { PoolClient } from "pg";

const allowedGenders = new Set(["Man", "Woman", "Nonbinary"]);
const allowedSeeking = new Set(["Women", "Men", "Everyone"]);

export async function syncDiscoveryProfile(
  client: PoolClient,
  userId: string,
  profile: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  const identity = text(profile.identity) || text(record(profile.details).Gender);
  const seeking = text(profile.seeking);
  const dateOfBirth = text(profile.dateOfBirth);
  if (!allowedGenders.has(identity) || !allowedSeeking.has(seeking) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return;

  const location = record(profile.matchingLocation);
  const latitude = finiteCoordinate(location.latitude, -90, 90);
  const longitude = finiteCoordinate(location.longitude, -180, 180);
  const readyToMeetAvailability = record(settings.readyToMeetAvailability);
  const readyToMeetAt = text(readyToMeetAvailability.availableAt);
  const readyToMeetExpiresAt = text(readyToMeetAvailability.expiresAt);
  const readyToMeetStartMs = readyToMeetAt ? new Date(readyToMeetAt).getTime() : Number.NaN;
  const readyToMeetEndMs = readyToMeetExpiresAt ? new Date(readyToMeetExpiresAt).getTime() : Number.NaN;
  const readyToMeet = readyToMeetAvailability.available === true
    && Number.isFinite(readyToMeetStartMs)
    && Number.isFinite(readyToMeetEndMs)
    && readyToMeetStartMs <= Date.now()
    && readyToMeetEndMs > Date.now();
  const matchingData = {
    personality: text(profile.personality),
    relationshipGoals: stringList(profile.relationshipGoals, 10),
    interests: stringList(profile.interests, 25),
    causes: stringList(profile.causes, 10),
    values: stringList(profile.values, 20),
    languages: stringList(profile.languages, 20),
    culturePreferences: stringList(profile.culturePreferences, 20),
    details: safeDetails(profile.details),
    occupation: text(profile.occupation).slice(0, 120),
    work: text(profile.work).slice(0, 120),
    hometown: text(profile.hometown).slice(0, 120),
    profileStrength: calculateProfileStrength(profile),
    minAge: Math.max(18, Math.min(100, Number(profile.minAge) || 18)),
    maxAge: Math.max(18, Math.min(100, Number(profile.maxAge) || 100)),
    maximumDistanceKm: Math.max(1, Math.min(500, Number(profile.maximumDistanceKm) || 80)),
    openToRelocate: profile.openToRelocate === true,
    bio: text(profile.bio).slice(0, 2000),
    bestPhotoUri: text(profile.bestPhotoUri).slice(0, 8000),
    photos: safePhotos(profile.photos),
    readyToMeet,
    readyToMeetAt: readyToMeetAt.slice(0, 50),
    readyToMeetExpiresAt: readyToMeetExpiresAt.slice(0, 50),
    promptAnswers: safePromptAnswers(profile.promptAnswers),
  };
  const culture = text(profile.culture) || stringList(profile.personalLifestyle, 1)[0] || "";
  const visible = settings.profilePaused !== true && settings.incognitoMode !== true;

  await client.query(
    `INSERT INTO discovery_profiles
      (user_id, display_name, gender, seeking, date_of_birth, culture, occupation,
       matching_data, area_latitude, area_longitude, visible, recently_active_at)
     SELECT $1, public_username::text, $2, $3, $4::date, $5, $6, $7::jsonb, $8, $9, $10, now()
       FROM users WHERE id = $1 AND status = 'active' AND email_verified_at IS NOT NULL
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       gender = EXCLUDED.gender,
       seeking = EXCLUDED.seeking,
       date_of_birth = EXCLUDED.date_of_birth,
       culture = EXCLUDED.culture,
       occupation = EXCLUDED.occupation,
       matching_data = EXCLUDED.matching_data,
       area_latitude = EXCLUDED.area_latitude,
       area_longitude = EXCLUDED.area_longitude,
       visible = EXCLUDED.visible,
       recently_active_at = now(),
       updated_at = now()`,
    [userId, identity, seeking, dateOfBirth, culture.slice(0, 80), text(profile.occupation).slice(0, 120), JSON.stringify(matchingData), latitude, longitude, visible],
  );
}

function calculateProfileStrength(profile: Record<string, unknown>) {
  const details = record(profile.details);
  const photos = safePhotos(profile.photos);
  const prompts = record(profile.promptAnswers);
  const validPromptCount = Object.values(prompts).filter((entry) => {
    const prompt = record(entry);
    return text(prompt.prompt) && text(prompt.answer).length >= 3;
  }).length;
  const completed = [
    text(profile.personality),
    stringList(profile.relationshipGoals, 10).length,
    stringList(profile.interests, 25).length,
    stringList(profile.causes, 10).length,
    stringList(profile.values, 20).length,
    text(profile.bio),
    text(profile.work),
    text(profile.occupation),
    text(profile.hometown),
    Object.keys(details).length >= 4,
    stringList(profile.languages, 20).length,
  ].filter(Boolean).length;
  const baseCompletionScore = Math.round((completed / 11) * 54);
  const promptCompletionScore = Math.min(12, validPromptCount * 4);
  const photoCompletionScore = Math.min(24, photos.length * 8);
  return Math.min(90, photoCompletionScore + promptCompletionScore + baseCompletionScore);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown, maximum: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, maximum)
    : [];
}

function safeDetails(value: unknown) {
  const input = record(value);
  return Object.fromEntries(Object.entries(input)
    .filter(([key, item]) => key.length <= 50 && typeof item === "string")
    .slice(0, 30)
    .map(([key, item]) => [key, (item as string).slice(0, 100)]));
}

function safePhotos(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((photo): photo is Record<string, unknown> => Boolean(photo) && typeof photo === "object" && !Array.isArray(photo))
        .map((photo) => ({
          id: text(photo.id).slice(0, 80),
          uri: text(photo.uri).slice(0, 8000),
        }))
        .filter((photo) => photo.uri)
        .slice(0, 9)
    : [];
}

function safePromptAnswers(value: unknown) {
  const prompts = Array.isArray(value)
    ? Object.fromEntries(value.map((item, index) => [String(index), item]))
    : record(value);
  return Object.fromEntries(
    Object.entries(prompts)
      .map(([category, item]) => {
        const prompt = record(item);
        const promptText = text(prompt.prompt) || text(prompt.question) || text(prompt.title);
        const answerText = text(prompt.answer) || text(prompt.response) || text(prompt.value);
        return [
          category.slice(0, 60),
          {
            prompt: promptText.slice(0, 180),
            answer: answerText.slice(0, 600),
          },
        ] as const;
      })
      .filter(([, item]) => item.prompt && item.answer),
  );
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= maximum ? numeric : null;
}
