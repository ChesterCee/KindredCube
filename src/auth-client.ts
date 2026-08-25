import * as SecureStore from "expo-secure-store";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const runtimeWebApiUrl =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as unknown as { KINDREDCUBE_API_URL?: unknown }).KINDREDCUBE_API_URL === "string"
    ? ((globalThis as unknown as { KINDREDCUBE_API_URL: string }).KINDREDCUBE_API_URL || "").replace(/\/$/, "")
    : "";
const configuredWebApiUrl =
  runtimeWebApiUrl ||
  process.env.EXPO_PUBLIC_WEB_API_URL?.replace(/\/$/, "") ||
  "https://api.kindredcube.com";
const API_URL = (process.env.EXPO_OS === "web" ? configuredWebApiUrl : configuredApiUrl) || "";
export const PUBLIC_API_URL = API_URL || "";
const runtimeHostname =
  typeof window !== "undefined" &&
  typeof (window as unknown as { location?: { hostname?: unknown } }).location?.hostname === "string"
    ? (window as unknown as { location: { hostname: string } }).location.hostname
    : "";
const runningOnLocalWeb =
  ["localhost", "127.0.0.1", "0.0.0.0"].includes(runtimeHostname);
const API_URL_IS_LOCAL_OR_PRIVATE =
  /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(API_URL);
const API_URL_IS_SECURE =
  !API_URL ||
  API_URL.startsWith("https://") ||
  (process.env.NODE_ENV !== "production" && API_URL_IS_LOCAL_OR_PRIVATE) ||
  (process.env.EXPO_OS === "web" && runningOnLocalWeb && API_URL_IS_LOCAL_OR_PRIVATE);
const ACCESS_TOKEN_KEY = "kindredcube.access-token";
const REFRESH_TOKEN_KEY = "kindredcube.refresh-token";
const WEB_TOKEN_SESSION_KEY = "kindredcube.web-token-session";
const WEB_TOKEN_TTL_MS = 60 * 60 * 1000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RegistrationInput = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  identity: string;
  seeking: string;
  dateOfBirth: string;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
};

type WebTokenSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  identity: string;
  seeking: string;
};

export type IdentityVerificationStatus =
  | "not_started"
  | "requires_input"
  | "processing"
  | "verified"
  | "canceled"
  | "redacted";

let webAccessToken = "";
let webRefreshToken = "";
let authExpiredHandler: (() => void) | null = null;
let refreshPromise: Promise<RefreshResult> | null = null;

type RefreshResult = "refreshed" | "invalid" | "network_error";

function readWebTokenSession(): WebTokenSession | null {
  if (process.env.EXPO_OS !== "web" || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WEB_TOKEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WebTokenSession>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(WEB_TOKEN_SESSION_KEY);
      return null;
    }
    webAccessToken = parsed.accessToken;
    webRefreshToken = parsed.refreshToken;
    return parsed as WebTokenSession;
  } catch {
    return null;
  }
}

function writeWebTokenSession(pair: TokenPair) {
  if (process.env.EXPO_OS !== "web" || typeof window === "undefined") return;
  const session: WebTokenSession = {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    expiresAt: Date.now() + WEB_TOKEN_TTL_MS,
  };
  window.sessionStorage.setItem(WEB_TOKEN_SESSION_KEY, JSON.stringify(session));
}

function clearWebTokenSession() {
  if (process.env.EXPO_OS !== "web" || typeof window === "undefined") return;
  window.sessionStorage.removeItem(WEB_TOKEN_SESSION_KEY);
}

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler;
}

async function expireSession() {
  await clearTokens();
  authExpiredHandler?.();
}

async function request<T>(
  path: string,
  options: RequestInit,
  authenticated = false,
  retryAfterRefresh = true,
): Promise<T> {
  if (!API_URL) {
    throw new ApiError(
      "KindredCube authentication is not configured. Set EXPO_PUBLIC_API_URL and restart the app.",
      0,
      "API_NOT_CONFIGURED",
    );
  }
  if (!API_URL_IS_SECURE) {
    throw new ApiError("KindredCube requires an HTTPS API connection outside local development.", 0, "INSECURE_API_URL");
  }
  let response: Response;
  const controller = new AbortController();
  const timeoutMs = path.includes("/media/") ? 60_000 : 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const accessToken = authenticated ? await getAccessToken() : "";
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      path.includes("/media/")
        ? "KindredCube could not finish uploading this photo. Please check your connection and try again."
        : "KindredCube could not reach the secure sign-in service. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (authenticated && response.status === 401 && retryAfterRefresh) {
    const refreshed = await refreshSession();
    if (refreshed === "refreshed") return request<T>(path, options, true, false);
    if (refreshed === "invalid") {
      await expireSession();
    } else {
      throw new ApiError(
        "KindredCube could not refresh your secure session. Check your connection and try again.",
        0,
        "SESSION_REFRESH_NETWORK_ERROR",
      );
    }
  } else if (authenticated && response.status === 401) {
    await expireSession();
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message[0]
      : data.message || "The request could not be completed.";
    throw new ApiError(message, response.status, data.code);
  }
  return data as T;
}

async function refreshSession(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefreshSession().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefreshSession(): Promise<RefreshResult> {
  const refreshToken = await getRefreshToken();
  if (!API_URL || !refreshToken) return "invalid";
  try {
    const response = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      await clearTokens();
      return "invalid";
    }
    const pair = (await response.json()) as TokenPair;
    await saveTokens(pair);
    return "refreshed";
  } catch {
    return "network_error";
  }
}

export function registerAccount(input: RegistrationInput) {
  return request<{ accepted: true; message: string; developmentVerificationUrl?: string }>("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginAccount(email: string, password: string) {
  await clearTokens();
  try {
    const pair = await request<TokenPair>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceName: "KindredCube mobile" }),
    });
    await saveTokens(pair);
    return await getCurrentUser();
  } catch (error) {
    await clearTokens();
    throw error;
  }
}

export async function completeEmailLogin(ticket: string) {
  const result = await request<TokenPair & { user: AuthenticatedUser }>(
    "/v1/auth/complete-email-login",
    {
      method: "POST",
      body: JSON.stringify({
        ticket,
        deviceName: "KindredCube mobile",
      }),
    },
  );
  await saveTokens(result);
  return result.user;
}

export function resendVerificationEmail(email: string) {
  return request<{ accepted: true; message: string; developmentVerificationUrl?: string }>(
    "/v1/auth/resend-verification",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function requestPasswordReset(email: string) {
  return request<{ accepted: true; message: string; developmentResetUrl?: string }>("/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function requestSignedInPasswordReset() {
  return request<{ accepted: true; message: string; developmentResetUrl?: string }>(
    "/v1/auth/me/request-password-reset",
    { method: "POST" },
    true,
  );
}

export function resetPassword(token: string, password: string, currentPassword?: string) {
  return request<{ changed: true; message: string }>("/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password, ...(currentPassword ? { currentPassword } : {}) }),
  });
}

export function getCurrentUser() {
  return request<AuthenticatedUser>("/v1/auth/me", { method: "GET" }, true);
}

export function updateAccountUsername(username: string) {
  return request<{ username: string }>(
    "/v1/auth/me/username",
    {
      method: "PUT",
      body: JSON.stringify({ username }),
    },
    true,
  );
}

export async function deleteAccount(input: { reasons: string[]; details?: string }) {
  const result = await request<{ deleted: true }>(
    "/v1/auth/delete-account",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    true,
  );
  await clearTokens();
  return result;
}

export function getPrivateSpace() {
  return request<{
    profile: Record<string, unknown>;
    settings: Record<string, unknown>;
  }>("/v1/me/private-space", { method: "GET" }, true);
}

export function updatePrivateSpace(
  profile: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  return request<{
    profile: Record<string, unknown>;
    settings: Record<string, unknown>;
  }>(
    "/v1/me/private-space",
    {
      method: "PUT",
      body: JSON.stringify({ profile, settings }),
    },
    true,
  );
}

export type AmaraWelcomeReceipt = {
  delivered: boolean;
  read: boolean;
  deliveredAt: string | null;
  readAt: string | null;
};

export function getAmaraWelcomeReceipt() {
  return request<AmaraWelcomeReceipt>(
    "/v1/me/system-messages/amara-welcome",
    { method: "GET" },
    true,
  );
}

export function markAmaraWelcomeDelivered() {
  return request<AmaraWelcomeReceipt>(
    "/v1/me/system-messages/amara-welcome/delivered",
    { method: "POST" },
    true,
  );
}

export function markAmaraWelcomeRead() {
  return request<AmaraWelcomeReceipt>(
    "/v1/me/system-messages/amara-welcome/read",
    { method: "POST" },
    true,
  );
}

export function blockMemberProfile(profileId: string, reason?: string, details?: string) {
  return request<{ blocked: true; moderationAction?: { action: string; uniqueSignals: number } | null }>(
    "/v1/member-safety/blocks",
    { method: "POST", body: JSON.stringify({ profileId, reason, details }) },
    true,
  );
}

export function reportMemberProfile(input: {
  profileId: string;
  reason: string;
  details?: string;
}) {
  return request<{ reportId: string; status: "submitted"; createdAt: string; moderationAction?: { action: string; uniqueSignals: number } | null }>(
    "/v1/member-safety/reports",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export type ModerationQueueItem = {
  profile_id: string;
  username: string | null;
  email: string | null;
  account_status: string | null;
  report_count: number;
  block_count: number;
  latest_report_reason: string | null;
  latest_report_details: string | null;
  latest_block_reason: string | null;
  latest_block_details: string | null;
  latest_at: string;
};

export type ModerationAppeal = {
  id: string;
  user_id: string | null;
  email: string;
  public_username: string;
  details: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  moderator_notes: string;
};

export type AdminUserStats = {
  total_users: number;
  active_users: number;
  pending_users: number;
  suspended_users: number;
  deleted_users: number;
};

export type AdminPurchaseStat = {
  purchase_type: "wallet" | "kindred_pass" | "premium";
  status: string;
  count: number;
  amount_cents: number;
};

export type AdminPurchase = {
  id: string;
  user_id: string;
  username: string;
  purchase_type: "wallet" | "kindred_pass" | "premium";
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
};

export type AdminActiveUser = {
  id: string;
  email: string;
  username: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  userId?: string;
  email?: string;
  username?: string;
  reason: string;
  message: string;
  status: "open" | "in_review" | "resolved" | "closed";
  closeReason?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{
    id: string;
    ticketId: string;
    senderType: "user" | "admin" | "email";
    senderUserId?: string | null;
    senderEmail?: string | null;
    body: string;
    source: "app" | "admin" | "email";
    createdAt: string;
  }>;
};

export type HelpContentPage = {
  slug: string;
  category: "profile_setup" | "account_management" | "data_management";
  title: string;
  summary: string;
  body: string;
  imageUrls: string[];
  updatedAt: string;
};

export type LegalContentPage = {
  slug: "privacy" | "terms" | "community-guidelines";
  title: string;
  summary: string;
  body: string;
  imageUrls: string[];
  updatedAt: string;
};

export function getHelpContent() {
  return request<{ pages: HelpContentPage[] }>(
    "/v1/help-content",
    { method: "GET" },
    true,
  );
}

export function getLegalContent() {
  return request<{ pages: LegalContentPage[] }>(
    "/v1/legal-content",
    { method: "GET" },
    false,
  );
}

export function getLegalContentPage(slug: LegalContentPage["slug"]) {
  return request<{ page: LegalContentPage | null }>(
    `/v1/legal-content/${encodeURIComponent(slug)}`,
    { method: "GET" },
    false,
  );
}

export function getAdminHelpContent(adminMfaToken: string) {
  return request<{ pages: HelpContentPage[] }>(
    "/v1/admin/moderation/help-content",
    { method: "GET", headers: { "X-Admin-MFA": adminMfaToken } },
    true,
  );
}

export function getAdminLegalContent(adminMfaToken: string) {
  return request<{ pages: LegalContentPage[] }>(
    "/v1/admin/moderation/legal-content",
    { method: "GET", headers: { "X-Admin-MFA": adminMfaToken } },
    true,
  );
}

export function saveAdminHelpContent(
  slug: string,
  page: Pick<HelpContentPage, "title" | "summary" | "body" | "imageUrls">,
  adminMfaToken: string,
) {
  return request<{ page: HelpContentPage; saved: true }>(
    `/v1/admin/moderation/help-content/${encodeURIComponent(slug)}`,
    { method: "PUT", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify(page) },
    true,
  );
}

export function saveAdminLegalContent(
  slug: LegalContentPage["slug"],
  page: Pick<LegalContentPage, "title" | "summary" | "body" | "imageUrls">,
  adminMfaToken: string,
) {
  return request<{ page: LegalContentPage; saved: true }>(
    `/v1/admin/moderation/legal-content/${encodeURIComponent(slug)}`,
    { method: "PUT", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify(page) },
    true,
  );
}

export function requestAdminMfaChallenge() {
  return request<{ totpRequired: true; account: string; issuer: string; expiresInSeconds: number }>(
    "/v1/admin/moderation/mfa/challenge",
    { method: "POST" },
    true,
  );
}

export function verifyAdminMfaCode(code: string) {
  return request<{ adminMfaToken: string; expiresInSeconds: number }>(
    "/v1/admin/moderation/mfa/verify",
    { method: "POST", body: JSON.stringify({ code }) },
    true,
  );
}

export function getModerationQueue(adminMfaToken: string) {
  return request<{
    stats: AdminUserStats;
    activeUsers: AdminActiveUser[];
    purchaseStats: AdminPurchaseStat[];
    purchases: AdminPurchase[];
    queue: ModerationQueueItem[];
    appeals: ModerationAppeal[];
    supportTickets: SupportTicket[];
  }>(
    "/v1/admin/moderation/queue",
    { method: "GET", headers: { "X-Admin-MFA": adminMfaToken } },
    true,
  );
}

export function replyToSupportTicket(ticketId: string, message: string, adminMfaToken: string) {
  return request<{ ticket: SupportTicket; sent: true }>(
    `/v1/admin/moderation/support-tickets/${encodeURIComponent(ticketId)}/reply`,
    { method: "POST", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify({ message }) },
    true,
  );
}

export function closeAdminSupportTicket(ticketId: string, reason: string, adminMfaToken: string) {
  return request<{ ticket: SupportTicket; closed: true }>(
    `/v1/admin/moderation/support-tickets/${encodeURIComponent(ticketId)}/close`,
    { method: "POST", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify({ reason }) },
    true,
  );
}

export function createSupportTicket(input: {
  reason: string;
  message: string;
  searchedFor?: string;
}) {
  return request<{ ticket: SupportTicket; created: true }>(
    "/v1/support/tickets",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function getSupportTickets() {
  return request<{ tickets: SupportTicket[] }>(
    "/v1/support/tickets",
    { method: "GET" },
    true,
  );
}

export function closeSupportTicket(ticketId: string, input: {
  reason: string;
  details?: string;
}) {
  return request<{ ticket: SupportTicket | null; closed: boolean }>(
    `/v1/support/tickets/${encodeURIComponent(ticketId)}/close`,
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function replyToUserSupportTicket(ticketId: string, message: string) {
  return request<{ ticket: SupportTicket; sent: true }>(
    `/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    { method: "POST", body: JSON.stringify({ message }) },
    true,
  );
}

export function saveModerationAction(profileId: string, action: "suspend" | "reinstate" | "ban" | "close_reports", notes: string | undefined, adminMfaToken: string) {
  return request<{ profileId: string; action: string; saved: true }>(
    `/v1/admin/moderation/profiles/${encodeURIComponent(profileId)}`,
    { method: "POST", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify({ action, notes }) },
    true,
  );
}

export function reviewModerationAppeal(appealId: string, status: "reviewing" | "accepted" | "rejected", notes: string | undefined, adminMfaToken: string) {
  return request<{ appealId: string; status: string; saved: true }>(
    `/v1/admin/moderation/appeals/${encodeURIComponent(appealId)}`,
    { method: "POST", headers: { "X-Admin-MFA": adminMfaToken }, body: JSON.stringify({ status, notes }) },
    true,
  );
}

export function startIdentityVerification() {
  return request<{ status: IdentityVerificationStatus; url: string | null; verifiedAt?: string | null; verificationMethod?: "stripe_identity" | "video_selfie" }>(
    "/v1/verification/session",
    { method: "POST" },
    true,
  );
}

export function submitVideoSelfieVerification(input: {
  videoBase64: string;
  mimeType: "video/mp4" | "video/quicktime" | "video/mov";
  sizeBytes: number;
  consentAccepted: boolean;
  faceImageBase64?: string;
  faceImageMimeType?: "image/jpeg" | "image/png" | "image/webp";
}) {
  return request<{ status: IdentityVerificationStatus; verifiedAt?: string | null; verificationMethod: "video_selfie"; reasonCode?: string }>(
    "/v1/verification/video-selfie",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function checkSelfiePose(input: {
  faceImageBase64: string;
  faceImageMimeType?: "image/jpeg" | "image/png" | "image/webp";
  expectedPose: "straight" | "left" | "right";
}) {
  return request<{
    ok: boolean;
    expectedPose: "straight" | "left" | "right";
    detectedPose?: string;
    confidence?: number;
    yaw?: number;
    pitch?: number;
    roll?: number;
    message: string;
  }>(
    "/v1/verification/selfie-pose-check",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function uploadProfilePhoto(input: {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
}) {
  return requestWithThrottleRetry<{ id: string; uri: string; path?: string; mimeType: string; sizeBytes: number }>(
    () => request(
      "/v1/me/private-space/media/profile-photo",
      { method: "POST", body: JSON.stringify(input) },
      true,
    ),
  );
}

async function requestWithThrottleRetry<T>(operation: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 429 || attempt >= retries) {
        throw caught;
      }
      await new Promise((resolve) => setTimeout(resolve, 900 + attempt * 800));
    }
  }
  return operation();
}

export function uploadChatMedia(input: {
  fileBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/quicktime" | "audio/mp4" | "audio/mpeg" | "audio/aac" | "audio/x-m4a";
  sizeBytes: number;
}) {
  return request<{ id: string; uri: string; path?: string; mimeType: string; sizeBytes: number }>(
    "/v1/me/private-space/media/chat",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export type InstagramMediaItem = {
  id: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  permalink: string;
  caption: string;
  timestamp: string;
};

export function startInstagramPhotoImport() {
  return request<{ authUrl: string; returnUrl: string }>(
    "/v1/instagram/connect",
    { method: "GET" },
    true,
  );
}

export function getInstagramPhotos() {
  return request<{ media: InstagramMediaItem[] }>(
    "/v1/instagram/media",
    { method: "GET" },
    true,
  );
}

export function importInstagramProfilePhotos(mediaIds: string[]) {
  return request<{ photos: Array<{ id: string; uri: string; path?: string; mimeType: string; sizeBytes: number; source: "instagram" }> }>(
    "/v1/instagram/import",
    { method: "POST", body: JSON.stringify({ mediaIds }) },
    true,
  );
}

export function getIdentityVerificationStatus() {
  return request<{
    status: IdentityVerificationStatus;
    verifiedAt: string | null;
    lastErrorCode: string | null;
    verificationMethod?: "stripe_identity" | "video_selfie";
  }>("/v1/verification/status", { method: "GET" }, true);
}

export type PaymentSummary = {
  walletBalanceCents: number;
  premiumActive: boolean;
  kindredPassActive: boolean;
  kindredPassExpiresAt: string | null;
};

export function createPaymentCheckout(
  purchaseType: "wallet" | "kindred_pass" | "premium",
  walletAmount?: number,
) {
  return request<{ url: string; orderId: string }>(
    "/v1/payments/checkout",
    {
      method: "POST",
      body: JSON.stringify({ purchaseType, walletAmount }),
    },
    true,
  );
}

export function getPaymentSummary() {
  return request<PaymentSummary>("/v1/payments/summary", { method: "GET" }, true);
}

export function confirmPaymentCheckout(sessionId: string) {
  return request<PaymentSummary>(
    "/v1/payments/confirm",
    { method: "POST", body: JSON.stringify({ sessionId }) },
    true,
  );
}

export function spendWallet(
  item: "super_like" | "photo_comment" | "liked_you_reveal" | "ready_to_meet_chat",
  idempotencyKey: string,
) {
  return request<{ walletBalanceCents: number }>(
    "/v1/payments/wallet/spend",
    { method: "POST", body: JSON.stringify({ item, idempotencyKey }) },
    true,
  );
}

export function registerPushToken(token: string, platform: "ios" | "android" | "web" | "unknown") {
  return request<{ registered: true }>(
    "/v1/notifications/push-token",
    { method: "POST", body: JSON.stringify({ token, platform }) },
    true,
  );
}

export type GifSearchResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

export function searchGifs(query: string) {
  return request<{ results: GifSearchResult[] }>(
    `/v1/gifs/search?q=${encodeURIComponent(query)}`,
    { method: "GET" },
    true,
  );
}

export type MapPlaceSuggestion = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  provider: "google" | "openstreetmap";
};

export function searchMapPlaces(query: string) {
  return request<{ results: MapPlaceSuggestion[] }>(
    `/v1/maps/places?q=${encodeURIComponent(query)}`,
    { method: "GET" },
    true,
  );
}

export type DiscoveryCandidate = {
  id: string;
  name: string;
  gender: "Man" | "Woman" | "Nonbinary";
  seeking: "Women" | "Men" | "Everyone";
  age: number;
  culture: string;
  role: string;
  photoUri?: string;
  photoUris?: string[];
  contactVerified: boolean;
  idVerified: boolean;
  selfieVerified: boolean;
  meetupVerified: boolean;
  recentlyActive: boolean;
  distanceKm?: number;
  matching: Record<string, unknown>;
};

export function getDiscoveryCandidates() {
  return request<{ candidates: DiscoveryCandidate[] }>(
    "/v1/discovery/candidates",
    { method: "GET" },
    true,
  );
}

export type ReadyToMeetAvailability = {
  available: boolean;
  availableAt?: string;
  expiresAt?: string;
  latitude?: number;
  longitude?: number;
};

export function getReadyToMeetCandidates() {
  return request<{ candidates: DiscoveryCandidate[] }>(
    "/v1/discovery/ready-to-meet",
    { method: "GET" },
    true,
  );
}

export function saveReadyToMeetAvailability(availability: ReadyToMeetAvailability) {
  return request<{
    availability: ReadyToMeetAvailability;
    profile: Record<string, unknown>;
    settings: Record<string, unknown>;
  }>(
    "/v1/discovery/ready-to-meet",
    {
      method: "POST",
      body: JSON.stringify(availability),
    },
    true,
  );
}

export type IncomingLike = {
  id: string;
  visible: boolean;
  matched?: boolean;
  chatStarted?: boolean;
  matchExpiresAt?: string | null;
  visibleAt: string;
  createdAt: string;
  source: "connect" | "explore" | "ready_to_meet";
  profile: DiscoveryCandidate;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  kind: "text" | "gif" | "image" | "audio" | "video" | "meeting_proposal" | "meeting_response";
  createdAt: string;
  editedAt?: string;
  unsentAt?: string;
  text?: string;
  gifUrl?: string;
  gifPreviewUrl?: string;
  gifTitle?: string;
  imageUri?: string;
  videoUri?: string;
  fileSizeBytes?: number;
  audioUri?: string;
  durationMillis?: number;
  reactions?: Record<string, string>;
  meetingProposal?: {
    venue: string;
    scheduledAt: number;
    durationMinutes: number;
    latitude: number;
    longitude: number;
  };
  meetingResponse?: {
    status: "accepted" | "declined";
    proposal: {
      venue: string;
      scheduledAt: number;
      durationMinutes: number;
      latitude: number;
      longitude: number;
    };
  };
};

export type ChatConversation = {
  profile: DiscoveryCandidate;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageSenderId?: string;
};

export async function getChatSocketConfig() {
  if (!API_URL) {
    throw new ApiError(
      "KindredCube authentication is not configured. Set EXPO_PUBLIC_API_URL and restart the app.",
      0,
      "API_NOT_CONFIGURED",
    );
  }
  if (!API_URL_IS_SECURE) {
    throw new ApiError("KindredCube requires an HTTPS API connection outside local development.", 0, "INSECURE_API_URL");
  }
  let token = await getAccessToken();
  const refreshed = await refreshSession();
  if (refreshed === "invalid") {
    await expireSession();
    throw new ApiError("Sign in again to use chat.", 401, "CHAT_AUTH_REQUIRED");
  }
  if (refreshed === "refreshed") token = await getAccessToken();
  if (!token) {
    await expireSession();
    throw new ApiError("Sign in again to use chat.", 401, "CHAT_AUTH_REQUIRED");
  }
  return { url: API_URL, token };
}

export function getConversationMessages(profileId: string) {
  return request<{ messages: ChatMessage[] }>(
    `/v1/chats/${encodeURIComponent(profileId)}/messages`,
    { method: "GET" },
    true,
  );
}

export function getChatConversations() {
  return request<{ conversations: ChatConversation[] }>(
    "/v1/chats",
    { method: "GET" },
    true,
  );
}

export function sendChatMessage(
  recipientId: string,
  kind: ChatMessage["kind"],
  payload: Partial<Pick<ChatMessage, "text" | "gifUrl" | "gifPreviewUrl" | "gifTitle" | "imageUri" | "videoUri" | "fileSizeBytes" | "audioUri" | "durationMillis" | "meetingProposal" | "meetingResponse">>,
) {
  return request<ChatMessage>(
    "/v1/chats/messages",
    { method: "POST", body: JSON.stringify({ recipientId, kind, payload }) },
    true,
  );
}

export function editChatMessage(messageId: string, text: string) {
  return request<ChatMessage>(
    `/v1/chats/messages/${encodeURIComponent(messageId)}`,
    { method: "PATCH", body: JSON.stringify({ text }) },
    true,
  );
}

export function unsendChatMessage(messageId: string) {
  return request<ChatMessage>(
    `/v1/chats/messages/${encodeURIComponent(messageId)}/unsend`,
    { method: "POST" },
    true,
  );
}

export function reactToChatMessage(messageId: string, emoji: string) {
  return request<ChatMessage>(
    `/v1/chats/messages/${encodeURIComponent(messageId)}/reaction`,
    { method: "POST", body: JSON.stringify({ emoji }) },
    true,
  );
}

export function deleteChatMessageForMe(messageId: string) {
  return request<{ deleted: true }>(
    `/v1/chats/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
    true,
  );
}

export function submitPostMeetCheck(input: {
  otherUserId: string;
  meetingStartedAt: string;
  meetingEndedAt: string;
  venue: string;
  latitude?: number;
  longitude?: number;
  met?: boolean;
  missedReason?: string;
  plansRespected?: string;
  showedUp?: string;
  profileMatched: string;
  boundariesRespected?: string;
  feltUnsafe?: string;
  feltSafe?: string;
  respectful?: string;
  wouldMeetAgain: string;
  notes?: string;
}) {
  return request<{ submitted: true; checkId: string; createdAt: string; privateScore?: number; counted?: boolean; meetupVerified?: boolean }>(
    "/v1/post-meet-checks",
    { method: "POST", body: JSON.stringify(input) },
    true,
  );
}

export function getPostMeetCheckStatus(input: {
  otherUserId: string;
  meetingStartedAt: string;
  venue?: string;
}) {
  const params = new URLSearchParams({
    otherUserId: input.otherUserId,
    meetingStartedAt: input.meetingStartedAt,
  });
  if (input.venue) params.set("venue", input.venue);
  return request<{ submitted: boolean; bothSubmitted: boolean; counted: boolean }>(
    `/v1/post-meet-checks/status?${params.toString()}`,
    { method: "GET" },
    true,
  );
}

export function likeMemberProfile(
  profileId: string,
  source: "connect" | "explore" | "ready_to_meet" = "connect",
) {
  return request<{ liked: boolean; matched?: boolean; profileId?: string; visibleToRecipientAfterDays?: number; reason?: string }>(
    "/v1/likes",
    { method: "POST", body: JSON.stringify({ profileId, source }) },
    true,
  );
}

export function getIncomingLikes() {
  return request<{ likes: IncomingLike[] }>(
    "/v1/likes/incoming",
    { method: "GET" },
    true,
  );
}

export async function logoutAccount() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await request<void>("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  await clearTokens();
}

async function saveTokens(pair: TokenPair) {
  if (process.env.EXPO_OS === "web") {
    webAccessToken = pair.accessToken;
    webRefreshToken = pair.refreshToken;
    writeWebTokenSession(pair);
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, pair.accessToken, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, pair.refreshToken, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  ]);
}

async function getRefreshToken() {
  if (process.env.EXPO_OS === "web") return webRefreshToken || readWebTokenSession()?.refreshToken || "";
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

async function getAccessToken() {
  if (process.env.EXPO_OS === "web") return webAccessToken || readWebTokenSession()?.accessToken || "";
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

async function clearTokens() {
  if (process.env.EXPO_OS === "web") {
    webAccessToken = "";
    webRefreshToken = "";
    clearWebTokenSession();
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
