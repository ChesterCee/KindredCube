import DateTimePicker from "@react-native-community/datetimepicker";
import { StatusBar } from "expo-status-bar";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  Baby,
  BadgeCheck,
  Bell,
  CalendarHeart,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Eye,
  EyeOff,
  FileText,
  Heart,
  LockKeyhole,
  LogOut,
  MessageCircle,
  MessageSquare,
  Mic,
  MinusCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Reply,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Square,
  Target,
  Trash2,
  Undo2,
  Users,
  Wallet,
  Wine,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import MapView, { Marker } from "./src/platform-map";
import {
  AuthenticatedUser,
  ChatMessage,
  IdentityVerificationStatus,
  DiscoveryCandidate,
  blockMemberProfile,
  completeEmailLogin,
  confirmPaymentCheckout,
  createPaymentCheckout,
  deleteAccount,
  getAmaraWelcomeReceipt,
  getModerationQueue,
  getPrivateSpace,
  getIdentityVerificationStatus,
  getDiscoveryCandidates,
  getReadyToMeetCandidates,
  getIncomingLikes,
  getCurrentUser,
  getPaymentSummary,
  likeMemberProfile,
  loginAccount,
  logoutAccount,
  markAmaraWelcomeDelivered,
  markAmaraWelcomeRead,
  registerAccount,
  registerPushToken,
  reportMemberProfile,
  reviewModerationAppeal,
  saveModerationAction,
  startIdentityVerification,
  submitVideoSelfieVerification,
  checkSelfiePose,
  requestPasswordReset,
  requestSignedInPasswordReset,
  resetPassword,
  resendVerificationEmail,
  MapPlaceSuggestion,
  searchMapPlaces,
  searchGifs,
  saveReadyToMeetAvailability,
  deleteChatMessageForMe,
  editChatMessage,
  reactToChatMessage,
  sendChatMessage,
  submitPostMeetCheck,
  unsendChatMessage,
  spendWallet,
  updateAccountUsername,
  updatePrivateSpace,
  uploadChatMedia,
  uploadProfilePhoto,
  startInstagramPhotoImport,
  getInstagramPhotos,
  importInstagramProfilePhotos,
  InstagramMediaItem,
  PUBLIC_API_URL,
  ModerationAppeal,
  AdminPurchase,
  AdminPurchaseStat,
  AdminUserStats,
  HelpContentPage,
  getAdminHelpContent,
  getChatSocketConfig,
  getChatConversations,
  getConversationMessages,
  getHelpContent,
  getPostMeetCheckStatus,
  ModerationQueueItem,
  requestAdminMfaChallenge,
  createSupportTicket,
  closeSupportTicket,
  getSupportTickets,
  replyToUserSupportTicket,
  replyToSupportTicket,
  closeAdminSupportTicket,
  verifyAdminMfaCode,
  saveAdminHelpContent,
  SupportTicket,
  setAuthExpiredHandler,
  IncomingLike,
} from "./src/auth-client";
import { MatchingSignals, rankMatches } from "./src/matching";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

const BRAND_FONT = Platform.select({ ios: "AvenirNext-DemiBold", android: "sans-serif-medium", default: "sans-serif" });
const APP_FONT = Platform.select({ ios: "Avenir Next", android: "sans-serif", default: "sans-serif" });

WebBrowser.maybeCompleteAuthSession();

const LOCATION_PERMISSION_ASKED_KEY = "kindredcube.locationPermissionAsked";
const HOME_CACHE_VERSION = 1;

type HomeStartupCache = {
  version: number;
  savedAt: string;
  privateProfile?: Record<string, unknown>;
  privateSettings?: Record<string, unknown>;
  discoveryPeople?: Profile[];
  readyToMeetPeople?: Profile[];
  incomingLikes?: IncomingLike[];
  memberChats?: Profile[];
  memberChat?: Profile | null;
  walletBalanceCents?: number;
  premiumActive?: boolean;
  kindredPassActive?: boolean;
};

function homeCacheUri(userId: string) {
  return `${LegacyFileSystem.documentDirectory || ""}kindredcube-home-${encodeURIComponent(userId)}.json`;
}

async function readHomeStartupCache(userId: string): Promise<HomeStartupCache | null> {
  if (process.env.EXPO_OS === "web" || !LegacyFileSystem.documentDirectory) return null;
  try {
    const raw = await LegacyFileSystem.readAsStringAsync(homeCacheUri(userId));
    const parsed = JSON.parse(raw) as HomeStartupCache;
    return parsed.version === HOME_CACHE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

async function writeHomeStartupCache(userId: string, cache: Partial<HomeStartupCache>) {
  if (process.env.EXPO_OS === "web" || !LegacyFileSystem.documentDirectory) return;
  try {
    await LegacyFileSystem.writeAsStringAsync(
      homeCacheUri(userId),
      JSON.stringify({
        ...cache,
        version: HOME_CACHE_VERSION,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Cache writes should never block the live app.
  }
}

async function requestForegroundLocationOnce() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === "granted") return current;
  if (process.env.EXPO_OS !== "web") {
    const askedBefore = await SecureStore.getItemAsync(LOCATION_PERMISSION_ASKED_KEY).catch(() => null);
    if (askedBefore === "1") return current;
    await SecureStore.setItemAsync(LOCATION_PERMISSION_ASKED_KEY, "1").catch(() => undefined);
  }
  return Location.requestForegroundPermissionsAsync();
}

async function openKindredInAppSession(url: string, returnUrl = "kindredcube://browser-complete") {
  try {
    return await WebBrowser.openAuthSessionAsync(url, returnUrl);
  } catch {
    return WebBrowser.openBrowserAsync(url);
  }
}

async function openPublicWebsiteUrl(url: string) {
  const normalizedUrl = url.trim();
  if (!/^https:\/\/kindredcube\.com(\/|$)/i.test(normalizedUrl)) return;
  try {
    await WebBrowser.openBrowserAsync(normalizedUrl);
  } catch {
    await Linking.openURL(normalizedUrl).catch(() => undefined);
  }
}

const C = {
  ink: "#221F1B",
  cream: "#F7F1E7",
  paper: "#FFFDF9",
  clay: "#A94F35",
  sage: "#627665",
  line: "#D9CFBF",
  muted: "#6E675F",
  pink: "#EF2D6F",
};

type IdentityVerificationMethod = "stripe_identity" | "video_selfie" | "";

const READY_TO_MEET_RADIUS_KM = 48.2803;
const CHAT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const TECTAVIS_GREEN = "#4E8F2F";
const KINDREDCUBE_ORANGE = "#F58220";
const INSTAGRAM_ICON = require("./assets/instagram-icon.png");
const PROFILE_UPLOAD_CAMERA_ICON = require("./assets/profile-upload-camera.png");

function formatMoney(amount: number, options: { signed?: boolean } = {}) {
  const prefix = options.signed && amount < 0 ? "-" : "";
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const identityOptions = ["Man", "Woman", "Nonbinary"];
const seekingOptions = ["Women", "Men", "Everyone"];

const lifestyleGroups: Record<string, string[]> = {
  American: [
    "Black American",
    "White American",
    "Asian American",
    "Native American",
    "Latino American",
    "Pacific Islander American",
    "Southern American",
    "Multicultural American",
    "Other American",
  ],
  Asian: [
    "Japanese",
    "Chinese",
    "Korean",
    "Indian",
    "Filipino",
    "Vietnamese",
    "Pakistani",
    "Thai",
    "Indonesian",
    "Malaysian",
    "Bangladeshi",
    "Sri Lankan",
    "Nepali",
    "Cambodian",
    "Other Asian",
  ],
  African: [
    "South African",
    "Nigerian",
    "Zimbabwean",
    "Botswana",
    "Swazi",
    "Ghanaian",
    "Kenyan",
    "Ethiopian",
    "Moroccan",
    "Egyptian",
    "Ugandan",
    "Tanzanian",
    "Congolese",
    "Senegalese",
    "Other African",
  ],
  European: [
    "Swiss",
    "British",
    "German",
    "French",
    "Italian",
    "Spanish",
    "Portuguese",
    "Polish",
    "Dutch",
    "Irish",
    "Greek",
    "Swedish",
    "Other European",
  ],
  "Latin American": [
    "Mexican",
    "Brazilian",
    "Colombian",
    "Argentine",
    "Dominican",
    "Cuban",
    "Peruvian",
    "Chilean",
    "Venezuelan",
    "Ecuadorian",
    "Other Latin American",
  ],
  "Middle Eastern": [
    "Lebanese",
    "Iranian",
    "Turkish",
    "Iraqi",
    "Israeli",
    "Palestinian",
    "Syrian",
    "Jordanian",
    "Gulf Arab",
    "Other Middle Eastern",
  ],
  Caribbean: [
    "Jamaican",
    "Haitian",
    "Trinidadian",
    "Puerto Rican",
    "Barbadian",
    "Bahamian",
    "Guyanese",
    "Other Caribbean",
  ],
  Multicultural: [
    "Mixed heritage",
    "Third-culture",
    "Diaspora",
    "Global citizen",
    "Intercultural",
    "Other multicultural",
  ],
};
const groupNames = Object.keys(lifestyleGroups);

const personalityTypes = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];
const personalityTestQuestions = [
  {
    prompt: "After a busy week, you recharge best...",
    left: ["With people", "E"],
    right: ["With quiet time", "I"],
  },
  {
    prompt: "You trust information that is...",
    left: ["Concrete and practical", "S"],
    right: ["Pattern-based and imaginative", "N"],
  },
  {
    prompt: "When deciding, you lead with...",
    left: ["Logic and consistency", "T"],
    right: ["People and values", "F"],
  },
  {
    prompt: "Your preferred lifestyle is...",
    left: ["Planned and structured", "J"],
    right: ["Flexible and spontaneous", "P"],
  },
];
const kindredTypeQuestions = [
  {
    key: "coreValues_integritySuccess",
    category: "coreValues",
    title: "Core values",
    weight: "20%",
    statement: "Integrity is more important than success.",
  },
  {
    key: "coreValues_principlesCost",
    category: "coreValues",
    title: "Core values",
    weight: "20%",
    statement: "People should stand by their principles even when it comes at a personal cost.",
  },
  {
    key: "coreValues_personalGrowth",
    category: "coreValues",
    title: "Core values",
    weight: "20%",
    statement: "Personal growth should be a lifelong priority.",
  },
  {
    key: "coreValues_meaningfulLife",
    category: "coreValues",
    title: "Core values",
    weight: "20%",
    statement: "A meaningful life is more important than a comfortable life.",
  },
  {
    key: "faithSpirituality_godReligion",
    category: "faithSpirituality",
    title: "Faith & spirituality",
    weight: "20%",
    statement: "God is more important than religion.",
  },
  {
    key: "faithSpirituality_majorDecisions",
    category: "faithSpirituality",
    title: "Faith & spirituality",
    weight: "20%",
    statement: "Faith should influence major life decisions.",
  },
  {
    key: "faithSpirituality_dailyReflection",
    category: "faithSpirituality",
    title: "Faith & spirituality",
    weight: "20%",
    statement: "Prayer or spiritual reflection should be part of daily life.",
  },
  {
    key: "faithSpirituality_differentBeliefs",
    category: "faithSpirituality",
    title: "Faith & spirituality",
    weight: "20%",
    statement: "I can build a successful long-term relationship with someone who has different religious or spiritual beliefs.",
  },
  {
    key: "relationships_lifelongMarriage",
    category: "relationships",
    title: "Relationships",
    weight: "20%",
    statement: "Marriage is a lifelong commitment.",
  },
  {
    key: "relationships_sharedFinances",
    category: "relationships",
    title: "Relationships",
    weight: "20%",
    statement: "Finances should be shared after marriage.",
  },
  {
    key: "relationships_decisionsTogether",
    category: "relationships",
    title: "Relationships",
    weight: "20%",
    statement: "Important life decisions should be made together.",
  },
  {
    key: "relationships_trustRomance",
    category: "relationships",
    title: "Relationships",
    weight: "20%",
    statement: "Trust is more important than romance.",
  },
  {
    key: "ethics_honestyFeelings",
    category: "ethics",
    title: "Ethics",
    weight: "15%",
    statement: "Honesty should come before protecting someone's feelings.",
  },
  {
    key: "ethics_endsMeans",
    category: "ethics",
    title: "Ethics",
    weight: "15%",
    statement: "The ends do not justify the means.",
  },
  {
    key: "ethics_loyaltyIntegrity",
    category: "ethics",
    title: "Ethics",
    weight: "15%",
    statement: "Loyalty should never require compromising personal integrity.",
  },
  {
    key: "ethics_responsibility",
    category: "ethics",
    title: "Ethics",
    weight: "15%",
    statement: "People should take responsibility for their own actions.",
  },
  {
    key: "conflictPersonality_discussProblems",
    category: "conflictPersonality",
    title: "Conflict & personality",
    weight: "10%",
    statement: "Problems should be discussed rather than avoided.",
  },
  {
    key: "conflictPersonality_forgiveness",
    category: "conflictPersonality",
    title: "Conflict & personality",
    weight: "10%",
    statement: "Forgiveness is essential for a healthy relationship.",
  },
  {
    key: "conflictPersonality_resolveSoon",
    category: "conflictPersonality",
    title: "Conflict & personality",
    weight: "10%",
    statement: "I prefer resolving disagreements as soon as possible.",
  },
  {
    key: "conflictPersonality_perspective",
    category: "conflictPersonality",
    title: "Conflict & personality",
    weight: "10%",
    statement: "Understanding another person's perspective is as important as being understood.",
  },
  {
    key: "lifestyle_physicalHealth",
    category: "lifestyle",
    title: "Lifestyle",
    weight: "7%",
    statement: "Maintaining good physical health is a personal responsibility.",
  },
  {
    key: "lifestyle_experiences",
    category: "lifestyle",
    title: "Lifestyle",
    weight: "7%",
    statement: "Experiences are more valuable than material possessions.",
  },
  {
    key: "lifestyle_financialDiscipline",
    category: "lifestyle",
    title: "Lifestyle",
    weight: "7%",
    statement: "Financial discipline is essential for long-term stability.",
  },
  {
    key: "lifestyle_familyTime",
    category: "lifestyle",
    title: "Lifestyle",
    weight: "7%",
    statement: "Family time should take priority over social status.",
  },
  {
    key: "ambition_purposeIncome",
    category: "ambition",
    title: "Ambition",
    weight: "5%",
    statement: "Purpose is more important than income.",
  },
  {
    key: "ambition_sacrificesGoals",
    category: "ambition",
    title: "Ambition",
    weight: "5%",
    statement: "I am willing to make significant sacrifices to achieve my goals.",
  },
  {
    key: "ambition_positiveImpact",
    category: "ambition",
    title: "Ambition",
    weight: "5%",
    statement: "Success should be measured by the positive impact we have on others.",
  },
  {
    key: "ambition_calculatedRisks",
    category: "ambition",
    title: "Ambition",
    weight: "5%",
    statement: "I am comfortable taking calculated risks to pursue opportunities.",
  },
  {
    key: "politicsSociety_freeSpeech",
    category: "politicsSociety",
    title: "Politics & society",
    weight: "3%",
    statement: "Freedom of speech should be protected even when opinions are unpopular.",
  },
  {
    key: "politicsSociety_communityHelp",
    category: "politicsSociety",
    title: "Politics & society",
    weight: "3%",
    statement: "Communities are stronger when people help one another.",
  },
  {
    key: "politicsSociety_individualResponsibility",
    category: "politicsSociety",
    title: "Politics & society",
    weight: "3%",
    statement: "Individual responsibility is more important than government support.",
  },
  {
    key: "politicsSociety_equalLaw",
    category: "politicsSociety",
    title: "Politics & society",
    weight: "3%",
    statement: "Laws should apply equally to everyone regardless of status.",
  },
] as const;
const kindredTypeAnswerOptions = [
  { value: 1, label: "Agree" },
  { value: 2, label: "Somewhat agree" },
  { value: 3, label: "Not sure" },
  { value: 4, label: "Somewhat disagree" },
  { value: 5, label: "Disagree" },
] as const;
const interestOptions = [
  "Museums & galleries",
  "Gardening",
  "Camping",
  "Exploring new cities",
  "International travel",
  "Horse riding",
  "Walking",
  "Hiking",
  "Running",
  "Cycling",
  "Skiing",
  "Soccer",
  "Basketball",
  "Tennis",
  "Swimming",
  "Live music",
  "Theater",
  "Photography",
  "Cooking",
  "Dancing",
  "Reading",
  "Volunteering",
  "Yoga",
  "Gaming",
  "Food experiences",
];
const relationshipOptions = [
  "Marriage",
  "Long-term relationship",
  "Something casual",
  "Life partner",
  "Open to seeing where things go",
  "Ethical non-monogamy",
];
const causeOptions = [
  "Black Lives Matter",
  "Feminism",
  "Environmentalism",
  "Immigration rights",
  "Voting rights",
  "Human rights",
  "Ending religious hate",
  "Stop Asian Hate",
  "Stop racism",
  "Neurodiversity",
  "Volunteering",
  "Disability rights",
];
const valueOptions = [
  "Ambition",
  "Confidence",
  "Empathy",
  "Generosity",
  "Humor",
  "Kindness",
  "Openness",
  "Optimism",
  "Playfulness",
  "Leadership",
  "Curiosity",
  "Gratitude",
  "Humility",
  "Loyalty",
  "Sarcasm",
  "Emotional intelligence",
  "Logic",
];
const profilePrompts: Record<string, string[]> = {
  "Dating me": [
    "Dating me is like...",
    "I'm a real nerd about...",
    "My most chaotic trait is...",
    "The quickest way to my heart is...",
    "Together, we could...",
    "My simple pleasure is...",
    "I'll fall for you if...",
    "A green flag I look for is...",
  ],
  Realness: [
    "I'm ready for someone who...",
    "I'm working towards...",
    "I'm competitive about...",
    "A warning about me...",
    "I'm still learning how to...",
    "Something I'm proud of...",
    "My friends know me for...",
    "The truth is...",
  ],
  "Date night": [
    "Our ideal first date...",
    "Let's skip dinner and...",
    "The perfect Sunday together...",
    "A spontaneous date I'd love...",
    "My favorite low-key date...",
    "Book us tickets to...",
    "A city date should include...",
    "At home, let's...",
  ],
  "About me": [
    "I'm happiest when...",
    "Most people don't know I...",
    "After work you can find me...",
    "I'm known for...",
    "My hidden talent is...",
    "I can talk for hours about...",
    "My perfect weekend...",
    "Something on my bucket list...",
  ],
  "Self-care": [
    "I recharge by...",
    "My mental health ritual...",
    "When life gets busy, I...",
    "My favorite way to slow down...",
    "A boundary I'm proud of...",
    "Movement I actually enjoy...",
    "My comfort routine...",
    "I feel grounded when...",
  ],
};
const detailOptions: Record<string, string[]> = {
  Education: [
    "In high school",
    "In college",
    "Undergraduate degree",
    "In grad school",
    "Graduate degree",
    "Trade school",
    "Prefer not to say",
  ],
  Gender: [
    "Woman",
    "Man",
    "Nonbinary",
    "Trans woman",
    "Trans man",
    "Genderfluid",
    "Self-described",
    "Prefer not to say",
  ],
  Height: [
    "Under 5'2\"",
    "5'2\"–5'5\"",
    "5'6\"–5'9\"",
    "5'10\"–6'1\"",
    "Over 6'1\"",
    "Skip",
  ],
  Exercise: ["Active", "Sometimes", "Almost never", "Skip"],
  Cannabis: ["Never", "Socially", "Sometimes", "Regularly", "Skip"],
  Smoke: ["Never", "Socially", "Sometimes", "Regularly", "Skip"],
  Drink: ["Never", "Socially", "Sometimes", "Regularly", "Skip"],
  "Have kids?": ["Yes", "No", "Skip"],
  "Want kids": ["Yes", "No", "Open to kids", "Don't want kids"],
  "How many kids?": ["1", "2", "3", "4", "5", "6+"],
  "Kids live with you?": ["Yes", "No", "Some of the time"],
  "Star sign": [],
  Politics: [
    "Apolitical",
    "Moderate",
    "Liberal",
    "Left",
    "Conservative",
    "Right",
    "Other",
    "Skip",
  ],
  Religion: [
    "Christian",
    "Muslim",
    "Hindu",
    "Buddhist",
    "Jewish",
    "Sikh",
    "Spiritual",
    "Agnostic",
    "Atheist",
    "Other",
    "Skip",
  ],
  Languages: [
    "English",
    "Spanish",
    "Mandarin",
    "Hindi",
    "Arabic",
    "French",
    "Portuguese",
    "Japanese",
    "German",
    "Korean",
    "Swahili",
    "Zulu",
  ],
};

const majorGlobalLanguages = [
  "English",
  "Spanish",
  "Mandarin Chinese",
  "Hindi",
  "Arabic",
  "French",
  "Portuguese",
  "Bengali",
  "Russian",
  "Urdu",
  "Indonesian",
  "German",
  "Japanese",
  "Swahili",
  "Marathi",
  "Telugu",
  "Turkish",
  "Tamil",
  "Vietnamese",
  "Korean",
  "Italian",
  "Thai",
  "Persian",
  "Polish",
  "Dutch",
  "Greek",
  "Hebrew",
  "Tagalog",
  "Zulu",
  "Afrikaans",
];

type Answers = {
  identity: string;
  seeking: string;
  dateOfBirth: string;
  minAge: number;
  maxAge: number;
  lifestyle: string;
  interests: string[];
  city: string;
};

const initialAnswers: Answers = {
  identity: "",
  seeking: "",
  dateOfBirth: "",
  minAge: 25,
  maxAge: 40,
  lifestyle: "",
  interests: [],
  city: "",
};

type Profile = {
  id?: string;
  name: string;
  gender: string;
  age: number;
  culture: string;
  role: string;
  portrait: number;
  photoUri?: string;
  photoUris?: string[];
  instagramPhotoUris?: string[];
  realMember?: boolean;
  idVerified?: boolean;
  selfieVerified?: boolean;
  meetupVerified?: boolean;
  discovery?: DiscoveryCandidate;
  chatPreview?: string;
  chatPreviewFromMe?: boolean;
  chatLastMessageAt?: string;
  chatLastMessageSenderId?: string;
  promptAnswers?: Record<string, { prompt: string; answer: string }>;
};

function safeProfilePromptAnswers(value: unknown): Record<string, { prompt: string; answer: string }> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return safeProfilePromptAnswers(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, { prompt: string; answer: string }> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    const answer = typeof record.answer === "string" ? record.answer.trim() : "";
    if (prompt && answer) output[key] = { prompt, answer };
  });
  return output;
}

function mergeProfilePromptAnswers(...values: unknown[]): Profile["promptAnswers"] {
  const merged: Record<string, { prompt: string; answer: string }> = {};
  const seen = new Set<string>();
  values.forEach((value) => {
    const parsed = safeProfilePromptAnswers(value);
    Object.entries(parsed).forEach(([key, entry]) => {
      const prompt = entry?.prompt?.trim();
      const answer = entry?.answer?.trim();
      if (!prompt || !answer) return;
      const dedupeKey = `${prompt}\n${answer}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const safeKey = key && !merged[key] ? key : `prompt-${Object.keys(merged).length + 1}`;
      merged[safeKey] = { prompt, answer };
    });
  });
  return merged;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ?
    value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isLocalOnlyMediaUri(uri: string) {
  return /^file:|^content:|^ph:|^assets-library:|^blob:/i.test(uri.trim());
}

function resolveServerMediaUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/v1/")) return PUBLIC_API_URL ? `${PUBLIC_API_URL}${trimmed}` : trimmed;
  return trimmed;
}

function cleanMediaUri(uri: unknown) {
  if (typeof uri !== "string") return "";
  return resolveServerMediaUri(uri);
}

function normalizeProfileMediaUris(profile: Record<string, unknown>) {
  const next = { ...profile };
  if (Array.isArray(next.photos)) {
    next.photos = next.photos
      .map((photo) => {
        if (!photo || typeof photo !== "object") return photo;
        const item = { ...(photo as Record<string, unknown>) };
        if (typeof item.uri === "string") item.uri = resolveServerMediaUri(item.uri);
        return item;
      })
      .filter((photo) => {
        if (!photo || typeof photo !== "object") return false;
        const uri = (photo as Record<string, unknown>).uri;
        return typeof uri === "string" && uri.trim().length > 0 && !isLocalOnlyMediaUri(uri);
      });
  }
  if (typeof next.bestPhotoUri === "string") {
    const bestPhotoUri = resolveServerMediaUri(next.bestPhotoUri);
    next.bestPhotoUri = bestPhotoUri && !isLocalOnlyMediaUri(bestPhotoUri) ? bestPhotoUri : "";
  }
  return next;
}

function discoveryCandidateToProfile(candidate: DiscoveryCandidate): Profile {
  const matching = candidate.matching && typeof candidate.matching === "object" ? candidate.matching : {};
  const candidateRecord = candidate as unknown as Record<string, unknown>;
  const matchingRecord = matching as Record<string, unknown>;
  const matchingProfile =
    matchingRecord.profile && typeof matchingRecord.profile === "object" && !Array.isArray(matchingRecord.profile)
      ? matchingRecord.profile as Record<string, unknown>
      : {};
  const promptAnswers = mergeProfilePromptAnswers(
    candidateRecord.promptAnswers,
    candidateRecord.prompts,
    matchingRecord.promptAnswers,
    matchingRecord.prompts,
    matchingProfile.promptAnswers,
    matchingProfile.prompts,
  );
  const enrichedMatching = {
    ...matchingRecord,
    promptAnswers,
  };
  const matchingPhotos = Array.isArray(matching.photos)
    ? matching.photos
        .map((photo) =>
          photo && typeof photo === "object" && "uri" in photo ?
            (photo as { uri?: unknown }).uri
            : undefined,
        )
        .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
    : [];
  const photoUris = [
    ...new Set(
      [
        ...(candidate.photoUris || []),
        candidate.photoUri,
        typeof matching.bestPhotoUri === "string" ? matching.bestPhotoUri : undefined,
        ...matchingPhotos,
      ].map(cleanMediaUri).filter((uri): uri is string => uri.length > 0),
    ),
  ];
  const instagramPhotoUris = [
    ...new Set(
      [
        ...instagramPhotoUrisFromRecords(matching.photos),
        ...instagramPhotoUrisFromRecords(candidateRecord.photos),
        ...instagramPhotoUrisFromRecords(matchingProfile.photos),
      ].filter((uri): uri is string => uri.length > 0),
    ),
  ];
  const role = typeof matching.occupation === "string" && matching.occupation.trim()
    ? matching.occupation.trim()
    : candidate.role;
  const idVerified = candidate.idVerified === true;
  const selfieVerified = !idVerified && candidate.selfieVerified === true;
  return normalizeProfileVerification({
    id: candidate.id,
    name: candidate.name,
    gender: candidate.gender,
    age: candidate.age,
    culture: candidate.culture,
    role,
    portrait: -1,
    photoUri: photoUris[0],
    photoUris,
    instagramPhotoUris,
    realMember: true,
    idVerified,
    selfieVerified,
    meetupVerified: candidate.meetupVerified,
    discovery: { ...candidate, idVerified, selfieVerified, matching: enrichedMatching },
    promptAnswers,
  });
}

function seekingMatchesGender(seeking: string | undefined, gender: string | undefined) {
  if (!seeking || !gender) return false;
  return seeking === "Everyone" ||
    (seeking === "Women" && gender === "Woman") ||
    (seeking === "Men" && gender === "Man");
}

function datingDirectionMatches(viewer: { identity?: string; seeking?: string }, candidate: Profile) {
  return seekingMatchesGender(viewer.seeking, candidate.gender) &&
    seekingMatchesGender(candidate.discovery?.seeking, viewer.identity);
}

function mergeChatProfiles(incoming: Profile[], current: Profile[]) {
  if (!incoming.length) return current;
  const merged = new Map<string, Profile>();
  incoming.forEach((profile) => {
    merged.set(likeProfileKeyValue(profile), profile);
  });
  current.forEach((profile) => {
    const key = likeProfileKeyValue(profile);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, profile);
      return;
    }
    merged.set(key, mergeFreshProfileIntoChatProfile(existing, profile));
  });
  return Array.from(merged.values()).sort((a, b) => {
    const aTime = a.chatLastMessageAt ? new Date(a.chatLastMessageAt).getTime() : 0;
    const bTime = b.chatLastMessageAt ? new Date(b.chatLastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
}

function likeProfileKeyValue(profile: Pick<Profile, "id" | "name">) {
  return profile.id || profile.name;
}

const profiles: Profile[] = [];

const previewProfiles: Profile[] = [
  { name: "Maya", gender: "Woman", age: 29, culture: "Black American", role: "Designer", portrait: 3 },
  { name: "Sofia", gender: "Woman", age: 28, culture: "Mexican", role: "Brand strategist", portrait: 11 },
  { name: "Aiko", gender: "Woman", age: 30, culture: "Japanese", role: "Creative director", portrait: 12 },
  { name: "Claire", gender: "Woman", age: 31, culture: "White American", role: "Architect", portrait: 7 },
  { name: "Mei", gender: "Woman", age: 29, culture: "Chinese", role: "Product designer", portrait: 10 },
  { name: "Zinhle", gender: "Woman", age: 30, culture: "Zulu South African", role: "Fashion designer", portrait: 0 },
  { name: "Daniel", gender: "Man", age: 32, culture: "White American", role: "Architect", portrait: 17 },
  { name: "Marcus", gender: "Man", age: 34, culture: "Black American", role: "Product lead", portrait: 16 },
  { name: "Mateo", gender: "Man", age: 31, culture: "Mexican", role: "Restaurant founder", portrait: 18 },
  { name: "Kenji", gender: "Man", age: 33, culture: "Japanese", role: "Software engineer", portrait: 19 },
  { name: "Wei", gender: "Man", age: 30, culture: "Chinese", role: "Finance analyst", portrait: 20 },
  { name: "Sizwe", gender: "Man", age: 35, culture: "Zulu South African", role: "Creative director", portrait: 21 },
];

const registrationPreviewProfiles: Profile[] = [
  { name: "Marcus", gender: "Man", age: 34, culture: "Black American", role: "Product lead", portrait: 100 },
  { name: "Mateo", gender: "Man", age: 31, culture: "Latino", role: "Restaurant founder", portrait: 101 },
  { name: "Daniel", gender: "Man", age: 32, culture: "White American", role: "Architect", portrait: 102 },
  { name: "Kenji", gender: "Man", age: 33, culture: "Asian", role: "Software engineer", portrait: 103 },
  { name: "Maya", gender: "Woman", age: 29, culture: "Black American", role: "Designer", portrait: 104 },
  { name: "Sofia", gender: "Woman", age: 28, culture: "Latina", role: "Brand strategist", portrait: 105 },
  { name: "Claire", gender: "Woman", age: 31, culture: "White American", role: "Architect", portrait: 106 },
  { name: "Aiko", gender: "Woman", age: 30, culture: "Asian", role: "Creative director", portrait: 107 },
];

const globalCities = [
  { city: "Atlanta", country: "United States", latitude: 33.749, longitude: -84.388, people: 10, portraitOffset: 0 },
  { city: "New York", country: "United States", latitude: 40.7128, longitude: -74.006, people: 10, portraitOffset: 5 },
  { city: "Philadelphia", country: "United States", latitude: 39.9526, longitude: -75.1652, people: 8, portraitOffset: 9 },
  { city: "Montgomery", country: "United States", latitude: 32.3792, longitude: -86.3077, people: 6, portraitOffset: 13 },
  { city: "Dallas", country: "United States", latitude: 32.7767, longitude: -96.797, people: 10, portraitOffset: 2 },
  { city: "Mexico City", country: "Mexico", latitude: 19.4326, longitude: -99.1332, people: 6, portraitOffset: 1 },
  { city: "Guatemala City", country: "Guatemala", latitude: 14.6349, longitude: -90.5069, people: 6, portraitOffset: 3 },
  { city: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, people: 6, portraitOffset: 4 },
  { city: "Beijing", country: "China", latitude: 39.9042, longitude: 116.4074, people: 6, portraitOffset: 6 },
  { city: "Shanghai", country: "China", latitude: 31.2304, longitude: 121.4737, people: 8, portraitOffset: 7 },
  { city: "Bangkok", country: "Thailand", latitude: 13.7563, longitude: 100.5018, people: 6, portraitOffset: 8 },
  { city: "Cairo", country: "Egypt", latitude: 30.0444, longitude: 31.2357, people: 6, portraitOffset: 10 },
  { city: "Rio de Janeiro", country: "Brazil", latitude: -22.9068, longitude: -43.1729, people: 8, portraitOffset: 11 },
  { city: "Johannesburg", country: "South Africa", latitude: -26.2041, longitude: 28.0473, people: 8, portraitOffset: 12 },
  { city: "Sydney", country: "Australia", latitude: -33.8688, longitude: 151.2093, people: 6, portraitOffset: 14 },
  { city: "London", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278, people: 8, portraitOffset: 15 },
  { city: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, people: 6, portraitOffset: 16 },
  { city: "Bern", country: "Switzerland", latitude: 46.948, longitude: 7.4474, people: 6, portraitOffset: 17 },
] as const;

const cityMarkerOffsets = [
  [0.035, -0.045],
  [-0.028, 0.036],
  [0.052, 0.018],
  [-0.048, -0.026],
  [0.011, -0.071],
  [-0.066, 0.011],
  [0.074, -0.008],
  [-0.013, 0.069],
  [0.029, 0.053],
  [-0.059, -0.052],
] as const;

function ageFromDate(date: Date) {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  if (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  )
    age -= 1;
  return age;
}

function suggestedRange(age: number) {
  return { minAge: Math.max(18, age - 15), maxAge: Math.min(80, age + 10) };
}

function Logo({
  size = "regular",
  align = "left",
}: {
  size?: "regular" | "compact";
  align?: "center" | "left";
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoWidth = Math.min(size === "compact" ? 170 : 190, width - 40);
  const logoHeight = logoWidth / (1659 / 399);
  const topPadding = insets.top + 8;
  return (
    <View
      style={{
        width: logoWidth,
        height: logoHeight + topPadding,
        paddingTop: topPadding,
        alignSelf: align === "left" ? "flex-start" : "center",
      }}
    >
      <Image
        accessibilityLabel="KindredCube"
        source={require("./assets/kindredcube-current-logo-header.png")}
        resizeMode="contain"
        style={{ width: logoWidth, height: logoHeight }}
      />
    </View>
  );
}

function WelcomeLoadingScreen({
  title = "Loading KindredCube",
  message = "Preparing your experience...",
  error = "",
  onRetry,
}: {
  title?: string;
  message?: string;
  error?: string;
  onRetry?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [showLoadingDetails, setShowLoadingDetails] = useState(false);
  const [gifReady, setGifReady] = useState(false);
  const gifDetailsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaWidth = Math.min(width * 0.92, 430);
  const mediaHeight = Math.min(height * 0.68, mediaWidth * (1920 / 1080));

  useEffect(() => {
    return () => {
      if (gifDetailsTimerRef.current) clearTimeout(gifDetailsTimerRef.current);
    };
  }, []);

  const revealLoadingDetailsAfterGif = useCallback(() => {
    if (gifDetailsTimerRef.current) return;
    setGifReady(true);
    gifDetailsTimerRef.current = setTimeout(() => setShowLoadingDetails(true), 1200);
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 240],
  });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.cream,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        gap: 18,
      }}
    >
      <StatusBar style="dark" translucent={false} backgroundColor={C.cream} />
      <View
        style={{
          width: mediaWidth,
          height: mediaHeight,
          borderRadius: 15,
          overflow: "hidden",
          backgroundColor: C.cream,
        }}
      >
        <Image
          accessibilityLabel="KindredCube welcome artwork"
          source={require("./assets/kindredcube-welcome-loader-poster.png")}
          resizeMode="cover"
          style={{ position: "absolute", width: "100%", height: "100%" }}
        />
        <Image
          accessibilityLabel="KindredCube welcome animation"
          source={require("./assets/kindredcube-welcome-loader.gif")}
          resizeMode="cover"
          onLoad={revealLoadingDetailsAfterGif}
          onLoadEnd={revealLoadingDetailsAfterGif}
          style={{ width: "100%", height: "100%", opacity: gifReady ? 1 : 0 }}
        />
      </View>
      {showLoadingDetails || error ? (
        <>
          <View
            style={{
              width: Math.min(width - 76, 280),
              height: 7,
              borderRadius: 999,
              backgroundColor: "#E3D8C8",
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                width: 120,
                height: "100%",
                borderRadius: 999,
                backgroundColor: KINDREDCUBE_ORANGE,
                transform: [{ translateX }],
              }}
            />
          </View>
          <View style={{ minHeight: 76, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Text
              selectable
              style={{
                color: error ? "#9C3225" : C.ink,
                fontSize: 19,
                fontWeight: "900",
                textAlign: "center",
              }}
            >
              {error ? "Your profile is still safe" : title}
            </Text>
            <Text
              accessibilityRole={error ? "alert" : undefined}
              selectable
              style={{
                color: error ? "#9C3225" : C.muted,
                fontSize: 13,
                lineHeight: 19,
                textAlign: "center",
              }}
            >
              {error || message}
            </Text>
            {error && onRetry ? <Button compact label="Try loading again" onPress={onRetry} /> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

function PeopleIcon({ size = 52 }: { size?: number }) {
  const head = size * 0.29;
  const bodyWidth = size * 0.56;
  const bodyHeight = size * 0.43;
  return (
    <View
      accessibilityLabel="People connecting"
      style={{ width: size, height: size * 0.82 }}
    >
      <View
        style={{
          position: "absolute",
          left: size * 0.13,
          top: 0,
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: C.pink,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: size * 0.13,
          top: 0,
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: "#5A3AC7",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: bodyWidth,
          height: bodyHeight,
          borderTopLeftRadius: bodyHeight,
          borderTopRightRadius: bodyHeight,
          borderBottomLeftRadius: size * 0.14,
          backgroundColor: C.pink,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: bodyWidth,
          height: bodyHeight,
          borderTopLeftRadius: bodyHeight,
          borderTopRightRadius: bodyHeight,
          borderBottomRightRadius: size * 0.14,
          backgroundColor: "#5A3AC7",
        }}
      />
      <Heart
        width={size * 0.19}
        height={size * 0.19}
        color={C.paper}
        fill={C.paper}
        strokeWidth={3}
        style={{
          position: "absolute",
          left: size * 0.405,
          top: size * 0.36,
          zIndex: 2,
        }}
      />
    </View>
  );
}

function ExploreIcon({ active }: { active: boolean }) {
  return (
    <Compass
      accessibilityLabel="Explore"
      width={28}
      height={28}
      color={active ? C.pink : C.muted}
      strokeWidth={2.25}
    />
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <MessageCircle
      accessibilityLabel="Chats"
      width={29}
      height={29}
      color={active ? C.pink : C.muted}
      strokeWidth={2.25}
    />
  );
}

function AppHeader({ onFilter }: { onFilter: () => void }) {
  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <Logo size="compact" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open filters"
        onPress={onFilter}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: pressed ? "#F1E9DD" : C.paper,
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        })}
      >
        <View
          style={{
            width: 21,
            height: 2,
            borderRadius: 1,
            backgroundColor: C.ink,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 5,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: C.pink,
            }}
          />
        </View>
        <View
          style={{
            width: 21,
            height: 2,
            borderRadius: 1,
            backgroundColor: C.ink,
          }}
        >
          <View
            style={{
              position: "absolute",
              right: 3,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#5A3AC7",
            }}
          />
        </View>
        <View
          style={{
            width: 21,
            height: 2,
            borderRadius: 1,
            backgroundColor: C.ink,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 2,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: C.clay,
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 48 : 54,
        borderRadius: 28,
        backgroundColor: disabled ? "#B9B0A5" : pressed ? "#3A342F" : C.ink,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
      })}
    >
      <Text style={{ color: C.paper, fontSize: 16, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Choice({
  label,
  selected,
  onPress,
  columns = 2,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  columns?: 2 | 3;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: columns === 3 ? "31.5%" : "48.5%",
        minHeight: compact ? 40 : 46,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? C.pink : C.line,
        backgroundColor: selected ? "#FCE5EE" : pressed ? "#F1E9DD" : C.paper,
        paddingHorizontal: columns === 3 ? 7 : 12,
        alignItems: columns === 3 ? "center" : "flex-start",
        justifyContent: "center",
      })}
    >
      <Text
        numberOfLines={2}
        style={{
          color: selected ? "#A5164D" : C.ink,
          textAlign: columns === 3 ? "center" : "left",
          fontSize: compact ? 12 : 13,
          lineHeight: compact ? 15 : 17,
          fontWeight: selected ? "800" : "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AgeRangeSlider({
  minAge,
  maxAge,
  onChange,
}: {
  minAge: number;
  maxAge: number;
  onChange: (min: number, max: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const [localMin, setLocalMin] = useState(minAge);
  const [localMax, setLocalMax] = useState(maxAge);
  const widthRef = useRef(0);
  const minRef = useRef(minAge);
  const maxRef = useRef(maxAge);
  const startRef = useRef(minAge);
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  useEffect(() => {
    minRef.current = minAge;
    maxRef.current = maxAge;
    setLocalMin(minAge);
    setLocalMax(maxAge);
  }, [minAge, maxAge]);
  const delta = (dx: number) =>
    Math.round((dx / Math.max(widthRef.current, 1)) * 62);
  const commit = () => callbackRef.current(minRef.current, maxRef.current);
  const minPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startRef.current = minRef.current;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(
          18,
          Math.min(maxRef.current, startRef.current + delta(g.dx)),
        );
        minRef.current = next;
        setLocalMin(next);
      },
      onPanResponderRelease: commit,
      onPanResponderTerminate: commit,
    }),
  ).current;
  const maxPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startRef.current = maxRef.current;
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(
          80,
          Math.max(minRef.current, startRef.current + delta(g.dx)),
        );
        maxRef.current = next;
        setLocalMax(next);
      },
      onPanResponderRelease: commit,
      onPanResponderTerminate: commit,
    }),
  ).current;
  const x = (age: number) => ((age - 18) / 62) * width;
  return (
    <View style={{ gap: 3 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.clay, fontSize: 20, fontWeight: "800" }}>
          {localMin}
        </Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>
          Interested age range
        </Text>
        <Text style={{ color: C.clay, fontSize: 20, fontWeight: "800" }}>
          {localMax}
        </Text>
      </View>
      <View
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={{ height: 42, justifyContent: "center" }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line }} />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: x(localMin),
            width: Math.max(0, x(localMax) - x(localMin)),
            height: 6,
            backgroundColor: C.clay,
          }}
        />
        <View
          {...minPan.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Minimum interested age"
          style={{
            position: "absolute",
            left: x(localMin) - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: C.paper,
            borderWidth: 3,
            borderColor: C.clay,
          }}
        />
        <View
          {...maxPan.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Maximum interested age"
          style={{
            position: "absolute",
            left: x(localMax) - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: C.paper,
            borderWidth: 3,
            borderColor: C.clay,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: C.muted, fontSize: 10 }}>18</Text>
        <Text style={{ color: C.muted, fontSize: 10 }}>80</Text>
      </View>
    </View>
  );
}

function GlobalCityPortrait({ index, size }: { index: number; size: number }) {
  const col = index % 4;
  const row = Math.floor(index / 4) % 4;
  return (
    <View style={{ width: size, height: size, overflow: "hidden" }}>
      <Image
        source={require("./assets/kindredcube-global-profile-grid.png")}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: size * 4,
          height: size * 4,
          left: -col * size,
          top: -row * size,
        }}
      />
    </View>
  );
}

function GlobalCityHero() {
  const mapRef = useRef<{ animateToRegion: (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, duration?: number) => void } | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const [cityIndex, setCityIndex] = useState(0);
  const [visibleMarkers, setVisibleMarkers] = useState(1);
  const cityIndexRef = useRef(0);
  const city = globalCities[cityIndex];
  useEffect(() => {
    setVisibleMarkers(1);
    const revealDelay = Math.max(950, Math.min(3000, Math.floor(14000 / city.people)));
    const revealTimer = setInterval(() => {
      setVisibleMarkers((count) => Math.min(city.people, count + 1));
    }, revealDelay);
    return () => clearInterval(revealTimer);
  }, [city.people, cityIndex]);
  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0.08,
        duration: 420,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        const next = (cityIndexRef.current + 1) % globalCities.length;
        cityIndexRef.current = next;
        setCityIndex(next);
        const destination = globalCities[next];
        mapRef.current?.animateToRegion(
          {
            latitude: destination.latitude,
            longitude: destination.longitude,
            latitudeDelta: 0.24,
            longitudeDelta: 0.24,
          },
          650,
        );
        Animated.timing(fade, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }).start();
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [fade]);
  return (
    <Animated.View style={{ flex: 1, opacity: fade }}>
      <MapView
        ref={mapRef}
        pointerEvents="none"
        style={{ width: "100%", height: "100%" }}
        initialRegion={{
          latitude: city.latitude,
          longitude: city.longitude,
          latitudeDelta: 0.24,
          longitudeDelta: 0.24,
        }}
        toolbarEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={false}
        showsCompass={false}
      >
        {cityMarkerOffsets.slice(0, visibleMarkers).map(([latitudeOffset, longitudeOffset], index) => (
          <Marker
            key={`${city.city}-${index}`}
            coordinate={{
              latitude: city.latitude + latitudeOffset,
              longitude: city.longitude + longitudeOffset,
            }}
          >
            <View style={{ width: 58, height: 58 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  overflow: "hidden",
                  borderWidth: 3,
                  borderColor: C.paper,
                  backgroundColor: C.paper,
                  boxShadow: "0 4px 12px rgba(34,31,27,0.24)",
                }}
              >
                <GlobalCityPortrait index={city.portraitOffset + index} size={48} />
              </View>
              <View
                style={{
                  position: "absolute",
                  right: 1,
                  bottom: 2,
                  width: 13,
                  height: 13,
                  borderRadius: 7,
                  backgroundColor: "#25B45B",
                  borderWidth: 2,
                  borderColor: C.paper,
                }}
              />
            </View>
          </Marker>
        ))}
      </MapView>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          borderRadius: 16,
          backgroundColor: "rgba(255,253,249,0.94)",
          paddingHorizontal: 13,
          paddingVertical: 9,
          gap: 1,
        }}
      >
        <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>
          Connections in {city.city}
        </Text>
        <Text selectable style={{ color: C.sage, fontSize: 10, fontWeight: "800" }}>
          {city.country} — area-level locations only
        </Text>
      </View>
    </Animated.View>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  const { height, width } = useWindowDimensions();
  const short = height < 650;
  const narrow = width < 360;
  return (
    <ScrollView
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: narrow ? 12 : 16,
        paddingTop: short ? 16 : 24,
        paddingBottom: short ? 10 : 14,
        gap: short ? 8 : 12,
      }}
    >
      <Logo size="compact" />
      <View
        style={{
          flex: 1,
          minHeight: short ? 410 : 520,
          borderRadius: short ? 24 : 30,
          overflow: "hidden",
          backgroundColor: "#E8DDD0",
          boxShadow: "0 10px 28px rgba(54,42,31,0.16)",
        }}
      >
        <GlobalCityHero />
        <View
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
            gap: short ? 7 : 9,
            borderRadius: 22,
            borderCurve: "continuous",
            backgroundColor: "rgba(255,253,249,0.84)",
            paddingHorizontal: narrow ? 14 : 18,
            paddingVertical: short ? 12 : 16,
          }}
        >
          <Text
            adjustsFontSizeToFit
            numberOfLines={2}
            minimumFontScale={0.86}
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: short ? 31 : 37,
              lineHeight: short ? 32 : 38,
              letterSpacing: -0.8,
              fontWeight: "900",
            }}
          >
            Shared Values.{`\n`}
            <Text style={{ color: C.clay, fontWeight: "900" }}>
              Real Connection.
            </Text>
          </Text>
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            style={{
              color: C.muted,
              fontSize: short ? 13 : 14,
              lineHeight: short ? 18 : 20,
            }}
          >
            Find the person who connects with your personality and values—not
            just your profile.
          </Text>
          <Button label="Find your match" onPress={onStart} compact />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: C.muted, fontSize: 10, textAlign: "center" }}
          >
            Personality and values lead the match.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function AccountChoice({
  onNew,
  onLogin,
  onBack,
}: {
  onNew: () => void;
  onLogin: () => void;
  onBack: () => void;
}) {
  return (
    <ScrollView
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 24,
        gap: 18,
      }}
    >
      <Logo size="compact" />
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
        <Text style={{ color: C.ink, fontWeight: "800" }}>Back</Text>
      </Pressable>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            backgroundColor: "rgba(255,253,249,0.88)",
            borderWidth: 1,
            borderColor: C.line,
            padding: 22,
            gap: 18,
            boxShadow: "0 12px 30px rgba(54,42,31,0.10)",
          }}
        >
          <View style={{ gap: 7 }}>
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 33,
                lineHeight: 37,
                fontWeight: "900",
              }}
            >
              Welcome to KindredCube
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}
            >
              Tell us where you'd like to begin.
            </Text>
          </View>
          <Button label="New to KindredCube" onPress={onNew} />
          <Pressable
            accessibilityRole="button"
            onPress={onLogin}
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: 26,
              borderWidth: 1.5,
              borderColor: C.ink,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>
              Already have an account?
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function Login({
  onBack,
  onComplete,
  onForgotPassword,
  onSignup,
}: {
  onBack: () => void;
  onComplete: (user: AuthenticatedUser) => void;
  onForgotPassword: () => void;
  onSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length > 0;
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const user = await loginAccount(email.trim(), password);
      onComplete(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };
  const inputStyle = {
    minHeight: 52,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
    borderRadius: 16,
    paddingHorizontal: 15,
    color: C.ink,
    fontSize: 15,
  } as const;
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 28,
          gap: 18,
        }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "800" }}>Back</Text>
        </Pressable>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View
            style={{
              borderRadius: 28,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 22,
              gap: 15,
              boxShadow: "0 12px 30px rgba(54,42,31,0.10)",
            }}
          >
            <View style={{ gap: 6 }}>
              <Text
                selectable
                style={{
                  color: C.ink,
                  fontFamily: BRAND_FONT,
                  fontSize: 34,
                  fontWeight: "900",
                }}
              >
                Welcome back
              </Text>
              <Text
                selectable
                style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
              >
                Sign in to continue connecting.
              </Text>
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#948A7F"
              style={inputStyle}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!passwordVisible}
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#948A7F"
              style={inputStyle}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setPasswordVisible((value) => !value)}
              style={{ alignSelf: "flex-end", paddingHorizontal: 4, paddingVertical: 2 }}
            >
              <Text style={{ color: C.clay, fontSize: 12, fontWeight: "800" }}>
                {passwordVisible ? "Hide password" : "Show password"}
              </Text>
            </Pressable>
            {error ? (
              <View accessibilityRole="alert" style={{ borderRadius: 14, backgroundColor: "#F8DFDC", padding: 11 }}>
                <Text selectable style={{ color: "#8A3028", fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                  {error}
                </Text>
              </View>
            ) : null}
            <Button
              label={submitting ? "Signing in..." : "Sign in"}
              disabled={!valid || submitting}
              onPress={submit}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onForgotPassword}
              style={{ alignItems: "center", padding: 6 }}
            >
              <Text style={{ color: C.clay, fontSize: 13, fontWeight: "800" }}>
                Forgot your password?
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onSignup}
              style={{ alignItems: "center", padding: 6 }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                Don't have an account Sign up
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ForgotPassword({
  onBack,
}: {
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [developmentResetUrl, setDevelopmentResetUrl] = useState("");
  const [error, setError] = useState("");
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message);
      setDevelopmentResetUrl(result.developmentResetUrl || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset email could not be sent.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 24, gap: 18 }}
      >
        <Logo size="compact" />
        <Pressable accessibilityRole="button" onPress={onBack} style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "800" }}>Back to sign in</Text>
        </Pressable>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ borderRadius: 28, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 22, gap: 16 }}>
            <LockKeyhole width={42} height={42} color={C.clay} />
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 32, fontWeight: "900" }}>
              Reset your password
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
              Enter your registered email. We'll send a private link that opens KindredCube so you can choose a new password.
            </Text>
            {!message ? (
              <>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Registered email address"
                  placeholderTextColor="#948A7F"
                  style={{ minHeight: 52, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, borderRadius: 16, paddingHorizontal: 15, color: C.ink, fontSize: 15 }}
                />
                {error ? <Text accessibilityRole="alert" selectable style={{ color: "#8A3028", fontWeight: "800" }}>{error}</Text> : null}
                <Button label={submitting ? "Sending secure link..." : "Send reset link"} disabled={!valid || submitting} onPress={submit} />
              </>
            ) : (
              <View style={{ borderRadius: 18, backgroundColor: "#EDF3ED", padding: 16, gap: 8 }}>
                <BadgeCheck width={30} height={30} color={C.sage} />
                <Text selectable style={{ color: C.ink, fontSize: 16, lineHeight: 23, fontWeight: "800" }}>{message}</Text>
                <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>The link expires in 30 minutes. Check your spam folder if it does not arrive.</Text>
                {developmentResetUrl ? (
                  <Text selectable style={{ color: C.clay, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>
                    Local test reset link: {developmentResetUrl}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ResetPassword({
  token,
  requiresCurrentPassword = false,
  onComplete,
  onCancel,
}: {
  token: string;
  requiresCurrentPassword?: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const longEnough = password.length >= 10 && password.length <= 128;
  const hasCapital = /\p{Lu}/u.test(password);
  const hasTwoSpecial = (password.match(/[^\p{L}\p{N}\s]/gu)?.length ?? 0) >= 2;
  const matches = Boolean(password) && password === confirmation;
  const hasCurrentPassword = !requiresCurrentPassword || currentPassword.length > 0;
  const valid = longEnough && hasCapital && hasTwoSpecial && matches && hasCurrentPassword;
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await resetPassword(
        token,
        password,
        requiresCurrentPassword ? currentPassword : undefined,
      );
      setSuccess(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be changed.");
    } finally {
      setSubmitting(false);
    }
  };
  const inputStyle = { minHeight: 52, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, borderRadius: 16, paddingHorizontal: 15, color: C.ink, fontSize: 15 } as const;
  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 24, gap: 18 }}>
        <Logo size="compact" />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ borderRadius: 28, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 22, gap: 14 }}>
            <ShieldCheck width={42} height={42} color={C.sage} />
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 31, fontWeight: "900" }}>Choose a new password</Text>
            {success ? (
              <>
                <Text selectable style={{ color: C.sage, fontSize: 16, lineHeight: 23, fontWeight: "800" }}>{success}</Text>
                <Button label="Sign in with new password" onPress={onComplete} />
              </>
            ) : (
              <>
                <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
                  {requiresCurrentPassword ?
                     "Because this reset was requested from Security and Privacy, enter your last password first. Then choose a new password with 10–128 characters, at least one capital letter, and at least two special characters."
                    : "Use 10–128 characters, at least one capital letter, and at least two special characters."}
                </Text>
                {requiresCurrentPassword ? (
                  <View style={{ position: "relative", justifyContent: "center" }}>
                    <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} autoComplete="current-password" textContentType="password" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Last/current password" placeholderTextColor="#948A7F" style={[inputStyle, { paddingRight: 52 }]} />
                    <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} onPress={() => setVisible((value) => !value)} style={{ position: "absolute", right: 14, padding: 6 }}>
                      {visible ? <EyeOff width={21} height={21} color={C.muted} /> : <Eye width={21} height={21} color={C.muted} />}
                    </Pressable>
                  </View>
                ) : null}
                <View style={{ position: "relative", justifyContent: "center" }}>
                  <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor="#948A7F" style={[inputStyle, { paddingRight: 52 }]} />
                  <Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"} onPress={() => setVisible((value) => !value)} style={{ position: "absolute", right: 14, padding: 6 }}>
                    {visible ? <EyeOff width={21} height={21} color={C.muted} /> : <Eye width={21} height={21} color={C.muted} />}
                  </Pressable>
                </View>
                <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} autoComplete="new-password" textContentType="newPassword" value={confirmation} onChangeText={setConfirmation} placeholder="Confirm new password" placeholderTextColor="#948A7F" style={inputStyle} />
                {error ? <Text accessibilityRole="alert" selectable style={{ color: "#8A3028", fontWeight: "800" }}>{error}</Text> : null}
                <Button label={submitting ? "Changing password..." : "Change password"} disabled={!valid || submitting} onPress={submit} />
                <Pressable accessibilityRole="button" onPress={onCancel} style={{ alignItems: "center", padding: 6 }}><Text style={{ color: C.clay, fontWeight: "800" }}>Cancel and return to sign in</Text></Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function nearbyAreas(city: string) {
  const value = city.toLowerCase();
  if (value.includes("atlanta"))
    return ["Buckhead", "Marietta", "Sandy Springs", "Decatur", "Midtown"];
  if (value.includes("los angeles"))
    return [
      "Culver City",
      "Pasadena",
      "Santa Monica",
      "Glendale",
      "Long Beach",
    ];
  if (value.includes("new york"))
    return ["Brooklyn", "Queens", "Harlem", "Jersey City", "Astoria"];
  return ["Downtown", "Northside", "City Center", "Westside", "Nearby"];
}

function Portrait({
  index,
  size,
  blurred = false,
}: {
  index: number;
  size?: number;
  blurred?: boolean;
}) {
  if (index < 0) {
    return (
      <View style={{ width: size, height: size, backgroundColor: "#EEE7F7", alignItems: "center", justifyContent: "center" }}>
        <Users width={size * 0.48} height={size * 0.48} color="#7655B7" strokeWidth={1.8} />
      </View>
    );
  }
  if (index >= 100 && index < 108) {
    const boxSize = size ?? 64;
    const originalIndex = index - 100;
    const col = originalIndex % 4;
    const row = Math.floor(originalIndex / 4);
    return (
      <View
        style={{
          width: boxSize,
          height: boxSize,
          overflow: "hidden",
          backgroundColor: C.line,
        }}
      >
        <Image
          blurRadius={blurred ? 64 : 0}
          source={require("./assets/registration/registration-preview-people.png")}
          resizeMode="stretch"
          style={{
            position: "absolute",
            width: boxSize * 4,
            height: boxSize * 2,
            left: -col * boxSize,
            top: -row * boxSize,
          }}
        />
      </View>
    );
  }
  if (index >= 16) {
    const originalIndex = index - 16;
    const col = originalIndex % 3;
    const row = Math.floor(originalIndex / 3);
    return (
      <View
        style={{
          width: size,
          height: size,
          overflow: "hidden",
          backgroundColor: C.line,
        }}
      >
        <Image
          blurRadius={blurred ? 64 : 0}
          source={require("./assets/kindredcube-profile-grid.png")}
          resizeMode="stretch"
          style={{
            position: "absolute",
            width: size * 3,
            height: size * 2,
            left: -col * size,
            top: -row * size,
          }}
        />
      </View>
    );
  }
  const col = index % 4;
  const row = Math.floor(index / 4);
  return (
    <View
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        backgroundColor: C.line,
      }}
    >
      <Image
        blurRadius={blurred ? 64 : 0}
        source={require("./assets/kindredcube-profile-grid-v2.png")}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: size * 4,
          height: size * 4,
          left: -col * size,
          top: -row * size,
        }}
      />
    </View>
  );
}

function ProfileImage({
  profile,
  size,
  blurred = false,
}: {
  profile: Profile;
  size?: number;
  blurred?: boolean;
}) {
  const photos = profilePhotoUris(profile);
  if (photos.length) {
    return (
      <Image
        source={{ uri: photos[0] }}
        resizeMode="cover"
        blurRadius={blurred ? 64 : 0}
        style={{ width: size, height: size, backgroundColor: C.line }}
      />
    );
  }
  return <Portrait index={profile.portrait} size={size} blurred={blurred} />;
}

const dummyGoals = ["Life partner", "Long-term relationship", "Marriage", "Open to seeing where things go"];
const dummyInterests = ["Museums & galleries", "Walking", "Exploring new cities", "Cooking", "Camping", "Soccer", "Live music", "Gardening"];
const dummyCommunities = ["Environmentalism", "Human rights", "Volunteering", "Stop racism", "Neurodiversity"];
const dummyLanguages = ["English", "Spanish", "Japanese", "Mandarin", "French", "Zulu"];
const dummyValues = ["Kindness", "Curiosity", "Loyalty", "Empathy", "Humor", "Ambition"];

function stableNumber(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 17);
}

function dummyMatchingSignals(profile: Profile): MatchingSignals {
  const seed = stableNumber(`${profile.name}-${profile.portrait}`);
  const pick = (items: string[], offset: number, count = 2) =>
    Array.from({ length: count }, (_, index) => items[(seed + offset + index * 3) % items.length]!);
  return {
    id: `dummy-${profile.name.toLowerCase()}`,
    gender: profile.gender,
    age: profile.age,
    culture: profile.culture,
    visible: true,
    contactVerified: true,
    idVerified: false,
    selfieVerified: false,
    meetupVerified: false,
    profileCompleteness: 78 + (seed % 23),
    recentlyActive: true,
    cvi: Array.from({ length: 6 }, (_, index) => 0.35 + ((seed + index * 17) % 55) / 100),
    personality: ["INTJ", "ENFP", "INFJ", "ENTP", "ISFJ", "ESFP"][seed % 6],
    values: pick(dummyValues, 2, 3),
    relationshipGoals: pick(dummyGoals, 5, 2),
    interests: pick(dummyInterests, 7, 4),
    communities: pick(dummyCommunities, 11, 2),
    languages: ["English", ...pick(dummyLanguages, 13, 2)].filter((item, index, items) => items.indexOf(item) === index),
    lifestyle: {
      Smoke: seed % 5 === 0 ? "Socially" : "Never",
      Drink: seed % 4 === 0 ? "Never" : "Socially",
      Exercise: seed % 2 === 0 ? "Active" : "Sometimes",
      Cannabis: seed % 6 === 0 ? "Socially" : "Never",
    },
    distanceKm: 3 + (seed % 42),
    maximumDistanceKm: 50,
    openToRelocate: seed % 5 === 0,
    readyToMeet: false,
  };
}

function profileReadyToMeetIsActive(profile: Profile) {
  const matching = profile.discovery?.matching;
  if (!matching || matching.readyToMeet !== true) return false;
  if (typeof profile.discovery?.distanceKm === "number" && profile.discovery.distanceKm > READY_TO_MEET_RADIUS_KM) return false;
  const startsAt = typeof matching.readyToMeetAt === "string" ? new Date(matching.readyToMeetAt).getTime() : Number.NaN;
  const expiresAt = typeof matching.readyToMeetExpiresAt === "string" ? new Date(matching.readyToMeetExpiresAt).getTime() : Number.NaN;
  const now = Date.now();
  return Number.isFinite(startsAt) && Number.isFinite(expiresAt) && startsAt <= now && expiresAt > now;
}

function profileMatchingSignals(profile: Profile): MatchingSignals {
  const candidate = profile.discovery;
  if (!candidate) return dummyMatchingSignals(profile);
  const matching = candidate.matching || {};
  const details = matching.details && typeof matching.details === "object" ? matching.details as Record<string, string> : {};
  const list = (key: string) => Array.isArray(matching[key]) ? matching[key] as string[] : [];
  return {
    id: candidate.id,
    gender: candidate.gender,
    age: candidate.age,
    culture: candidate.culture,
    visible: true,
    contactVerified: candidate.contactVerified,
    idVerified: candidate.idVerified,
    selfieVerified: candidate.selfieVerified,
    meetupVerified: candidate.meetupVerified,
    profileCompleteness: typeof matching.profileStrength === "number" ? matching.profileStrength : 0,
    recentlyActive: candidate.recentlyActive,
    personality: typeof matching.personality === "string" ? matching.personality : undefined,
    values: list("values"),
    relationshipGoals: list("relationshipGoals"),
    interests: list("interests"),
    communities: list("causes"),
    languages: list("languages"),
    culturePreferences: list("culturePreferences"),
    lifestyle: {
      Smoke: details.Smoke || "",
      Drink: details.Drink || "",
      Exercise: details.Exercise || "",
      Cannabis: details.Cannabis || "",
    },
    hasChildren: String(details["Have kids"] || "").trim().toLowerCase() === "yes",
    wantsChildren: details["Want kids"] || "",
    religion: details.Religion || "",
    politics: details.Politics || "",
    compatibilityResponses:
      matching.compatibilityResponses && typeof matching.compatibilityResponses === "object" ?
         matching.compatibilityResponses as MatchingSignals["compatibilityResponses"]
        : undefined,
    distanceKm: candidate.distanceKm,
    openToRelocate: matching.openToRelocate === true,
    readyToMeet: profileReadyToMeetIsActive(profile),
  };
}

function viewerMatchingSignals(
  profile: Record<string, unknown>,
  user: AuthenticatedUser | null | undefined,
  blockedIds: string[],
): MatchingSignals {
  const array = (key: string) => Array.isArray(profile[key]) ? profile[key] as string[] : [];
  const details = profile.details && typeof profile.details === "object" ? profile.details as Record<string, string> : {};
  const seeking = user?.seeking === "Women" ? ["Woman"] : user?.seeking === "Men" ? ["Man"] : ["Woman", "Man", "Nonbinary"];
  const seed = stableNumber(user?.id || "kindred-member");
  return {
    id: user?.id || "current-member",
    gender: user?.identity,
    age: typeof profile.dateOfBirth === "string" ? ageFromDate(new Date(`${profile.dateOfBirth}T00:00:00`)) : undefined,
    seeking,
    blockedIds,
    visible: true,
    contactVerified: Boolean(user?.emailVerified),
    cvi: Array.isArray(profile.cvi) ? profile.cvi as number[] : Array.from({ length: 6 }, (_, index) => 0.4 + ((seed + index * 13) % 45) / 100),
    personality: typeof profile.personality === "string" ? profile.personality : undefined,
    values: array("values"),
    relationshipGoals: array("relationshipGoals"),
    interests: array("interests"),
    communities: array("causes"),
    languages: array("languages"),
    culturePreferences: array("culturePreferences"),
    lifestyle: {
      Smoke: details.Smoke || "Never",
      Drink: details.Drink || "Socially",
      Exercise: details.Exercise || "Sometimes",
      Cannabis: details.Cannabis || "Never",
    },
    hasChildren: String(details["Have kids"] || "").trim().toLowerCase() === "yes",
    wantsChildren: details["Want kids"] || "",
    religion: details.Religion || "",
    politics: details.Politics || "",
    compatibilityResponses:
      profile.compatibilityResponses && typeof profile.compatibilityResponses === "object" ?
         profile.compatibilityResponses as MatchingSignals["compatibilityResponses"]
        : undefined,
    minAge: typeof profile.minAge === "number" ? profile.minAge : 18,
    maxAge: typeof profile.maxAge === "number" ? profile.maxAge : 80,
    maximumDistanceKm: typeof profile.maximumDistanceKm === "number" ? profile.maximumDistanceKm : 80,
    openToRelocate: Boolean(profile.openToRelocate),
  };
}

function moreAboutForProfile(profile: Profile) {
  const realDetails = profile.discovery?.matching?.details;
  if (realDetails && typeof realDetails === "object" && !Array.isArray(realDetails)) {
    const entries = Object.entries(realDetails as Record<string, unknown>)
      .filter(([label, value]) =>
        typeof value === "string" &&
        value.trim().length > 0 &&
        !["country of origin", "culture"].includes(label.trim().toLowerCase()),
      )
      .map(([label, value]) => [label, String(value)] as [string, string]);
    if (entries.length) return entries;
  }
  if (profile.realMember || profile.discovery) return [["Profile details", "Not added yet"]];
  const sets = [
    {
      Education: "Graduate degree",
      Gender: "Woman",
      Height: "5'6\"–5'9\"",
      Exercise: "Active",
      Cannabis: "Never",
      "Have kids": "Don't have kids",
      "Star sign": "Libra",
      Politics: "Moderate",
      Religion: "Spiritual",
      Languages: "English, Spanish",
    },
    {
      Education: "Undergraduate degree",
      Gender: "Woman",
      Height: "5'2\"–5'5\"",
      Exercise: "Sometimes",
      Cannabis: "Never",
      "Have kids": "Have kids",
      "Star sign": "Aquarius",
      Politics: "Liberal",
      Religion: "Christian",
      Languages: "English, Japanese",
    },
    {
      Education: "Graduate degree",
      Gender: "Woman",
      Height: "5'6\"–5'9\"",
      Exercise: "Active",
      Cannabis: "Socially",
      "Have kids": "Don't have kids",
      "Star sign": "Gemini",
      Politics: "Apolitical",
      Religion: "Agnostic",
      Languages: "English, Mandarin",
    },
  ] as const;
  const safeIndex = Math.abs(profile.portrait || 0) % sets.length;
  return Object.entries(sets[safeIndex] || sets[0]);
}

const PROFILE_VIEW_MORE_ABOUT_LABELS = new Set([
  "height",
  "exercise",
  "drink",
  "smoke",
  "cannabis",
  "have kids?",
  "have kids?",
  "want kids?",
  "want kids?",
  "religion",
]);

function profileMoreAboutBasics(profile: Profile) {
  const entries = moreAboutForProfile(profile).filter(([label]) =>
    PROFILE_VIEW_MORE_ABOUT_LABELS.has(label.trim().toLowerCase()),
  );
  return entries.length ? entries : [["Profile details", "Not added yet"]];
}

function profileDetailDisplayValue(label: string, value: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("have kids")) return value === "Yes" ? "Has kids" : value === "No" ? "No kids" : value;
  if (normalized.includes("want kids")) {
    if (value === "Yes") return "Want kids";
    if (value === "No") return "Don\u2019t want kids";
    return value;
  }
  return value;
}

function profileLanguagesForCard(profile: Profile) {
  const signals = profileMatchingSignals(profile);
  const realLanguages = Array.isArray(signals.languages) ?
    signals.languages.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (realLanguages.length) return realLanguages.slice(0, 6);
  const languageEntry = moreAboutForProfile(profile).find(([label]) => label.trim().toLowerCase().includes("language"));
  if (!languageEntry) return [];
  return languageEntry[1].split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function MeetupVerifiedBadge() {
  return (
    <View
      accessibilityLabel="Meetup verified"
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 16,
        backgroundColor: "#E7F2EA",
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <ShieldCheck width={16} height={16} color={C.sage} strokeWidth={2.6} />
      <Text selectable style={{ color: C.sage, fontSize: 11, fontWeight: "900" }}>
        Meetup verified
      </Text>
    </View>
  );
}

function VerificationBadges({ profile }: { profile: Profile }) {
  const badges = profileVerificationBadges(profile, "full");
  if (!badges.length) return null;
  const meetupBadge = badges.find((badge) => badge.shortLabel === "Meetup");
  const identityBadge = badges.find((badge) => badge.shortLabel !== "Meetup");
  const orderedBadges = [meetupBadge, identityBadge].filter(
    (badge): badge is { label: string; shortLabel: string; icon: typeof BadgeCheck; color: string; background: string } => Boolean(badge),
  );
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: orderedBadges.length > 1 ? "space-between" : "flex-start",
        alignItems: "center",
        width: "100%",
        gap: 6,
      }}
    >
      {orderedBadges.map(({ label, icon: Icon, color, background }) => (
        <View
          key={label}
          accessibilityLabel={label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            borderRadius: 14,
            backgroundColor: background,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <Icon width={14} height={14} color={color} strokeWidth={2.6} />
          <Text selectable style={{ color, fontSize: 9, fontWeight: "900" }}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function profileHasStripeVerification(profile: Profile) {
  return profile.idVerified === true || profile.discovery?.idVerified === true;
}

function profileHasSelfieVerification(profile: Profile) {
  return profile.selfieVerified === true || profile.discovery?.selfieVerified === true;
}

function normalizeProfileVerification(profile: Profile): Profile {
  const idVerified = profileHasStripeVerification(profile);
  const selfieVerified = !idVerified && profileHasSelfieVerification(profile);
  const meetupVerified = profileMeetupVerified(profile);
  return {
    ...profile,
    idVerified,
    selfieVerified,
    meetupVerified,
    discovery: profile.discovery
      ? {
          ...profile.discovery,
          idVerified,
          selfieVerified,
          meetupVerified,
        }
      : profile.discovery,
  };
}

function profileIdentityVerificationKind(profile: Profile): "stripe" | "selfie" | "" {
  if (profileHasStripeVerification(profile)) return "stripe";
  if (profileHasSelfieVerification(profile)) return "selfie";
  return "";
}

function profileMeetupVerified(profile: Profile) {
  return profile.meetupVerified === true || profile.discovery?.meetupVerified === true;
}

function profileVerificationKind(profile: Profile): "stripe" | "selfie" | "meetup" | "" {
  const identityKind = profileIdentityVerificationKind(profile);
  if (identityKind) return identityKind;
  if (profileMeetupVerified(profile)) return "meetup";
  return "";
}

function profileHasVerifiedBadge(profile: Profile) {
  return profileVerificationBadges(profile).length > 0;
}

function profileVerificationBadgeColor(profile: Profile) {
  const kind = profileVerificationKind(profile);
  if (kind === "selfie") return KINDREDCUBE_ORANGE;
  if (kind === "meetup") return "#2DA85E";
  return "#1685E5";
}

function profileVerificationBadgeText(profile: Profile) {
  const kind = profileIdentityVerificationKind(profile);
  if (kind === "stripe") return "Verified securely by Stripe";
  if (kind === "selfie") return "Selfie verified";
  if (profileMeetupVerified(profile)) return "Meetup verified";
  return "";
}

function profileVerificationSummaryText(profile: Profile) {
  const identityKind = profileIdentityVerificationKind(profile);
  const identityText = identityKind === "stripe" ? "ID" : identityKind === "selfie" ? "Selfie" : "";
  const meetupText = profileMeetupVerified(profile) ? "Meetup verified" : "";
  if (identityText && meetupText) return `${identityText} + Meetup Verified`;
  if (identityText) return `${identityText} Verified`;
  return identityText || meetupText;
}

function profileVerificationBadges(profile: Profile, variant: "icon" | "full" = "icon") {
  const identityKind = profileIdentityVerificationKind(profile);
  const badges = [
    identityKind === "stripe" ?
      { label: "Verified securely by Stripe", shortLabel: "Stripe", icon: BadgeCheck, color: "#1685E5", background: "#E8F3FD" }
      : identityKind === "selfie" ?
        { label: "Selfie verified", shortLabel: "Selfie", icon: BadgeCheck, color: KINDREDCUBE_ORANGE, background: "#FFF1E4" }
        : null,
    profileMeetupVerified(profile) ?
      { label: "Meetup verified", shortLabel: "Meetup", icon: ShieldCheck, color: "#2DA85E", background: "#E7F7EA" }
      : null,
  ].filter((badge): badge is { label: string; shortLabel: string; icon: typeof BadgeCheck; color: string; background: string } => Boolean(badge));
  return variant === "full" ? badges : badges.map((badge) => ({ ...badge, label: badge.shortLabel }));
}

function ProfileVerificationBadgeIcons({
  profile,
  size = 17,
  stroke = C.paper,
  stacked = false,
}: {
  profile: Profile;
  size?: number;
  stroke?: string;
  stacked?: boolean;
}) {
  const badges = profileVerificationBadges(profile);
  if (!badges.length) return null;
  const meetupBadge = badges.find((badge) => badge.shortLabel === "Meetup");
  const identityBadge = badges.find((badge) => badge.shortLabel !== "Meetup");
  if (meetupBadge && identityBadge) {
    return (
      <View
        accessibilityLabel={`${meetupBadge.label} and ${identityBadge.label}`}
        style={{
          width: size * 1.78,
          height: size * 1.5,
          position: "relative",
        }}
      >
        <BadgeCheck
          width={size}
          height={size}
          color={meetupBadge.color}
          fill={meetupBadge.color}
          stroke={stroke}
          style={{
            position: "absolute",
            left: 0,
            top: size * 0.3,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
        <BadgeCheck
          width={size}
          height={size}
          color={identityBadge.color}
          fill={identityBadge.color}
          stroke={stroke}
          style={{
            position: "absolute",
            left: size * 0.62,
            top: 0,
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 2.5,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      {badges.map((badge) => (
        <BadgeCheck
          key={badge.label}
          accessibilityLabel={badge.label}
          width={size}
          height={size}
          color={badge.color}
          fill={badge.color}
          stroke={stroke}
        />
      ))}
    </View>
  );
}

function verificationStrengthCap(status: IdentityVerificationStatus, method: IdentityVerificationMethod) {
  if (status !== "verified") return 90;
  return method === "video_selfie" ? 95 : 100;
}

function verificationStrengthBonus(status: IdentityVerificationStatus, method: IdentityVerificationMethod) {
  if (status !== "verified") return 0;
  return method === "video_selfie" ? 5 : 10;
}

function calculateProfileStrengthValue(
  profile: Record<string, unknown>,
  status: IdentityVerificationStatus,
  method: IdentityVerificationMethod,
) {
  const photos = Array.isArray(profile.photos) ? profile.photos : [];
  const prompts = profile.promptAnswers && typeof profile.promptAnswers === "object" && !Array.isArray(profile.promptAnswers)
    ? profile.promptAnswers as Record<string, unknown>
    : {};
  const details = profile.details && typeof profile.details === "object" && !Array.isArray(profile.details)
    ? profile.details as Record<string, unknown>
    : {};
  const compatibilityResponses = profile.compatibilityResponses && typeof profile.compatibilityResponses === "object" && !Array.isArray(profile.compatibilityResponses)
    ? profile.compatibilityResponses as Record<string, unknown>
    : {};
  const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const validPromptCount = Object.values(prompts).filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const prompt = entry as Record<string, unknown>;
    return textValue(prompt.prompt).length > 0 && textValue(prompt.answer).length >= 3;
  }).length;
  const kindredTypeAnswerCount = kindredTypeQuestions.filter((question) => {
    const response = compatibilityResponses[question.key];
    return Boolean(response && typeof response === "object" && !Array.isArray(response) && typeof (response as Record<string, unknown>).value === "number");
  }).length;
  const completionItems = [
    Boolean(textValue(profile.personality)),
    kindredTypeAnswerCount === kindredTypeQuestions.length,
    stringList(profile.relationshipGoals).length > 0,
    stringList(profile.interests).length > 0,
    stringList(profile.causes).length > 0,
    stringList(profile.values).length > 0,
    Boolean(textValue(profile.bio)),
    Boolean(textValue(profile.work)),
    Boolean(textValue(profile.occupation)),
    Boolean(textValue(profile.hometown)),
    Object.keys(details).length >= 4,
    stringList(profile.languages).length > 0,
  ];
  const baseCompletionScore = Math.round((completionItems.filter(Boolean).length / completionItems.length) * 54);
  const promptCompletionScore = Math.min(12, validPromptCount * 4);
  const photoCompletionScore = Math.min(24, photos.length * 8);
  return Math.min(
    verificationStrengthCap(status, method),
    Math.min(90, photoCompletionScore + promptCompletionScore + baseCompletionScore) +
      verificationStrengthBonus(status, method),
  );
}

function mergeFreshProfileIntoChatProfile(fresh: Profile, existing?: Profile): Profile {
  const freshNormalized = normalizeProfileVerification(fresh);
  const existingNormalized = existing ? normalizeProfileVerification(existing) : undefined;
  const freshMatching = freshNormalized.discovery?.matching && typeof freshNormalized.discovery.matching === "object"
    ? freshNormalized.discovery.matching as Record<string, unknown>
    : {};
  const existingMatching = existingNormalized?.discovery?.matching && typeof existingNormalized.discovery.matching === "object"
    ? existingNormalized.discovery.matching as Record<string, unknown>
    : {};
  const promptAnswers = mergeProfilePromptAnswers(
    existingNormalized?.promptAnswers,
    existingMatching.promptAnswers,
    existingMatching.prompts,
    freshNormalized.promptAnswers,
    freshMatching.promptAnswers,
    freshMatching.prompts,
  );
  const discovery = freshNormalized.discovery || existingNormalized?.discovery;
  const mergedDiscovery = discovery
    ? {
        ...discovery,
        matching: {
          ...(existingMatching || {}),
          ...(freshMatching || {}),
          promptAnswers,
        },
      }
    : discovery;
  const merged = existingNormalized
    ? { ...existingNormalized, ...freshNormalized, discovery: mergedDiscovery, promptAnswers }
    : { ...freshNormalized, discovery: mergedDiscovery, promptAnswers };
  const idVerified = Boolean(profileHasStripeVerification(freshNormalized) || (existingNormalized ? profileHasStripeVerification(existingNormalized) : false));
  const selfieVerified = !idVerified && Boolean(profileHasSelfieVerification(freshNormalized) || (existingNormalized ? profileHasSelfieVerification(existingNormalized) : false));
  const meetupVerified = Boolean(profileMeetupVerified(freshNormalized) || (existingNormalized ? profileMeetupVerified(existingNormalized) : false));
  return normalizeProfileVerification({
    ...merged,
    discovery: merged.discovery
      ? {
          ...merged.discovery,
          matching: merged.discovery.matching,
          idVerified,
          selfieVerified,
          meetupVerified,
        }
      : merged.discovery,
    chatPreview: existing?.chatPreview ?? fresh.chatPreview,
    chatPreviewFromMe: existing?.chatPreviewFromMe ?? fresh.chatPreviewFromMe,
    chatLastMessageAt: existing?.chatLastMessageAt ?? fresh.chatLastMessageAt,
    chatLastMessageSenderId: existing?.chatLastMessageSenderId ?? fresh.chatLastMessageSenderId,
    idVerified,
    selfieVerified,
    meetupVerified,
  });
}

function NearbyMap({
  city,
  coordinates,
  people,
  onPersonPress,
  height,
}: {
  city: string;
  coordinates: { latitude: number; longitude: number } | null;
  people: readonly Profile[];
  onPersonPress: (profile: Profile) => void;
  height: number;
}) {
  if (!coordinates)
    return (
      <View
        style={{
          height,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          paddingHorizontal: 22,
        }}
      >
        <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
          Finding your actual map
        </Text>
        <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
          Enable location access so KindredCube can show the real map around you with preview profiles nearby.
        </Text>
      </View>
    );
  const offsets = [
    [0.012, -0.018],
    [-0.009, 0.014],
    [0.021, 0.008],
    [-0.018, -0.009],
    [0.005, 0.025],
    [-0.025, 0.018],
    [0.028, -0.022],
    [-0.013, -0.028],
    [0.032, 0.029],
    [-0.031, 0.004],
  ];
  return (
    <View
      style={{
        height,
        borderRadius: 26,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: "#E5E1D6",
        borderWidth: 1,
        borderColor: "#CBC3B3",
        boxShadow: "0 8px 24px rgba(54,42,31,0.12)",
      }}
    >
      <MapView
        style={{ width: "100%", height: "100%" }}
        initialRegion={{
          ...coordinates,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        <Marker
          coordinate={coordinates}
          title="You are here"
          description={city}
          pinColor={C.sage}
        />
        {people.slice(0, 10).map((person, index) => {
          const [latitudeOffset, longitudeOffset] = offsets[index];
          return (
            <Marker
              key={person.name}
              coordinate={{
                latitude: coordinates.latitude + latitudeOffset,
                longitude: coordinates.longitude + longitudeOffset,
              }}
              title={`${person.name}, ${person.age}`}
              description={`${person.culture} · ${person.role}`}
              onPress={() => onPersonPress(person)}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  overflow: "hidden",
                  borderWidth: 3,
                  borderColor: C.paper,
                  backgroundColor: C.paper,
                  boxShadow: "0 3px 8px rgba(34,31,27,0.25)",
                }}
              >
                <Portrait index={person.portrait} size={38} />
              </View>
            </Marker>
          );
        })}
      </MapView>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          backgroundColor: "rgba(255,253,249,0.92)",
          borderRadius: 13,
          paddingHorizontal: 11,
          paddingVertical: 7,
        }}
      >
        <Text
          selectable
          style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}
        >
          {city}
        </Text>
        <Text
          selectable
          style={{ color: C.sage, fontSize: 10, fontWeight: "800" }}
        >
          Connects nearby
        </Text>
      </View>
    </View>
  );
}

function profilesForInterests(interests: string[]) {
  if (!interests.length || interests.includes("Open to everyone"))
    return [...profiles];
  return profiles.filter((profile) =>
    interests.some((interest) => {
      if (profile.culture.toLowerCase() === interest.toLowerCase()) return true;
      return lifestyleGroups[interest]?.includes(profile.culture) ?? false;
    }),
  );
}

function profilesForSelectedDiscovery<T extends readonly Profile[] | Profile[]>(
  people: T,
  interests: string[],
) {
  if (!interests.length || interests.includes("Open to everyone")) return [...people];
  const matched = people.filter((profile) =>
    interests.some((interest) => {
      if (profile.culture.toLowerCase() === interest.toLowerCase()) return true;
      return lifestyleGroups[interest]?.includes(profile.culture) ?? false;
    }),
  );
  return matched.length ? matched : [...people];
}

function profilesForSeeking<T extends readonly Profile[] | Profile[]>(
  people: T,
  seeking: string,
) {
  const normalized = seeking.trim().toLowerCase();
  if (normalized === "women" || normalized === "woman")
    return people.filter((profile) => profile.gender === "Woman");
  if (normalized === "men" || normalized === "man")
    return people.filter((profile) => profile.gender === "Man");
  const women = people.filter((profile) => profile.gender === "Woman");
  const men = people.filter((profile) => profile.gender === "Man");
  const nonbinary = people.filter((profile) => profile.gender === "Nonbinary");
  const mixed: Profile[] = [];
  const max = Math.max(women.length, men.length, nonbinary.length);
  for (let index = 0; index < max; index += 1) {
    if (women[index]) mixed.push(women[index]);
    if (men[index]) mixed.push(men[index]);
    if (nonbinary[index]) mixed.push(nonbinary[index]);
  }
  return mixed.length ? mixed : [...people];
}

function profilesForRegistrationPreview(
  people: readonly Profile[],
  _interests: string[],
  seeking: string,
) {
  return profilesForSeeking(people, seeking);
}

function Results({
  answers,
  onBack,
  onProfilePress,
}: {
  answers: Answers;
  onBack: () => void;
  onProfilePress?: (profile: Profile) => void;
}) {
  const { height } = useWindowDimensions();
  const backRef = useRef(onBack);
  backRef.current = onBack;
  const swipeBack = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.05,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dx > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.1,
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => false,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 42 && Math.abs(gesture.dy) < 160) backRef.current();
      },
    }),
  ).current;
  const [visiblePreviewCount, setVisiblePreviewCount] = useState(1);
  const [status, setStatus] = useState<"locating" | "ready" | "denied">(
    "locating",
  );
  const [city, setCity] = useState(answers.city || "your area");
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await requestForegroundLocationOnce();
        if (permission.status !== "granted") {
          if (active) setStatus("denied");
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const places = await Location.reverseGeocodeAsync(position.coords);
        const detected =
          places[0]?.city ||
          places[0]?.subregion ||
          places[0]?.region ||
          "your area";
        if (active) {
          setCity(detected);
          setCoordinates({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("denied");
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setVisiblePreviewCount(1);
    const timer = setInterval(() => {
      setVisiblePreviewCount((count) => Math.min(count + 1, 10));
    }, 3_000);
    return () => clearInterval(timer);
  }, [answers.seeking, answers.interests.join("|")]);
  const areas = nearbyAreas(city);
  const previewShown = profilesForRegistrationPreview(
    registrationPreviewProfiles,
    answers.interests,
    answers.seeking,
  );
  const shown = previewShown.slice(0, visiblePreviewCount);
  const firstProfile = previewShown[0] || registrationPreviewProfiles[0]!;
  const mapHeight = Math.max(250, Math.min(480, height - 375));
  return (
    <ScrollView
      {...swipeBack.panHandlers}
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 34,
        gap: 14,
      }}
    >
      <Logo size="compact" align="left" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to edit interests"
        onPress={onBack}
        style={{ minHeight: 36, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <ChevronLeft width={22} height={22} color={C.ink} />
        <Text style={{ color: C.ink, fontWeight: "800" }}>
          Edit interests
        </Text>
      </Pressable>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 32,
            lineHeight: 36,
            fontWeight: "700",
          }}
        >
          {status === "locating" ? "Finding people near you..." : "Connects nearby"}
        </Text>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          {status === "denied" ?
            "Location access is off. Enable it to see your real city map."
            : `Around ${areas.slice(0, 3).join(", ")}, and nearby.`}
        </Text>
      </View>
      <NearbyMap
        city={city}
        coordinates={coordinates}
        people={shown}
        onPersonPress={onProfilePress}
        height={mapHeight}
      />
      <Button label="Click to view profiles" onPress={() => onProfilePress(firstProfile)} />
    </ScrollView>
  );
}

function Registration({
  profile,
  identity,
  seeking,
  dateOfBirth,
  onBack,
  onComplete,
  onSignIn,
}: {
  profile: Profile;
  identity: string;
  seeking: string;
  dateOfBirth: string;
  onBack: () => void;
  onComplete: (email: string, verificationUrl?: string) => void;
  onSignIn: () => void;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const usernameValid = /^[A-Za-z0-9_]{3,24}$/.test(username.trim());
  const passwordLongEnough = password.length >= 10;
  const passwordWithinLimit = password.length <= 128;
  const passwordHasCapital = /\p{Lu}/u.test(password);
  const passwordHasTwoSpecialCharacters =
    (password.match(/[^\p{L}\p{N}\s]/gu)?.length ?? 0) >= 2;
  const passwordsMatch = Boolean(password) && password === confirmPassword;
  const passwordDoesNotUseAccount = Boolean(password) && ![
    username.trim().toLowerCase(),
    email.trim().split("@")[0]?.toLowerCase() || "",
    "kindredcube",
  ].some((value) => value.length >= 3 && password.toLowerCase().includes(value));
  const valid =
    firstName.trim().length > 1 &&
    lastName.trim().length > 1 &&
    usernameValid &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    passwordLongEnough &&
    passwordWithinLimit &&
    passwordHasCapital &&
    passwordHasTwoSpecialCharacters &&
    passwordsMatch &&
    passwordDoesNotUseAccount;
  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await registerAccount({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        identity,
        seeking,
        dateOfBirth,
      });
      onComplete(email.trim(), result.developmentVerificationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your account could not be created.");
    } finally {
      setSubmitting(false);
    }
  };
  const inputStyle = {
    minHeight: compact ? 42 : 46,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
    borderRadius: 14,
    paddingHorizontal: 13,
    color: C.ink,
    fontSize: 15,
  } as const;
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 18,
          paddingTop: compact ? 8 : 12,
          paddingBottom: compact ? 12 : 18,
          gap: compact ? 7 : 10,
        }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={{ alignSelf: "flex-start", paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "800" }}>Back to map</Text>
        </Pressable>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "rgba(255,253,249,0.76)",
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 17,
            padding: compact ? 8 : 10,
          }}
        >
          <View
            style={{
              width: compact ? 44 : 50,
              height: compact ? 44 : 50,
              borderRadius: compact ? 22 : 25,
              overflow: "hidden",
            }}
          >
            <Image
              accessibilityLabel="Amara, KindredCube Assistant"
              source={require("./assets/amara-kindredcube-assistant.png")}
              resizeMode="cover"
              style={{ width: compact ? 44 : 50, height: compact ? 44 : 50 }}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              selectable
              style={{
                color: C.clay,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 0.2,
                textTransform: "uppercase",
              }}
            >
              Amara
            </Text>
            <Text
              selectable
              style={{ color: C.ink, fontSize: compact ? 14 : 15, fontWeight: "900", lineHeight: compact ? 18 : 20 }}
            >
              Join KindredCube to connect with your kindred.
            </Text>
          </View>
        </View>
        <View style={{ gap: 2 }}>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: compact ? 25 : 28,
              lineHeight: compact ? 28 : 31,
              fontWeight: "800",
            }}
          >
            Create your account
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
          >
            Register securely to connect and view complete profiles.
          </Text>
        </View>
        <View style={{ gap: compact ? 6 : 8 }}>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <TextInput
              autoComplete="given-name"
              textContentType="givenName"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#948A7F"
              style={[inputStyle, { flex: 1 }]}
            />
            <TextInput
              autoComplete="family-name"
              textContentType="familyName"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#948A7F"
              style={[inputStyle, { flex: 1 }]}
            />
          </View>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            value={username}
            onChangeText={setUsername}
            placeholder="Public username"
            placeholderTextColor="#948A7F"
            maxLength={24}
            style={inputStyle}
          />
          <Text selectable style={{ color: username && !usernameValid ? "#9C3225" : C.muted, fontSize: 10, lineHeight: 14 }}>
            This is the name people will see. Use 3-24 letters, numbers, or underscores.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="#948A7F"
            style={inputStyle}
          />
          {[
            {
                label: "Password — at least 10 characters",
              value: password,
              onChangeText: setPassword,
            },
            {
              label: "Confirm password",
              value: confirmPassword,
              onChangeText: setConfirmPassword,
            },
          ].map((field) => (
            <View
              key={field.label}
              style={{
                minHeight: compact ? 42 : 46,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.paper,
                borderRadius: 14,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!passwordVisible}
                autoComplete="new-password"
                textContentType="newPassword"
                value={field.value}
                onChangeText={field.onChangeText}
                placeholder={field.label}
                placeholderTextColor="#948A7F"
                maxLength={128}
                style={{
                  flex: 1,
                  minHeight: compact ? 42 : 46,
                  paddingLeft: 13,
                  paddingRight: 4,
                  color: C.ink,
                  fontSize: 15,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={passwordVisible ? "Hide passwords" : "Show passwords"}
                hitSlop={8}
                onPress={() => setPasswordVisible((value) => !value)}
                style={{
                  width: 42,
                  minHeight: compact ? 42 : 46,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {passwordVisible ? (
                  <EyeOff width={19} height={19} color={C.clay} strokeWidth={2.2} />
                ) : (
                  <Eye width={19} height={19} color={C.clay} strokeWidth={2.2} />
                )}
              </Pressable>
            </View>
          ))}
          <View
            style={{
              borderRadius: 13,
              backgroundColor: "#F3EFE8",
              padding: compact ? 7 : 9,
              flexDirection: "row",
              flexWrap: "wrap",
              rowGap: compact ? 4 : 5,
            }}
          >
            {[
              [passwordLongEnough, "At least 10 characters"],
              [passwordHasCapital, "At least one capital letter"],
              [passwordHasTwoSpecialCharacters, "At least two special characters"],
              [passwordWithinLimit, "No more than 128 characters"],
              [passwordDoesNotUseAccount, "Does not contain your username, email name, or KindredCube"],
              [passwordsMatch, "Both passwords match"],
            ].map(([passed, label]) => (
              <View
                key={String(label)}
                style={{
                  width:
                    label ===
                    "Does not contain your username, email name, or KindredCube" ?
                      "100%"
                      : "50%",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingRight: 4,
                }}
              >
                <View
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 8,
                    backgroundColor: passed ? "#E0EEE3" : C.paper,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {passed ? <Check width={10} height={10} color={C.sage} strokeWidth={3} /> : null}
                </View>
                <Text
                  selectable
                  style={{
                    flex: 1,
                    color: passed ? C.sage : C.muted,
                    fontSize: compact ? 9 : 9.5,
                    lineHeight: compact ? 11 : 12,
                    fontWeight: "800",
                  }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        {error ? (
          <View accessibilityRole="alert" style={{ borderRadius: 14, backgroundColor: "#F8DFDC", padding: 11 }}>
            <Text selectable style={{ color: "#8A3028", fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
              {error}
            </Text>
          </View>
        ) : null}
        <Button
          label={submitting ? "Creating secure account..." : "Create my account"}
          disabled={!valid || submitting}
          onPress={submit}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={{ alignItems: "center", paddingVertical: compact ? 5 : 7 }}
        >
          <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
            Already have an account? Sign in
          </Text>
        </Pressable>
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 11,
            lineHeight: 16,
            textAlign: "center",
          }}
        >
          By registering, you agree to our{" "}
          <Text
            accessibilityRole="link"
            onPress={() =>
              WebBrowser.openBrowserAsync("https://kindredcube.com/terms").catch(() =>
                Linking.openURL("https://kindredcube.com/terms").catch(() => undefined),
              )
            }
            style={{ color: C.clay, fontWeight: "900", textDecorationLine: "underline" }}
          >
            Terms
          </Text>
          {" "}and{" "}
          <Text
            accessibilityRole="link"
            onPress={() =>
              WebBrowser.openBrowserAsync("https://kindredcube.com/privacy").catch(() =>
                Linking.openURL("https://kindredcube.com/privacy").catch(() => undefined),
              )
            }
            style={{ color: C.clay, fontWeight: "900", textDecorationLine: "underline" }}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EmailVerification({
  email,
  profile,
  onBack,
  initialVerificationUrl,
}: {
  email: string;
  profile: Profile;
  onBack: () => void;
  initialVerificationUrl?: string;
}) {
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState(initialVerificationUrl || "");
  const resend = async () => {
    if (resending) return;
    setResending(true);
    setResendMessage("");
    setResendError("");
    try {
      const result = await resendVerificationEmail(email);
      setResendMessage(result.message);
      setVerificationUrl(result.developmentVerificationUrl || "");
    } catch (caught) {
      setResendError(
        caught instanceof Error ?
          caught.message
          : "A new confirmation email could not be sent.",
      );
    } finally {
      setResending(false);
    }
  };
  const swipeBack = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 70) onBack();
      },
    }),
  ).current;
  return (
    <ScrollView
      {...swipeBack.panHandlers}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 30,
        justifyContent: "center",
        gap: 18,
      }}
    >
      <Logo size="compact" />
      <View
        style={{
          alignItems: "center",
          gap: 12,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 26,
          padding: 22,
          boxShadow: "0 10px 28px rgba(54,42,31,0.08)",
        }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: "#FCE5EE",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: C.pink, fontSize: 34, fontWeight: "900" }}>
            ✉
          </Text>
        </View>
        <Text
          selectable
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 31,
            fontWeight: "800",
            textAlign: "center",
          }}
        >
          Confirm your email
        </Text>
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 14,
            lineHeight: 21,
            textAlign: "center",
          }}
        >
          A verification link is required at
        </Text>
        <Text
          selectable
          style={{
            color: C.clay,
            fontSize: 15,
            fontWeight: "900",
            textAlign: "center",
          }}
        >
          {email}
        </Text>
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 13,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          Confirm the email address before connecting with {profile.name}. This
          helps keep bots and fake accounts out of KindredCube.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={resending}
        onPress={resend}
        style={{
          minHeight: 52,
          borderRadius: 26,
          backgroundColor: C.ink,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
          opacity: resending ? 0.65 : 1,
        }}
      >
        <Text style={{ color: C.paper, fontWeight: "900", fontSize: 15 }}>
          {resending ? "Sending a new link..." : "Resend confirmation email"}
        </Text>
      </Pressable>
      {resendMessage ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ color: C.sage, textAlign: "center", fontWeight: "800" }}
        >
          {resendMessage}
        </Text>
      ) : null}
      {verificationUrl ? (
        <View style={{ borderRadius: 18, backgroundColor: "#EDF3ED", padding: 14, gap: 8 }}>
          <Text selectable style={{ color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "center" }}>
            Local test confirmation link
          </Text>
          <Text selectable style={{ color: C.clay, fontSize: 11, lineHeight: 16, fontWeight: "800", textAlign: "center" }}>
            {verificationUrl}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => Linking.openURL(verificationUrl)}
            style={{ minHeight: 42, borderRadius: 21, backgroundColor: C.sage, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}
          >
            <Text style={{ color: C.paper, fontWeight: "900" }}>Open confirmation link</Text>
          </Pressable>
        </View>
      ) : null}
      {resendError ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ color: "#9C3225", textAlign: "center", fontWeight: "800" }}
        >
          {resendError}
        </Text>
      ) : null}
    </ScrollView>
  );
}

type MemberReportReason = "Fake profile" | "Harassment" | "Scam or money request" | "Hate or discrimination" | "Inappropriate content" | "Safety concern" | "Other";

function memberSafetyReasonCode(reason?: MemberReportReason) {
  return reason?.toLowerCase().replaceAll(" ", "_").replaceAll("or", "or");
}

function selfieVerificationNotice(status: IdentityVerificationStatus, reasonCode: string) {
  if (status === "verified") return "Thank you for verifying. You are now Selfie Verified.";
  if (reasonCode === "possible_duplicate_account") {
    return "This face appears linked to another KindredCube account. Please log into that account instead.";
  }
  if (reasonCode === "face_frame_required" || reasonCode === "no_indexable_face_detected") {
    return "We could not capture a clear face. Please keep your face inside the oval and try again.";
  }
  return "Verification has not met the requirement. Please redo your video selfie.";
}

function MemberSafetyMenu({
  profile,
  onBlock,
  onReport,
}: {
  profile: Profile;
  onBlock: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onReport?: (profile: Profile, reason: MemberReportReason, details: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report" | "block">("menu");
  const [reason, setReason] = useState<MemberReportReason | "">("");
  const [details, setDetails] = useState("");
  const reasons: MemberReportReason[] = ["Fake profile", "Harassment", "Scam or money request", "Hate or discrimination", "Inappropriate content", "Safety concern", "Other"];
  if (!onBlock && !onReport) return null;
  return (
    <View style={{ position: "relative", zIndex: 9999, elevation: 9999 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Safety options for ${profile.name}`} onPress={() => { setOpen((value) => !value); setMode("menu"); }} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.ink, fontSize: 18, fontWeight: "900", letterSpacing: 2 }}>•••</Text>
      </Pressable>
      {open ? (
        <>
          <Pressable accessibilityLabel="Close safety menu" onPress={() => setOpen(false)} style={{ position: "absolute", right: -18, top: -18, width: 420, height: 720, zIndex: 9998, elevation: 9998 }} />
          <View style={{ position: "absolute", right: 0, top: 48, width: 285, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 9, zIndex: 9999, elevation: 9999, boxShadow: "0 9px 24px rgba(34,31,27,0.18)" }}>
            {mode === "menu" ? <>
              <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>Safety options</Text>
              {onReport ? <Pressable onPress={() => setMode("report")} style={{ minHeight: 43, borderRadius: 14, backgroundColor: "#FFF4EF", paddingHorizontal: 12, justifyContent: "center" }}><Text style={{ color: "#9C3225", fontWeight: "900" }}>Report {profile.name}</Text></Pressable> : null}
              {onBlock ? <Pressable onPress={() => setMode("block")} style={{ minHeight: 43, borderRadius: 14, backgroundColor: "#F3EFE8", paddingHorizontal: 12, justifyContent: "center" }}><Text style={{ color: C.ink, fontWeight: "900" }}>Block {profile.name}</Text></Pressable> : null}
            </> : mode === "block" ? <>
              <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>Block {profile.name}?</Text>
              <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>You will be removed from each other's discovery, likes, matches and chats immediately. They will not be notified.</Text>
              <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Optional reason</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{reasons.map((item) => <Pressable key={item} onPress={() => setReason(item)} style={{ borderRadius: 15, borderWidth: 1, borderColor: reason === item ? C.ink : C.line, backgroundColor: reason === item ? "#F3EFE8" : C.paper, paddingHorizontal: 9, paddingVertical: 7 }}><Text style={{ color: C.ink, fontSize: 10, fontWeight: "900" }}>{item}</Text></Pressable>)}</View>
              <TextInput multiline value={details} onChangeText={setDetails} placeholder="Optional details for moderators" placeholderTextColor="#948A7F" style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10, color: C.ink, textAlignVertical: "top" }} />
              <Button compact label="Block member" onPress={() => { onBlock?.(profile, reason || undefined, details.trim()); setOpen(false); }} />
              <Pressable onPress={() => setMode("menu")} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontWeight: "900" }}>Cancel</Text></Pressable>
            </> : <>
              <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>Report {profile.name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{reasons.map((item) => <Pressable key={item} onPress={() => setReason(item)} style={{ borderRadius: 15, borderWidth: 1, borderColor: reason === item ? "#C84534" : C.line, backgroundColor: reason === item ? "#FDE5E1" : C.paper, paddingHorizontal: 9, paddingVertical: 7 }}><Text style={{ color: reason === item ? "#9C3225" : C.ink, fontSize: 10, fontWeight: "900" }}>{item}</Text></Pressable>)}</View>
              <TextInput multiline value={details} onChangeText={setDetails} placeholder="Optional details for the safety team" placeholderTextColor="#948A7F" style={{ minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10, color: C.ink, textAlignVertical: "top" }} />
              <Button compact label="Submit report" disabled={!reason} onPress={() => { if (reason) onReport?.(profile, reason, details.trim()); setOpen(false); }} />
              <Pressable onPress={() => setMode("menu")} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontWeight: "900" }}>Cancel</Text></Pressable>
            </>}
          </View>
        </>
      ) : null}
    </View>
  );
}

function ProfileDetail({
  profile,
  onBack,
  onConnect,
  onLike,
  onPass,
  liked = false,
  readyMeetMode = false,
  onSwipeLeft,
  onSwipeRight,
  onBlock,
  onReport,
  walletBalance = 0,
  hasCommentPlan = false,
  onOpenWallet,
  onPhotoComment,
}: {
  profile: Profile;
  onBack: () => void;
  onConnect?: () => void;
  onLike?: () => void;
  onPass?: () => void;
  liked?: boolean;
  readyMeetMode?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onBlock: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onReport?: (profile: Profile, reason: MemberReportReason, details: string) => void;
  walletBalance?: number;
  hasCommentPlan?: boolean;
  onOpenWallet?: () => void;
  onPhotoComment?: (profile: Profile, photoIndex: number) => Promise<boolean>;
}) {
  const { width: profileScreenWidth } = useWindowDimensions();
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const swipeLeftRef = useRef(onSwipeLeft);
  const swipeRightRef = useRef(onSwipeRight);
  const profileTouchStart = useRef<{ x: number; y: number } | null>(null);
  const profileSwipeX = useRef(new Animated.Value(0)).current;
  const [profileSwipeDelta, setProfileSwipeDelta] = useState(0);
  const photoPrompts = profilePromptsForGallery(profile);
  const profileCanSwipe = !readyMeetMode && (Boolean(onLike) || Boolean(onPass));
  swipeLeftRef.current = onSwipeLeft;
  swipeRightRef.current = onSwipeRight;
  const finishProfileSwipe = useCallback(
    (direction: "left" | "right") => {
      const callback =
        direction === "left" ? swipeLeftRef.current || onPass : swipeRightRef.current || onLike;
      Animated.timing(profileSwipeX, {
        toValue: direction === "right" ? profileScreenWidth : -profileScreenWidth,
        duration: 230,
        useNativeDriver: true,
      }).start(({ finished }) => {
        profileSwipeX.setValue(0);
        setProfileSwipeDelta(0);
        if (finished) callback?.();
      });
    },
    [onLike, onPass, profileScreenWidth, profileSwipeX],
  );
  const shareProfile = useCallback(() => {
    Share.share({
      title: `Meet ${profile.name} on KindredCube`,
      message: `I found ${profile.name}, ${profile.age}, on KindredCube. This could be a meaningful match for someone you know.`,
    }).catch(() => undefined);
  }, [profile.age, profile.name]);
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={(event) => {
        if (!profileCanSwipe) return;
        profileTouchStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
        setProfileSwipeDelta(0);
      }}
      onTouchMove={(event) => {
        if (!profileCanSwipe || !profileTouchStart.current) return;
        const dx = event.nativeEvent.pageX - profileTouchStart.current.x;
        const dy = event.nativeEvent.pageY - profileTouchStart.current.y;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          const limited = Math.max(-profileScreenWidth * 0.35, Math.min(profileScreenWidth * 0.35, dx));
          setProfileSwipeDelta(limited);
          profileSwipeX.setValue(limited);
        }
      }}
      onTouchEnd={(event) => {
        if (!profileCanSwipe || !profileTouchStart.current) return;
        const dx = event.nativeEvent.pageX - profileTouchStart.current.x;
        const dy = event.nativeEvent.pageY - profileTouchStart.current.y;
        profileTouchStart.current = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.15) {
          Animated.spring(profileSwipeX, { toValue: 0, useNativeDriver: true }).start(() => setProfileSwipeDelta(0));
          return;
        }
        finishProfileSwipe(dx < 0 ? "left" : "right");
      }}
    >
    <Animated.View style={{ flex: 1, transform: [{ translateX: profileSwipeX }, { rotate: profileSwipeX.interpolate({ inputRange: [-profileScreenWidth, 0, profileScreenWidth], outputRange: ["-7deg", "0deg", "7deg"] }) }] }}>
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: readyMeetMode && onConnect ? 116 : profileCanSwipe ? 112 : 30,
        gap: 15,
      }}
    >
      {!readyMeetMode ? <Logo size="compact" /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}><Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={{ alignSelf: "flex-start", paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
        <Text style={{ color: C.ink, fontWeight: "800" }}>
          {readyMeetMode ? "Back to Ready to Meet" : "Back"}
        </Text>
      </Pressable><MemberSafetyMenu profile={profile} onBlock={onBlock} onReport={onReport} /></View>
      <View
        style={{
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
        }}
      >
        <View style={{ position: "relative" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Enlarge ${profile.name}'s photo`}
            onPress={() => setGalleryIndex(0)}
          >
            <ProfileImage profile={profile} size={profileScreenWidth - 40} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${profile.name}'s profile`}
            onPress={shareProfile}
            style={{
              position: "absolute",
              left: 14,
              bottom: 14,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "rgba(255,253,249,0.92)",
              borderWidth: 1,
              borderColor: C.line,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 5px 14px rgba(34,31,27,0.22)",
            }}
          >
            <Share2 width={22} height={22} color={C.ink} strokeWidth={2.8} />
          </Pressable>
        </View>
        {!readyMeetMode && Math.abs(profileSwipeDelta) > 20 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 24,
              left: profileSwipeDelta < 0 ? 22 : undefined,
              right: profileSwipeDelta > 0 ? 22 : undefined,
              borderRadius: 18,
              borderWidth: 3,
              borderColor: profileSwipeDelta > 0 ? C.pink : C.muted,
              backgroundColor: "rgba(255,253,249,0.84)",
              paddingHorizontal: 16,
              paddingVertical: 8,
              transform: [{ rotate: profileSwipeDelta > 0 ? "10deg" : "-10deg" }],
            }}
          >
            <Text style={{ color: profileSwipeDelta > 0 ? C.pink : C.muted, fontSize: 19, fontWeight: "900" }}>
              {profileSwipeDelta > 0 ? "LIKE" : "PASS"}
            </Text>
          </View>
        ) : null}
        {profileCanSwipe ? (
          <View
            pointerEvents="none"
            style={{ backgroundColor: "#F7F3ED", paddingHorizontal: 14, paddingVertical: 10 }}
          >
            <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900", textAlign: "center" }}>
              Swipe right to like · swipe left to pass
            </Text>
          </View>
        ) : null}
        <View style={{ padding: 16, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 28,
                fontWeight: "800",
              }}
            >
              {profile.name}, {profile.age}
            </Text>
            <ProfileVerificationBadgeIcons profile={profile} size={19} stacked />
          </View>
          {profileOccupationEducationLine(profile) ? (
            <Text selectable numberOfLines={2} style={{ color: C.clay, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
              {profileOccupationEducationLine(profile)}
            </Text>
          ) : null}
          <VerificationBadges profile={profile} />
          {profileBioForCard(profile) ? (
            <View style={{ paddingTop: 5, gap: 4 }}>
              <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
                Bio
              </Text>
              <Text
                selectable
                style={{
                  color: C.sage,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {profileBioForCard(profile)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View
        style={{
          borderRadius: 21,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 14,
          gap: 10,
        }}
      >
        <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
          More about {profile.name}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {profileMoreAboutBasics(profile).map(([label, value]) => (
            <View
              key={`${label}-${value}`}
              style={{
                minHeight: 36,
                borderRadius: 15,
                backgroundColor: "#F1F0EE",
                paddingHorizontal: 10,
                paddingVertical: 7,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text selectable style={{ color: C.ink, fontSize: 15 }}>
                {profileDetailEmoji(label)}
              </Text>
              <Text
                selectable
                numberOfLines={1}
                style={{ color: C.ink, fontSize: 12, fontWeight: "800", maxWidth: 185 }}
              >
                {profileDetailDisplayValue(label, value)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ borderRadius: 21, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }}>
        <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
          Searching for
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {profileGoalsForCard(profile).map((goal) => (
            <View key={goal} style={{ borderRadius: 15, backgroundColor: "#F7F3ED", borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "800" }}>
                {goalEmoji(goal)} {goal}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ borderRadius: 21, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }}>
        <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
          Interests
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {profileInterestsForCard(profile).map((interest) => (
            <View key={interest} style={{ borderRadius: 15, backgroundColor: "#FFF8EF", borderWidth: 1, borderColor: "#F4C28C", paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "800" }}>
                {interestEmoji(interest)} {interest}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ borderRadius: 21, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }}>
        <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
          More photos of {profile.name}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {profileGalleryItems(profile).slice(1).map((item, photoIndex) => {
            const galleryIndexForPhoto = photoIndex + 1;
            const savedPrompt = photoPrompts[photoIndex] || null;
            return (
              <Pressable
                key={`${item.kind}-${item.value}-${photoIndex}`}
                accessibilityRole="button"
                accessibilityLabel={`Enlarge ${profile.name}'s photo ${galleryIndexForPhoto + 1}`}
                onPress={() => setGalleryIndex(galleryIndexForPhoto)}
                style={{ width: 116, height: 136, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.cream, position: "relative" }}
              >
                {item.kind === "uri" ? (
                  <Image source={{ uri: String(item.value) }} resizeMode="cover" style={{ width: 116, height: 136 }} />
                ) : (
                  <Portrait index={Number(item.value)} size={136} />
                )}
                {item.source === "instagram" ? <InstagramPhotoBadge compact /> : null}
                {savedPrompt ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 6,
                      right: 6,
                      bottom: 6,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.55)",
                      backgroundColor: "rgba(255,253,249,0.42)",
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: C.paper, fontSize: 8, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
                      {savedPrompt?.prompt || ""}
                    </Text>
                    <Text numberOfLines={2} style={{ color: C.paper, fontSize: 9, lineHeight: 11, fontWeight: "900", textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
                      {savedPrompt?.answer || ""}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {profileLanguagesForCard(profile).length ? (
        <View style={{ borderRadius: 21, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }}>
          <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
            Languages
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {profileLanguagesForCard(profile).map((language) => (
              <View key={language} style={{ borderRadius: 15, backgroundColor: "#F7F3ED", borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 7 }}>
                <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "800" }}>
                  {languageFlagEmoji(language)} {language}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {(onReport || onBlock) ? (
        <View style={{ alignSelf: "center", flexDirection: "row", gap: 8, paddingTop: 4 }}>
          {onReport ? <Pressable accessibilityRole="button" onPress={() => onReport(profile, "Safety concern", "Reported from profile footer.")} style={{ minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: "#E5B8AE", backgroundColor: "#FFF7F4", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#9C3225", fontSize: 11, fontWeight: "900" }}>Report</Text>
          </Pressable> : null}
          {onBlock ? <Pressable accessibilityRole="button" onPress={() => onBlock(profile, undefined, "")} style={{ minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: C.paper, paddingHorizontal: 12 }}>
              <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>Block</Text>
            </Pressable> : null}
        </View>
      ) : null}
    </ScrollView>
    {galleryIndex !== null ? (
      <ProfilePhotoGallery
        profile={profile}
        initialIndex={galleryIndex}
        walletBalance={walletBalance}
        hasCommentPlan={hasCommentPlan}
        onOpenWallet={onOpenWallet}
        onPhotoComment={onPhotoComment}
        onClose={() => setGalleryIndex(null)}
      />
    ) : null}
    </Animated.View>
    {profileCanSwipe ? (
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 14,
          backgroundColor: "rgba(247,241,231,0.96)",
          borderTopWidth: 1,
          borderTopColor: C.line,
          flexDirection: "row",
          gap: 12,
        }}
      >
        {onPass ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pass on ${profile.name}`}
            onPress={() => finishProfileSwipe("left")}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: C.line,
              backgroundColor: C.paper,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            <X width={20} height={20} color={C.muted} strokeWidth={3} />
            <Text style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Pass</Text>
          </Pressable>
        ) : null}
        {onLike ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Like ${profile.name}`}
            accessibilityState={{ selected: liked }}
            onPress={() => finishProfileSwipe("right")}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: 26,
              backgroundColor: liked ? "#FCE5EE" : C.ink,
              borderWidth: liked ? 1 : 0,
              borderColor: "#F3A8C4",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Heart width={20} height={20} color={liked ? C.pink : C.paper} fill={liked ? C.pink : "transparent"} strokeWidth={2.6} />
            <Text style={{ color: liked ? C.ink : C.paper, fontSize: 14, fontWeight: "900" }}>
              {liked ? "Liked" : "Like"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}
    {readyMeetMode && onConnect ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${profile.name}`}
        onPress={onConnect}
        style={{
          position: "absolute",
          right: 22,
          bottom: 24,
          width: 62,
          height: 62,
          borderRadius: 31,
          backgroundColor: C.pink,
          borderWidth: 3,
          borderColor: "rgba(255,253,249,0.94)",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 28px rgba(236,45,117,0.32)",
        }}
      >
        <MessageCircle width={29} height={29} color={C.paper} strokeWidth={2.8} />
      </Pressable>
    ) : null}
    </View>
  );
}

const superSwipePacks = [
  {
    quantity: 30,
    each: 1.1,
    total: 33,
    checkoutUrl: process.env.EXPO_PUBLIC_STRIPE_SUPER_SWIPE_30_URL,
  },
  {
    quantity: 15,
    each: 1.2,
    total: 18,
    checkoutUrl: process.env.EXPO_PUBLIC_STRIPE_SUPER_SWIPE_15_URL,
  },
  {
    quantity: 5,
    each: 1.5,
    total: 7.5,
    checkoutUrl: process.env.EXPO_PUBLIC_STRIPE_SUPER_SWIPE_5_URL,
  },
  {
    quantity: 2,
    each: 2.5,
    total: 5,
    checkoutUrl: process.env.EXPO_PUBLIC_STRIPE_SUPER_SWIPE_2_URL,
  },
] as const;

function ConnectMark() {
  return null;
}

function SuperSwipeStore({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const pack = superSwipePacks[selected];
  const checkout = async () => {
    if (!pack.checkoutUrl) {
      setError("Stripe Checkout is not connected for this package yet.");
      return;
    }
    setError("");
    await openKindredInAppSession(pack.checkoutUrl, "kindredcube://payment-complete");
  };
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 30,
        gap: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={{ alignSelf: "flex-start", padding: 6 }}
      >
        <Text style={{ color: C.ink, fontWeight: "900" }}>{"♥ Connect"}</Text>
      </Pressable>
      <View style={{ alignItems: "center", gap: 7 }}>
        <Star width={46} height={46} color="#E2A415" fill="#FFF5D5" strokeWidth={2.8} />
        <Text
          selectable
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 32,
            fontWeight: "900",
          }}
        >
          Get Super Swipes
        </Text>
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          Stand out and show someone you're especially interested.
        </Text>
      </View>
      <View style={{ gap: 9 }}>
        {superSwipePacks.map((item, index) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === index }}
            key={item.quantity}
            onPress={() => {
              setSelected(index);
              setError("");
            }}
            style={{
              minHeight: 70,
              borderRadius: 18,
              borderWidth: 2,
              borderColor: selected === index ? C.pink : C.line,
              backgroundColor: selected === index ? "#FCE5EE" : C.paper,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}
              >
                {item.quantity} Super Swipes
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 12 }}>
                ${item.each.toFixed(2)} each
              </Text>
            </View>
            <Text
              selectable
              style={{
                color: selected === index ? "#A5164D" : C.ink,
                fontSize: 20,
                fontWeight: "900",
              }}
            >
              ${item.total.toFixed(2)}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={{
            color: "#A0322A",
            fontSize: 13,
            textAlign: "center",
            fontWeight: "800",
          }}
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={`Continue to Stripe · $${pack.total.toFixed(2)}`}
        onPress={checkout}
      />
      <Text
        selectable
        style={{
          color: C.muted,
          fontSize: 11,
          textAlign: "center",
          lineHeight: 16,
        }}
      >
        Purchases are activated only after secure server-side Stripe
        confirmation.
      </Text>
    </ScrollView>
  );
}

function Connect({
  people,
  onProfilePress,
  onFilter,
}: {
  people: Profile[];
  onProfilePress?: (profile: Profile) => void;
  onFilter: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const deck = people.length ? people : profiles.slice(0, 8);
  const [index, setIndex] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState("");
  const position = useRef(new Animated.ValueXY()).current;
  const advanceRef = useRef<(direction: "like" | "pass") => void>(() => {});
  const advance = (direction: "like" | "pass") => {
    setNotice(direction === "like" ? "Liked" : "Passed");
    Animated.timing(position, {
      toValue: { x: direction === "like" ? width : -width, y: 0 },
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      setIndex((current) => current + 1);
      setComment("");
      setTimeout(() => setNotice(""), 450);
    });
  };
  advanceRef.current = advance;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) =>
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.08 }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 80) advanceRef.current("like");
        else if (gesture.dx < -80) advanceRef.current("pass");
        else
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;
  if (storeOpen) return <SuperSwipeStore onBack={() => setStoreOpen(false)} />;
  const current = deck[index];
  if (!current)
    return (
      <ScrollView
        scrollEnabled={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 22,
          gap: 20,
        }}
      >
        <AppHeader onFilter={onFilter} />
        <View style={{ flex: 1, justifyContent: "center", gap: 20 }}>
          <ConnectMark />
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 31,
              textAlign: "center",
              fontWeight: "800",
            }}
          >
            You've seen everyone for now.
          </Text>
          <Text selectable style={{ color: C.muted, textAlign: "center" }}>
            Come back later for new connections.
          </Text>
          <Button label="Review again" onPress={() => setIndex(0)} />
        </View>
      </ScrollView>
    );
  const cardWidth = Math.min(width - 32, 410);
  const imageHeight = Math.min(cardWidth, height < 700 ? 245 : 330);
  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ["-10deg", "0deg", "10deg"],
  });
  return (
    <ScrollView
      scrollEnabled={false}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 14,
        alignItems: "center",
        gap: 10,
      }}
    >
      <ConnectMark />
      {notice ? (
        <Text
          selectable
          style={{
            position: "absolute",
            top: 65,
            zIndex: 30,
            color: notice === "Liked" ? C.pink : C.muted,
            fontSize: 16,
            fontWeight: "900",
          }}
        >
          {notice}
        </Text>
      ) : null}
      <Animated.View
        {...pan.panHandlers}
        style={{
          width: cardWidth,
          borderRadius: 25,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: C.paper,
          boxShadow: "0 12px 30px rgba(54,42,31,0.15)",
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate },
          ],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${current.name}'s profile`}
          onPress={() => onProfilePress(current)}
        >
          <View
            style={{
              width: cardWidth,
              height: imageHeight,
              overflow: "hidden",
            }}
          >
            <ProfileImage profile={current} size={cardWidth} />
          </View>
          <View
            style={{
              paddingHorizontal: 15,
              paddingTop: 11,
              paddingBottom: 8,
              gap: 3,
            }}
          >
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 26,
                fontWeight: "900",
              }}
            >
              {current.name}, {current.age}
            </Text>
            <Text
              selectable
              style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}
            >
              {profileOccupationEducationLine(current) || "Profile details not added"}
            </Text>
            <VerificationBadges profile={current} />
          </View>
        </Pressable>
        <View
          style={{
            flexDirection: "row",
            gap: 7,
            paddingHorizontal: 12,
            paddingBottom: 12,
          }}
        >
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Comment on this photo..."
            placeholderTextColor="#948A7F"
            style={{
              flex: 1,
              minHeight: 42,
              borderWidth: 1,
              borderColor: C.line,
              borderRadius: 21,
              paddingHorizontal: 13,
              color: C.ink,
              fontSize: 13,
            }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!comment.trim()}
            onPress={() => {
              setNotice("Comment sent");
              setComment("");
              setTimeout(() => setNotice(""), 900);
            }}
            style={{
              minWidth: 58,
              borderRadius: 21,
              backgroundColor: comment.trim() ? C.ink : "#B9B0A5",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>
              Send
            </Text>
          </Pressable>
        </View>
      </Animated.View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 22,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pass"
          onPress={() => advance("pass")}
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X width={26} height={26} color={C.muted} strokeWidth={2.8} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Super Swipe"
          onPress={() => setStoreOpen(true)}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: "#FFF5D5",
            borderWidth: 1,
            borderColor: "#E8C75B",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Star width={30} height={30} color="#D39B00" fill="#FFF2BB" strokeWidth={2.8} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like"
          onPress={() => advance("like")}
          style={{
            width: 62,
            height: 62,
            borderRadius: 31,
            backgroundColor: "#FCE5EE",
            borderWidth: 1,
            borderColor: "#F3A4C2",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Heart width={31} height={31} color={C.pink} fill="#F7A7C6" strokeWidth={2.5} />
        </Pressable>
      </View>
      <Text selectable style={{ color: C.muted, fontSize: 10 }}>
          Swipe right to like · Swipe left to pass · Photo comments use Premium or Wallet
      </Text>
    </ScrollView>
  );
}

function CompleteProfileRecommendation({
  profileStrength,
  onComplete,
  onBrowse,
}: {
  profileStrength: number;
  onComplete: () => void;
  onBrowse: () => void;
}) {
  return (
    <ScrollView
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 24,
        gap: 18,
      }}
    >
      <Logo size="compact" />
      <ConnectMark />
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 22,
            gap: 14,
            boxShadow: "0 12px 30px rgba(54,42,31,0.10)",
          }}
        >
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              backgroundColor: "#FCE5EE",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Heart width={30} height={30} color={C.pink} fill={C.pink} />
          </View>
          <View style={{ gap: 5 }}>
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 31,
                lineHeight: 34,
                fontWeight: "900",
              }}
            >
              Complete your profile
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}
            >
              Profiles with photos, prompts, values, and intentions receive
              stronger recommendations and more meaningful connections.
            </Text>
          </View>
          <View
            style={{
              height: 7,
              borderRadius: 4,
              overflow: "hidden",
              backgroundColor: C.line,
            }}
          >
            <View
              style={{
                width: `${profileStrength}%`,
                height: "100%",
                backgroundColor: C.pink,
              }}
            />
          </View>
          <Text
            selectable
            style={{ color: C.sage, fontSize: 12, fontWeight: "900" }}
          >
            {profileStrength}% complete
          </Text>
          <Button label="Complete my profile" onPress={onComplete} />
          <Pressable
            accessibilityRole="button"
            onPress={onBrowse}
            style={{ alignItems: "center", padding: 7 }}
          >
            <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
              Browse Connect for now
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function MessagesScreen({
  username,
  assistantAvailable,
  memberChat,
  memberChats,
  unreadChatIds,
  currentUserId,
  activeMemberChat,
  onOpenMemberChat,
  onProfilePress,
  onCloseMemberChat,
  onBlockMember,
  onReportMember,
  onCompleteProfile,
  onMessageRead,
  onMemberMessageSent,
  memberReadyNearby,
  verificationStatus,
  verificationMethod,
  onVerificationStatusChange,
  onVerificationMethodChange,
  onCurrentUserMeetupVerified,
  completedPostMeetCheckKeys = [],
  onPostMeetCheckCompleted,
}: {
  username: string;
  assistantAvailable: boolean;
  memberChat: Profile | null;
  memberChats?: Profile[];
  unreadChatIds?: string[];
  currentUserId?: string;
  activeMemberChat: Profile | null;
  onOpenMemberChat: (profile: Profile) => void;
  onProfilePress?: (profile: Profile) => void;
  onCloseMemberChat: () => void;
  onBlockMember: (profile: Profile, reason?: MemberReportReason, details?: string) => void;
  onReportMember: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onCompleteProfile: () => void;
  onMessageRead: () => void;
  onMemberMessageSent: (profile: Profile, message?: ChatMessage) => void;
  memberReadyNearby: boolean;
  verificationStatus?: IdentityVerificationStatus;
  verificationMethod?: IdentityVerificationMethod;
  onVerificationStatusChange?: (status: IdentityVerificationStatus) => void;
  onVerificationMethodChange?: (method: IdentityVerificationMethod) => void;
  onCurrentUserMeetupVerified?: () => void;
  completedPostMeetCheckKeys?: string[];
  onPostMeetCheckCompleted?: (key: string) => void;
}) {
  const [conversationOpen, setConversationOpen] = useState(false);
  const [chatListFilter, setChatListFilter] = useState<"all" | "unread">("all");
  const chatProfiles = memberChats && memberChats.length > 0 ?
    memberChats
    : memberChat ?
      [memberChat]
      : [];
  const visibleChatProfiles =
    chatListFilter === "unread" ?
       chatProfiles.filter((chatProfile) =>
          Boolean(unreadChatIds.includes(chatProfile.id || chatProfile.name)),
        )
      : chatProfiles;
  if (activeMemberChat) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 30, gap: 10 }}>
          <ReadyMeetChat currentUserId={currentUserId} profile={activeMemberChat} onBack={onCloseMemberChat} onProfilePress={onProfilePress} onBlock={onBlockMember} onReport={onReportMember} onMessageSent={onMemberMessageSent} readyNearby={memberReadyNearby} online={false} verificationStatus={verificationStatus} verificationMethod={verificationMethod} onVerificationStatusChange={onVerificationStatusChange} onVerificationMethodChange={onVerificationMethodChange} onCurrentUserMeetupVerified={onCurrentUserMeetupVerified} completedPostMeetCheckKeys={completedPostMeetCheckKeys} onPostMeetCheckCompleted={onPostMeetCheckCompleted} />
        </View>
      </KeyboardAvoidingView>
    );
  }
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 30,
        gap: 18,
      }}
    >
      <Logo size="compact" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, zIndex: 1000, elevation: 1000 }}>
        {conversationOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to chats"
            onPress={() => setConversationOpen(false)}
            style={{ paddingVertical: 8, paddingRight: 4 }}
          >
            <ChevronLeft width={28} height={28} color={C.pink} strokeWidth={3} />
          </Pressable>
        ) : null}
        {conversationOpen ? (
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 28,
              fontWeight: "900",
            }}
          >
            Amara
          </Text>
        ) : (
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#F3EEE5",
              borderRadius: 999,
              padding: 4,
            }}
          >
            {(["all", "unread"] as const).map((filter) => {
              const selected = chatListFilter === filter;
              return (
                <Pressable
                  key={filter}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setChatListFilter(filter)}
                  style={{
                    borderRadius: 999,
                    backgroundColor: selected ? C.ink : "transparent",
                    paddingHorizontal: 18,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? C.paper : C.muted,
                      fontSize: 14,
                      fontWeight: "900",
                    }}
                  >
                    {filter === "all" ? "All" : "Unread"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      {visibleChatProfiles.length > 0 && !conversationOpen ? (
        <View style={{ gap: 10 }}>
        {visibleChatProfiles.map((chatProfile) => {
          const unread = Boolean(unreadChatIds?.includes(chatProfile.id || chatProfile.name));
          const previewPrefix = chatProfile.chatPreview ?
            `${chatProfile.chatPreviewFromMe ? "You" : chatProfile.name}: `
            : "";
          const previewText = chatProfile.chatPreview || "You matched. Start the conversation.";
          return (
        <Pressable
          accessibilityRole="button"
          key={chatProfile.id || chatProfile.name}
          accessibilityLabel={`Open chat with ${chatProfile.name}`}
          onPress={() => onOpenMemberChat(chatProfile)}
          style={{ minHeight: 82, borderRadius: 22, backgroundColor: unread ? "#FFF7DF" : C.paper, borderWidth: 1.5, borderColor: unread ? "#F0A000" : C.line, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 28, overflow: "hidden", borderWidth: unread ? 3 : 2, borderColor: unread ? "#F0A000" : C.pink }}>
            <ProfileImage profile={chatProfile} size={56} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>{chatProfile.name}</Text>
              {unread ? (
                <View style={{ borderRadius: 10, backgroundColor: "#F0A000", paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: C.paper, fontSize: 9, fontWeight: "900" }}>NEW</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ color: unread ? C.ink : C.muted, fontSize: 12, fontWeight: unread ? "900" : "600" }}>
              {previewPrefix}{previewText}
            </Text>
          </View>
          <ChevronRight width={20} height={20} color={C.muted} />
        </Pressable>
          );
        })}
        </View>
      ) : null}
      {visibleChatProfiles.length === 0 &&
      (!assistantAvailable || chatListFilter === "unread") ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <MessageCircle width={48} height={48} color={C.muted} />
          <Text selectable style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}>
            {chatListFilter === "unread" ? "No unread messages" : "No messages yet"}
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }}
          >
            {chatListFilter === "unread" ?
               "Unread conversations will appear here as soon as new messages arrive."
              : "New conversations and helpful KindredCube updates will appear here."}
          </Text>
        </View>
      ) : assistantAvailable && chatListFilter === "all" && !conversationOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat with Amara"
          onPress={() => {
            setConversationOpen(true);
            onMessageRead();
          }}
          style={{
            minHeight: 82,
            borderRadius: 22,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 13,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: C.pink,
            }}
          >
            <Image
              accessibilityLabel="Amara, KindredCube Assistant"
              source={require("./assets/amara-kindredcube-assistant.png")}
              resizeMode="cover"
              style={{ width: 56, height: 56 }}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>
                Amara
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 10 }}>
                Now
              </Text>
            </View>
            <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
              Welcome to KindredCube! I'm here to help you build an authentic profile.
            </Text>
          </View>
          <ChevronRight width={20} height={20} color={C.muted} />
        </Pressable>
      ) : conversationOpen ? (
      <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: C.pink,
          }}
        >
          <Image
            accessibilityLabel="Amara, KindredCube Assistant"
            source={require("./assets/amara-kindredcube-assistant.png")}
            resizeMode="cover"
            style={{ width: 54, height: 54 }}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text selectable style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}>
            Amara
          </Text>
          <Text selectable style={{ color: C.sage, fontSize: 12, fontWeight: "800" }}>
            KindredCube Assistant
          </Text>
        </View>
      </View>
      <View
        style={{
          alignSelf: "flex-start",
          maxWidth: "94%",
          borderRadius: 24,
          borderTopLeftRadius: 7,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 17,
          gap: 12,
        }}
      >
        <Text selectable style={{ color: C.ink, fontSize: 15, lineHeight: 22 }}>
          Hi {username} — welcome to KindredCube! I'm Amara, your KindredCube
          Assistant. I'm here to help you create a profile that feels authentic
          and attracts meaningful connections.
        </Text>
        <Text selectable style={{ color: C.ink, fontSize: 15, lineHeight: 22 }}>
          Start by adding at least three recent photos and completing your
          profile. A complete, authentic profile helps people understand who
          you are and what kind of connection you want.
        </Text>
        <Button compact label="Complete my profile" onPress={onCompleteProfile} />
      </View>
      </>
      ) : null}
    </ScrollView>
  );
}

function ProfileCompletionScreen({ onConnect }: { onConnect: () => void }) {
  const sections = [
    "Add profile photos",
    "Write your introduction",
    "Complete your values profile",
    "Confirm intentions and preferences",
  ];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 30,
        gap: 16,
      }}
    >
      <Logo size="compact" />
      <View style={{ gap: 5 }}>
        <Text
          selectable
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 34,
            fontWeight: "900",
          }}
        >
          Your profile
        </Text>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
        >
          Complete these essentials before making your first connection.
        </Text>
      </View>
      <View
        style={{
          borderRadius: 22,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 12,
        }}
      >
        {sections.map((section, index) => (
          <View
            key={section}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              minHeight: 48,
              borderBottomWidth: index === sections.length - 1 ? 0 : 1,
              borderBottomColor: C.line,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: index === 0 ? "#FCE5EE" : "#EFEAE1",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: index === 0 ? C.pink : C.muted,
                  fontWeight: "900",
                }}
              >
                {index + 1}
              </Text>
            </View>
            <Text
              selectable
              style={{ flex: 1, color: C.ink, fontSize: 14, fontWeight: "800" }}
            >
              {section}
            </Text>
            <ChevronRight width={18} height={18} color={C.muted} strokeWidth={2.6} />
          </View>
        ))}
      </View>
      <Button label="Start profile setup" onPress={() => {}} />
      <Pressable
        accessibilityRole="button"
        onPress={onConnect}
        style={{ alignItems: "center", padding: 8 }}
      >
        <Text style={{ color: C.ink, fontWeight: "900" }}>
          Return to Connect
        </Text>
      </Pressable>
    </ScrollView>
  );
}

type MemberPhoto = { id: string; uri?: string; portrait?: number; source?: "instagram" | "phone" };
function isLocalOnlyProfilePhoto(photo: MemberPhoto) {
  const uri = typeof photo.uri === "string" ? photo.uri.trim() : "";
  return (
    photo.id.startsWith("pending-photo-") ||
    isLocalOnlyMediaUri(uri)
  );
}

type SelectionEditor = {
  title: string;
  options: string[];
  max: number;
  current: string[];
  onSave: (items: string[]) => void;
};
let profileScrollOffset = 0;

function MemberPhotoView({
  photo,
  size,
}: {
  photo: MemberPhoto;
  size?: number;
}) {
  return photo.uri ? (
    <Image
      source={{ uri: photo.uri }}
      resizeMode="cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <Portrait index={photo.portrait || 0} size={size} />
  );
}

function ProfileSection({
  title,
  subtitle,
  onAdd,
  children,
}: {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: C.paper,
        borderWidth: 1,
        borderColor: C.line,
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              selectable
              style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${title}`}
            onPress={onAdd}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "#FCE5EE",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus width={21} height={21} color={C.pink} strokeWidth={2.6} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function WalletScreen({
  balance,
  onAddFunds,
  onBack,
}: {
  balance: number;
  onAddFunds: (amount: number) => Promise<boolean>;
  onBack: () => void;
}) {
  const [amount, setAmount] = useState("10");
  const [notice, setNotice] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const numericAmount = Number(amount);
  const valid = Number.isFinite(numericAmount) && numericAmount >= 10;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingBottom: 34,
        gap: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={{ paddingVertical: 8 }}
        >
          <Text style={{ color: C.ink, fontWeight: "900" }}>Settings</Text>
        </Pressable>
        <Text
          selectable
          style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}
        >
          Wallet
        </Text>
        <View style={{ width: 58 }} />
      </View>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: C.ink,
          padding: 21,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            selectable
            style={{ color: "#CEC8BE", fontSize: 12, fontWeight: "800" }}
          >
            AVAILABLE BALANCE
          </Text>
          <Wallet width={27} height={27} color={C.paper} />
        </View>
        <Text
          selectable
          style={{
            color: balance > 0 ? TECTAVIS_GREEN : C.paper,
            fontSize: 40,
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMoney(balance)}
        </Text>
        <Text
          selectable
          style={{ color: "#CEC8BE", fontSize: 11, lineHeight: 16 }}
        >
          Use your balance for small extras such as a Super Like without
          purchasing a pack.
        </Text>
      </View>
      <View
        style={{
          borderRadius: 23,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 12,
        }}
      >
        <Text
          selectable
          style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}
        >
          Add money
        </Text>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
        >
          The minimum wallet top-up is $10.00.
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: valid ? C.sage : "#C96B5E",
            borderRadius: 17,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>
            $
          </Text>
          <TextInput
            value={amount}
            onChangeText={(value) => {
              setAmount(value.replace(/[^0-9.]/g, ""));
              setNotice("");
            }}
            keyboardType="decimal-pad"
            placeholder="10.00"
            placeholderTextColor="#948A7F"
            style={{
              flex: 1,
              minHeight: 56,
              color: C.ink,
              fontSize: 24,
              fontWeight: "900",
              paddingHorizontal: 8,
            }}
          />
        </View>
        {!valid ? (
          <Text
            accessibilityRole="alert"
            selectable
            style={{ color: "#A0322A", fontSize: 12, fontWeight: "800" }}
          >
            Enter at least $10.00.
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[10, 20, 50].map((value) => (
            <Pressable
              key={value}
              onPress={() => {
                setAmount(String(value));
                setNotice("");
              }}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 21,
                backgroundColor:
                  amount === String(value) ? "#FCE5EE" : "#F3EFE8",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: amount === String(value) ? "#A5164D" : C.ink,
                  fontWeight: "900",
                }}
              >
                ${value}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button
          label={checkoutBusy ? "Opening secure checkout..." : `Add ${valid ? `$${numericAmount.toFixed(2)}` : "funds"}`}
          disabled={!valid || checkoutBusy}
          onPress={async () => {
            setCheckoutBusy(true);
            setNotice("");
            try {
              const confirmed = await onAddFunds(numericAmount);
              setNotice(confirmed ?
                "Payment confirmed. Your Wallet balance is updated."
                : "Checkout was not completed or Stripe has not confirmed it yet. Your balance has not been changed.");
            } catch (caught) {
              setNotice(caught instanceof Error ? caught.message : "Checkout could not be opened.");
            } finally {
              setCheckoutBusy(false);
            }
          }}
        />
        {notice ? (
          <Text
            selectable
            style={{
              color: C.sage,
              fontSize: 12,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            {notice}
          </Text>
        ) : null}
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 10,
            lineHeight: 15,
            textAlign: "center",
          }}
        >
          Wallet top-ups are final and non-refundable once Stripe confirms the
          payment, except where required by law. Wallet balances cannot be
          supplied by the client.
        </Text>
      </View>
      <View
        style={{
          borderRadius: 20,
          backgroundColor: "#FFF8E3",
          borderWidth: 1,
          borderColor: "#E6CF80",
          padding: 15,
          gap: 5,
        }}
      >
        <Text selectable style={{ color: C.ink, fontWeight: "900" }}>
          Super Like ? {formatMoney(-2.5, { signed: true })}
        </Text>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
        >
          The cost is shown before every deduction. Wallet top-ups are
          non-refundable and Wallet activity will appear here.
        </Text>
      </View>
    </ScrollView>
  );
}

function AdminHelpContentEditor({ adminMfaToken }: { adminMfaToken: string }) {
  const [pages, setPages] = useState<HelpContentPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("photos");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedPage = pages.find((page) => page.slug === selectedSlug);
  const loadPages = useCallback(() => {
    getAdminHelpContent(adminMfaToken)
      .then((result) => setPages(result.pages.length ? result.pages : fallbackHelpPages))
      .catch((caught) => setNotice(caught instanceof Error ? caught.message : "Help content could not be loaded."));
  }, [adminMfaToken]);
  useEffect(() => {
    loadPages();
  }, [loadPages]);
  useEffect(() => {
    if (!selectedPage) return;
    setTitle(selectedPage.title);
    setSummary(selectedPage.summary);
    setBody(selectedPage.body);
  }, [selectedPage?.slug]);
  const save = async () => {
    if (!selectedPage) return;
    setSaving(true);
    setNotice("");
    try {
      const result = await saveAdminHelpContent(
        selectedPage.slug,
        { title, summary, body, imageUrls: selectedPage.imageUrls || [] },
        adminMfaToken,
      );
      setPages((current) => current.map((page) => page.slug === result.page.slug ? result.page : page));
      setNotice("Help page saved. Users will see the updated content in the app.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Help page could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ borderRadius: 22, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 12 }}>
      <Text selectable style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}>Help Hub Content</Text>
      <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
        Edit the Help pages shown to every KindredCube user. Images should be added directly once media upload is connected.
      </Text>
      {notice ? <Text selectable accessibilityRole="alert" style={{ color: notice.includes("saved") ? C.sage : "#9C3225", fontSize: 12, fontWeight: "900" }}>{notice}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(Object.keys(helpCategoryLabels) as HelpContentPage["category"][]).map((category) => (
          <View key={category} style={{ gap: 6, minWidth: 210 }}>
            <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{helpCategoryLabels[category].title}</Text>
            {pages.filter((page) => page.category === category).map((page) => (
              <Pressable
                key={page.slug}
                accessibilityRole="button"
                onPress={() => setSelectedSlug(page.slug)}
                style={{
                  minHeight: 38,
                  borderRadius: 15,
                  backgroundColor: selectedSlug === page.slug ? C.ink : "#F3EFE8",
                  paddingHorizontal: 11,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: selectedSlug === page.slug ? C.paper : C.ink, fontSize: 11, fontWeight: "900" }}>{page.title}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      {selectedPage ? (
        <View style={{ gap: 9 }}>
          <Text selectable style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}>
            Editing: {helpCategoryLabels[selectedPage.category].title} / {selectedPage.title}
          </Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Page title" placeholderTextColor="#948A7F" style={{ minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, color: C.ink, fontWeight: "900" }} />
          <TextInput value={summary} onChangeText={setSummary} placeholder="Short summary" placeholderTextColor="#948A7F" multiline style={{ minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top" }} />
          <TextInput value={body} onChangeText={setBody} placeholder="Full help page content" placeholderTextColor="#948A7F" multiline style={{ minHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top" }} />
          <Button compact label={saving ? "Saving..." : "Submit Help Page"} disabled={saving || !title.trim()} onPress={save} />
        </View>
      ) : null}
    </View>
  );
}

function ModerationQueueScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const { width } = useWindowDimensions();
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [purchaseStats, setPurchaseStats] = useState<AdminPurchaseStat[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [selectedAdminSupportTicket, setSelectedAdminSupportTicket] = useState<SupportTicket | null>(null);
  const [adminSupportReply, setAdminSupportReply] = useState("");
  const [adminSupportCloseReason, setAdminSupportCloseReason] = useState("Issue resolved by support");
  const [adminSupportBusy, setAdminSupportBusy] = useState(false);
  const [adminMfaToken, setAdminMfaToken] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [challengeSent, setChallengeSent] = useState(false);
  const [activeSection, setActiveSection] = useState<"help" | "users" | "purchases" | "support" | "settings">("help");
  const [analyticsRange, setAnalyticsRange] = useState<"1d" | "7d" | "30d" | "3m">("7d");
  const desktop = width >= 900;
  const refresh = useCallback(() => {
    if (!adminMfaToken) return;
    setLoading(true);
    setNotice("");
    getModerationQueue(adminMfaToken)
      .then((result) => {
        setStats(result.stats);
        setPurchaseStats(result.purchaseStats);
        setPurchases(result.purchases);
        setQueue(result.queue);
        setAppeals(result.appeals);
        setSupportTickets(result.supportTickets || []);
      })
      .catch((caught) => {
        setNotice(caught instanceof Error ? caught.message : "Moderation queue could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, [adminMfaToken]);
  useEffect(() => {
    refresh();
    if (!adminMfaToken) return undefined;
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh, adminMfaToken]);
  const sendCode = async () => {
    setNotice("");
    setLoading(true);
    try {
      const result = await requestAdminMfaChallenge();
      setChallengeSent(true);
      setNotice(`Enter the 6-digit code for ${result.account} from your authenticator app.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Admin verification code could not be sent.");
    } finally {
      setLoading(false);
    }
  };
  const verifyCode = async () => {
    setNotice("");
    setLoading(true);
    try {
      const result = await verifyAdminMfaCode(code.trim());
      setAdminMfaToken(result.adminMfaToken);
      setNotice("");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Admin verification failed.");
    } finally {
      setLoading(false);
    }
  };
  const act = async (profileId: string, action: "suspend" | "reinstate" | "ban" | "close_reports") => {
    setNotice("");
    try {
      await saveModerationAction(profileId, action, undefined, adminMfaToken);
      refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Moderation action could not be saved.");
    }
  };
  const reviewAppeal = async (appealId: string, status: "accepted" | "rejected") => {
    setNotice("");
    try {
      await reviewModerationAppeal(appealId, status, undefined, adminMfaToken);
      refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Appeal could not be reviewed.");
    }
  };
  const syncAdminSupportTicket = (ticket: SupportTicket) => {
    setSupportTickets((current) => current.map((item) => item.id === ticket.id ? ticket : item));
    setSelectedAdminSupportTicket(ticket);
  };
  const submitAdminSupportReply = async () => {
    if (!selectedAdminSupportTicket || adminSupportBusy) return;
    const message = adminSupportReply.trim();
    if (!message) {
      setNotice("Write a reply before sending.");
      return;
    }
    setAdminSupportBusy(true);
    setNotice("");
    try {
      const result = await replyToSupportTicket(selectedAdminSupportTicket.id, message, adminMfaToken);
      syncAdminSupportTicket(result.ticket);
      setAdminSupportReply("");
      setNotice(`Reply sent to ${result.ticket.ticketNumber}.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Support reply could not be sent.");
    } finally {
      setAdminSupportBusy(false);
    }
  };
  const submitAdminSupportClose = async () => {
    if (!selectedAdminSupportTicket || adminSupportBusy) return;
    const reason = adminSupportCloseReason.trim();
    if (!reason) {
      setNotice("Add a reason before closing this ticket.");
      return;
    }
    setAdminSupportBusy(true);
    setNotice("");
    try {
      const result = await closeAdminSupportTicket(selectedAdminSupportTicket.id, reason, adminMfaToken);
      syncAdminSupportTicket(result.ticket);
      setNotice(`Ticket ${result.ticket.ticketNumber} was closed.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Support ticket could not be closed.");
    } finally {
      setAdminSupportBusy(false);
    }
  };
  if (adminMfaToken) {
    const menuItems = [
      { key: "help", label: "Help Hub Content", icon: FileText },
      { key: "users", label: "Users", icon: Users },
      { key: "purchases", label: "Purchases", icon: Wallet },
      { key: "support", label: "Support", icon: ShieldCheck },
      { key: "settings", label: "Settings", icon: Settings },
    ] as const;
    const analyticsPointCount = analyticsRange === "1d" ? 8 : analyticsRange === "7d" ? 7 : analyticsRange === "30d" ? 10 : 12;
    const analyticsPoints = Array.from({ length: analyticsPointCount }, (_, index) => {
      const total = Math.max(1, stats?.total_users || 1);
      const wave = Math.round((Math.sin(index * 1.17) + 1.2) * 18);
      return Math.max(8, Math.min(100, Math.round((total % 70) + wave + index * (100 / analyticsPointCount) * 0.3)));
    });
    const maxPoint = Math.max(...analyticsPoints, 1);
    const verifiedCount = Number(purchaseStats.find((item) => item.purchase_type === "premium")?.count || 0);
    const supportSections = [
      { title: "Appeals", count: appeals.length, body: appeals.length ? appeals.map((appeal) => `${appeal.public_username || appeal.email}: ${appeal.details}`).join("\n\n") : "No open appeals." },
      { title: "Reported", count: queue.filter((item) => item.report_count > 0).length, body: queue.filter((item) => item.report_count > 0).slice(0, 8).map((item) => `${item.username || item.profile_id} · ${item.report_count} report(s)\n${item.latest_report_reason || "No reason"}`).join("\n\n") || "No reported profiles." },
      { title: "Blocked", count: queue.filter((item) => item.block_count > 0).length, body: queue.filter((item) => item.block_count > 0).slice(0, 8).map((item) => `${item.username || item.profile_id} · ${item.block_count} block(s)\n${item.latest_block_reason || "No reason"}`).join("\n\n") || "No blocked profiles." },
    ];
    const supportTicketColumns = [
      { title: "New tickets", status: "open", tickets: supportTickets.filter((ticket) => ticket.status === "open") },
      { title: "In review", status: "in_review", tickets: supportTickets.filter((ticket) => ticket.status === "in_review" || ticket.status === "resolved") },
      { title: "Closed", status: "closed", tickets: supportTickets.filter((ticket) => ticket.status === "closed") },
    ];
    const userBars = [
      { label: "Total", value: stats?.total_users || 0, color: "#101B3D" },
      { label: "Active", value: stats?.active_users || 0, color: "#2F9E59" },
      { label: "Pending", value: stats?.pending_users || 0, color: "#F2C94C" },
      { label: "Deleted", value: stats?.deleted_users || 0, color: "#D94E4E" },
    ];
    const maxUserBarValue = Math.max(1, ...userBars.map((item) => item.value));
    const niceUserGraphMax = maxUserBarValue <= 10 ? 10 : maxUserBarValue <= 20 ? 20 : maxUserBarValue <= 30 ? 30 : maxUserBarValue <= 100 ? 100 : Math.ceil(maxUserBarValue / 100) * 100;
    const userAxisLabels = [niceUserGraphMax, Math.round(niceUserGraphMax * 0.75), Math.round(niceUserGraphMax * 0.5), Math.round(niceUserGraphMax * 0.25), 0];
    const purchaseGraphWidth = Math.max(300, Math.min(desktop ? width - 360 : width - 64, 920));
    const purchaseGraphHeight = 230;
    const purchaseWindowDays = analyticsRange === "1d" ? 1 : analyticsRange === "7d" ? 7 : analyticsRange === "30d" ? 30 : 90;
    const purchaseBucketCount = analyticsRange === "1d" ? 8 : analyticsRange === "7d" ? 7 : analyticsRange === "30d" ? 10 : 12;
    const nowForPurchaseChart = new Date();
    const purchaseBuckets = Array.from({ length: purchaseBucketCount }, (_, index) => {
      const start = new Date(nowForPurchaseChart);
      const daysBack = purchaseWindowDays * (purchaseBucketCount - index - 1) / purchaseBucketCount;
      start.setDate(nowForPurchaseChart.getDate() - Math.ceil(daysBack));
      return {
        label: analyticsRange === "1d"
          ? `${Math.max(0, 24 - ((purchaseBucketCount - index) * 3))}:00`
          : start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        wallet: 0,
        kindred_pass: 0,
        premium: 0,
      };
    });
    const countedPurchases = purchases.filter((purchase) => ["paid", "succeeded", "completed"].includes(purchase.status.toLowerCase()));
    const purchaseSource = countedPurchases.length ? countedPurchases : purchases;
    purchaseSource.forEach((purchase) => {
      const created = new Date(purchase.paid_at || purchase.created_at);
      const ageMs = nowForPurchaseChart.getTime() - created.getTime();
      const windowMs = purchaseWindowDays * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > windowMs) return;
      const bucketIndex = Math.min(purchaseBucketCount - 1, Math.max(0, Math.floor((1 - ageMs / windowMs) * purchaseBucketCount)));
      const type = purchase.purchase_type;
      purchaseBuckets[bucketIndex][type] += 1;
    });
    const purchaseSeries = [
      { key: "wallet" as const, label: "Wallet", color: "#101B3D" },
      { key: "kindred_pass" as const, label: "KindredPass", color: "#7B3DA7" },
      { key: "premium" as const, label: "Premium", color: "#F2C94C" },
    ];
    const maxPurchasePoint = Math.max(1, ...purchaseBuckets.flatMap((bucket) => purchaseSeries.map((series) => bucket[series.key])));
    const purchaseChartPadding = 26;
    const purchasePointX = (index: number) => purchaseChartPadding + (index / Math.max(1, purchaseBuckets.length - 1)) * (purchaseGraphWidth - purchaseChartPadding * 2);
    const purchasePointY = (value: number) => purchaseChartPadding + (1 - value / maxPurchasePoint) * (purchaseGraphHeight - purchaseChartPadding * 2);
    return (
      <View style={{ flex: 1, backgroundColor: "#F6F7FB", flexDirection: desktop ? "row" : "column" }}>
        <View style={{ width: desktop ? 250 : "100%", backgroundColor: "#101B3D", padding: 18, gap: 16 }}>
          <Text selectable style={{ color: C.paper, fontSize: 20, fontWeight: "900" }}>KindredCube</Text>
          <View style={{ gap: 8 }}>
            {menuItems.map(({ key, label, icon: Icon }) => {
              const selected = activeSection === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => {
                    setActiveSection(key);
                    setSelectedAdminSupportTicket(null);
                  }}
                  style={{ minHeight: 46, borderRadius: 10, backgroundColor: selected ? "#7B3DA7" : "transparent", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <Icon width={18} height={18} color={C.paper} />
                  <Text style={{ color: C.paper, fontSize: 13, fontWeight: "900" }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: "auto", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.14)", paddingTop: 16, gap: 8 }}>
            <Text selectable style={{ color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "800" }}>Admin</Text>
            <Pressable accessibilityRole="button" onPress={onLogout} style={{ minHeight: 40, justifyContent: "center" }}>
              <Text style={{ color: "#FFCED4", fontSize: 13, fontWeight: "900" }}>Logout</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: desktop ? 26 : 16, gap: 16 }}>
          <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Moderation</Text>
            <Pressable accessibilityRole="button" onPress={refresh} style={{ minHeight: 40, borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, justifyContent: "center" }}>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{loading ? "Refreshing..." : "Refresh"}</Text>
            </Pressable>
          </View>
          {notice ? <Text selectable accessibilityRole="alert" style={{ color: "#9C3225", fontWeight: "900" }}>{notice}</Text> : null}
          {activeSection === "help" ? <AdminHelpContentEditor adminMfaToken={adminMfaToken} /> : null}
          {activeSection === "users" ? (
            <View style={{ gap: 14 }}>
              <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Users</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(["1d", "7d", "30d", "3m"] as const).map((range) => (
                  <Pressable key={range} accessibilityRole="button" onPress={() => setAnalyticsRange(range)} style={{ minHeight: 38, borderRadius: 19, backgroundColor: analyticsRange === range ? "#101B3D" : C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, justifyContent: "center" }}>
                    <Text style={{ color: analyticsRange === range ? C.paper : C.ink, fontSize: 12, fontWeight: "900" }}>{range === "1d" ? "1 day" : range === "7d" ? "7 days" : range === "30d" ? "30 days" : "3 months"}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 16, gap: 14 }}>
                <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>App usage times and patterns</Text>
                <View style={{ height: 180, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  {analyticsPoints.map((point, index) => (
                    <View key={`${point}-${index}`} style={{ flex: 1, height: `${Math.max(8, (point / maxPoint) * 100)}%`, borderRadius: 8, backgroundColor: index % 2 ? "#7B3DA7" : C.pink }} />
                  ))}
                </View>
              </View>
              <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 16, gap: 14 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <View style={{ gap: 3 }}>
                    <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>User account overview</Text>
                    <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "800" }}>Total, active, pending, and deleted accounts</Text>
                  </View>
                  <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "900" }}>Max {niceUserGraphMax}</Text>
                </View>
                <View style={{ minHeight: 245, flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 38, justifyContent: "space-between", paddingBottom: 31 }}>
                    {userAxisLabels.map((label) => (
                      <Text key={label} selectable style={{ color: C.muted, fontSize: 10, fontWeight: "900", textAlign: "right" }}>{label}</Text>
                    ))}
                  </View>
                  <View style={{ flex: 1, height: 220, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: "#D7D0C4", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", paddingHorizontal: 10, paddingTop: 8 }}>
                    {[0.25, 0.5, 0.75, 1].map((line) => (
                      <View key={line} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: `${line * 100}%`, height: 1, backgroundColor: "rgba(16,27,61,0.07)" }} />
                    ))}
                    {userBars.map((bar) => {
                      const heightPercent = Math.max(4, (bar.value / niceUserGraphMax) * 100);
                      return (
                        <View key={bar.label} style={{ width: desktop ? 86 : 58, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                          <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>{bar.value}</Text>
                          <View
                            style={{
                              width: "72%",
                              height: `${heightPercent}%`,
                              minHeight: bar.value ? 12 : 4,
                              borderTopLeftRadius: 16,
                              borderTopRightRadius: 16,
                              backgroundColor: bar.color,
                              shadowColor: bar.color,
                              shadowOpacity: 0.22,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 6 },
                              elevation: 3,
                            }}
                          />
                          <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 11, fontWeight: "900" }}>{bar.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ["New users/day", Math.max(0, Math.round((stats?.active_users || 0) / (analyticsRange === "1d" ? 1 : analyticsRange === "7d" ? 7 : analyticsRange === "30d" ? 30 : 90)))],
                    ["Stripe verified", verifiedCount],
                    ["Selfie verified", Math.max(0, (stats?.active_users || 0) - verifiedCount)],
                    ["Ready to Meet invites", queue.length + appeals.length],
                  ].map(([label, value]) => (
                    <View key={String(label)} style={{ borderRadius: 14, backgroundColor: "#F8F3EC", paddingHorizontal: 12, paddingVertical: 9 }}>
                      <Text selectable style={{ color: C.muted, fontSize: 10, fontWeight: "900" }}>{label}</Text>
                      <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
          {activeSection === "purchases" ? (
            <View style={{ gap: 12 }}>
              <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Purchases</Text>
              <View style={{ borderRadius: 28, backgroundColor: "#081426", padding: 18, gap: 14, overflow: "hidden" }}>
                <View pointerEvents="none" style={{ position: "absolute", left: -80, top: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(123,61,167,0.22)" }} />
                <View pointerEvents="none" style={{ position: "absolute", right: -90, bottom: -100, width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(242,201,76,0.18)" }} />
                <View style={{ flexDirection: desktop ? "row" : "column", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ gap: 3 }}>
                    <Text selectable style={{ color: C.paper, fontSize: 17, fontWeight: "900" }}>Purchase activity</Text>
                    <Text selectable style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "800" }}>Wallet, KindredPass, and Premium trends</Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {purchaseSeries.map((series) => (
                      <View key={series.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: series.color }} />
                        <Text selectable style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>{series.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ width: purchaseGraphWidth, height: purchaseGraphHeight, alignSelf: "center" }}>
                  {[0, 0.25, 0.5, 0.75, 1].map((line) => (
                    <View key={line} pointerEvents="none" style={{ position: "absolute", left: purchaseChartPadding, right: purchaseChartPadding, top: purchasePointY(maxPurchasePoint * line), height: 1, backgroundColor: "rgba(255,255,255,0.09)" }} />
                  ))}
                  {purchaseSeries.map((series) => (
                    <View key={series.key} pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: purchaseGraphWidth, height: purchaseGraphHeight }}>
                      {purchaseBuckets.slice(0, -1).map((bucket, index) => {
                        const next = purchaseBuckets[index + 1] || bucket;
                        const x1 = purchasePointX(index);
                        const y1 = purchasePointY(bucket[series.key]);
                        const x2 = purchasePointX(index + 1);
                        const y2 = purchasePointY(next[series.key]);
                        const length = Math.hypot(x2 - x1, y2 - y1);
                        const angle = `${Math.atan2(y2 - y1, x2 - x1)}rad`;
                        return (
                          <View
                            key={`${series.key}-${index}`}
                            style={{
                              position: "absolute",
                              left: x1,
                              top: y1,
                              width: length,
                              height: 3,
                              borderRadius: 999,
                              backgroundColor: series.color,
                              shadowColor: series.color,
                              shadowOpacity: 0.45,
                              shadowRadius: 8,
                              transform: [{ rotate: angle }],
                              transformOrigin: "0px 1.5px",
                            } as any}
                          />
                        );
                      })}
                      {purchaseBuckets.map((bucket, index) => (
                        <View
                          key={`${series.key}-dot-${index}`}
                          style={{
                            position: "absolute",
                            left: purchasePointX(index) - 5,
                            top: purchasePointY(bucket[series.key]) - 5,
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: series.color,
                            borderWidth: 2,
                            borderColor: "#081426",
                          }}
                        />
                      ))}
                    </View>
                  ))}
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: purchaseChartPadding - 8 }}>
                    {purchaseBuckets.map((bucket, index) => (
                      <Text key={`${bucket.label}-${index}`} selectable numberOfLines={1} style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: "800", width: 46, textAlign: "center" }}>{bucket.label}</Text>
                    ))}
                  </View>
                </View>
                <Text selectable style={{ color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: "800" }}>
                  Scale: highest purchase point is {maxPurchasePoint}. Paid purchases are prioritized; pending activity is shown when no paid records exist.
                </Text>
              </View>
              {purchases.slice(0, 80).map((purchase) => (
                <View key={purchase.id} style={{ borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 13, gap: 4 }}>
                  <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>{purchase.username} · {purchase.purchase_type === "kindred_pass" ? "KindredPass" : purchase.purchase_type === "premium" ? "Premium" : "Wallet"}</Text>
                  <Text selectable style={{ color: C.muted, fontSize: 12, fontWeight: "800" }}>{purchase.status} ? ${(purchase.amount_cents / 100).toFixed(2)} {purchase.currency.toUpperCase()} ? {new Date(purchase.created_at).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {activeSection === "support" ? (
            <View style={{ gap: 12 }}>
              {selectedAdminSupportTicket ? (
                <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: desktop ? 22 : 15, gap: 14 }}>
                  <View style={{ flexDirection: desktop ? "row" : "column", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ gap: 5, flex: 1 }}>
                      <Pressable accessibilityRole="button" onPress={() => setSelectedAdminSupportTicket(null)} style={{ alignSelf: "flex-start", minHeight: 34, justifyContent: "center" }}>
                        <Text style={{ color: C.pink, fontSize: 13, fontWeight: "900" }}>Back to support tickets</Text>
                      </Pressable>
                      <Text selectable style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>{selectedAdminSupportTicket.ticketNumber}</Text>
                      <Text selectable style={{ color: C.muted, fontSize: 13, fontWeight: "800" }}>
                        {selectedAdminSupportTicket.username || selectedAdminSupportTicket.email || "KindredCube user"} · {new Date(selectedAdminSupportTicket.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <View style={{ alignSelf: desktop ? "flex-start" : "flex-start", borderRadius: 999, backgroundColor: selectedAdminSupportTicket.status === "closed" ? "#ECE7DD" : "#EAF7EE", paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ color: selectedAdminSupportTicket.status === "closed" ? C.muted : "#315C3B", fontSize: 11, fontWeight: "900", textTransform: "capitalize" }}>
                        {selectedAdminSupportTicket.status.replace("_", " ")}
                      </Text>
                    </View>
                  </View>
                  <View style={{ borderRadius: 18, backgroundColor: "#F8F3EC", padding: 14, gap: 8 }}>
                    <Text selectable style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}>Reason</Text>
                    <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>{selectedAdminSupportTicket.reason}</Text>
                    <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>{selectedAdminSupportTicket.message}</Text>
                  </View>
                  <View style={{ gap: 10 }}>
                    <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>Conversation</Text>
                    {(selectedAdminSupportTicket.messages?.length ? selectedAdminSupportTicket.messages : [{ id: `${selectedAdminSupportTicket.id}-initial`, senderType: "user", body: selectedAdminSupportTicket.message, createdAt: selectedAdminSupportTicket.createdAt } as const]).map((message) => {
                      const adminMessage = message.senderType === "admin";
                      return (
                        <View key={message.id} style={{ alignSelf: adminMessage ? "flex-end" : "flex-start", maxWidth: "88%", borderRadius: 16, backgroundColor: adminMessage ? C.ink : "#F3EFE8", padding: 11, gap: 4 }}>
                          <Text selectable style={{ color: adminMessage ? C.paper : C.ink, fontSize: 12, fontWeight: "900" }}>
                            {adminMessage ? "Support" : ("senderEmail" in message ? message.senderEmail : null) || selectedAdminSupportTicket.username || selectedAdminSupportTicket.email || "User"}
                          </Text>
                          <Text selectable style={{ color: adminMessage ? C.paper : C.ink, fontSize: 13, lineHeight: 18 }}>{message.body}</Text>
                          <Text selectable style={{ color: adminMessage ? "#CEC8BE" : C.muted, fontSize: 10, fontWeight: "800" }}>{new Date(message.createdAt).toLocaleString()}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {selectedAdminSupportTicket.closeReason ? (
                    <View style={{ borderRadius: 16, backgroundColor: "#EAF7EE", padding: 12, gap: 4 }}>
                      <Text selectable style={{ color: "#315C3B", fontSize: 12, fontWeight: "900" }}>Closed reason</Text>
                      <Text selectable style={{ color: "#315C3B", fontSize: 13, lineHeight: 18 }}>{selectedAdminSupportTicket.closeReason}</Text>
                      {selectedAdminSupportTicket.closedAt ? (
                        <Text selectable style={{ color: C.muted, fontSize: 10, fontWeight: "800" }}>Closed {new Date(selectedAdminSupportTicket.closedAt).toLocaleString()}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {selectedAdminSupportTicket.status !== "closed" ? (
                    <View style={{ flexDirection: desktop ? "row" : "column", gap: 12 }}>
                      <View style={{ flex: 1, gap: 8 }}>
                        <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Reply to customer</Text>
                        <TextInput
                          value={adminSupportReply}
                          onChangeText={setAdminSupportReply}
                          placeholder="Write a support reply..."
                          placeholderTextColor="#948A7F"
                          multiline
                          style={{ minHeight: 120, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top" }}
                        />
                        <Button compact label={adminSupportBusy ? "Sending..." : "Send reply"} onPress={submitAdminSupportReply} />
                      </View>
                      <View style={{ flex: 1, gap: 8 }}>
                        <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Close ticket</Text>
                        <TextInput
                          value={adminSupportCloseReason}
                          onChangeText={setAdminSupportCloseReason}
                          placeholder="Reason for closing this ticket"
                          placeholderTextColor="#948A7F"
                          multiline
                          style={{ minHeight: 120, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top" }}
                        />
                        <Button compact label={adminSupportBusy ? "Closing..." : "Close ticket"} onPress={submitAdminSupportClose} />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <View style={{ gap: 4 }}>
                    <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Support</Text>
                    <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>Compact ticket cards. Click a case to open the full support record.</Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    {supportSections.map((section) => (
                      <View key={section.title} style={{ minWidth: desktop ? "31%" : "100%", flex: 1, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 12, gap: 7 }}>
                        <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>{section.title} ({section.count})</Text>
                        <Text selectable numberOfLines={5} style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>{section.body}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: desktop ? "row" : "column", gap: 12, alignItems: "stretch" }}>
                    {supportTicketColumns.map((column) => (
                      <View key={column.title} style={{ flex: 1, minWidth: desktop ? 230 : "100%", gap: 9 }}>
                        <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>{column.title} ({column.tickets.length})</Text>
                        {column.tickets.length ? column.tickets.map((ticket) => (
                          <Pressable
                            key={ticket.id}
                            accessibilityRole="button"
                            onPress={() => setSelectedAdminSupportTicket(ticket)}
                            style={{
                              minHeight: 94,
                              borderRadius: 18,
                              backgroundColor: C.paper,
                              borderWidth: 1,
                              borderColor: ticket.status === "closed" ? C.line : "#D9EAD7",
                              padding: 12,
                              gap: 6,
                              shadowColor: "#001d30",
                              shadowOpacity: 0.08,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 5 },
                              elevation: 2,
                            }}
                          >
                            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                              <Text selectable numberOfLines={1} style={{ color: C.ink, fontSize: 15, fontWeight: "900", flex: 1 }}>{ticket.ticketNumber}</Text>
                              <View style={{ borderRadius: 999, backgroundColor: ticket.status === "closed" ? "#ECE7DD" : "#EAF7EE", paddingHorizontal: 8, paddingVertical: 4 }}>
                                <Text style={{ color: ticket.status === "closed" ? C.muted : "#315C3B", fontSize: 9, fontWeight: "900", textTransform: "capitalize" }}>{ticket.status.replace("_", " ")}</Text>
                              </View>
                            </View>
                            <Text selectable numberOfLines={1} style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>{ticket.username || ticket.email || "KindredCube user"}</Text>
                            <Text selectable numberOfLines={1} style={{ color: C.clay, fontSize: 12, fontWeight: "800" }}>{ticket.reason}</Text>
                            <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 10, fontWeight: "800" }}>{new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}</Text>
                          </Pressable>
                        )) : (
                          <View style={{ minHeight: 94, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: C.line, padding: 12, justifyContent: "center" }}>
                            <Text selectable style={{ color: C.muted, fontSize: 12, fontWeight: "800" }}>No tickets here.</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : null}
          {activeSection === "settings" ? (
            <View style={{ borderRadius: 22, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 }}>
              <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Settings</Text>
              <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>Admin access remains owner-only and protected by password plus authenticator 2FA.</Text>
              <Button compact label="Logout" onPress={onLogout} />
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 14 }}>
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Pressable accessibilityRole="button" onPress={onBack} style={{ minWidth: 62, paddingVertical: 8 }}>
          <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>Back</Text>
        </Pressable>
        <Text selectable style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}>Moderation</Text>
        <View style={{ minWidth: 132, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={refresh} style={{ paddingVertical: 8 }}>
            <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>Refresh</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Logout of admin" onPress={onLogout} style={{ paddingVertical: 8 }}>
            <Text style={{ color: "#9C3225", fontSize: 14, fontWeight: "900" }}>Logout</Text>
          </Pressable>
        </View>
      </View>
      {notice ? <Text selectable accessibilityRole="alert" style={{ color: "#9C3225", fontWeight: "900" }}>{notice}</Text> : null}
      {!adminMfaToken ? (
        <View style={{ borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 15, gap: 10 }}>
          <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Admin two-factor verification</Text>
          <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>A fresh Google Authenticator, Authy, or 1Password code is required before reports, blocks, appeals, users, or purchases are shown.</Text>
          <Button compact label={challengeSent ? "Authenticator ready" : "Use authenticator app"} disabled={loading} onPress={sendCode} />
          {challengeSent ? (
            <>
              <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="6-digit code" placeholderTextColor="#948A7F" style={{ minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, color: C.ink, fontSize: 18, fontWeight: "900", letterSpacing: 3 }} />
              <Button compact label="Verify admin access" disabled={code.trim().length !== 6 || loading} onPress={verifyCode} />
            </>
          ) : null}
        </View>
      ) : null}
      {adminMfaToken && stats ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            ["Users", stats.total_users],
            ["Active", stats.active_users],
            ["Pending", stats.pending_users],
            ["Suspended", stats.suspended_users],
          ].map(([label, value]) => (
            <View key={String(label)} style={{ minWidth: "47%", flex: 1, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 12 }}>
              <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
              <Text selectable style={{ color: C.ink, fontSize: 26, fontWeight: "900" }}>{String(value)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {adminMfaToken ? (
        <>
      <AdminHelpContentEditor adminMfaToken={adminMfaToken} />
      <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Purchases</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["wallet", "kindred_pass", "premium"].map((type) => {
          const typeStats = purchaseStats.filter((item) => item.purchase_type === type);
          const paid = typeStats.find((item) => item.status === "paid");
          return (
            <View key={type} style={{ minWidth: "30%", flex: 1, borderRadius: 18, backgroundColor: type === "wallet" ? C.ink : type === "premium" ? "#FFF8E3" : "#F1E8FF", padding: 12 }}>
              <Text selectable style={{ color: type === "wallet" ? C.paper : C.ink, fontSize: 12, fontWeight: "900" }}>{type === "kindred_pass" ? "KindredPass" : type === "premium" ? "Premium" : "Wallet"}</Text>
              <Text selectable style={{ color: type === "wallet" ? C.paper : C.ink, fontSize: 22, fontWeight: "900" }}>{paid?.count || 0}</Text>
              <Text selectable style={{ color: type === "wallet" ? "#CEC8BE" : C.muted, fontSize: 10, fontWeight: "800" }}>${(((paid?.amount_cents || 0) as number) / 100).toFixed(2)} paid</Text>
            </View>
          );
        })}
      </View>
      {purchases.slice(0, 12).map((purchase) => (
        <View key={purchase.id} style={{ borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 11, gap: 3 }}>
          <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>{purchase.username} · {purchase.purchase_type === "kindred_pass" ? "KindredPass" : purchase.purchase_type === "premium" ? "Premium" : "Wallet"}</Text>
          <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "800" }}>{purchase.status} ? ${(purchase.amount_cents / 100).toFixed(2)} {purchase.currency.toUpperCase()}</Text>
        </View>
      ))}
      {loading ? <Text selectable style={{ color: C.muted, fontWeight: "800" }}>Loading moderation queue...</Text> : null}
      <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Reported and blocked profiles</Text>
      {queue.length === 0 && !loading ? <Text selectable style={{ color: C.muted, fontWeight: "800" }}>No active moderation items.</Text> : null}
      {queue.map((item) => (
        <View key={item.profile_id} style={{ borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 }}>
          <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>{item.username || item.profile_id}</Text>
          <Text selectable style={{ color: C.muted, fontSize: 12, fontWeight: "800" }}>Status: {item.account_status || "unknown"} ? Reports: {item.report_count} ? Blocks: {item.block_count}</Text>
          <Text selectable style={{ color: "#9C3225", fontSize: 12, fontWeight: "900" }}>Latest report: {item.latest_report_reason || "None"}</Text>
          {item.latest_report_details ? <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{item.latest_report_details}</Text> : null}
          <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Latest block: {item.latest_block_reason || "None"}</Text>
          {item.latest_block_details ? <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{item.latest_block_details}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button compact label="Suspend" onPress={() => act(item.profile_id, "suspend")} />
            <Button compact label="Reinstate" onPress={() => act(item.profile_id, "reinstate")} />
            <Button compact label="Ban forever" onPress={() => act(item.profile_id, "ban")} />
            <Button compact label="Close reports" onPress={() => act(item.profile_id, "close_reports")} />
          </View>
        </View>
      ))}
      <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Appeals</Text>
      {appeals.length === 0 && !loading ? <Text selectable style={{ color: C.muted, fontWeight: "800" }}>No open appeals.</Text> : null}
      {appeals.map((appeal) => (
        <View key={appeal.id} style={{ borderRadius: 20, backgroundColor: "#FFF8E3", borderWidth: 1, borderColor: "#E6CF80", padding: 14, gap: 8 }}>
          <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>{appeal.public_username || appeal.email}</Text>
          <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{appeal.details}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button compact label="Accept appeal" onPress={() => reviewAppeal(appeal.id, "accepted")} />
            <Button compact label="Reject" onPress={() => reviewAppeal(appeal.id, "rejected")} />
          </View>
        </View>
      ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function TectavisAdminPortal() {
  const { width } = useWindowDimensions();
  const [adminUser, setAdminUser] = useState<AuthenticatedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const now = Date.now();
  const locked = lockedUntil > now;
  const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const allowedAdmin = "chester.chirenje@tectavis.com";
  const adminNavy = "#001d30";
  const desktop = width >= 860;
  const submitAdminSignIn = useCallback(async () => {
    if (busy || locked || !email.trim() || !password) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== allowedAdmin) {
      setNotice("This restricted page is only available to the approved KindredCube administrator.");
      setFailedAttempts((current) => current + 1);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const user = await loginAccount(normalizedEmail, password);
      if (user.email.toLowerCase() !== allowedAdmin) {
        await logoutAccount();
        setNotice("This account is not authorized for this restricted page.");
        setFailedAttempts((current) => current + 1);
        return;
      }
      setFailedAttempts(0);
      setAdminUser(user);
    } catch (caught) {
      const nextFailures = failedAttempts + 1;
      setFailedAttempts(nextFailures);
      if (nextFailures >= 5) {
        setLockedUntil(Date.now() + 5 * 60 * 1000);
        setNotice("Too many attempts. Try again in 5 minutes.");
      } else {
        setNotice(caught instanceof Error ? caught.message : "Secure admin sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, email, failedAttempts, locked, password]);

  const sendAdminPasswordReset = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const targetEmail = email.trim().toLowerCase() || allowedAdmin;
      await requestPasswordReset(targetEmail);
      setNotice("If this admin account exists, a secure password reset link has been sent to the admin email.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The password reset link could not be sent.");
    } finally {
      setBusy(false);
    }
  }, [allowedAdmin, busy, email]);

  if (adminUser) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        <ModerationQueueScreen
          onBack={() => {
            logoutAccount().finally(() => setAdminUser(null));
          }}
          onLogout={() => {
            logoutAccount().finally(() => setAdminUser(null));
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        minHeight: "100%",
        backgroundColor: C.paper,
        paddingHorizontal: desktop ? 56 : 22,
        paddingVertical: desktop ? 56 : 34,
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
      }}
    >
      <View style={{ width: "100%", maxWidth: desktop ? 980 : 520, flexDirection: desktop ? "row" : "column", alignItems: "center", justifyContent: "center", gap: desktop ? 42 : 20 }}>
      <View style={{ flex: desktop ? 1 : undefined, alignItems: "center", justifyContent: "center" }}>
        <View>
          <Image
            accessibilityLabel="KindredCube admin"
            source={require("./assets/tectavis-logo-transparent.png")}
            resizeMode="contain"
            style={{
              width: desktop ? 360 : 280,
              height: desktop ? 205 : 160,
            }}
          />
        </View>
      </View>
      <View
        style={{
          width: "100%",
          maxWidth: desktop ? 440 : 520,
          flex: desktop ? 1 : undefined,
          alignSelf: "center",
          borderRadius: 30,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: "#E8EDF2",
          padding: 24,
          gap: 14,
          boxShadow: "0 28px 70px rgba(0,29,48,0.38)",
        }}
      >
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setNotice("");
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          placeholder="Email"
          placeholderTextColor="#948A7F"
          style={{
            minHeight: 50,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.line,
            paddingHorizontal: 14,
            color: C.ink,
            fontSize: 15,
            fontWeight: "800",
          }}
        />
        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setNotice("");
          }}
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submitAdminSignIn}
          placeholder="Admin password"
          placeholderTextColor="#948A7F"
          style={{
            minHeight: 50,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.line,
            paddingHorizontal: 14,
            color: C.ink,
            fontSize: 15,
            fontWeight: "800",
          }}
        />
        {notice ? (
          <Text selectable accessibilityRole="alert" style={{ color: "#9C3225", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
            {notice}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy || locked || !email.trim() || !password}
          onPress={submitAdminSignIn}
          style={({ pressed }) => ({
            minHeight: 54,
            borderRadius: 28,
            backgroundColor: busy || locked || !email.trim() || !password ?
              "#8D9AA3"
              : pressed ?
                "#003452"
                : adminNavy,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 20,
            boxShadow: "0 12px 28px rgba(0,29,48,0.28)",
          })}
        >
          <Text style={{ color: C.paper, fontSize: 16, fontWeight: "900" }}>
            {locked ? `Locked ${remainingSeconds}s` : busy ? "Checking access..." : "Sign-in"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={sendAdminPasswordReset}
          style={{ alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4 }}
        >
          <Text style={{ color: adminNavy, fontSize: 13, fontWeight: "900" }}>
            Forgot password? Send reset link
          </Text>
        </Pressable>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 }}
        >
          This is a restricted page. Access is strictly regulated. Any form of attempt or illegal access will be prosecuted.
        </Text>
      </View>
      </View>
    </ScrollView>
  );
}

function SecurityPrivacySettingsPage({
  busy,
  notice,
  onBack,
  onRequestPasswordReset,
  onDeleteAccountPress,
}: {
  busy: boolean;
  notice: string;
  onBack: () => void;
  onRequestPasswordReset: () => void;
  onDeleteAccountPress?: () => void;
}) {
  const policyUrl = "https://kindredcube.com/privacy";
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 38,
        gap: 16,
      }}
    >
      <View
        style={{
          minHeight: 54,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={{ minWidth: 64, paddingVertical: 8 }}
        >
          <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>
            Back
          </Text>
        </Pressable>
        <Text
          selectable
          style={{ flex: 1, color: C.ink, fontSize: 19, fontWeight: "900", textAlign: "center" }}
        >
          Privacy
        </Text>
        <View style={{ width: 64 }} />
      </View>

      <View
        style={{
          borderRadius: 25,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 18,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: "#EEF6F1",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ShieldCheck width={28} height={28} color={C.sage} />
        </View>
        <Text selectable style={{ color: C.ink, fontSize: 26, fontWeight: "900" }}>
          Protect your account
        </Text>
        <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
          Reset your password by email. Since this request starts from your signed-in account, the reset link will ask for your last password before accepting the new password.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onRequestPasswordReset}
          style={{
            minHeight: 54,
            borderRadius: 27,
            backgroundColor: busy ? "#8D8680" : C.ink,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 18,
          }}
        >
          <Text style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>
            {busy ? "Sending reset link..." : "Reset password"}
          </Text>
        </Pressable>
        {notice ? (
          <Text
            accessibilityRole="alert"
            selectable
            style={{
              color: notice.includes("could not") ? "#A0322A" : C.sage,
              fontSize: 12,
              lineHeight: 17,
              fontWeight: "800",
            }}
          >
            {notice}
          </Text>
        ) : null}
      </View>

      {onDeleteAccountPress ? (
        <View
          style={{
            borderRadius: 22,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: "#E2A29B",
            padding: 16,
            gap: 10,
          }}
        >
          <Text selectable style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>
            Delete account
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
            Permanently delete your KindredCube account, profile, saved photos, active sessions, and password access.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onDeleteAccountPress}
            style={{
              alignSelf: "flex-start",
              minHeight: 34,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: "#E2A29B",
              backgroundColor: "transparent",
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Trash2 width={14} height={14} color="#8F1F18" />
            <Text style={{ color: "#8F1F18", fontSize: 11, fontWeight: "900" }}>
              Delete account
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          borderRadius: 22,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          overflow: "hidden",
        }}
      >
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            WebBrowser.openBrowserAsync(policyUrl).catch(() =>
              Linking.openURL(policyUrl).catch(() => undefined),
            )
          }
          style={{
            minHeight: 68,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <FileText width={22} height={22} color={C.muted} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
              Privacy Policy
            </Text>
            <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 10 }}>
              Open Privacy Policy on kindredcube.com
            </Text>
          </View>
          <ChevronRight width={18} height={18} color={C.muted} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

type NotificationPreferenceKey =
  | "newMessages"
  | "newAdmirers"
  | "newMatches"
  | "expiringMatches"
  | "profileTips"
  | "kindredEvents"
  | "marketing"
  | "vibration";

const defaultNotificationPreferences: Record<NotificationPreferenceKey, boolean> = {
  newMessages: true,
  newAdmirers: true,
  newMatches: true,
  expiringMatches: true,
  profileTips: true,
  kindredEvents: true,
  marketing: true,
  vibration: true,
};

const notificationPreferenceGroups: Array<{
  title: string;
  items: Array<{ key: NotificationPreferenceKey; label: string; description: string }>;
}> = [
  {
    title: "Message notifications",
    items: [
      { key: "newMessages", label: "New messages", description: "Messages from your connections." },
    ],
  },
  {
    title: "Match notifications",
    items: [
      { key: "newAdmirers", label: "New admirers", description: "People who liked you." },
      { key: "newMatches", label: "New matches", description: "When you both like each other." },
      { key: "expiringMatches", label: "Expiring matches", description: "Matches that need a first chat before they expire." },
    ],
  },
  {
    title: "Profile notifications",
    items: [
      { key: "profileTips", label: "Top profile tips", description: "Tips to improve your profile and visibility." },
    ],
  },
  {
    title: "Other notifications",
    items: [
      { key: "kindredEvents", label: "KindredCube events", description: "Events and app updates." },
      { key: "marketing", label: "Marketing communications", description: "Offers, launches, and product news." },
      { key: "vibration", label: "Enable app vibration", description: "Use vibration for important in-app alerts." },
    ],
  },
];

function SettingsScreen({
  balance,
  initialSettings,
  onSettingsDataChange,
  onAddFunds,
  onCancel,
  onDone,
  onLogout,
  onDeleteAccount,
  userEmail = "",
  startInWallet = false,
}: {
  balance: number;
  initialSettings: Record<string, unknown>;
  onSettingsDataChange: (settings: Record<string, unknown>) => void;
  onAddFunds: (amount: number) => Promise<boolean>;
  onCancel: () => void;
  onDone: () => void;
  onLogout: () => void;
  onDeleteAccount?: (reasons: string[], details: string) => Promise<void>;
  userEmail?: string;
  startInWallet?: boolean;
}) {
  const [walletOpen, setWalletOpen] = useState(startInWallet);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectionType, setConnectionType] = useState<"dating" | "community">(
    initialSettings.connectionType === "community" ? "community" : "dating",
  );
  const [notificationPreferences, setNotificationPreferences] = useState<Record<NotificationPreferenceKey, boolean>>(() => {
    const savedPreferences =
      initialSettings.notificationPreferences &&
      typeof initialSettings.notificationPreferences === "object" &&
      !Array.isArray(initialSettings.notificationPreferences)
        ? initialSettings.notificationPreferences as Record<string, unknown>
        : {};
    return {
      ...defaultNotificationPreferences,
      ...Object.fromEntries(
        Object.entries(savedPreferences).filter((entry): entry is [NotificationPreferenceKey, boolean] =>
          entry[0] in defaultNotificationPreferences && typeof entry[1] === "boolean",
        ),
      ),
    };
  });
  const [saved, setSaved] = useState(false);
  const [securityNotice, setSecurityNotice] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [connectionExpanded, setConnectionExpanded] = useState(false);
  const [openSection, setOpenSection] = useState("");
  const settingsBackAction = useRef<() => void>(() => {});
  settingsBackAction.current = walletOpen ?
    () => setWalletOpen(false)
    : deleteOpen ?
      () => setDeleteOpen(false)
      : securityOpen ?
        () => setSecurityOpen(false)
        : helpOpen ?
          () => setHelpOpen(false)
        : onCancel;
  const settingsSwipeBack = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 72) settingsBackAction.current();
      },
    }),
  ).current;
  useEffect(() => {
    onSettingsDataChange({ connectionType });
  }, [connectionType, onSettingsDataChange]);
  const toggleNotificationPreference = (key: NotificationPreferenceKey) => {
    setNotificationPreferences((current) => {
      const next = { ...current, [key]: !current[key] };
      onSettingsDataChange({ notificationPreferences: next });
      return next;
    });
  };
  const notificationEmail = userEmail;
  if (walletOpen)
    return (
      <View style={{ flex: 1 }} {...settingsSwipeBack.panHandlers}>
      <WalletScreen
        balance={balance}
        onAddFunds={onAddFunds}
        onBack={() => setWalletOpen(false)}
      />
      </View>
    );
  if (deleteOpen)
    return (
      <DeleteAccountScreen
        onBack={() => setDeleteOpen(false)}
        onDeleteAccount={onDeleteAccount}
      />
    );
  if (helpOpen)
    return <HelpHubPage onBack={() => setHelpOpen(false)} onDeleteAccount={onDeleteAccount} />;
  if (securityOpen)
    return (
      <SecurityPrivacySettingsPage
        busy={securityBusy}
        notice={securityNotice}
        onBack={() => setSecurityOpen(false)}
        onDeleteAccountPress={onDeleteAccount ? () => {
          setSecurityOpen(false);
          setDeleteOpen(true);
        } : undefined}
        onRequestPasswordReset={async () => {
          if (securityBusy) return;
          setSecurityBusy(true);
          setSecurityNotice("");
          try {
            const result = await requestSignedInPasswordReset();
            setSecurityNotice(result.message);
          } catch (caught) {
            setSecurityNotice(
              caught instanceof Error ?
                caught.message
                : "The password reset link could not be sent.",
            );
          } finally {
            setSecurityBusy(false);
          }
        }}
      />
    );
  const rows = [
    {
      title: "Notification settings",
      description: "Likes, matches, messages, reminders, and email preferences",
      details: [] as string[],
      icon: Bell,
    },
    {
      title: "Privacy",
      description: "Delete account and open the Privacy Policy",
      details: [] as string[],
      icon: ShieldCheck,
    },
    {
      title: "Legal information",
      description: "Open Terms, Privacy, and Community Guidelines on kindredcube.com",
      details: [
        "Terms of Service|https://kindredcube.com/terms",
        "Privacy Policy|https://kindredcube.com/privacy",
        "Community Guidelines|https://kindredcube.com/community-guidelines",
      ],
      icon: FileText,
    },
    {
      title: "Get help",
      description: "Contact support now. More help tools are coming soon.",
      details: ["Contact support", "Report a problem|coming-soon", "Accessibility help|coming-soon"],
      icon: CircleHelp,
    },
  ];
  return (
    <ScrollView
      {...settingsSwipeBack.panHandlers}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 38,
        gap: 15,
      }}
    >
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{ minWidth: 62, paddingVertical: 8 }}
        >
          <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>
            Cancel
          </Text>
        </Pressable>
        <Text
          selectable
          style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}
        >
          Settings
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={{ minWidth: 62, alignItems: "flex-end", paddingVertical: 8 }}
        >
          <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>
            Done
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setWalletOpen(true)}
        style={{
          borderRadius: 22,
          backgroundColor: C.ink,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Wallet width={28} height={28} color={C.paper} />
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={{ color: C.paper, fontSize: 17, fontWeight: "900" }}
          >
            Wallet
          </Text>
          <Text selectable style={{ color: "#CEC8BE", fontSize: 11 }}>
            Add funds · $10 minimum
          </Text>
        </View>
        <Text
          selectable
          style={{
            color: balance > 0 ? TECTAVIS_GREEN : C.paper,
            fontSize: 18,
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMoney(balance)}
        </Text>
      </Pressable>
      <View
        style={{
          borderRadius: 23,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: connectionExpanded }}
          onPress={() => setConnectionExpanded((value) => !value)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}
            >
              Type of connection
            </Text>
            <Text
              selectable
              style={{ color: C.clay, fontSize: 11, fontWeight: "900" }}
            >
              Selected:{" "}
              {connectionType === "dating" ?
                "Dating"
                : "Friendship & community"}
            </Text>
          </View>
          <ChevronRight
            width={21}
            height={21}
            color={C.muted}
            style={{
              transform: [{ rotate: connectionExpanded ? "90deg" : "0deg" }],
            }}
          />
        </Pressable>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
        >
          Choose the main experience you want KindredCube to prioritize.
        </Text>
        {connectionExpanded
          ? [
              {
                key: "dating" as const,
                title: "Dating",
                description:
                  "Find a relationship, marriage, something casual, something serious, or anything in between.",
                icon: Heart,
              },
              {
                key: "community" as const,
                title: "Friendship & community",
                description:
                  "Find friends and people who share your interests, culture, or community.",
                icon: Users,
              },
            ].map((item) => {
              const active = connectionType === item.key;
              const Icon = item.icon;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  key={item.key}
                  onPress={() => {
                    setConnectionType(item.key);
                    setSaved(false);
                    setConnectionExpanded(false);
                  }}
                  style={{
                    minHeight: 84,
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderColor: active ? C.pink : C.line,
                    backgroundColor: active ? "#FFF5F8" : C.paper,
                    padding: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: active ? "#FCE5EE" : "#F3EFE8",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      width={21}
                      height={21}
                      color={active ? C.pink : C.muted}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text
                      selectable
                      style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}
                    >
                      {item.title}
                    </Text>
                    <Text
                      selectable
                      style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
                    >
                      {item.description}
                    </Text>
                  </View>
                  {active ? (
                    <Check
                      width={20}
                      height={20}
                      color={C.pink}
                      strokeWidth={3}
                    />
                  ) : null}
                </Pressable>
              );
            })
          : null}
        <Button
          compact
          label="Save connection type"
          onPress={() => setSaved(true)}
        />
        {saved ? (
          <Text
            selectable
            style={{
              color: C.sage,
              fontSize: 11,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            Connection preference saved.
          </Text>
        ) : null}
      </View>
      <View
        style={{
          borderRadius: 23,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: C.paper,
        }}
      >
        {rows.map((row, index) => {
          const Icon = row.icon;
          const open = openSection === row.title;
          return (
            <View key={row.title}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => {
                  if (row.title === "Privacy") {
                    setSecurityOpen(true);
                    return;
                  }
                  setOpenSection(open ? "" : row.title);
                }}
                style={{
                  minHeight: 67,
                  paddingHorizontal: 15,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderBottomWidth: index === rows.length - 1 && !open ? 0 : 1,
                  borderBottomColor: C.line,
                }}
              >
                <Icon width={22} height={22} color={C.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    selectable
                    style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
                  >
                    {row.title}
                  </Text>
                  <Text
                    selectable
                    numberOfLines={1}
                    style={{ color: C.muted, fontSize: 10 }}
                  >
                    {row.description}
                  </Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 19 }}>
                  {open ? "⌄" : "›"}
                </Text>
              </Pressable>
              {open ? (
                <View
                  style={{
                    paddingHorizontal: 49,
                    paddingVertical: 12,
                    gap: 9,
                    backgroundColor: "#FAF7F2",
                  }}
                >
                  {row.title === "Notification settings" ? (
                    <>
                      {notificationPreferenceGroups.map((group) => (
                        <View key={group.title} style={{ gap: 8, paddingBottom: 4 }}>
                          <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "900" }}>
                            {group.title}
                          </Text>
                          {group.items.map((item) => {
                            const active = notificationPreferences[item.key];
                            return (
                              <Pressable
                                key={item.key}
                                accessibilityRole="switch"
                                accessibilityState={{ checked: active }}
                                onPress={() => toggleNotificationPreference(item.key)}
                                style={{
                                  minHeight: 52,
                                  borderRadius: 18,
                                  backgroundColor: C.paper,
                                  borderWidth: 1,
                                  borderColor: C.line,
                                  paddingHorizontal: 13,
                                  paddingVertical: 9,
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 12,
                                }}
                              >
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                                    {item.label}
                                  </Text>
                                  <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 14 }}>
                                    {item.description}
                                  </Text>
                                </View>
                                <View
                                  style={{
                                    width: 46,
                                    height: 28,
                                    borderRadius: 14,
                                    padding: 3,
                                    backgroundColor: active ? C.ink : "#D8D0C5",
                                    alignItems: active ? "flex-end" : "flex-start",
                                  }}
                                >
                                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.paper }} />
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                      <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
                        Email notifications are sent to {notificationEmail || "your account email"} when the related email toggle is on.
                      </Text>
                    </>
                  ) : row.details.map((item) => {
                    const [label, target] = item.split("|");
                    const isComingSoon = target === "coming-soon";
                    const isLink = target?.startsWith("https://") || label.startsWith("https://");
                    return (
                    <Pressable
                      key={item}
                      accessibilityRole={isLink ? "link" : "button"}
                      disabled={securityBusy && item === "Reset password"}
                      onPress={async () => {
                        if (label === "Contact support") {
                          setOpenSection("");
                          setHelpOpen(true);
                          return;
                        }
                        if (isComingSoon) return;
                        if (label === "Reset password") {
                          if (securityBusy) return;
                          setSecurityBusy(true);
                          setSecurityNotice("");
                          try {
                            const result = await requestSignedInPasswordReset();
                            setSecurityNotice(result.message);
                          } catch (caught) {
                            setSecurityNotice(
                              caught instanceof Error ?
                                caught.message
                                : "The password reset link could not be sent.",
                            );
                          } finally {
                            setSecurityBusy(false);
                          }
                          return;
                        }
                        const url = target?.startsWith("https://") ? target : label.startsWith("https://") ? label : "";
                        if (url) await openPublicWebsiteUrl(url);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        selectable
                        style={{
                          flex: 1,
                          color: C.ink,
                          fontSize: 12,
                          lineHeight: 17,
                        }}
                      >
                        {label}
                        {isComingSoon ? " — Coming soon" : ""}
                      </Text>
                      {isComingSoon ? null : <ChevronRight width={16} height={16} color={C.muted} />}
                    </Pressable>
                  )})}
                  {row.title === "Privacy" && securityNotice ? (
                    <Text
                      accessibilityRole="alert"
                      selectable
                      style={{
                        color: securityNotice.includes("could not") ? "#A0322A" : C.sage,
                        fontSize: 11,
                        lineHeight: 16,
                        fontWeight: "800",
                      }}
                    >
                      {securityNotice}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        style={{
          minHeight: 52,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: "#C85A50",
          backgroundColor: "#FFF7F5",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
        }}
      >
        <LogOut width={20} height={20} color="#A0322A" />
        <Text style={{ color: "#A0322A", fontSize: 14, fontWeight: "900" }}>
          Log out
        </Text>
      </Pressable>
      <View style={{ alignItems: "center", gap: 8, paddingTop: 18 }}>
        <Image
          source={require("./assets/kindredcube-current-logo-header.png")}
          resizeMode="contain"
          style={{
            width: 190,
            height: 58,
            opacity: 0.78,
          }}
        />
        <Text
          selectable
          style={{ color: "#99938B", fontSize: 10, fontWeight: "800" }}
        >
          Version 1.0.0
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
          }}
        >
          <Text
            selectable
            style={{ color: "#817C75", fontSize: 9, fontWeight: "400" }}
          >
            Powered by
          </Text>
          <Image
            source={require("./assets/tectavis-logo-transparent.png")}
            resizeMode="contain"
            style={{
              width: 84,
              height: 27,
              marginLeft: -7,
              tintColor: "#817C75",
              opacity: 0.82,
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function DeleteAccountScreen({
  onBack,
  onDeleteAccount,
}: {
  onBack: () => void;
  onDeleteAccount?: (reasons: string[], details: string) => Promise<void>;
}) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const reasonOptions = [
    "I met someone",
    "I'm taking a break",
    "Privacy concern",
    "Safety concern",
    "Too expensive",
    "Not enough matches",
    "Something did not work",
    "Other",
  ];
  const toggleReason = (reason: string) =>
    setReasons((current) =>
      current.includes(reason) ?
        current.filter((item) => item !== reason)
        : [...current, reason],
    );
  const canDelete = reasons.length > 0 && confirmText.trim().toUpperCase() === "DELETE";
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 14 }}
    >
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" onPress={onBack} style={{ minWidth: 62, paddingVertical: 8 }}>
          <Text style={{ color: C.pink, fontSize: 14, fontWeight: "900" }}>Back</Text>
        </Pressable>
        <Text selectable style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}>
          Delete account
        </Text>
        <View style={{ minWidth: 62 }} />
      </View>
      <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
        <Text selectable style={{ color: C.ink, fontSize: 25, fontWeight: "900" }}>
          Before you go
        </Text>
        <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
          Tell us why you're deleting. Your visible profile, private profile data, discovery listing, password, and sessions will be removed from active use. Minimal anonymized audit records may be retained for safety and legal reasons.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {reasonOptions.map((reason) => {
            const selected = reasons.includes(reason);
            return (
              <Pressable
                key={reason}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleReason(reason)}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: selected ? "#8F1F18" : C.line,
                  backgroundColor: selected ? "#FFF2F0" : "#F7F1E7",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: selected ? "#8F1F18" : C.ink, fontSize: 12, fontWeight: "900" }}>
                  {reason}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={details}
          onChangeText={setDetails}
          multiline
          placeholder="Anything else we should know?"
          placeholderTextColor="#948A7F"
          style={{ minHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top" }}
        />
        <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
          Type DELETE to confirm
        </Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          placeholder="DELETE"
          placeholderTextColor="#948A7F"
          style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, color: C.ink, fontWeight: "900" }}
        />
        {notice ? <Text selectable accessibilityRole="alert" style={{ color: "#9C3225", fontSize: 12, fontWeight: "900" }}>{notice}</Text> : null}
        <Button
          label={busy ? "Deleting..." : "Delete my account permanently"}
          disabled={!canDelete || busy}
          onPress={async () => {
            setBusy(true);
            setNotice("");
            try {
              await onDeleteAccount(reasons, details);
            } catch (caught) {
              setNotice(caught instanceof Error ? caught.message : "Account could not be deleted.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </ScrollView>
  );
}

const helpCategoryLabels: Record<HelpContentPage["category"], { title: string; description: string }> = {
  profile_setup: {
    title: "Profile Setup and Editing",
    description: "Photos, bio, prompts, interests, values, and profile strength.",
  },
  account_management: {
    title: "Account Management",
    description: "Login, email, password, verification, notifications, and account access.",
  },
  data_management: {
    title: "Data Management",
    description: "Export, privacy choices, deletion, blocked users, and saved profile data.",
  },
};

const fallbackHelpPages: HelpContentPage[] = [
  { slug: "photos", category: "profile_setup", title: "Photos", summary: "Choose photos that show the real you.", body: "Add at least three clear photos. Your first photo should be your strongest photo.", imageUrls: [], updatedAt: "" },
  { slug: "bio", category: "profile_setup", title: "Bio", summary: "Write a bio that helps someone understand you quickly.", body: "Use your bio to share your personality, values, lifestyle, and what makes connecting with you meaningful.", imageUrls: [], updatedAt: "" },
  { slug: "prompts", category: "profile_setup", title: "Prompts", summary: "Prompts help your profile feel more human.", body: "Pick prompts that invite conversation and answer them in your own words.", imageUrls: [], updatedAt: "" },
  { slug: "interests", category: "profile_setup", title: "Interests", summary: "Interests help KindredCube find common ground.", body: "Choose interests that genuinely reflect how you spend your time.", imageUrls: [], updatedAt: "" },
  { slug: "values", category: "profile_setup", title: "Values", summary: "Values help match people beyond surface attraction.", body: "Choose qualities and values that matter to you in another person.", imageUrls: [], updatedAt: "" },
  { slug: "profile-strength", category: "profile_setup", title: "Profile Strength", summary: "A stronger profile receives stronger recommendations.", body: "Profile strength increases when you add photos, bio, prompts, interests, values, details, and verification.", imageUrls: [], updatedAt: "" },
  { slug: "login-email-password", category: "account_management", title: "Login, Email, and Password", summary: "Manage account access safely.", body: "Use a strong password and keep your email address current.", imageUrls: [], updatedAt: "" },
  { slug: "verification", category: "account_management", title: "Verification", summary: "Verification helps people trust your profile.", body: "KindredCube uses Stripe for verification and does not store your identification documents.", imageUrls: [], updatedAt: "" },
  { slug: "notifications", category: "account_management", title: "Notifications", summary: "Control how KindredCube keeps in touch.", body: "You can control notifications for messages, admirers, matches, tips, and marketing updates.", imageUrls: [], updatedAt: "" },
  { slug: "account-access", category: "account_management", title: "Account Access", summary: "Keep access to your account protected.", body: "Log out on shared devices and contact support if you suspect unauthorized access.", imageUrls: [], updatedAt: "" },
  { slug: "export-data", category: "data_management", title: "Export Data", summary: "Request a copy of your information.", body: "KindredCube can support account data export for transparency.", imageUrls: [], updatedAt: "" },
  { slug: "privacy-choices", category: "data_management", title: "Privacy Choices", summary: "Control visibility and privacy preferences.", body: "Use visibility, blocks, pause, and privacy settings to control how you appear.", imageUrls: [], updatedAt: "" },
  { slug: "delete-account", category: "data_management", title: "Delete Account", summary: "Delete your account when you are ready to leave.", body: "Deleting removes active profile data. Minimal safety/legal records may be retained where required.", imageUrls: [], updatedAt: "" },
  { slug: "blocked-users", category: "data_management", title: "Blocked Users", summary: "Blocking removes access between both people.", body: "Blocked members are removed from discovery, likes, matches, and chats.", imageUrls: [], updatedAt: "" },
  { slug: "saved-profile-data", category: "data_management", title: "Saved Profile Data", summary: "Your profile changes stay with your account.", body: "Photos, bio, prompts, and settings are saved to your private account space.", imageUrls: [], updatedAt: "" },
];

const supportReasonOptions = [
  "Profile setup",
  "Account access",
  "Photos",
  "Verification",
  "Payments",
  "Ready to Meet",
  "Matches and messages",
  "Report a problem",
  "Other",
];

const supportCloseReasonOptions = [
  "Issue resolved by support",
  "I figured it out myself",
  "No longer needed",
  "Created by mistake",
  "Other",
];

const quickSupportSolutions = [
  {
    title: "How do I add photos?",
    keywords: ["photo", "photos", "picture", "instagram", "upload"],
    body: "Go to Profile, tap Edit profile, then use the Photos section. Add at least three clear photos and mark your strongest photo as Best.",
  },
  {
    title: "How do I delete my account?",
    keywords: ["delete", "remove", "account", "data"],
    body: "Sign in to KindredCube, open Settings, open Privacy, then choose Delete account. Select your reason, type DELETE, and confirm.",
  },
  {
    title: "How do I connect with someone?",
    keywords: ["connect", "match", "like", "chat", "message"],
    body: "Like a profile from Connect or Explore. When both people like each other, chat opens automatically.",
  },
  {
    title: "How do I make my profile more visible?",
    keywords: ["visible", "visibility", "recommend", "recommendation", "profile strength"],
    body: "Add 3+ photos, a bio, interests, values, profile prompts, Kindred Type answers, and complete verification. Stronger profiles get better recommendations.",
  },
  {
    title: "How does Ready to Meet work?",
    keywords: ["ready", "meet", "availability", "available"],
    body: "Ready to Meet shows people who saved an active availability window nearby. You can turn yourself off whenever plans change.",
  },
];

function HelpHubPage({
  onBack,
  onDeleteAccount,
}: {
  onBack: () => void;
  onDeleteAccount?: (reasons: string[], details: string) => Promise<void>;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [pages, setPages] = useState<HelpContentPage[]>(fallbackHelpPages);
  const [selectedCategory, setSelectedCategory] = useState<HelpContentPage["category"] | null>(null);
  const [selectedPage, setSelectedPage] = useState<HelpContentPage | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [helpSearch, setHelpSearch] = useState("");
  const [faqsOpen, setFaqsOpen] = useState(false);
  const [supportFormOpen, setSupportFormOpen] = useState(false);
  const [supportReason, setSupportReason] = useState("Profile setup");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportNotice, setSupportNotice] = useState("");
  const [userSupportTickets, setUserSupportTickets] = useState<SupportTicket[]>([]);
  const [selectedSupportTicket, setSelectedSupportTicket] = useState<SupportTicket | null>(null);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [closeTicketOpen, setCloseTicketOpen] = useState(false);
  const [closeTicketReason, setCloseTicketReason] = useState("Issue resolved by support");
  const [closeTicketDetails, setCloseTicketDetails] = useState("");
  const [closingTicket, setClosingTicket] = useState(false);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketReplySubmitting, setTicketReplySubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    getHelpContent()
      .then((result) => {
        if (active && result.pages.length) setPages(result.pages);
      })
      .catch(() => undefined);
    getSupportTickets()
      .then((result) => {
        if (active) setUserSupportTickets(result.tickets || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const goBack = () => {
    if (closeTicketOpen) {
      setCloseTicketOpen(false);
      return;
    }
    if (supportFormOpen) {
      setSupportFormOpen(false);
      return;
    }
    if (deleteOpen) {
      setDeleteOpen(false);
      return;
    }
    if (selectedSupportTicket) {
      setSelectedSupportTicket(null);
      return;
    }
    if (updatesOpen) {
      setUpdatesOpen(false);
      return;
    }
    if (selectedPage) {
      setSelectedPage(null);
      return;
    }
    if (selectedCategory) {
      setSelectedCategory(null);
      return;
    }
    onBack();
  };
  const shownPages = selectedCategory ? pages.filter((page) => page.category === selectedCategory) : [];
  const normalizedSearch = helpSearch.trim().toLowerCase();
  const suggestedSolutions = normalizedSearch ?
    [
      ...quickSupportSolutions.filter((solution) =>
        solution.title.toLowerCase().includes(normalizedSearch) ||
        solution.body.toLowerCase().includes(normalizedSearch) ||
        solution.keywords.some((keyword) => keyword.includes(normalizedSearch) || normalizedSearch.includes(keyword)),
      ).map((solution) => ({ ...solution, source: "quick" as const })),
      ...pages.filter((page) =>
        page.title.toLowerCase().includes(normalizedSearch) ||
        page.summary.toLowerCase().includes(normalizedSearch) ||
        page.body.toLowerCase().includes(normalizedSearch),
      ).slice(0, 5).map((page) => ({
        title: page.title,
        body: page.summary || page.body || "Open this help page for more details.",
        source: "page" as const,
        page,
      })),
    ].slice(0, 6)
    : quickSupportSolutions.slice(0, 4).map((solution) => ({ ...solution, source: "quick" as const }));
  const submitSupportTicket = async () => {
    if (supportSubmitting) return;
    setSupportNotice("");
    if (supportMessage.trim().length < 10) {
      setSupportNotice("Please describe the issue with at least a little detail before creating a ticket.");
      return;
    }
    setSupportSubmitting(true);
    try {
      const result = await createSupportTicket({
        reason: supportReason,
        message: supportMessage.trim(),
        searchedFor: helpSearch.trim(),
      });
      setUserSupportTickets((current) => [
        result.ticket,
        ...current.filter((ticket) => ticket.id !== result.ticket.id),
      ]);
      setSupportNotice(`Support ticket ${result.ticket.ticketNumber} is open. You can follow it in Updates.`);
      setSupportMessage("");
      setSupportFormOpen(false);
    } catch (caught) {
      setSupportNotice(caught instanceof Error ? caught.message : "Support ticket could not be created. Please try again.");
    } finally {
      setSupportSubmitting(false);
    }
  };
  const openSupportTicketCount = userSupportTickets.filter((ticket) => ticket.status !== "closed").length;
  const submitTicketReply = async () => {
    if (!selectedSupportTicket || ticketReplySubmitting) return;
    const message = ticketReply.trim();
    if (message.length < 2) {
      setSupportNotice("Please write a message before sending.");
      return;
    }
    setSupportNotice("");
    setTicketReplySubmitting(true);
    try {
      const result = await replyToUserSupportTicket(selectedSupportTicket.id, message);
      setSelectedSupportTicket(result.ticket);
      setUserSupportTickets((current) =>
        current.map((ticket) => ticket.id === result.ticket.id ? result.ticket : ticket),
      );
      setTicketReply("");
      setSupportNotice("Reply added to your support ticket.");
    } catch (caught) {
      setSupportNotice(caught instanceof Error ? caught.message : "Your reply could not be sent. Please try again.");
    } finally {
      setTicketReplySubmitting(false);
    }
  };
  const submitCloseSupportTicket = async () => {
    if (!selectedSupportTicket || closingTicket) return;
    setSupportNotice("");
    setClosingTicket(true);
    try {
      const result = await closeSupportTicket(selectedSupportTicket.id, {
        reason: closeTicketReason,
        details: closeTicketDetails.trim(),
      });
      if (!result.ticket) {
        setSupportNotice("This ticket could not be closed. Please try again.");
        return;
      }
      setSelectedSupportTicket(result.ticket);
      setUserSupportTickets((current) =>
        current.map((ticket) => (ticket.id === result.ticket?.id ? result.ticket : ticket)),
      );
      setCloseTicketOpen(false);
      setCloseTicketDetails("");
      setSupportNotice(`Ticket ${result.ticket.ticketNumber} was closed.`);
    } catch (caught) {
      setSupportNotice(caught instanceof Error ? caught.message : "This ticket could not be closed. Please try again.");
    } finally {
      setClosingTicket(false);
    }
  };
  if (deleteOpen && onDeleteAccount) {
    return (
      <DeleteAccountScreen
        onBack={() => setDeleteOpen(false)}
        onDeleteAccount={onDeleteAccount}
      />
    );
  }
  if (supportFormOpen) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.cream }}
        onTouchStart={(event) => {
          touchStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
        }}
        onTouchEnd={(event) => {
          if (!touchStart.current) return;
          const dx = event.nativeEvent.pageX - touchStart.current.x;
          const dy = event.nativeEvent.pageY - touchStart.current.y;
          touchStart.current = null;
          if (dx > 75 && Math.abs(dx) > Math.abs(dy) * 1.25) setSupportFormOpen(false);
        }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 15 }}
        >
          <Logo size="compact" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Help Hub"
            onPress={() => setSupportFormOpen(false)}
            style={{ alignSelf: "flex-start", minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7 }}
          >
            <ChevronLeft width={23} height={23} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Back to Help Hub</Text>
          </Pressable>
          <View style={{ borderRadius: 28, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 18, gap: 14 }}>
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 30, fontWeight: "900" }}>
              Contact Support
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>
              Tell us what happened. We’ll create a ticket and send it directly to the admin support queue.
            </Text>
            {supportNotice ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, backgroundColor: "#EAF7EE", borderWidth: 1, borderColor: "#B9E3C5", padding: 12 }}>
                <Text selectable style={{ color: "#315C3B", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>{supportNotice}</Text>
              </View>
            ) : null}
            <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>Reason</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {supportReasonOptions.map((reason) => {
                const selected = supportReason === reason;
                return (
                  <Pressable
                    key={reason}
                    accessibilityRole="button"
                    onPress={() => setSupportReason(reason)}
                    style={{
                      borderRadius: 16,
                      backgroundColor: selected ? C.pink : "#F3EFE8",
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: selected ? C.paper : C.ink, fontSize: 11, fontWeight: "900" }}>{reason}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              multiline
              value={supportMessage}
              onChangeText={setSupportMessage}
              placeholder="Tell support what happened..."
              placeholderTextColor="#948A7F"
              textAlignVertical="top"
              style={{
                minHeight: 170,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: "#F8F3EA",
                color: C.ink,
                padding: 14,
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "700",
              }}
            />
            <Button compact label={supportSubmitting ? "Creating ticket..." : "Create ticket"} onPress={submitSupportTicket} />
          </View>
        </ScrollView>
      </View>
    );
  }
  if (closeTicketOpen && selectedSupportTicket) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.cream }}
        onTouchStart={(event) => {
          touchStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
        }}
        onTouchEnd={(event) => {
          if (!touchStart.current) return;
          const dx = event.nativeEvent.pageX - touchStart.current.x;
          const dy = event.nativeEvent.pageY - touchStart.current.y;
          touchStart.current = null;
          if (dx > 75 && Math.abs(dx) > Math.abs(dy) * 1.25) setCloseTicketOpen(false);
        }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 15 }}
        >
          <Logo size="compact" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to support ticket"
            onPress={() => setCloseTicketOpen(false)}
            style={{ alignSelf: "flex-start", minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7 }}
          >
            <ChevronLeft width={23} height={23} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Back to Ticket</Text>
          </Pressable>
          <View style={{ borderRadius: 28, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 18, gap: 14 }}>
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 30, fontWeight: "900" }}>
              Close Ticket
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>
              Tell us why you are closing {selectedSupportTicket.ticketNumber}. This reason stays saved on the ticket.
            </Text>
            {supportNotice ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, backgroundColor: "#FFF7DF", borderWidth: 1, borderColor: "#E8D7AA", padding: 12 }}>
                <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>{supportNotice}</Text>
              </View>
            ) : null}
            <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>Reason</Text>
            <View style={{ gap: 8 }}>
              {supportCloseReasonOptions.map((reason) => {
                const selected = closeTicketReason === reason;
                return (
                  <Pressable
                    key={reason}
                    accessibilityRole="button"
                    onPress={() => setCloseTicketReason(reason)}
                    style={{
                      minHeight: 44,
                      borderRadius: 18,
                      backgroundColor: selected ? C.ink : "#F3EFE8",
                      borderWidth: 1,
                      borderColor: selected ? C.ink : C.line,
                      justifyContent: "center",
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text style={{ color: selected ? C.paper : C.ink, fontSize: 13, fontWeight: "900" }}>{reason}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              multiline
              value={closeTicketDetails}
              onChangeText={setCloseTicketDetails}
              placeholder="Add optional details..."
              placeholderTextColor="#948A7F"
              textAlignVertical="top"
              style={{
                minHeight: 120,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: "#F8F3EA",
                color: C.ink,
                padding: 14,
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "700",
              }}
            />
            <Button compact label={closingTicket ? "Closing ticket..." : "Close ticket"} onPress={submitCloseSupportTicket} />
          </View>
        </ScrollView>
      </View>
    );
  }
  return (
    <View
      style={{ flex: 1, backgroundColor: C.cream }}
      onTouchStart={(event) => {
        touchStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
      }}
      onTouchEnd={(event) => {
        if (!touchStart.current) return;
        const dx = event.nativeEvent.pageX - touchStart.current.x;
        const dy = event.nativeEvent.pageY - touchStart.current.y;
        touchStart.current = null;
        if (dx > 75 && Math.abs(dx) > Math.abs(dy) * 1.25) goBack();
      }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, gap: 15 }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back to Profile"
          onPress={goBack}
          style={{ alignSelf: "flex-start", minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7 }}
        >
          <ChevronLeft width={23} height={23} color={C.ink} />
          <Text style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
            {selectedSupportTicket ? "Back to Updates" : updatesOpen ? "Back to Help Hub" : selectedPage ? `Back to ${helpCategoryLabels[selectedPage.category].title}` : selectedCategory ? "Back to Help Hub" : "Back to Profile"}
          </Text>
        </Pressable>
        <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 34, fontWeight: "900" }}>
          {selectedSupportTicket ? "Support Ticket" : updatesOpen ? "Updates" : selectedPage?.title || (selectedCategory ? helpCategoryLabels[selectedCategory].title : "Help Hub")}
        </Text>
        {selectedSupportTicket ? (
          <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text selectable style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}>
                  {selectedSupportTicket.ticketNumber}
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                  {selectedSupportTicket.reason}
                </Text>
              </View>
              <View style={{ borderRadius: 999, backgroundColor: "#EAF7EE", borderWidth: 1, borderColor: "#B9E3C5", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: "#315C3B", fontSize: 11, fontWeight: "900", textTransform: "capitalize" }}>
                  {selectedSupportTicket.status.replace("_", " ")}
                </Text>
              </View>
            </View>
            <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
              Created {new Date(selectedSupportTicket.createdAt).toLocaleString()}
            </Text>
            <View style={{ gap: 9 }}>
              {(selectedSupportTicket.messages?.length ? selectedSupportTicket.messages : [{ id: `${selectedSupportTicket.id}-initial`, senderType: "user", body: selectedSupportTicket.message, createdAt: selectedSupportTicket.createdAt } as const]).map((message) => (
                <View
                  key={message.id}
                  style={{
                    alignSelf: message.senderType === "admin" ? "flex-start" : "flex-end",
                    maxWidth: "88%",
                    borderRadius: 18,
                    backgroundColor: message.senderType === "admin" ? "#EAF0FF" : "#F8F3EA",
                    borderWidth: 1,
                    borderColor: C.line,
                    padding: 13,
                    gap: 4,
                  }}
                >
                  <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
                    {message.senderType === "admin" ? "KindredCube Support" : message.senderType === "email" ? "You replied by email" : "You"}
                  </Text>
                  <Text selectable style={{ color: C.ink, fontSize: 14, lineHeight: 21, fontWeight: "700" }}>
                    {message.body}
                  </Text>
                  <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 14, fontWeight: "800" }}>
                    {message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}
                  </Text>
                </View>
              ))}
            </View>
            {selectedSupportTicket.closeReason ? (
              <View style={{ borderRadius: 18, backgroundColor: "#EAF7EE", borderWidth: 1, borderColor: "#B9E3C5", padding: 14, gap: 4 }}>
                <Text selectable style={{ color: "#315C3B", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
                  Close reason
                </Text>
                <Text selectable style={{ color: "#315C3B", fontSize: 13, lineHeight: 19, fontWeight: "800" }}>
                  {selectedSupportTicket.closeReason}
                </Text>
                {selectedSupportTicket.closedAt ? (
                  <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                    Closed {new Date(selectedSupportTicket.closedAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {supportNotice ? (
              <View accessibilityRole="alert" style={{ borderRadius: 16, backgroundColor: "#EAF7EE", borderWidth: 1, borderColor: "#B9E3C5", padding: 12 }}>
                <Text selectable style={{ color: "#315C3B", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>{supportNotice}</Text>
              </View>
            ) : null}
            <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
              Support updates for this ticket will appear here. You can reply here or by email.
            </Text>
            {selectedSupportTicket.status !== "closed" ? (
              <View style={{ gap: 9 }}>
                <TextInput
                  multiline
                  value={ticketReply}
                  onChangeText={setTicketReply}
                  placeholder="Reply to support..."
                  placeholderTextColor={C.muted}
                  style={{
                    minHeight: 82,
                    borderRadius: 18,
                    backgroundColor: "#F8F3EA",
                    borderWidth: 1,
                    borderColor: C.line,
                    padding: 13,
                    color: C.ink,
                    fontSize: 14,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button compact label={ticketReplySubmitting ? "Sending..." : "Send reply"} onPress={submitTicketReply} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button compact label="Close ticket" onPress={() => setCloseTicketOpen(true)} />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : updatesOpen ? (
          <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
            <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Support Updates</Text>
            <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
              Your support tickets stay here. Tap a ticket to view details or close it when the issue is handled.
            </Text>
            {userSupportTickets.length ? (
              <View style={{ gap: 10 }}>
                {userSupportTickets.map((ticket) => (
                  <Pressable
                    key={ticket.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedSupportTicket(ticket)}
                    style={{
                      borderRadius: 18,
                      backgroundColor: "#F8F3EA",
                      borderWidth: 1,
                      borderColor: C.line,
                      padding: 14,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text selectable style={{ flex: 1, color: C.ink, fontSize: 15, fontWeight: "900" }}>
                        {ticket.ticketNumber}
                      </Text>
                      <View style={{ borderRadius: 999, backgroundColor: ticket.status === "closed" ? "#ECE7DD" : "#EAF7EE", paddingHorizontal: 9, paddingVertical: 5 }}>
                        <Text style={{ color: ticket.status === "closed" ? C.muted : "#315C3B", fontSize: 10, fontWeight: "900", textTransform: "capitalize" }}>
                          {ticket.status.replace("_", " ")}
                        </Text>
                      </View>
                    </View>
                    <Text selectable style={{ color: C.clay, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
                      {ticket.reason}
                    </Text>
                    <Text selectable numberOfLines={2} style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
                      {ticket.message}
                    </Text>
                    {ticket.closeReason ? (
                      <Text selectable numberOfLines={2} style={{ color: "#315C3B", fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                        Closed: {ticket.closeReason}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ borderRadius: 18, backgroundColor: "#F8F3EA", borderWidth: 1, borderColor: C.line, padding: 14, gap: 5 }}>
                <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
                  No support updates yet
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                  When you create a ticket, it will appear here with its status.
                </Text>
              </View>
            )}
          </View>
        ) : selectedPage ? (
          <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
            {selectedPage.summary ? <Text selectable style={{ color: C.clay, fontSize: 14, lineHeight: 20, fontWeight: "900" }}>{selectedPage.summary}</Text> : null}
            {selectedPage.imageUrls.map((url, index) => (
              <Image key={`${selectedPage.slug}-${url}-${index}`} source={{ uri: url }} resizeMode="cover" style={{ width: "100%", height: 180, borderRadius: 18, backgroundColor: C.line }} />
            ))}
            <Text selectable style={{ color: C.ink, fontSize: 14, lineHeight: 22, fontWeight: "700" }}>
              {selectedPage.body || "More information will be added here soon."}
            </Text>
          </View>
        ) : selectedCategory ? (
          <>
            <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
              <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>{helpCategoryLabels[selectedCategory].description}</Text>
              {shownPages.map((page) => (
                <Pressable key={page.slug} accessibilityRole="button" onPress={() => setSelectedPage(page)} style={{ borderRadius: 18, backgroundColor: "#F3EFE8", padding: 14, gap: 4, flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>{page.title}</Text>
                    <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{page.summary}</Text>
                  </View>
                  <ChevronRight width={20} height={20} color={C.muted} />
                </Pressable>
              ))}
            </View>
            {selectedCategory === "data_management" && onDeleteAccount ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setDeleteOpen(true)}
                style={{
                  alignSelf: "center",
                  minHeight: 34,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: "#E2A29B",
                  backgroundColor: "transparent",
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Trash2 width={14} height={14} color="#8F1F18" />
                <Text style={{ color: "#8F1F18", fontSize: 11, fontWeight: "900" }}>
                  Delete account
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setUpdatesOpen(true)}
              style={{ borderRadius: 24, backgroundColor: "#F8F0F6", borderWidth: 1, borderColor: "#E8CFE0", padding: 17, gap: 9 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Updates</Text>
                  <Text selectable style={{ color: C.ink, fontSize: 14, lineHeight: 20, fontWeight: "800" }}>
                    {openSupportTicketCount
                      ? `${openSupportTicketCount} open support ${openSupportTicketCount === 1 ? "ticket" : "tickets"}`
                      : userSupportTickets.length
                        ? "No open support tickets"
                        : "Your support tickets will show here"}
                  </Text>
                  <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                    Tap to view support updates and ticket history.
                  </Text>
                </View>
                <ChevronRight width={24} height={24} color={C.muted} />
              </View>
            </Pressable>
            <View style={{ borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 17, gap: 12 }}>
              <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Ask KindredCube Help</Text>
              <TextInput
                value={helpSearch}
                onChangeText={setHelpSearch}
                placeholder="Search or ask a question..."
                placeholderTextColor="#948A7F"
                returnKeyType="search"
                style={{
                  minHeight: 48,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: "#F8F3EA",
                  color: C.ink,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  fontWeight: "800",
                }}
              />
              {normalizedSearch ? (
                <View style={{ gap: 9 }}>
                {suggestedSolutions.map((solution, index) => (
                  <Pressable
                    key={`${solution.title}-${index}`}
                    accessibilityRole="button"
                    onPress={() => {
                      if ("page" in solution && solution.page) setSelectedPage(solution.page);
                    }}
                    style={{ borderRadius: 18, backgroundColor: "#F3EFE8", padding: 13, gap: 5 }}
                  >
                    <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>{solution.title}</Text>
                    <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{solution.body}</Text>
                  </Pressable>
                ))}
                </View>
              ) : null}
              {supportNotice ? (
                <View accessibilityRole="alert" style={{ borderRadius: 16, backgroundColor: "#EAF7EE", borderWidth: 1, borderColor: "#B9E3C5", padding: 12 }}>
                  <Text selectable style={{ color: "#315C3B", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>{supportNotice}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => setFaqsOpen((current) => !current)}
                style={{ minHeight: 44, borderRadius: 22, backgroundColor: "#F3EFE8", borderWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15 }}
              >
                <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                  Frequently Asked Questions
                </Text>
                {faqsOpen ? <ChevronDown width={18} height={18} color={C.muted} /> : <ChevronRight width={18} height={18} color={C.muted} />}
              </Pressable>
              {faqsOpen ? (
                <View style={{ gap: 9 }}>
                  {quickSupportSolutions.map((solution, index) => (
                    <View key={`${solution.title}-${index}`} style={{ borderRadius: 18, backgroundColor: "#F3EFE8", padding: 13, gap: 5 }}>
                      <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>{solution.title}</Text>
                      <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{solution.body}</Text>
                    </View>
                  ))}
                  {(Object.keys(helpCategoryLabels) as HelpContentPage["category"][]).map((category) => (
                    <Pressable key={category} accessibilityRole="button" onPress={() => setSelectedCategory(category)} style={{ borderRadius: 18, backgroundColor: "#F8F3EA", padding: 14, gap: 4, flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>{helpCategoryLabels[category].title}</Text>
                        <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>{helpCategoryLabels[category].description}</Text>
                      </View>
                      <ChevronRight width={20} height={20} color={C.muted} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => setSupportFormOpen(true)}
                style={{ minHeight: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.paper, fontSize: 13, fontWeight: "900" }}>
                  Still need help? Contact Support
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProfileHubScreen({
  balance,
  profile,
  displayName,
  profilePhotoUri,
  profileStrength,
  verificationStatus,
  verificationMethod,
  onEditProfile,
  onSettings,
  onOpenWallet,
  onPurchasePlan,
  onDeleteAccount,
  premiumActive,
  kindredPassActive,
}: {
  balance: number;
  profile: Profile;
  displayName: string;
  profilePhotoUri: string;
  profileStrength: number;
  verificationStatus?: IdentityVerificationStatus;
  verificationMethod?: IdentityVerificationMethod;
  onEditProfile: () => void;
  onSettings: () => void;
  onOpenWallet?: () => void;
  onPurchasePlan: (plan: "premium" | "kindred_pass") => Promise<boolean>;
  onDeleteAccount?: (reasons: string[], details: string) => Promise<void>;
  premiumActive: boolean;
  kindredPassActive: boolean;
}) {
  const [activePlan, setActivePlan] = useState<
    "wallet" | "premium" | "pass"
  >("wallet");
  const [helpOpen, setHelpOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState<"premium" | "kindred_pass" | "">("");
  const [planNotices, setPlanNotices] = useState({ premium: "", kindred_pass: "" });
  if (helpOpen) return <HelpHubPage onBack={() => setHelpOpen(false)} onDeleteAccount={onDeleteAccount} />;
  const hubProfile = normalizeProfileVerification(profile);
  const hubVerificationSummary = profileVerificationSummaryText(hubProfile);
  const Benefit = ({ label, dark = false }: { label: string; dark?: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: dark ? "rgba(255,255,255,0.16)" : "#E7F2EA",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check width={13} height={13} color={dark ? C.paper : C.sage} strokeWidth={3} />
      </View>
      <Text
        selectable
        style={{
          flex: 1,
          color: dark ? C.paper : C.ink,
          fontSize: 12,
          lineHeight: 17,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </View>
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 36,
        gap: 15,
      }}
    >
      <Logo size="compact" />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          zIndex: 2,
          marginBottom: -34,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Help Hub"
            onPress={() => setHelpOpen(true)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircleHelp width={22} height={22} color={C.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={onSettings}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Settings width={22} height={22} color={C.ink} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingRight: 98 }}>
        <View style={{ width: 82, height: 82 }}>
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              overflow: "hidden",
              borderWidth: 3,
              borderColor: C.pink,
            }}
          >
            {profilePhotoUri ? (
              <Image
                source={{ uri: profilePhotoUri }}
                resizeMode="cover"
                style={{ width: 78, height: 78 }}
              />
            ) : (
              <View
                style={{
                  width: 78,
                  height: 78,
                  backgroundColor: "#EFEAE1",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Camera width={28} height={28} color={C.muted} />
              </View>
            )}
          </View>
          <View
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              borderRadius: 11,
              backgroundColor: C.ink,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: C.paper, fontSize: 10, fontWeight: "900" }}>
              {profileStrength}%
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}
            >
              {displayName}
            </Text>
            <ProfileVerificationBadgeIcons profile={hubProfile} size={21} stacked />
          </View>
          <Text selectable style={{ color: C.muted, fontSize: 11 }}>
            {hubVerificationSummary ||
              (verificationStatus === "verified"
                ? verificationMethod === "video_selfie"
                  ? "Selfie Verified — ID verification still available"
                  : "Verified securely by Stripe"
              : verificationStatus === "processing" ?
                "Verification is processing"
                : "Verification not completed")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onEditProfile}
            style={{
              alignSelf: "flex-start",
              minHeight: 38,
              borderRadius: 19,
              borderWidth: 1.5,
              borderColor: C.ink,
              paddingHorizontal: 15,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
              {profileStrength >= 100 ? "Edit profile" : "Complete profile"}
            </Text>
          </Pressable>
        </View>
      </View>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          borderRadius: 22,
          backgroundColor: "#EDE6DB",
          padding: 4,
          gap: 4,
        }}
      >
        {[
          ["wallet", "Wallet"],
          ["pass", "KindredPass"],
          ["premium", "Premium"],
        ].map(([key, label]) => {
          const active = activePlan === key;
          const tabBackground = key === "wallet" ? C.ink : key === "pass" ? "#59359C" : "#F4C542";
          const tabText = key === "premium" ? C.ink : C.paper;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={key}
              onPress={() =>
                setActivePlan(key as "wallet" | "premium" | "pass")
              }
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 18,
                backgroundColor: tabBackground,
                borderWidth: active ? 2 : 0,
                borderColor: active ? C.paper : "transparent",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 4,
                paddingHorizontal: 5,
              }}
            >
              {key === "wallet" ? <Wallet width={15} height={15} color={tabText} /> : key === "premium" ? <Star width={15} height={15} color={tabText} fill="#E7B51E" /> : <BadgeCheck width={15} height={15} color={tabText} />}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  color: tabText,
                  fontSize: 12,
                  fontWeight: "900",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {activePlan === "wallet" ? (
      <View
        style={{
          borderRadius: 24,
          backgroundColor: C.ink,
          padding: 17,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <Wallet width={30} height={30} color={C.paper} />
          <View style={{ flex: 1 }}>
            <Text
              selectable
              style={{ color: C.paper, fontSize: 21, fontWeight: "900" }}
            >
              Wallet
            </Text>
          <Text selectable style={{ color: "#CEC8BE", fontSize: 11 }}>
            Balance <Text style={{ color: balance > 0 ? TECTAVIS_GREEN : "#CEC8BE" }}>{formatMoney(balance)}</Text> · top up from $10
          </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenWallet}
            style={{
              borderRadius: 17,
              backgroundColor: C.paper,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>
              Open
            </Text>
          </Pressable>
        </View>
        <Text
          selectable
          style={{
            color: "#F0EBE3",
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "800",
          }}
        >
          You're in control. Pay as you go and choose exactly which extras matter
          to you.
        </Text>
        <Text
          selectable
          style={{
            color: "#F0EBE3",
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "800",
          }}
        >
          Load. Choose. Connect.
        </Text>
        <Benefit dark label="Super Likes" />
        <Benefit dark label="Photo comments" />
        <Benefit dark label="Ready to Meet" />
        <Benefit dark label="Reveal selected people in Liked You" />
      </View>
      ) : null}
      {activePlan === "premium" ? (
      <View
        style={{
          borderRadius: 24,
          backgroundColor: "#FFF1B8",
          borderWidth: 1,
          borderColor: "#E3C450",
          padding: 17,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}
            >
              Premium
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 11 }}>
              $49.99/month · the complete KindredCube experience
            </Text>
          </View>
          <Star width={30} height={30} color="#B78100" fill="#E7B51E" />
        </View>
        <Benefit label="Ready to Meet area map and Premium chat included" />
        <Benefit label="Save and apply Advanced Filters" />
        <Benefit label="See everyone who liked you" />
        <Benefit label="Send photo comments without individual charges" />
        <Benefit label="More discovery communities and connection tools" />
        <Button compact disabled={premiumActive || Boolean(planBusy)} label={premiumActive ? "Premium active" : planBusy === "premium" ? "Opening secure checkout..." : "Get Premium"} onPress={async () => {
          setPlanBusy("premium");
          setPlanNotices((current) => ({ ...current, premium: "" }));
          try {
            const confirmed = await onPurchasePlan("premium");
            setPlanNotices((current) => ({ ...current, premium: confirmed ? "Premium is active." : "Premium checkout was not completed or is still awaiting Stripe confirmation." }));
          }
          catch (caught) { setPlanNotices((current) => ({ ...current, premium: caught instanceof Error ? caught.message : "Checkout could not be opened." })); }
          finally { setPlanBusy(""); }
        }} />
        {activePlan === "premium" && planNotices.premium ? <Text selectable style={{ color: C.sage, fontSize: 11, fontWeight: "900", textAlign: "center" }}>{planNotices.premium}</Text> : null}
      </View>
      ) : null}
      {activePlan === "pass" ? (
      <View
        style={{
          borderRadius: 24,
          backgroundColor: "#F3EDF9",
          borderWidth: 1,
          borderColor: "#BDA9DF",
          padding: 17,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text
              selectable
              style={{ color: "#59359C", fontSize: 23, fontWeight: "900" }}
            >
              KindredPass
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 11 }}>
              $19.99 · Premium access for one week
            </Text>
          </View>
          <View
            style={{
              borderRadius: 13,
              backgroundColor: "#59359C",
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>
              24 HOURS
            </Text>
          </View>
        </View>
        <Benefit label="All Premium features for 7 days" />
        <Benefit label="Ideal for travel, events, and trying Premium" />
        <Benefit label="Expires automatically with no ongoing subscription" />
        <Button compact disabled={kindredPassActive || Boolean(planBusy)} label={kindredPassActive ? "KindredPass active" : planBusy === "kindred_pass" ? "Opening secure checkout..." : "Get KindredPass"} onPress={async () => {
          setPlanBusy("kindred_pass");
          setPlanNotices((current) => ({ ...current, kindred_pass: "" }));
          try {
            const confirmed = await onPurchasePlan("kindred_pass");
            setPlanNotices((current) => ({ ...current, kindred_pass: confirmed ? "KindredPass is active for 7 days." : "KindredPass checkout was not completed or is still awaiting Stripe confirmation." }));
          }
          catch (caught) { setPlanNotices((current) => ({ ...current, kindred_pass: caught instanceof Error ? caught.message : "Checkout could not be opened." })); }
          finally { setPlanBusy(""); }
        }} />
        {activePlan === "pass" && planNotices.kindred_pass ? <Text selectable style={{ color: "#59359C", fontSize: 11, fontWeight: "900", textAlign: "center" }}>{planNotices.kindred_pass}</Text> : null}
      </View>
      ) : null}
    </ScrollView>
  );
}

function EditableProfileScreen({
  displayName,
  initialProfile,
  onUsernameChange,
  onConnect,
  onSettings,
  onProfilePhotoChange,
  onProfileStrengthChange,
  onInterestsChange,
  onBioChange,
  onSearchingForChange,
  onSaveProfile,
  verificationStatus,
  verificationMethod,
  onVerificationStatusChange,
  onVerificationMethodChange,
}: {
  displayName: string;
  initialProfile: Record<string, unknown>;
  onUsernameChange: (username: string) => Promise<void>;
  onConnect?: () => void;
  onSettings: () => void;
  onProfilePhotoChange: (uri?: string) => void;
  onProfileStrengthChange: (strength: number) => void;
  onInterestsChange: (interests: string[]) => void;
  onBioChange: (bio: string) => void;
  onSearchingForChange: (goals: string[]) => void;
  onSaveProfile: (patch: Record<string, unknown>) => Promise<void>;
  verificationStatus?: IdentityVerificationStatus;
  verificationMethod?: IdentityVerificationMethod;
  onVerificationStatusChange?: (status: IdentityVerificationStatus) => void;
  onVerificationMethodChange?: (method: IdentityVerificationMethod) => void;
}) {
  const initialArray = (key: string) =>
    Array.isArray(initialProfile[key]) ? (initialProfile[key] as string[]) : [];
  const initialObject = <T extends Record<string, unknown>>(key: string) =>
    initialProfile[key] && typeof initialProfile[key] === "object" ?
      (initialProfile[key] as T)
      : ({} as T);
  const [photos, setPhotos] = useState<MemberPhoto[]>(
    Array.isArray(initialProfile.photos) ?
      (initialProfile.photos as MemberPhoto[])
      : [],
  );
  const [bestPhotoId, setBestPhotoId] = useState(
    typeof initialProfile.bestPhotoId === "string" ?
      initialProfile.bestPhotoId
      : "",
  );
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(displayName);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [verificationOptionsOpen, setVerificationOptionsOpen] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [selfieVerificationOpen, setSelfieVerificationOpen] = useState(false);
  const [instagramPickerOpen, setInstagramPickerOpen] = useState(false);
  const [instagramBusy, setInstagramBusy] = useState(false);
  const [instagramMedia, setInstagramMedia] = useState<InstagramMediaItem[]>([]);
  const [selectedInstagramMediaIds, setSelectedInstagramMediaIds] = useState<string[]>([]);
  const stripeIdentityVerified = verificationStatus === "verified" && verificationMethod !== "video_selfie";
  const selfieOnlyVerified = verificationStatus === "verified" && verificationMethod === "video_selfie";
  const [personality, setPersonality] = useState(
    typeof initialProfile.personality === "string" ?
      initialProfile.personality
      : "",
  );
  const [personalityTestOpen, setPersonalityTestOpen] = useState(false);
  const [personalityTestReturnPrompt, setPersonalityTestReturnPrompt] =
    useState(false);
  const [personalityTestAnswers, setPersonalityTestAnswers] = useState<
    string[]
  >([]);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>(
    initialArray("relationshipGoals"),
  );
  const [interests, setInterests] = useState<string[]>(initialArray("interests"));
  const [causes, setCauses] = useState<string[]>(initialArray("causes"));
  const [values, setValues] = useState<string[]>(initialArray("values"));
  const [bio, setBio] = useState(
    typeof initialProfile.bio === "string" ? initialProfile.bio : "",
  );
  const [bioDraft, setBioDraft] = useState(
    typeof initialProfile.bio === "string" ? initialProfile.bio : "",
  );
  const [bioEditing, setBioEditing] = useState(
    !(typeof initialProfile.bio === "string" && initialProfile.bio.trim()),
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const profileSaveInFlightRef = useRef(false);
  const photoUploadInFlightRef = useRef(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [work, setWork] = useState(
    typeof initialProfile.work === "string" ? initialProfile.work : "",
  );
  const [occupation, setOccupation] = useState(
    typeof initialProfile.occupation === "string" ? initialProfile.occupation : "",
  );
  const [hometown, setHometown] = useState(
    typeof initialProfile.hometown === "string" ? initialProfile.hometown : "",
  );
  const [currentLocation, setCurrentLocation] = useState(
    typeof initialProfile.currentLocation === "string" ? initialProfile.currentLocation : "",
  );
  const [matchingLocation, setMatchingLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const saved = initialProfile.matchingLocation;
    if (!saved || typeof saved !== "object") return null;
    const value = saved as Record<string, unknown>;
    return typeof value.latitude === "number" && typeof value.longitude === "number" ?
      { latitude: value.latitude, longitude: value.longitude }
      : null;
  });
  const [currentLocationStatus, setCurrentLocationStatus] = useState<
    "loading" | "ready" | "denied"
  >("loading");
  const [details, setDetails] = useState<Record<string, string>>(
    initialObject<Record<string, string>>("details"),
  );
  const [languages, setLanguages] = useState<string[]>(initialArray("languages"));
  const [selectionEditor, setSelectionEditor] =
    useState<SelectionEditor | null>(null);
  const [draftSelections, setDraftSelections] = useState<string[]>([]);
  const [promptEditor, setPromptEditor] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [promptAnswers, setPromptAnswers] = useState<
    Record<string, { prompt: string; answer: string }>
  >(
    initialObject<Record<string, { prompt: string; answer: string }>>(
      "promptAnswers",
    ),
  );
  const [kindredTypeOpen, setKindredTypeOpen] = useState(false);
  const [kindredTypeStep, setKindredTypeStep] = useState(0);
  const [compatibilityResponses, setCompatibilityResponses] = useState<
    NonNullable<MatchingSignals["compatibilityResponses"]>
  >(
    initialObject<NonNullable<MatchingSignals["compatibilityResponses"]>>(
      "compatibilityResponses",
    ),
  );
  const profileEditorBackAction = useRef<() => void>(() => {});
  profileEditorBackAction.current = selectionEditor ?
    () => setSelectionEditor(null)
    : promptEditor
      ? () => {
          setSelectedPrompt("");
          setPromptAnswer("");
          setPromptEditor("");
        }
      : kindredTypeOpen ?
         () => setKindredTypeOpen(false)
        : onConnect;
  const profileEditorSwipeBack = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 72) profileEditorBackAction.current();
      },
    }),
  ).current;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setCurrentLocationStatus("loading");
        const permission = await requestForegroundLocationOnce();
        if (permission.status !== "granted") {
          if (active) setCurrentLocationStatus("denied");
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const places = await Location.reverseGeocodeAsync(position.coords);
        const place = places[0];
        const parts = [place?.city || place?.subregion, place?.region, place?.country]
          .filter((value, index, values): value is string =>
            Boolean(value) && values.indexOf(value) === index,
          );
        if (active) {
          setCurrentLocation(parts.join(", ") || "Current area detected");
          setMatchingLocation({
            latitude: Math.round(position.coords.latitude * 100) / 100,
            longitude: Math.round(position.coords.longitude * 100) / 100,
          });
          setCurrentLocationStatus("ready");
        }
      } catch {
        if (active) setCurrentLocationStatus("denied");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const openSelection = (
    title: string,
    options: string[],
    current: string[],
    max: number,
    onSave: (items: string[]) => void,
  ) => {
    setDraftSelections(current);
    setSelectionEditor({ title, options, current, max, onSave });
  };
  const toggleDraft = (item: string) => {
    if (!selectionEditor) return;
    if (selectionEditor.max === 1) return setDraftSelections([item]);
    setDraftSelections((current) =>
      current.includes(item) ?
        current.filter((value) => value !== item)
        : current.length < selectionEditor.max ?
          [...current, item]
          : current,
    );
  };
  const uploadPhoto = async () => {
    if (photoUploadInFlightRef.current) return;
    const remainingSlots = Math.max(0, 9 - photos.length);
    if (!remainingSlots) return;
    photoUploadInFlightRef.current = true;
    setPhotoUploadBusy(true);
    setVerificationNotice("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setVerificationNotice("Photo library permission is required to upload profile pictures.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.45,
        base64: true,
      });
      if (result.canceled || !result.assets.length) return;
      const pickedAssets = result.assets.slice(0, remainingSlots);
      const pendingPhotos: MemberPhoto[] = pickedAssets.map((asset, index) => ({
        id: `pending-photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        uri: asset.uri,
        source: "phone",
      }));
      setPhotos((current) => {
        const next = [...current, ...pendingPhotos];
        if (!current.length && next[0]) {
          setBestPhotoId(next[0].id);
        }
        return next;
      });
      const uploadedPhotoIds: string[] = [];
      for (const [index, asset] of pickedAssets.entries()) {
        const pendingPhoto = pendingPhotos[index];
        const imageBase64 = await getPickerAssetBase64(asset);
        if (!imageBase64) {
          setVerificationNotice("One or more photos could not be read. Please try a different photo.");
          continue;
        }
        const sizeBytes = getPickerAssetSize(asset) || estimateBase64SizeBytes(imageBase64);
        if (sizeBytes <= 0 || sizeBytes > 8 * 1024 * 1024) {
          setVerificationNotice("One or more photos were skipped. Profile photos must be 8 MB or less.");
          continue;
        }
        const mimeType =
          asset.mimeType === "image/png" || asset.mimeType === "image/webp" || asset.mimeType === "image/jpeg" ?
            asset.mimeType
            : "image/jpeg";
        try {
          setVerificationNotice(`Uploading photo ${index + 1} of ${pickedAssets.length}…`);
          const uploaded = await uploadProfilePhoto({
            imageBase64,
            mimeType,
            sizeBytes,
          });
          const uploadedUri = resolveServerMediaUri(uploaded.path || uploaded.uri || "");
          if (!uploaded.id || !uploadedUri || isLocalOnlyProfilePhoto({ id: uploaded.id, uri: uploadedUri })) {
            throw new Error("The server did not return a saved profile photo. Please try again.");
          }
          const uploadedPhoto: MemberPhoto = {
            id: uploaded.id,
            uri: uploadedUri,
            source: "phone",
          };
          uploadedPhotoIds.push(uploadedPhoto.id);
          setPhotos((current) => {
            const replaced = current.map((photo) => (photo.id === pendingPhoto.id ? uploadedPhoto : photo));
            setBestPhotoId((currentBestPhotoId) => currentBestPhotoId === pendingPhoto.id ? uploadedPhoto.id : currentBestPhotoId);
            return replaced;
          });
        } catch (caught) {
          const status = typeof caught === "object" && caught && "status" in caught ? Number((caught as { status?: unknown }).status) : 0;
          const detail = status ? ` Server code: ${status}.` : "";
          setVerificationNotice(
            caught instanceof Error
              ? `${caught.message}${detail} The photo is still shown locally, but it is not saved to your account yet.`
              : "Photo upload failed. The photo is still shown locally, but it is not saved to your account yet.",
          );
        }
      }
      if (!uploadedPhotoIds.length) {
        setVerificationNotice("The selected photo is visible locally, but the cloud upload did not finish. Please check the server upload settings and try again.");
        return;
      }
      setVerificationNotice(
        uploadedPhotoIds.length === 1
          ? "Photo uploaded. Tap Save to keep this profile change."
          : `${uploadedPhotoIds.length} photos uploaded. Tap Save to keep these profile changes.`,
      );
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoUploadBusy(false);
    }
  };
  const loadInstagramPhotos = async () => {
    const result = await getInstagramPhotos();
    setInstagramMedia(result.media || []);
    setSelectedInstagramMediaIds([]);
    setInstagramPickerOpen(true);
    if (!result.media?.length) {
      setVerificationNotice("Instagram connected, but no photos were available to import.");
    }
  };
  const importInstagramPhotos = async () => {
    if (instagramBusy) return;
    setVerificationNotice("");
    setInstagramBusy(true);
    try {
      try {
        await loadInstagramPhotos();
        return;
      } catch {
        // Not connected yet. Continue through Instagram authorization.
      }
      const session = await startInstagramPhotoImport();
      const result = await openKindredInAppSession(session.authUrl, session.returnUrl || "kindredcube://instagram-connected");
      if (result.type === "cancel" || result.type === "dismiss") {
        setVerificationNotice("Instagram connection was cancelled.");
        return;
      }
      await loadInstagramPhotos();
    } catch (caught) {
      setVerificationNotice(caught instanceof Error ? caught.message : "Instagram photos could not be loaded. Please try again.");
    } finally {
      setInstagramBusy(false);
    }
  };
  const toggleInstagramMedia = (id: string) => {
    setSelectedInstagramMediaIds((current) =>
      current.includes(id) ?
        current.filter((value) => value !== id)
        : current.length < Math.max(0, 9 - photos.length) ?
          [...current, id]
          : current,
    );
  };
  const importSelectedInstagramPhotos = async () => {
    if (instagramBusy || !selectedInstagramMediaIds.length) return;
    setInstagramBusy(true);
    setVerificationNotice("");
    try {
      const result = await importInstagramProfilePhotos(selectedInstagramMediaIds);
      const importedPhotos: MemberPhoto[] = (result.photos || []).map((photo) => ({
        id: photo.id,
        uri: resolveServerMediaUri(photo.path || photo.uri),
        source: "instagram",
      }));
      if (!importedPhotos.length) {
        setVerificationNotice("No Instagram photos were imported. Please choose different photos.");
        return;
      }
      setPhotos((current) => {
        const next = [...current, ...importedPhotos].slice(0, 9);
        if (!current.length && next[0]) setBestPhotoId(next[0].id);
        return next;
      });
      setInstagramPickerOpen(false);
      setSelectedInstagramMediaIds([]);
      setVerificationNotice(`${importedPhotos.length} Instagram photo${importedPhotos.length === 1 ? "" : "s"} added. Remember to save your profile.`);
    } catch (caught) {
      setVerificationNotice(caught instanceof Error ? caught.message : "Instagram photos could not be imported. Please try again.");
    } finally {
      setInstagramBusy(false);
    }
  };
  const chooseBest = (photo: MemberPhoto) => {
    setPhotos((current) => [photo, ...current.filter((item) => item.id !== photo.id)]);
    setBestPhotoId(photo.id);
  };
  const movePhoto = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= photos.length) return;
    const reordered = [...photos];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    const first = reordered[0];
    setPhotos(reordered);
    setBestPhotoId(first?.id || "");
  };
  const deletePhoto = (photo: MemberPhoto) => {
    const remaining = photos.filter((item) => item.id !== photo.id);
    setPhotos(remaining);
    if (bestPhotoId === photo.id) {
      const next = remaining[0];
      setBestPhotoId(next?.id || "");
    }
  };
  useEffect(() => {
    const first = photos[0];
    if (!first || bestPhotoId === first.id) return;
    setBestPhotoId(first.id);
  }, [photos, bestPhotoId]);
  const startVideoSelfieVerificationFromProfile = () => {
    setVerificationNotice("");
    setSelfieVerificationOpen(true);
  };
  const submitProfileVideoSelfieVerification = async (input: {
    videoBase64: string;
    mimeType: "video/mp4" | "video/quicktime" | "video/mov";
    sizeBytes: number;
    faceImageBase64: string;
    faceImageMimeType: "image/jpeg";
  }) => {
    setVerificationBusy(true);
    setVerificationNotice("");
    try {
      const saved = await submitVideoSelfieVerification({
        videoBase64: input.videoBase64,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        consentAccepted: true,
        faceImageBase64: input.faceImageBase64,
        faceImageMimeType: input.faceImageMimeType,
      });
      onVerificationStatusChange?.(saved.status);
      onVerificationMethodChange?.(saved.verificationMethod || "video_selfie");
      setVerificationNotice(selfieVerificationNotice(saved.status, saved.reasonCode || ""));
      if (saved.status === "verified") setSelfieVerificationOpen(false);
    } catch (caught) {
      setVerificationNotice(caught instanceof Error ? caught.message : "Video selfie verification could not be completed.");
    } finally {
      setVerificationBusy(false);
    }
  };
  const validPromptCount = Object.values(promptAnswers).filter((entry) =>
    entry &&
    typeof entry.prompt === "string" &&
    entry.prompt.trim().length > 0 &&
    typeof entry.answer === "string" &&
    entry.answer.trim().length >= 3,
  ).length;
  const savedPhotoPrompts = Object.values(promptAnswers)
    .filter((entry) =>
      entry &&
      typeof entry.prompt === "string" &&
      entry.prompt.trim().length > 0 &&
      typeof entry.answer === "string" &&
      entry.answer.trim().length >= 3,
    )
    .map((entry) => ({
      prompt: entry.prompt.trim() || "",
      answer: entry.answer.trim() || "",
    }));
  const orderedPhotoEntries = photos
    .map((photo, originalIndex) => ({ photo, originalIndex }))
    .sort((left, right) => {
      const leftBest = left.photo.id === bestPhotoId;
      const rightBest = right.photo.id === bestPhotoId;
      if (leftBest && !rightBest) return -1;
      if (!leftBest && rightBest) return 1;
      return left.originalIndex - right.originalIndex;
    });
  const kindredTypeAnswerCount = kindredTypeQuestions.filter((question) =>
    typeof compatibilityResponses[question.key]?.value === "number",
  ).length;
  const completionItems = [
    Boolean(personality),
    kindredTypeAnswerCount === kindredTypeQuestions.length,
    relationshipGoals.length > 0,
    interests.length > 0,
    causes.length > 0,
    values.length > 0,
    Boolean(bio),
    Boolean(work),
    Boolean(occupation),
    Boolean(hometown),
    Object.keys(details).length >= 4,
    languages.length > 0,
  ];
  const profileStrength = calculateProfileStrengthValue({
    photos,
    personality,
    relationshipGoals,
    interests,
    causes,
    values,
    bio,
    work,
    occupation,
    hometown,
    details,
    languages,
    promptAnswers,
    compatibilityResponses,
  }, verificationStatus || "not_started", verificationMethod || "");
  const tagList = (items: string[], empty: string) =>
    items.length ? (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {items.map((item) => (
          <View
            key={item}
            style={{
              borderRadius: 16,
              backgroundColor: "#F3EDF9",
              paddingHorizontal: 11,
              paddingVertical: 7,
            }}
          >
            <Text
              selectable
              style={{ color: "#59359C", fontSize: 12, fontWeight: "800" }}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>
    ) : (
      <Text selectable style={{ color: C.muted, fontSize: 13 }}>
        {empty}
      </Text>
    );

  if (personalityTestReturnPrompt)
    return (
      <ScrollView
        {...profileEditorSwipeBack.panHandlers}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingBottom: 30,
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Logo size="compact" />
        <View
          style={{
            borderRadius: 27,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 22,
            gap: 14,
          }}
        >
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: 31,
              backgroundColor: "#F3EDF9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Target width={29} height={29} color="#59359C" />
          </View>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 29,
              fontWeight: "900",
            }}
          >
            Finished your personality test?
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}
          >
            If you have your four-letter result, tap Done and select it. You can
            also return later without losing your profile progress.
          </Text>
          <Button
            label="Done"
            onPress={() => {
              setPersonalityTestReturnPrompt(false);
              openSelection(
                "Personality type",
                personalityTypes,
                personality ? [personality] : [],
                1,
                (items) => setPersonality(items[0]),
              );
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setPersonalityTestReturnPrompt(false)}
            style={{
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
              Later
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );

  if (personalityTestOpen)
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 16,
        }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          onPress={() => setPersonalityTestOpen(false)}
          style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "900" }}>Profile</Text>
        </Pressable>
        <View style={{ gap: 5 }}>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 31,
              fontWeight: "900",
            }}
          >
            Personality type check
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}
          >
            A short Myers-Briggs-style guide. Personality type contributes to
            more effective matching and connection.
          </Text>
        </View>
        {personalityTestQuestions.map((question, index) => (
          <View
            key={question.prompt}
            style={{
              borderRadius: 20,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 15,
              gap: 10,
            }}
          >
            <Text
              selectable
              style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}
            >
              {question.prompt}
            </Text>
            {[question.left, question.right].map(([label, letter]) => {
              const selected = personalityTestAnswers[index] === letter;
              return (
                <Pressable
                  key={letter}
                  onPress={() =>
                    setPersonalityTestAnswers((current) => {
                      const next = [...current];
                      next[index] = letter;
                      return next;
                    })
                  }
                  style={{
                    minHeight: 44,
                    borderRadius: 15,
                    borderWidth: 1.5,
                    borderColor: selected ? C.pink : C.line,
                    backgroundColor: selected ? "#FCE5EE" : C.paper,
                    paddingHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? "#A5164D" : C.ink,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {label}
                  </Text>
                  {selected ? (
                    <Check
                      width={17}
                      height={17}
                      color={C.pink}
                      strokeWidth={3}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Button
          label="Save my personality type"
          disabled={personalityTestAnswers.filter(Boolean).length < 4}
          onPress={() => {
            setPersonality(personalityTestAnswers.join(""));
            setPersonalityTestOpen(false);
          }}
        />
      </ScrollView>
    );

  if (kindredTypeOpen) {
    const currentQuestion = kindredTypeQuestions[Math.min(kindredTypeStep, kindredTypeQuestions.length - 1)]!;
    const selectedValue = compatibilityResponses[currentQuestion.key]?.value;
    const isLastKindredTypeStep = kindredTypeStep >= kindredTypeQuestions.length - 1;
    const goBackKindredStep = () => {
      if (kindredTypeStep > 0) setKindredTypeStep((step) => Math.max(0, step - 1));
      else setKindredTypeOpen(false);
    };
    return (
      <ScrollView
        {...profileEditorSwipeBack.panHandlers}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 16,
          justifyContent: "center",
        }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          onPress={goBackKindredStep}
          style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "900" }}>
            {kindredTypeStep > 0 ? "Previous" : "Profile"}
          </Text>
        </Pressable>
        <View style={{ gap: 5 }}>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 32,
              fontWeight: "900",
            }}
          >
            Kindred Type
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
            Choose what feels most true to you.
          </Text>
        </View>
        <View
          style={{
            borderRadius: 24,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 18,
            gap: 13,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 26, fontWeight: "900", flex: 1 }}>
              {currentQuestion.title}
            </Text>
            <View style={{ borderRadius: 999, backgroundColor: "#FCE5EE", paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text selectable style={{ color: "#A5164D", fontSize: 11, fontWeight: "900" }}>
                {currentQuestion.weight}
              </Text>
            </View>
          </View>
          <Text selectable style={{ color: C.ink, fontSize: 20, lineHeight: 29, fontWeight: "900" }}>
            {currentQuestion.statement}
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
            Pick the answer that feels most true to you. Your individual response stays private.
          </Text>
          <View style={{ gap: 8 }}>
            {kindredTypeAnswerOptions.map((option) => {
              const selected = selectedValue === option.value;
              return (
                <Pressable
                  key={`${currentQuestion.key}-${option.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() =>
                    setCompatibilityResponses((current) => ({
                      ...current,
                      [currentQuestion.key]: {
                        category: currentQuestion.category,
                        value: option.value,
                      },
                    }))
                  }
                  style={{
                    minHeight: 48,
                    borderRadius: 17,
                    borderWidth: 1.5,
                    borderColor: selected ? C.pink : C.line,
                    backgroundColor: selected ? "#FCE5EE" : C.paper,
                    paddingHorizontal: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? "#A5164D" : C.ink,
                      fontSize: 14,
                      fontWeight: selected ? "900" : "700",
                    }}
                  >
                    {option.label}
                  </Text>
                  {selected ? <Check width={17} height={17} color={C.pink} strokeWidth={3} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        <Button
          label={isLastKindredTypeStep ? "Save Kindred Type" : "Next"}
                  disabled={typeof selectedValue !== "number"}
          onPress={() => {
            if (isLastKindredTypeStep) setKindredTypeOpen(false);
            else setKindredTypeStep((step) => Math.min(kindredTypeQuestions.length - 1, step + 1));
          }}
        />
        <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }}>
          Your answers stay private. You can edit them anytime.
        </Text>
      </ScrollView>
    );
  }

  if (selectionEditor)
    return (
      <ScrollView
        {...profileEditorSwipeBack.panHandlers}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 16,
        }}
      >
        <Logo size="compact" />
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectionEditor(null)}
          style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
          <Text style={{ color: C.ink, fontWeight: "900" }}>Profile</Text>
        </Pressable>
        <View style={{ gap: 5 }}>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 32,
              fontWeight: "900",
            }}
          >
            {selectionEditor.title}
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 13 }}>
            {selectionEditor.max === 1 ?
              "Choose one option."
              : `Choose up to ${selectionEditor.max}. ${draftSelections.length} selected.`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 9, rowGap: 16, paddingBottom: 10 }}>
          {selectionEditor.options.map((item) => {
            const selected = draftSelections.includes(item);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                key={item}
                onPress={() => toggleDraft(item)}
                style={{
                  minHeight: 44,
                  maxWidth: "100%",
                  borderRadius: 22,
                  borderWidth: 1.5,
                  borderColor: selected ? C.pink : C.line,
                  backgroundColor: selected ? "#FCE5EE" : C.paper,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Text
                  style={{
                    color: selected ? "#A5164D" : C.ink,
                    fontSize: 13,
                    fontWeight: selected ? "900" : "700",
                  }}
                >
                  {item}
                </Text>
                {selected ? (
                  <Check
                    width={16}
                    height={16}
                    color={C.pink}
                    strokeWidth={3}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Button
          label="Save choices"
          disabled={!draftSelections.length}
          onPress={() => {
            selectionEditor.onSave(draftSelections);
            setSelectionEditor(null);
          }}
        />
      </ScrollView>
    );

  if (promptEditor) {
    const prompts = profilePrompts[promptEditor];
    return (
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          {...profileEditorSwipeBack.panHandlers}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 30,
            gap: 15,
          }}
        >
          <Logo size="compact" />
          <Pressable
            accessibilityRole="button"
            onPress={() => setPromptEditor("")}
            style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
            <Text style={{ color: C.ink, fontWeight: "900" }}>Profile</Text>
          </Pressable>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 32,
              fontWeight: "900",
            }}
          >
            {promptEditor}
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 13 }}>
            Pick a prompt, then answer in your own words.
          </Text>
          {!selectedPrompt ? (
            <View style={{ gap: 8 }}>
              {prompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => setSelectedPrompt(prompt)}
                  style={{
                    minHeight: 48,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: C.line,
                    backgroundColor: C.paper,
                    paddingHorizontal: 14,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: C.ink, fontSize: 13, fontWeight: "700" }}>
                    {prompt}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  minHeight: 52,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: C.pink,
                  backgroundColor: "#FCE5EE",
                  paddingHorizontal: 14,
                  justifyContent: "center",
                }}
              >
                <Text selectable style={{ color: "#A5164D", fontSize: 13, fontWeight: "900" }}>
                  {selectedPrompt}
                </Text>
              </View>
              <TextInput
                autoFocus
                multiline
                value={promptAnswer}
                onChangeText={setPromptAnswer}
                placeholder="Write your answer..."
                placeholderTextColor="#948A7F"
                style={{
                  minHeight: 120,
                  textAlignVertical: "top",
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: C.paper,
                  borderRadius: 18,
                  padding: 15,
                  color: C.ink,
                  fontSize: 15,
                  lineHeight: 21,
                }}
              />
              <Button
                label="Save answer"
                disabled={promptAnswer.trim().length < 3}
                onPress={() => {
                  const nextPromptAnswers = {
                    ...promptAnswers,
                    [promptEditor]: {
                      prompt: selectedPrompt,
                      answer: promptAnswer.trim(),
                    },
                  };
                  setPromptAnswers(nextPromptAnswers);
                  setPromptEditor("");
                  setSelectedPrompt("");
                  setPromptAnswer("");
                }}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelectedPrompt("");
                  setPromptAnswer("");
                }}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                  Cancel and choose another prompt
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <>
      <Modal
        visible={selfieVerificationOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelfieVerificationOpen(false)}
      >
        {selfieVerificationOpen ? (
          <ReadyMeetVerificationScreen
            mode="profile"
            busy={verificationBusy ? "selfie" : ""}
            notice={verificationNotice}
            onClose={() => setSelfieVerificationOpen(false)}
            onSubmitSelfie={submitProfileVideoSelfieVerification}
            showStripe={false}
          />
        ) : null}
      </Modal>
      <Modal
        visible={instagramPickerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setInstagramPickerOpen(false)}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 34, gap: 16 }}
          style={{ flex: 1, backgroundColor: C.cream }}
        >
          <Logo size="compact" />
          <Pressable
            accessibilityRole="button"
            onPress={() => setInstagramPickerOpen(false)}
            style={{ alignSelf: "flex-start", paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <ChevronLeft width={18} height={18} color={C.ink} strokeWidth={3} />
            <Text style={{ color: C.ink, fontWeight: "900" }}>Profile</Text>
          </Pressable>
          <View style={{ borderRadius: 26, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 18, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Image source={INSTAGRAM_ICON} resizeMode="contain" style={{ width: 38, height: 38 }} />
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>
                  Add photos from Instagram
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
                  Choose photos you want to show on KindredCube. Selected photos are copied securely so they show on every device.
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
              {instagramMedia.map((item) => {
                const selected = selectedInstagramMediaIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleInstagramMedia(item.id)}
                    style={{
                      width: "31%",
                      aspectRatio: 0.82,
                      borderRadius: 15,
                      overflow: "hidden",
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? C.pink : C.line,
                      backgroundColor: "#F3EFE8",
                    }}
                  >
                    <Image source={{ uri: item.thumbnailUrl || item.mediaUrl }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
                    <View style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: selected ? C.pink : "rgba(255,255,255,0.86)", alignItems: "center", justifyContent: "center" }}>
                      {selected ? <Check width={15} height={15} color={C.paper} strokeWidth={3} /> : <Image source={INSTAGRAM_ICON} resizeMode="contain" style={{ width: 16, height: 16 }} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {!instagramMedia.length ? (
              <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19, textAlign: "center", paddingVertical: 18 }}>
                No Instagram photos are available yet. Make sure Instagram access was approved, then try again.
              </Text>
            ) : null}
            <Button
              label={instagramBusy ? "Importing..." : `Import ${selectedInstagramMediaIds.length || ""} photo${selectedInstagramMediaIds.length === 1 ? "" : "s"}`.trim()}
              disabled={instagramBusy || !selectedInstagramMediaIds.length}
              onPress={importSelectedInstagramPhotos}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setInstagramPickerOpen(false)}
              style={{ minHeight: 42, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Modal>
      <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentOffset={{ x: 0, y: profileScrollOffset }}
      onScroll={(event) => {
        profileScrollOffset = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 36,
        gap: 14,
      }}
    >
      <Logo size="compact" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            overflow: "hidden",
            borderWidth: 3,
            borderColor: C.paper,
          }}
        >
          {photos.length ? (
            <MemberPhotoView
              photo={
                photos.find((photo) => photo.id === bestPhotoId) || photos[0]!
              }
              size={76}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add your first profile photo"
              onPress={uploadPhoto}
              style={{
                width: 76,
                height: 76,
                backgroundColor: "#EFEAE1",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera width={29} height={29} color={C.muted} />
            </Pressable>
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 29,
                fontWeight: "900",
                flexShrink: 1,
              }}
            >
              {displayName}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit username"
              onPress={() => {
                setUsernameDraft(displayName);
                setUsernameError("");
                setEditingUsername(true);
              }}
              style={{ paddingHorizontal: 5, paddingVertical: 7 }}
            >
              <Text style={{ color: C.pink, fontSize: 11, fontWeight: "900" }}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={onSettings}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: C.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings width={21} height={21} color={C.ink} />
            </Pressable>
          </View>
          <Text
            selectable
            style={{ color: C.clay, fontSize: 14, fontWeight: "900" }}
          >
            Complete profile
          </Text>
          <Text selectable style={{ color: stripeIdentityVerified || selfieOnlyVerified ? C.sage : C.muted, fontSize: 11, fontWeight: stripeIdentityVerified || selfieOnlyVerified ? "900" : "400" }}>
            {stripeIdentityVerified
              ? "Verified securely by Stripe"
              : selfieOnlyVerified
                ? "Selfie Verified — ID verification still available"
              : verificationStatus === "processing" ?
                "Verification is processing"
                : "Verification not completed"}
          </Text>
        </View>
      </View>
      {editingUsername ? (
        <View
          style={{
            borderRadius: 18,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 14,
            gap: 10,
          }}
        >
          <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
            Edit username
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            value={usernameDraft}
            onChangeText={setUsernameDraft}
            maxLength={24}
            placeholder="Public username"
            placeholderTextColor="#948A7F"
            style={{
              minHeight: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: C.line,
              paddingHorizontal: 13,
              color: C.ink,
              fontSize: 15,
            }}
          />
          {usernameError ? (
            <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 12 }}>
              {usernameError}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 9 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditingUsername(false)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: C.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: C.ink, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                usernameSaving ||
                !/^[A-Za-z0-9_]{3,24}$/.test(usernameDraft.trim())
              }
              onPress={async () => {
                setUsernameSaving(true);
                setUsernameError("");
                try {
                  await onUsernameChange(usernameDraft.trim());
                  setEditingUsername(false);
                } catch (caught) {
                  setUsernameError(
                    caught instanceof Error ?
                      caught.message
                      : "The username could not be updated.",
                  );
                } finally {
                  setUsernameSaving(false);
                }
              }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 22,
                backgroundColor: C.ink,
                alignItems: "center",
                justifyContent: "center",
                opacity: usernameSaving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: C.paper, fontWeight: "900" }}>
                {usernameSaving ? "Saving..." : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View
        style={{
          borderRadius: 20,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 9,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text selectable style={{ color: C.ink, fontWeight: "900" }}>
            Profile strength
          </Text>
          <Text
            selectable
            style={{
              color: C.sage,
              fontWeight: "900",
              fontVariant: ["tabular-nums"],
            }}
          >
            {profileStrength}% complete
          </Text>
        </View>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: C.line,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${profileStrength}%`,
              height: "100%",
              backgroundColor: C.pink,
            }}
          />
        </View>
      </View>
      <ProfileSection
        title="Verification"
        subtitle="Selfie verification adds trust. Stripe ID verification completes profile verification."
      >
        <View style={{ gap: 9 }}>
          <Button
            compact
            label={stripeIdentityVerified ? "Verification complete" : verificationOptionsOpen ? "Hide verification details" : selfieOnlyVerified ? "Complete ID verification" : "Get Verified"}
            disabled={stripeIdentityVerified}
            onPress={() => {
              setVerificationOptionsOpen((value) => !value);
              setVerificationNotice("");
            }}
          />
          {verificationOptionsOpen ? <>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, padding: 14, flexDirection: "row", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FCE5EE", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck width={23} height={23} color={C.pink} />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>Verification by Stripe</Text>
                <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
                  Stripe securely checks a government-issued ID and matching live selfie. KindredCube never receives or stores the ID, selfie, document number, or extracted identification details.
                </Text>
                <Text selectable style={{ color: C.sage, fontSize: 10, lineHeight: 15, fontWeight: "800" }}>
                  KindredCube stores only Stripe's verification reference, status, and completion time.
                </Text>
              </View>
            </View>
            <Button
              compact
              label={verificationBusy ? "Opening Stripe..." : verificationStatus === "requires_input" ? "Continue ID verification" : verificationStatus === "processing" ? "Check ID verification status" : selfieOnlyVerified ? "Verify ID with Stripe" : "Start ID verification"}
              disabled={verificationBusy}
              onPress={async () => {
                setVerificationBusy(true);
                setVerificationNotice("");
                try {
                  if (verificationStatus !== "processing") {
                    const session = await startIdentityVerification();
                    onVerificationStatusChange(session.status);
                    onVerificationMethodChange(session.verificationMethod || "stripe_identity");
                    if (session.url) await openKindredInAppSession(session.url, "kindredcube://verification-complete");
                  }
                  const result = await getIdentityVerificationStatus();
                  onVerificationStatusChange(result.status);
                  onVerificationMethodChange(result.verificationMethod || "stripe_identity");
                  setVerificationNotice(
                    result.status === "verified" ?
                      "Verification complete. Your verified badge is now active."
                      : result.status === "processing" ?
                        "Verification pending. Stripe is processing your verification. Check again shortly."
                        : "Verification pending. Stripe has received your verification steps. Check again shortly.",
                  );
                } catch (caught) {
                  setVerificationNotice(caught instanceof Error ? caught.message : "Verification could not be started.");
                } finally {
                  setVerificationBusy(false);
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              disabled={verificationBusy}
              onPress={startVideoSelfieVerificationFromProfile}
              style={{ minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
            >
              <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900", textAlign: "center" }}>
                Selfie Verification
              </Text>
            </Pressable>
            <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
              Selfie verification uses the in-app camera and Amazon Rekognition safety checks. By submitting, you consent to secure encrypted storage for fraud prevention, accountability, and Trust & Safety review.
            </Text>
          {verificationNotice ? (
            <View
              accessibilityRole="alert"
              style={{
                borderRadius: 16,
                backgroundColor: "#FFF5D5",
                borderWidth: 1,
                borderColor: "#E5C658",
                padding: 13,
                gap: 7,
              }}
            >
              <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>
                {verificationNotice}
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                Identification is handled and retained by Stripe according to Stripe's Identity terms and your configured retention settings.
              </Text>
            </View>
          ) : null}
          </> : null}
        </View>
      </ProfileSection>

      <ProfileSection
        title="Photos"
        subtitle="Add more photos for a stronger, more trusted profile."
        onAdd={photoUploadBusy ? undefined : uploadPhoto}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload photos"
            disabled={photoUploadBusy}
            onPress={uploadPhoto}
            style={{
              width: "31%",
              aspectRatio: 0.82,
              marginBottom: 8,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: "#E7D4EE",
              backgroundColor: photoUploadBusy ? "#F3EDF9" : "#FFF7FF",
              opacity: photoUploadBusy ? 0.72 : 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 8,
            }}
          >
            <Image source={PROFILE_UPLOAD_CAMERA_ICON} resizeMode="contain" style={{ width: 46, height: 46 }} />
            <Text style={{ color: "#7E2B8F", fontSize: 10.5, fontWeight: "900", textAlign: "center" }}>
              {photoUploadBusy ? "Uploading..." : "Upload photos"}
            </Text>
          </Pressable>
          {orderedPhotoEntries.map(({ photo, originalIndex }, displayIndex) => {
            const best = photo.id === bestPhotoId;
            const canDelete = true;
            const savedPrompt = !best && savedPhotoPrompts.length ?
               savedPhotoPrompts[Math.max(0, displayIndex - 1)]
              : null;
            return (
              <View
                key={photo.id}
                style={{
                  width: "31%",
                  aspectRatio: 0.82,
                  marginBottom: 8,
                  borderRadius: 15,
                  overflow: "hidden",
                  borderWidth: best ? 3 : 1,
                  borderColor: best ? "#E3AE18" : C.line,
                }}
              >
                <MemberPhotoView photo={photo} size={130} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    best ? "Best profile photo" : "Set as best photo"
                  }
                  onPress={() => chooseBest(photo)}
                  style={{
                    position: "absolute",
                    right: 6,
                    top: 6,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: best ? "#FFF1A9" : "rgba(255,255,255,0.9)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Star
                    width={16}
                    height={16}
                    color={best ? "#C98B00" : C.muted}
                    fill={best ? "#E7B51E" : "transparent"}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete photo"
                  disabled={!canDelete}
                  onPress={() => deletePhoto(photo)}
                  style={{
                    position: "absolute",
                    left: 6,
                    top: 6,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: canDelete ?
                      "rgba(34,31,27,0.72)"
                      : "rgba(34,31,27,0.28)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X width={15} height={15} color={C.paper} strokeWidth={3} />
                </Pressable>
                {savedPrompt ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 6,
                      right: 6,
                      bottom: 38,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.55)",
                      backgroundColor: "rgba(255,255,255,0.42)",
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: "#FFFFFF",
                        fontSize: 7.5,
                        lineHeight: 10,
                        fontWeight: "900",
                        textShadowColor: "rgba(0,0,0,0.55)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {savedPrompt?.prompt || ""}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: "#FFFFFF",
                        fontSize: 8.5,
                        lineHeight: 11,
                        fontWeight: "800",
                        textShadowColor: "rgba(0,0,0,0.65)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {savedPrompt?.answer || ""}
                    </Text>
                  </View>
                ) : null}
                {best ? (
                  <Text
                    style={{
                      position: "absolute",
                      left: 6,
                      bottom: 6,
                      color: C.ink,
                      backgroundColor: "#FFF1A9",
                      borderRadius: 10,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      fontSize: 9,
                      fontWeight: "900",
                    }}
                  >
                    BEST
                  </Text>
                ) : null}
                <View style={{ position: "absolute", right: 6, bottom: 6, flexDirection: "row", gap: 5 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Move photo earlier" disabled={originalIndex === 0} onPress={() => movePhoto(originalIndex, -1)} style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: originalIndex === 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" }}>
                    <ChevronLeft width={16} height={16} color={C.ink} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Move photo later" disabled={originalIndex === photos.length - 1} onPress={() => movePhoto(originalIndex, 1)} style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: originalIndex === photos.length - 1 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" }}>
                    <ChevronRight width={16} height={16} color={C.ink} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
        <Text
          selectable
          style={{ color: photos.length <= 3 ? C.muted : C.sage, fontSize: 11, lineHeight: 16, paddingTop: 4 }}
        >
          {photos.length === 3 ?
             "Add another photo before deleting—three are required."
            : photos.length < 3 ?
              `${photos.length} of 3 required photos added.`
              : `${photos.length} photos · tap X to remove or ★ to choose your best.`}
        </Text>
      </ProfileSection>
      <ProfileSection
        title="Bio"
        subtitle="Write anything that helps someone know the real you."
      >
        {bioEditing ? <><TextInput
          multiline
          value={bioDraft}
          onChangeText={setBioDraft}
          placeholder="Tell people about yourself..."
          placeholderTextColor="#948A7F"
          style={{
            minHeight: 110,
            textAlignVertical: "top",
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 16,
            padding: 13,
            color: C.ink,
            fontSize: 14,
            lineHeight: 20,
          }}
        />
        <Button
          compact
          label="Save bio"
          disabled={!bioDraft.trim()}
          onPress={() => {
          const saved = bioDraft.trim();
          setBio(saved);
          setBioEditing(false);
        }}
        />
        {bio ? <Pressable accessibilityRole="button" onPress={() => { setBioDraft(bio); setBioEditing(false); }} style={{ alignItems: "center", padding: 5 }}><Text style={{ color: C.muted, fontWeight: "800" }}>Cancel</Text></Pressable> : null}</> : bio ? (
          <View
            style={{
              borderRadius: 16,
              backgroundColor: "#F3EFE8",
              padding: 13,
              gap: 5,
            }}
          >
            <Text
              selectable
              style={{ color: C.sage, fontSize: 10, fontWeight: "900" }}
            >
              SAVED BIO
            </Text>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 14, lineHeight: 20 }}
            >
              {bio}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => { setBioDraft(bio); setBioEditing(true); }} style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
              <Text style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}>Edit bio</Text>
            </Pressable>
          </View>
        ) : <Button compact label="Add bio" onPress={() => setBioEditing(true)} />}
      </ProfileSection>

      <ProfileSection
        title="Kindred Type"
        subtitle="Respond to private values statements that help KindredCube find deeper compatibility."
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17, flex: 1 }}>
            {kindredTypeAnswerCount === kindredTypeQuestions.length ?
               `${kindredTypeAnswerCount} of ${kindredTypeQuestions.length} answered`
              : kindredTypeAnswerCount ?
                 "In progress"
                : "Not started"}
          </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const firstUnanswered = kindredTypeQuestions.findIndex(
                  (question) => typeof compatibilityResponses[question.key]?.value !== "number",
                );
                setKindredTypeStep(firstUnanswered >= 0 ? firstUnanswered : 0);
                setKindredTypeOpen(true);
              }}
              style={{
                minHeight: 42,
                borderRadius: 21,
                backgroundColor: C.ink,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>
                {kindredTypeAnswerCount ? "Edit" : "Start"}
              </Text>
            </Pressable>
        </View>
      </ProfileSection>

      <ProfileSection
        title="Personality type"
        subtitle="Personality type contributes to more effective matching and connection."
        onAdd={() =>
          openSelection(
            "Personality type",
            personalityTypes,
            personality ? [personality] : [],
            1,
            (items) => setPersonality(items[0]),
          )
        }
      >
        {personality ? (
          tagList([personality], "")
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await WebBrowser.openBrowserAsync(
              "https://www.16personalities.com/free-personality-test",
              {
                presentationStyle:
                  WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                controlsColor: C.pink,
              },
            );
            setPersonalityTestReturnPrompt(true);
          }}
          style={{
            minHeight: 42,
            borderRadius: 21,
            borderWidth: 1,
            borderColor: "#A894D4",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: "#59359C", fontSize: 12, fontWeight: "900" }}>
            I don't know — take the personality test
          </Text>
        </Pressable>
      </ProfileSection>
      <ProfileSection
        title="Searching for"
        subtitle="Tell matches what kind of relationship you want."
        onAdd={() =>
          openSelection(
            "Searching for",
            relationshipOptions,
            relationshipGoals,
            2,
            (items) => {
              setRelationshipGoals(items);
            },
          )
        }
      >
        {tagList(
          relationshipGoals,
          "Marriage, long-term, casual, life partner, or another relationship style.",
        )}
      </ProfileSection>
      <ProfileSection
        title="Interests"
        subtitle="Choose up to 5 from 25 general interests."
        onAdd={() =>
          openSelection("Interests", interestOptions, interests, 5, (items) => {
            setInterests(items);
          })
        }
      >
        {tagList(interests, "Add the things you genuinely enjoy.")}
      </ProfileSection>
      <ProfileSection
        title="Causes & communities"
        subtitle="Choose up to 3 that are close to you."
        onAdd={() =>
          openSelection(
            "Causes & communities",
            causeOptions,
            causes,
            3,
            setCauses,
          )
        }
      >
        {tagList(causes, "Show what you stand for.")}
      </ProfileSection>
      <ProfileSection
        title="Qualities & values"
        subtitle="What matters to you in another person."
        onAdd={() =>
          openSelection(
            "Qualities & values",
            valueOptions,
            values,
            8,
            setValues,
          )
        }
      >
        {tagList(values, "Add the qualities you value most.")}
      </ProfileSection>

      <ProfileSection
        title="Profile prompts"
        subtitle="Help people understand what dating you is really like."
      >
        <View style={{ gap: 9 }}>
          {Object.keys(profilePrompts).map((category) => {
            const saved = promptAnswers[category];
            return (
              <Pressable
                key={category}
                onPress={() => {
                  setPromptEditor(category);
                  setSelectedPrompt(saved?.prompt || "");
                  setPromptAnswer(saved?.answer || "");
                }}
                style={{
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: saved ? "#FFF7FA" : C.paper,
                  padding: 13,
                  gap: 5,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    selectable
                    style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}
                  >
                    {category}
                  </Text>
                  {saved ? (
                    <Check
                      width={18}
                      height={18}
                      color={C.pink}
                      strokeWidth={3}
                    />
                  ) : (
                    <Plus width={18} height={18} color={C.pink} />
                  )}
                </View>
                {saved ? (
                  <>
                    <Text
                      selectable
                      style={{ color: C.clay, fontSize: 12, fontWeight: "800" }}
                    >
                      {saved.prompt}
                    </Text>
                    <Text
                      selectable
                      numberOfLines={3}
                      style={{ color: C.muted, fontSize: 13, lineHeight: 18 }}
                    >
                      {saved.answer}
                    </Text>
                  </>
                ) : (
                  <Text selectable style={{ color: C.muted, fontSize: 12 }}>
                    Choose from 8 prompts and write your answer.
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ProfileSection>

      <ProfileSection
        title="About you"
        subtitle="The essentials people use to understand your life."
      >
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <TextInput
              value={work}
              onChangeText={setWork}
              placeholder="Where do you work?"
              placeholderTextColor="#948A7F"
              style={{
                flex: 1,
                minHeight: 48,
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 14,
                paddingHorizontal: 12,
                color: C.ink,
              }}
            />
            <TextInput
              value={occupation}
              onChangeText={setOccupation}
              placeholder="Occupation"
              placeholderTextColor="#948A7F"
              style={{
                flex: 1,
                minHeight: 48,
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 14,
                paddingHorizontal: 12,
                color: C.ink,
              }}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <TextInput
              value={hometown}
              onChangeText={setHometown}
              placeholder="Hometown"
              placeholderTextColor="#948A7F"
              style={{
                flex: 1,
                minHeight: 48,
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 14,
                paddingHorizontal: 12,
                color: C.ink,
              }}
            />
          </View>
          <View
            style={{
              borderRadius: 15,
              backgroundColor: "#F3EFE8",
              padding: 12,
            }}
          >
            <Text
              selectable
              style={{ color: C.muted, fontSize: 11, fontWeight: "800" }}
            >
              LOCATION ? AUTOMATIC
            </Text>
            <Text
              selectable
              style={{
                color: C.ink,
                fontSize: 14,
                fontWeight: "800",
                paddingTop: 3,
              }}
            >
              {currentLocationStatus === "loading" ?
                 "Detecting your current city..."
                : currentLocation || "Enable location access to detect your city"}
            </Text>
          </View>
        </View>
      </ProfileSection>

      <ProfileSection
        title="More about you"
        subtitle="Tap any field to choose from simple options."
      >
        <View>
          {Object.entries(detailOptions)
            .filter(
              ([label]) =>
                !["Kids live with you?", "How many kids?"].includes(label),
            )
            .map(([label, options], index, visibleEntries) => {
              const isLanguages = label === "Languages";
              const isAutomatic = label === "Star sign";
              const value = isLanguages ? languages.join(", ") : details[label];
              return (
                <View key={label}>
                <Pressable
                  disabled={isAutomatic}
                  onPress={() =>
                    isAutomatic ? undefined : openSelection(
                      label,
                      options,
                      isLanguages ? languages : value ? [value] : [],
                      isLanguages ? 5 : 1,
                      (items) =>
                        isLanguages ?
                          setLanguages(items)
                          : setDetails((current) => {
                              const next = {
                                ...current,
                                [label]: items[0],
                              };
                              if (
                                label === "Have kids?" &&
                                items[0] !== "Yes"
                              ) {
                                delete next["Kids live with you?"];
                                delete next["How many kids?"];
                              }
                              return next;
                            }),
                    )
                  }
                  style={{
                    minHeight: 52,
                    borderBottomWidth:
                      index === visibleEntries.length - 1 ? 0 : 1,
                    borderBottomColor: C.line,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Text
                    selectable
                    style={{
                      color: C.ink,
                      fontSize: 14,
                      fontWeight: "800",
                      flex: 1,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    selectable
                    numberOfLines={1}
                    style={{
                      color: value ? C.clay : C.muted,
                      fontSize: 12,
                      maxWidth: "48%",
                    }}
                  >
                    {value || (isAutomatic ? "From date of birth" : "Add")}
                  </Text>
                  {isAutomatic ? <LockKeyhole width={16} height={16} color={C.sage} /> : <ChevronRight width={18} height={18} color={C.muted} />}
                </Pressable>
                {label === "Have kids?" && value === "Yes" ? (
                  <View style={{ marginLeft: 14, marginBottom: 9, borderLeftWidth: 3, borderLeftColor: "#F3A4C2", backgroundColor: "#FFF7FA", borderRadius: 14, paddingHorizontal: 12 }}>
                    {(["How many kids?", "Kids live with you?"] as const).map((childLabel) => {
                      const childValue = details[childLabel];
                      return (
                        <Pressable
                          key={childLabel}
                          accessibilityRole="button"
                          onPress={() => openSelection(childLabel, detailOptions[childLabel], childValue ? [childValue] : [], 1, (items) => setDetails((current) => ({ ...current, [childLabel]: items[0] })))}
                          style={{ minHeight: 48, borderBottomWidth: childLabel === "How many kids?" ? 1 : 0, borderBottomColor: C.line, flexDirection: "row", alignItems: "center", gap: 8 }}
                        >
                          <Text selectable style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "800" }}>{childLabel}</Text>
                          <Text selectable style={{ color: childValue ? C.clay : C.muted, fontSize: 12 }}>{childValue || "Add"}</Text>
                          <ChevronRight width={17} height={17} color={C.muted} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                </View>
              );
            })}
        </View>
      </ProfileSection>
      {profileSaveError ? (
        <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "center" }}>
          {profileSaveError}
        </Text>
      ) : null}
      <Button
        label={profileSaving ? "Saving profile..." : "Save Profile"}
        disabled={profileSaving}
        onPress={async () => {
          if (profileSaveInFlightRef.current) return;
          profileSaveInFlightRef.current = true;
          setProfileSaving(true);
          setProfileSaveError("");
          try {
            const localOnlyPhotos = photos.filter(isLocalOnlyProfilePhoto);
            if (localOnlyPhotos.length > 0) {
              setProfileSaveError(
                localOnlyPhotos.length === 1
                  ? "One photo has not reached the server yet. Please wait for the upload to finish, remove it, or try uploading it again before saving."
                  : `${localOnlyPhotos.length} photos have not reached the server yet. Please wait for uploads to finish, remove them, or try uploading them again before saving.`,
              );
              return;
            }
            const firstPhoto = photos[0];
            const draftProfile = {
              photos,
              bestPhotoId: firstPhoto?.id || "",
              bestPhotoUri: firstPhoto?.uri || "",
              personality,
              relationshipGoals,
              interests,
              causes,
              values,
              bio,
              work,
              occupation,
              hometown,
              currentLocation,
              matchingLocation,
              details,
              languages,
              promptAnswers,
              compatibilityResponses,
              profileStrength,
            };
            await onSaveProfile(draftProfile);
            onProfilePhotoChange(firstPhoto?.uri || "");
            onProfileStrengthChange(profileStrength);
            onInterestsChange(interests);
            onBioChange(bio);
            onSearchingForChange(relationshipGoals);
            onConnect();
          } catch (caught) {
            setProfileSaveError(caught instanceof Error ? caught.message : "Your profile could not be saved. Check your connection and try again.");
          } finally {
            profileSaveInFlightRef.current = false;
            setProfileSaving(false);
          }
        }}
      />
      </ScrollView>
    </>
  );
}

function RecommendationCard({
  profile,
  index,
  step,
  cardWidth,
  scrollX,
  tag,
  onOpen,
  onLike,
  liked,
}: {
  profile: Profile;
  index: number;
  step: number;
  cardWidth: number;
  scrollX: Animated.Value;
  tag: string;
  onOpen: () => void;
  onLike?: () => void;
  liked?: boolean;
}) {
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.86, 1, 0.86],
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.72, 1, 0.72],
    extrapolate: "clamp",
  });
  return (
    <Animated.View
      style={{
        width: cardWidth,
        marginRight: step - cardWidth,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: C.paper,
        borderWidth: 1,
        borderColor: C.line,
        boxShadow: "0 10px 25px rgba(54,42,31,0.14)",
        opacity,
        transform: [{ scale }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${profile.name}'s profile`}
        onPress={onOpen}
      >
        <View
          style={{ width: cardWidth, height: cardWidth, overflow: "hidden" }}
        >
          <ProfileImage profile={profile} size={cardWidth} />
          <View
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              maxWidth: cardWidth - 20,
              borderRadius: 14,
              backgroundColor: "rgba(255,253,249,0.92)",
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text
              selectable
              numberOfLines={1}
              style={{ color: C.clay, fontSize: 11, fontWeight: "900" }}
            >
              {tag}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Like ${profile.name}`}
            onPress={onLike}
            style={({ pressed }) => ({
              position: "absolute",
              right: 11,
              bottom: 11,
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: pressed ?
                "rgba(249,200,218,0.96)"
                : liked ?
                  "rgba(252,229,238,0.98)"
                  : "rgba(255,253,249,0.94)",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Heart width={24} height={24} color={C.pink} fill={liked ? C.pink : "transparent"} strokeWidth={2.4} />
          </Pressable>
          {liked ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: 10,
                bottom: 62,
                borderRadius: 13,
                backgroundColor: "rgba(34,31,27,0.86)",
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: C.paper, fontSize: 10, fontWeight: "900" }}>
                Liked
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

type TaggedRecommendation = {
  profile: Profile;
  tag: string;
};

function normalizeRecommendationValue(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function taggedSharedRecommendations(
  people: readonly Profile[],
  viewerItems: readonly string[] | undefined,
  candidateItems: (signals: MatchingSignals) => readonly string[] | undefined,
  label: string,
): TaggedRecommendation[] {
  const viewerLookup = new Map(
    (viewerItems || [])
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => [normalizeRecommendationValue(item), item.trim()] as const),
  );
  if (!viewerLookup.size) return [];
  return people
    .map((profile) => {
      const signals = profileMatchingSignals(profile);
      const shared = (candidateItems(signals) || [])
        .filter((item) => typeof item === "string" && item.trim().length > 0)
        .find((item) => viewerLookup.has(normalizeRecommendationValue(item)));
      if (!shared) return null;
      return { profile, tag: `${label}: ${viewerLookup.get(normalizeRecommendationValue(shared)) || shared.trim()}` };
    })
    .filter((item): item is TaggedRecommendation => Boolean(item));
}

function recommendationOverlap(
  viewerItems: readonly string[] | undefined,
  candidateItems: readonly string[] | undefined,
) {
  const viewerLookup = new Set(
    (viewerItems || [])
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map(normalizeRecommendationValue),
  );
  if (!viewerLookup.size) return { count: 0, first: "" };
  const shared = (candidateItems || [])
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .filter((item) => viewerLookup.has(normalizeRecommendationValue(item)));
  return { count: shared.length, first: shared[0]?.trim() || "" };
}

function categorizedExploreRecommendations(
  people: readonly Profile[],
  viewerSignals: MatchingSignals,
) {
  const buckets = {
    interests: [] as TaggedRecommendation[],
    datingGoals: [] as TaggedRecommendation[],
    communities: [] as TaggedRecommendation[],
  };
  people.forEach((profile) => {
    const signals = profileMatchingSignals(profile);
    const interest = recommendationOverlap(viewerSignals.interests, signals.interests);
    const datingGoal = recommendationOverlap(viewerSignals.relationshipGoals, signals.relationshipGoals);
    const community = recommendationOverlap(viewerSignals.communities, signals.communities);
    const options = [
      { key: "interests" as const, label: "Similar interest", ...interest },
      { key: "datingGoals" as const, label: "Similar dating goal", ...datingGoal },
      { key: "communities" as const, label: "Community in common", ...community },
    ].filter((option) => option.count > 0);
    if (!options.length) return;
    const best = options.sort((a, b) => b.count - a.count)[0];
    buckets[best.key].push({
      profile,
      tag: `${best.label}: ${best.first}`,
    });
  });
  return buckets;
}

function RecommendationCarousel({
  title,
  description,
  recommendations,
  likedProfileKeys,
  onProfilePress,
  onLike,
}: {
  title: string;
  description: string;
  recommendations: readonly TaggedRecommendation[];
  likedProfileKeys?: readonly string[];
  onProfilePress?: (profile: Profile) => void;
  onLike: (profile: Profile) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(278, width * 0.7);
  const step = cardWidth + 12;
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRecommendation = recommendations[activeIndex] || recommendations[0];
  const activeProfile = activeRecommendation?.profile;
  if (!recommendations.length) return null;
  return (
    <View style={{ gap: 9 }}>
      <View style={{ paddingHorizontal: 18, gap: 3 }}>
        <Text
          selectable
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 25,
            fontWeight: "900",
          }}
        >
          {title}
        </Text>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}
        >
          {description}
        </Text>
      </View>
      <Animated.ScrollView
        horizontal
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const next = Math.max(
            0,
            Math.min(
              recommendations.length - 1,
              Math.round(event.nativeEvent.contentOffset.x / step),
            ),
          );
          setActiveIndex(next);
        }}
        contentContainerStyle={{
          paddingHorizontal: (width - cardWidth) / 2,
          paddingVertical: 10,
        }}
      >
        {recommendations.map(({ profile, tag }, index) => (
          <RecommendationCard
            key={`${title}-${profile.name}`}
            profile={profile}
            index={index}
            step={step}
            cardWidth={cardWidth}
            scrollX={scrollX}
            tag={tag}
            onOpen={() => onProfilePress(profile)}
            onLike={() => onLike(profile)}
            liked={Boolean(likedProfileKeys?.includes(profile.id || profile.name))}
          />
        ))}
      </Animated.ScrollView>
      {activeProfile ? (
        <View
          style={{
            marginHorizontal: 18,
            borderRadius: 19,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            padding: 13,
            gap: 7,
            boxShadow: "0 6px 16px rgba(54,42,31,0.08)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text selectable style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}>
              {activeProfile.name}, {activeProfile.age}
            </Text>
            <ProfileVerificationBadgeIcons profile={activeProfile} size={18} />
          </View>
          <Text selectable style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}>
            {profileOccupationEducationLine(activeProfile) || "Profile details not added"}
          </Text>
          <VerificationBadges profile={activeProfile} />
          <Text selectable style={{ color: C.sage, fontSize: 11, fontWeight: "800" }}>
            {activeRecommendation.tag}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type MeetProposal = {
  venue: string;
  scheduledAt: number;
  durationMinutes: number;
  latitude: number;
  longitude: number;
  status: "pending" | "accepted" | "declined";
};

function proposalMapLink(proposal: MeetProposal) {
  return `https://www.google.com/maps/search/?api=1&query=${proposal.latitude},${proposal.longitude}`;
}

function proposalDirectionsLink(proposal: MeetProposal) {
  const destination = `${proposal.latitude},${proposal.longitude}`;
  return process.env.EXPO_OS === "ios" ?
    `http://maps.apple.com/?daddr=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function openProposalLink(url: string, fallbackUrl?: string) {
  Linking.openURL(url).catch(() => {
    if (fallbackUrl) Linking.openURL(fallbackUrl).catch(() => undefined);
  });
}

function meetingDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function MeetingSafetyShare({
  profile,
  proposal,
  onClose,
}: {
  profile: Profile;
  proposal: MeetProposal;
  onClose: () => void;
}) {
  const [trustedName, setTrustedName] = useState("");
  const [trustedContact, setTrustedContact] = useState("");
  const [shared, setShared] = useState(false);
  const scheduled = new Date(proposal.scheduledAt);
  const shareMeeting = async () => {
    const safetyLink = `https://kindredcube.app/safety/meet-${profile.name.toLowerCase()}-7K4P`;
    const mapLink = proposalMapLink(proposal);
    await Share.share({
      title: "My KindredCube meeting",
      message: `I'm meeting ${profile.name} from KindredCube at ${proposal.venue} on ${scheduled.toLocaleDateString()} at ${scheduled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. We expect the meeting to take about ${proposal.durationMinutes} minutes. Map location: ${mapLink}. Follow my optional safety check-in here: ${safetyLink}`,
    });
    setShared(true);
  };
  const fieldStyle = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    backgroundColor: C.paper,
    paddingHorizontal: 13,
    color: C.ink,
    fontSize: 13,
  } as const;
  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: "#FFF7F5",
        borderWidth: 1.5,
        borderColor: "#D97563",
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={{ color: "#9C3225", fontSize: 20, fontWeight: "900" }}
          >
            Share my meeting
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
          >
            Optional safety check-in with someone you trust.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close meeting safety"
          onPress={onClose}
        >
          <X width={23} height={23} color={C.ink} />
        </Pressable>
      </View>
      <TextInput
        value={trustedName}
        onChangeText={setTrustedName}
        placeholder="Loved one's name"
        placeholderTextColor="#948A7F"
        style={fieldStyle}
      />
      <TextInput
        value={trustedContact}
        onChangeText={setTrustedContact}
        placeholder="Their phone number or email"
        placeholderTextColor="#948A7F"
        keyboardType="email-address"
        autoCapitalize="none"
        style={fieldStyle}
      />
      <View style={{ borderRadius: 16, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 12, gap: 4 }}>
        <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>{proposal.venue}</Text>
        <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
          {scheduled.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {scheduled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ? about {proposal.durationMinutes} minutes
        </Text>
        <Text selectable style={{ color: C.sage, fontSize: 10, fontWeight: "900" }}>Copied from the accepted proposal</Text>
        <Text selectable style={{ color: C.clay, fontSize: 10, lineHeight: 15, fontWeight: "800" }}>
          Map link included in the safety share.
        </Text>
      </View>
      <Button
        compact
        label="Send secure meeting link"
        disabled={
          !trustedName.trim() ||
          !trustedContact.trim()
        }
        onPress={shareMeeting}
      />
      {shared ? (
        <Text
          selectable
          style={{
            color: C.sage,
            fontSize: 12,
            lineHeight: 17,
            fontWeight: "900",
          }}
        >
          Meeting share prepared. Your loved one receives only the secure
          check-in link and the details you chose to share.
        </Text>
      ) : null}
      <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        Your exact live location is not shared. In production, safety links must
        be private, expiring, revocable, and protected from search engines.
      </Text>
    </View>
  );
}

function MeetupTrustCheck({
  profile,
  onDone,
  onCancel,
}: {
  profile: Profile;
  onDone: () => void;
  onCancel: () => void;
}) {
  const questions = [
    { key: "plans", label: "Were plans respected or changes communicated?", choices: ["Yes", "No"] },
    { key: "profile", label: "Did they broadly match their verified profile?", choices: ["Yes", "No"] },
    { key: "boundaries", label: "Were your boundaries respected?", choices: ["Yes", "No"] },
    { key: "safety", label: "Did anything make you feel pressured or unsafe?", choices: ["No", "Yes"] },
    { key: "again", label: "Would you personally meet them again?", choices: ["Yes", "Not sure", "No"] },
  ] as const;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.every(({ key }) => Boolean(answers[key]));
  return (
    <View
      style={{
        borderRadius: 21,
        backgroundColor: "#F7F3ED",
        borderWidth: 1,
        borderColor: C.line,
        padding: 15,
        gap: 13,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <ShieldCheck width={25} height={25} color={C.sage} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
            Private post-meet check
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 14 }}>
            {profile.name} will never see your individual answers.
          </Text>
        </View>
      </View>
      {questions.map(({ key, label, choices }) => (
        <View key={key} style={{ gap: 7 }}>
          <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
            {label}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {choices.map((choice) => {
              const selected = answers[key] === choice;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setAnswers((current) => ({ ...current, [key]: choice }))}
                  style={{
                    minHeight: 38,
                    borderRadius: 19,
                    borderWidth: 1,
                    borderColor: selected ? C.sage : C.line,
                    backgroundColor: selected ? "#E7F2EA" : C.paper,
                    paddingHorizontal: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: selected ? C.sage : C.ink, fontSize: 11, fontWeight: "900" }}>
                    {choice}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        Safety concerns are reviewed privately. There are no public stars, public negative reviews, or automatic penalties from one response.
      </Text>
      <Button compact label="Submit private check-in" disabled={!complete} onPress={onDone} />
      <Pressable accessibilityRole="button" onPress={onCancel} style={{ minHeight: 40, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Not now</Text>
      </Pressable>
    </View>
  );
}

function PostMeetCheckModal({
  visible,
  profile,
  proposal,
  onDone,
  onCancel,
}: {
  visible: boolean;
  profile: Profile;
  proposal: MeetProposal;
  onDone: (result?: { meetupVerified?: boolean }) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const questions = [
    { key: "showedUp", label: "Did this person show up?", choices: ["Yes", "No"] },
    { key: "profileMatched", label: "Did this person match their profile and photos?", choices: ["Yes", "Mostly", "No"] },
    { key: "feltSafe", label: "Did you feel safe during the meeting?", choices: ["Yes", "Somewhat", "No"] },
    { key: "respectful", label: "Were they respectful and polite?", choices: ["Yes", "Mostly", "No"] },
    { key: "wouldMeetAgain", label: "Would you meet this person again?", choices: ["Yes", "Maybe", "No"] },
  ] as const;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const complete = questions.every(({ key }) => Boolean(answers[key]));
  const meetingStartedAt = new Date(proposal.scheduledAt);
  const meetingEndedAt = new Date(proposal.scheduledAt + proposal.durationMinutes * 60_000);
  const memberId = profile.id || profile.discovery?.id || "";
  const closePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 28 || Math.abs(gesture.dy) > 28,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 72 || gesture.dy > 72) onCancel();
      },
    }),
  ).current;

  const submit = async () => {
    if (!complete || submitting || !memberId) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitPostMeetCheck({
        otherUserId: memberId,
        meetingStartedAt: meetingStartedAt.toISOString(),
        meetingEndedAt: meetingEndedAt.toISOString(),
        venue: proposal.venue,
        latitude: proposal.latitude,
        longitude: proposal.longitude,
        showedUp: answers.showedUp || "",
        profileMatched: answers.profileMatched || "",
        feltSafe: answers.feltSafe || "",
        respectful: answers.respectful || "",
        wouldMeetAgain: answers.wouldMeetAgain || "",
        notes,
      });
      setAnswers({});
      setNotes("");
      onDone(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not save this check-in yet. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: C.cream }}
      >
        <View {...closePan.panHandlers} style={{ flex: 1 }}>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            contentContainerStyle={{
              paddingTop: insets.top + 14,
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 34,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close post-meet check"
                onPress={onCancel}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: C.paper,
                  borderWidth: 1,
                  borderColor: C.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChevronLeft width={22} height={22} color={C.ink} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text selectable style={{ color: C.ink, fontSize: 23, fontWeight: "900" }}>
                  Private post-meet check
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                  Swipe right or down to return to chat.
                </Text>
              </View>
            </View>

            <View
              style={{
                borderRadius: 24,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: C.line,
                padding: 16,
                gap: 10,
                boxShadow: "0 18px 38px rgba(0,29,48,0.14)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ShieldCheck width={28} height={28} color={C.sage} />
                <View style={{ flex: 1 }}>
                  <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>
                    Only KindredCube reviews this privately
                  </Text>
                  <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                    {profile.name} will never see your individual answers.
                  </Text>
                </View>
              </View>
              <View style={{ borderRadius: 16, backgroundColor: "#F7F3ED", padding: 12, gap: 4 }}>
                <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                  {proposal.venue}
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                  {meetingStartedAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {meetingStartedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ? about {proposal.durationMinutes} minutes
                </Text>
              </View>
            </View>

            {questions.map(({ key, label, choices }) => (
              <View
                key={key}
                style={{
                  borderRadius: 22,
                  backgroundColor: C.paper,
                  borderWidth: 1,
                  borderColor: C.line,
                  padding: 14,
                  gap: 10,
                }}
              >
                <Text selectable style={{ color: C.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" }}>
                  {label}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {choices.map((choice) => {
                    const selected = answers[key] === choice;
                    return (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setAnswers((current) => ({ ...current, [key]: choice }))}
                        style={{
                          minHeight: 42,
                          borderRadius: 21,
                          borderWidth: 1.5,
                          borderColor: selected ? C.sage : C.line,
                          backgroundColor: selected ? "#E7F2EA" : C.paper,
                          paddingHorizontal: 16,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: selected ? C.sage : C.ink, fontSize: 12, fontWeight: "900" }}>
                          {choice}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <View
              style={{
                borderRadius: 22,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: C.line,
                padding: 14,
                gap: 9,
              }}
            >
              <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
                Anything KindredCube should know?
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
                placeholder="Optional private note..."
                placeholderTextColor="#948A7F"
                style={{
                  minHeight: 110,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: "#F7F3ED",
                  padding: 12,
                  color: C.ink,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              />
            </View>

            <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }}>
              Safety concerns are reviewed privately. There are no public stars, public negative reviews, or automatic penalties from one response.
            </Text>
            {error ? (
              <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 12, fontWeight: "900", textAlign: "center" }}>
                {error}
              </Text>
            ) : null}
            <Button compact label={submitting ? "Submitting..." : "Submit private check-in"} disabled={!complete || submitting || !memberId} onPress={submit} />
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>Not now</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LegacyReadyMeetChat({
  profile,
  onBack,
}: {
  profile: Profile;
  onBack: () => void;
}) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [trustCheckOpen, setTrustCheckOpen] = useState(false);
  const [trustCheckSubmitted, setTrustCheckSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  return (
    <View
      style={{
        borderRadius: 25,
        backgroundColor: C.paper,
        borderWidth: 1,
        borderColor: C.line,
        padding: 15,
        gap: 13,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Ready to Meet map"
          onPress={onBack}
        >
          <Text style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>
            ?
          </Text>
        </Pressable>
        <View
          style={{
            width: 45,
            height: 45,
            borderRadius: 23,
            overflow: "hidden",
          }}
        >
          <ProfileImage profile={profile} size={45} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}
          >
            {profile.name}
          </Text>
          <Text
            selectable
            style={{ color: C.sage, fontSize: 11, fontWeight: "800" }}
          >
            Ready nearby · online
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open meeting safety"
          onPress={() => setSafetyOpen((value) => !value)}
          style={{
            minWidth: 74,
            height: 45,
            borderRadius: 23,
            backgroundColor: "#E7F7EA",
            borderWidth: 1.5,
            borderColor: "#279447",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 10,
            gap: 1,
          }}
        >
          <Text
            style={{
              color: "#1F7A3B",
              fontSize: 18,
              lineHeight: 19,
              fontWeight: "900",
            }}
          >
            ?
          </Text>
          <Text style={{ color: "#1F7A3B", fontSize: 9, lineHeight: 10, fontWeight: "900" }}>Safety</Text>
        </Pressable>
      </View>
      {safetyOpen ? (
        <MeetingSafetyShare
          profile={profile}
          proposal={{ venue: "", scheduledAt: Date.now(), durationMinutes: 60, latitude: 0, longitude: 0, status: "accepted" }}
          onClose={() => setSafetyOpen(false)}
        />
      ) : (
        <View
          style={{
            minHeight: 165,
            justifyContent: "center",
            alignItems: "center",
            gap: 7,
            borderRadius: 18,
            backgroundColor: "#F7F3ED",
            padding: 18,
          }}
        >
          <Text
            selectable
            style={{
              color: C.ink,
              fontSize: 15,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            Meet safely and keep the first meeting public
          </Text>
          <Text
            selectable
            style={{
              color: C.muted,
              fontSize: 12,
              lineHeight: 17,
              textAlign: "center",
            }}
          >
            Tap the bold safety cross above to optionally share this meeting
            with a loved one.
          </Text>
          {sent.map((item, index) => (
            <View
              key={`${item}-${index}`}
              style={{
                alignSelf: "flex-end",
                maxWidth: "82%",
                borderRadius: 17,
                backgroundColor: "#FCE5EE",
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            >
              <Text selectable style={{ color: C.ink, fontSize: 13 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      )}
      {trustCheckOpen ? (
        <MeetupTrustCheck
          profile={profile}
          onCancel={() => setTrustCheckOpen(false)}
          onDone={() => {
            setTrustCheckOpen(false);
            setTrustCheckSubmitted(true);
          }}
        />
      ) : trustCheckSubmitted ? (
        <View
          style={{
            borderRadius: 18,
            backgroundColor: "#E7F2EA",
            padding: 13,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
          }}
        >
          <ShieldCheck width={20} height={20} color={C.sage} />
          <Text selectable style={{ flex: 1, color: C.sage, fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
            Thank you. Your private post-meet check was submitted.
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setTrustCheckOpen(true)}
          style={{
            minHeight: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: C.sage,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <ShieldCheck width={18} height={18} color={C.sage} />
          <Text style={{ color: C.sage, fontSize: 12, fontWeight: "900" }}>
            Complete post-meet check
          </Text>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={`Message ${profile.name}...`}
          placeholderTextColor="#948A7F"
          style={{
            flex: 1,
            minHeight: 46,
            borderWidth: 1,
            borderColor: C.line,
            borderRadius: 23,
            paddingHorizontal: 14,
            color: C.ink,
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!message.trim()}
          onPress={() => {
            setSent((current) => [...current, message.trim()]);
            setMessage("");
          }}
          style={{
            minWidth: 62,
            borderRadius: 23,
            backgroundColor: message.trim() ? C.ink : "#BDB5AA",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>
            Send
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ChatAudioBubble({ uri, durationMillis }: { uri: string; durationMillis?: number }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const duration = Math.max(1, Math.round((durationMillis || status.duration * 1000 || 0) / 1000));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? "Pause voice note" : "Play voice note"}
      onPress={() => status.playing ? player.pause() : player.play()}
      style={{ minWidth: 155, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9 }}
    >
      {status.playing ? <Pause width={19} height={19} color={C.ink} fill={C.ink} /> : <Play width={19} height={19} color={C.ink} fill={C.ink} />}
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(34,31,27,0.22)" }} />
      <Text style={{ color: C.ink, fontSize: 10, fontWeight: "900" }}>{duration}s</Text>
    </Pressable>
  );
}

function ReadyMeetVerificationScreen({
  mode,
  busy,
  notice,
  onClose,
  onStripe,
  onSubmitSelfie,
  showStripe = true,
}: {
  mode: "send" | "accept" | "profile";
  busy: "" | "stripe" | "selfie";
  notice: string;
  onClose: () => void;
  onStripe: () => void;
  onSubmitSelfie: (input: {
    videoBase64: string;
    mimeType: "video/mp4" | "video/quicktime" | "video/mov";
    sizeBytes: number;
    faceImageBase64: string;
    faceImageMimeType: "image/jpeg";
  }) => Promise<void>;
  showStripe: boolean;
}) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const autoCaptureStarted = useRef(false);
  const autoSubmitStarted = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [poseChecking, setPoseChecking] = useState(false);
  const [posePaused, setPosePaused] = useState(false);
  const [recordedUri, setRecordedUri] = useState("");
  const [recordedFaceImageBase64, setRecordedFaceImageBase64] = useState("");
  const [selfieNotice, setSelfieNotice] = useState("");
  const [instructionIndex, setInstructionIndex] = useState(0);
  const instructions: Array<{ pose: "straight" | "left" | "right"; text: string }> = [
    { pose: "straight", text: "Place your face inside the oval and look straight." },
    { pose: "left", text: "Turn your head slowly to your left." },
    { pose: "right", text: "Turn your head slowly to your right." },
    { pose: "straight", text: "Look straight again and hold still." },
  ];

  useEffect(() => {
    if (!recording) return;
    setInstructionIndex(0);
    const timer = setInterval(() => {
      setInstructionIndex((current) => Math.min(instructions.length - 1, current + 1));
    }, 2200);
    return () => clearInterval(timer);
  }, [instructions.length, recording]);

  const openCamera = async () => {
    setSelfieNotice("");
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setSelfieNotice("Camera permission is required for video selfie verification.");
        return;
      }
    }
    setRecordedUri("");
    setRecordedFaceImageBase64("");
    autoCaptureStarted.current = false;
    autoSubmitStarted.current = false;
    setPosePaused(false);
    setInstructionIndex(0);
    setCameraReady(false);
    setCameraOpen(true);
  };

  const friendlySelfieError = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "";
    if (/cannot\s+post|\/v1\/|verification\/selfie|not found|404/i.test(message)) {
      return "Selfie verification is not available right now. Please try again after the app is updated.";
    }
    if (/network|failed to fetch|connection|timeout/i.test(message)) {
      return "Selfie verification could not connect. Check your connection and try again.";
    }
    return "Selfie verification could not check your movement. Please try again.";
  };

  const captureFaceFrame = async () => {
    const camera = cameraRef.current as unknown as {
      takePictureAsync?: (options?: { base64?: boolean; quality?: number; skipProcessing?: boolean }) => Promise<{ base64?: string } | undefined>;
    } | null;
    if (!camera?.takePictureAsync) return "";
    try {
      const photo = await camera.takePictureAsync({ base64: true, quality: 0.82, skipProcessing: false });
      return photo?.base64 || "";
    } catch {
      return "";
    }
  };

  const recordSelfie = async (faceFrame: string) => {
    if (!cameraRef.current || !cameraReady || recording) return;
    setSelfieNotice("");
    setRecording(true);
    try {
      if (faceFrame) setRecordedFaceImageBase64(faceFrame);
      const recordingPromise = cameraRef.current.recordAsync({ maxDuration: 4 });
      setTimeout(() => {
        try {
          cameraRef.current.stopRecording();
        } catch {
          // recordAsync may already have stopped at maxDuration.
        }
      }, 4200);
      const result = await recordingPromise;
      if (result?.uri) setRecordedUri(result.uri);
    } catch {
      setSelfieNotice("The video selfie could not be recorded. Please try again.");
    } finally {
      setRecording(false);
    }
  };

  const stopSelfie = () => {
    try {
      cameraRef.current?.stopRecording();
    } catch {
      setRecording(false);
    }
  };

  const resetAutoSelfie = (message = "Place your face inside the oval and hold still. KindredCube will capture automatically.") => {
    if (recording) stopSelfie();
    setRecordedUri("");
    setRecordedFaceImageBase64("");
    setInstructionIndex(0);
    setPoseChecking(false);
    setPosePaused(false);
    autoCaptureStarted.current = false;
    autoSubmitStarted.current = false;
    setSelfieNotice(message);
  };

  const checkCurrentPose = async () => {
    if (!cameraRef.current || !cameraReady || recording || poseChecking || posePaused || recordedUri) return;
    const step = instructions[instructionIndex] || instructions[0]!;
    setPoseChecking(true);
    setSelfieNotice("");
    try {
      const faceFrame = await captureFaceFrame();
      if (!faceFrame) {
        setSelfieNotice("I cannot see your face clearly. Place your face inside the oval.");
        return;
      }
      const result = await checkSelfiePose({
        faceImageBase64: faceFrame,
        faceImageMimeType: "image/jpeg",
        expectedPose: step.pose,
      });
      if (!result.ok) {
        setSelfieNotice(result.message);
        return;
      }
      setSelfieNotice("");
      if (instructionIndex >= instructions.length - 1) {
        await recordSelfie(faceFrame);
        return;
      }
      setInstructionIndex((current) => Math.min(instructions.length - 1, current + 1));
    } catch (caught) {
      setPosePaused(true);
      setSelfieNotice(friendlySelfieError(caught));
    } finally {
      setPoseChecking(false);
    }
  };

  useEffect(() => {
    if (!cameraOpen || !cameraReady || recording || recordedUri || poseChecking || posePaused) return;
    const timer = setTimeout(() => {
      void checkCurrentPose();
    }, autoCaptureStarted.current ? 2400 : 2600);
    autoCaptureStarted.current = true;
    return () => clearTimeout(timer);
  }, [cameraOpen, cameraReady, instructionIndex, poseChecking, posePaused, recordedUri, recording]);

  const submitSelfie = async () => {
    if (!recordedUri) return;
    setSelfieNotice("");
    try {
      const videoFile = new File(recordedUri);
      const sizeBytes = videoFile.size || 0;
      if (sizeBytes <= 0 || sizeBytes > 15 * 1024 * 1024) {
        setSelfieNotice("Video selfie must be 15 MB or less. Please retake it.");
        setPosePaused(true);
        autoSubmitStarted.current = false;
        return;
      }
      const faceImageBase64 = recordedFaceImageBase64 || await captureFaceFrame();
      if (!faceImageBase64) {
        setSelfieNotice("Please keep your face clearly in the oval so KindredCube can create your secure face record.");
        setPosePaused(true);
        autoSubmitStarted.current = false;
        return;
      }
      const videoBase64 = await videoFile.base64();
      await onSubmitSelfie({ videoBase64, mimeType: "video/mp4", sizeBytes, faceImageBase64, faceImageMimeType: "image/jpeg" });
    } catch {
      setSelfieNotice("Selfie verification could not be submitted. Please try again.");
      setPosePaused(true);
      autoSubmitStarted.current = false;
    }
  };

  useEffect(() => {
    if (!recordedUri || !cameraOpen || recording || busy === "selfie" || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    setSelfieNotice("Selfie captured. Submitting securely to Amazon Rekognition...");
    const timer = setTimeout(() => {
      void submitSelfie();
    }, 700);
    return () => clearTimeout(timer);
  }, [busy, cameraOpen, recordedUri, recording]);

  if (cameraOpen) {
    const cameraInstructionText = recording ?
       "Final capture in progress. Hold still."
      : recordedUri ?
         notice || selfieNotice || (busy === "selfie" ? "Selfie captured. Submitting securely..." : "Selfie captured. Waiting for confirmation...")
        : poseChecking ?
           "Hold still..."
          : selfieNotice || instructions[instructionIndex].text || "Place your face inside the oval.";
    return (
      <View style={{ flex: 1, backgroundColor: "#060606", paddingTop: insets.top + 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => { if (recording) stopSelfie(); setCameraOpen(false); }} style={{ minHeight: 42, justifyContent: "center" }}>
            <Text style={{ color: C.paper, fontSize: 14, fontWeight: "900" }}>Close</Text>
          </Pressable>
          <Text selectable style={{ color: C.paper, fontSize: 16, fontWeight: "900" }}>Selfie Verification</Text>
          <View style={{ width: 54 }} />
        </View>
        <View style={{ flex: 1, margin: 18, borderRadius: 28, overflow: "hidden", backgroundColor: "#111" }}>
          <CameraView
            ref={cameraRef}
            facing="front"
            mode="video"
            onCameraReady={() => setCameraReady(true)}
            style={{ flex: 1 }}
          />
          <View pointerEvents="none" style={{ position: "absolute", top: "16%", alignSelf: "center", width: 210, height: 285, borderRadius: 110, borderWidth: 4, borderColor: "rgba(255,255,255,0.92)", backgroundColor: "transparent" }} />
          <View pointerEvents="none" style={{ position: "absolute", top: "7%", left: 22, right: 22, alignItems: "center" }}>
            <View style={{ borderRadius: 22, backgroundColor: "rgba(0,0,0,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text accessibilityRole={selfieNotice ? "alert" : undefined} selectable style={{ color: C.paper, fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center" }}>
                {cameraInstructionText}
              </Text>
            </View>
          </View>
          <View style={{ position: "absolute", left: 14, right: 14, bottom: 14, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.48)", padding: 14, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                disabled={busy === "selfie"}
                onPress={() => resetAutoSelfie()}
                style={{ flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.65)", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.paper, fontSize: 14, fontWeight: "900" }}>{posePaused ? "Try again" : "Retake"}</Text>
              </Pressable>
              <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: recording ? "#D73333" : recordedUri ? C.sage : "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: C.paper, fontSize: 14, fontWeight: "900" }}>
                  {busy === "selfie" ? "Submitting..." : recording ? "Capturing..." : recordedUri ? "Captured" : posePaused ? "Paused" : cameraReady ? "Auto capture" : "Preparing..."}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 16, backgroundColor: C.cream }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 42, justifyContent: "center" }}>
          <Text style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>Close</Text>
        </Pressable>
        <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: "900" }}>
          {mode === "profile" ? "Selfie Verification" : "Ready to Meet Safety"}
        </Text>
        <View style={{ width: 54 }} />
      </View>
      <View style={{ borderRadius: 30, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 20, gap: 15, boxShadow: "0 18px 42px rgba(0,29,48,0.18)" }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#E8F3FD", alignItems: "center", justifyContent: "center" }}>
          <ShieldCheck width={30} height={30} color="#1685E5" />
        </View>
        <Text selectable style={{ color: C.ink, fontSize: 27, lineHeight: 31, fontWeight: "900" }}>
          {mode === "profile" ?
             "Verify with a guided selfie"
            : `Verification required to ${mode === "send" ? "send a meetup proposal" : "accept this meetup"}`}
        </Text>
        <Text selectable style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
          {mode === "profile" ?
             "KindredCube will guide you through a short in-app selfie recording, capture a clear face frame, and send it securely to Amazon Rekognition for duplicate-account and safety checks."
            : "Both people must be verified before a Ready to Meet proposal can be sent or accepted. This protects everyone and keeps meetup details safer."}
        </Text>
        {showStripe && onStripe ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(busy)}
              onPress={onStripe}
              style={{ minHeight: 56, borderRadius: 28, backgroundColor: "#1685E5", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}
            >
              <Text style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>{busy === "stripe" ? "Opening Stripe..." : "Verify with Stripe (Recommended)"}</Text>
            </Pressable>
            <Text selectable style={{ color: C.sage, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>
              Stripe is the most secure option. KindredCube stores only the Stripe verification reference and status ? not your ID document.
            </Text>
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={Boolean(busy)}
          onPress={openCamera}
          style={{ minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: C.line, backgroundColor: "#FFF9F1", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }}
        >
          <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900", textAlign: "center" }}>Selfie Verification</Text>
        </Pressable>
        <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
          You will be asked for camera permission first. The camera opens inside KindredCube with an oval face guide and turn-left / turn-right prompts.
        </Text>
        <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
          By submitting a video selfie, you consent to secure encrypted storage for fraud prevention, accountability, and Trust & Safety review under KindredCube's retention policy.
        </Text>
        {selfieNotice || notice ? (
          <Text accessibilityRole="alert" selectable style={{ color: (selfieNotice || notice).includes("Verified") ? C.sage : "#9C3225", fontSize: 12, lineHeight: 18, fontWeight: "900" }}>
            {selfieNotice || notice}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ReadyMeetChat({
  currentUserId,
  profile,
  onBack,
  onProfilePress,
  onBlock,
  onReport,
  onMessageSent,
  readyNearby = false,
  online = false,
  verificationStatus = "not_started",
  verificationMethod = "",
  onVerificationStatusChange,
  onVerificationMethodChange,
  onCurrentUserMeetupVerified,
  completedPostMeetCheckKeys = [],
  onPostMeetCheckCompleted,
}: {
  currentUserId?: string;
  profile: Profile;
  onBack: () => void;
  onProfilePress?: (profile: Profile) => void;
  onBlock: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onReport?: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onMessageSent?: (profile: Profile, message?: ChatMessage) => void;
  readyNearby?: boolean;
  online?: boolean;
  verificationStatus?: IdentityVerificationStatus;
  verificationMethod?: IdentityVerificationMethod;
  onVerificationStatusChange?: (status: IdentityVerificationStatus) => void;
  onVerificationMethodChange?: (method: IdentityVerificationMethod) => void;
  onCurrentUserMeetupVerified?: () => void;
  completedPostMeetCheckKeys?: string[];
  onPostMeetCheckCompleted?: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [message, setMessage] = useState("");
  const [pendingChatMedia, setPendingChatMedia] = useState<{
    kind: "image" | "video" | "audio";
    payload: Partial<Pick<ChatMessage, "imageUri" | "videoUri" | "fileSizeBytes" | "audioUri" | "durationMillis">>;
    label: string;
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    senderId?: string;
    recipientId?: string;
    createdAt?: string;
    sender: "me" | "them";
    kind: ChatMessage["kind"];
    text?: string;
    gifUrl?: string;
    gifTitle?: string;
    imageUri?: string;
    videoUri?: string;
    fileSizeBytes?: number;
    audioUri?: string;
    durationMillis?: number;
    meetingProposal?: ChatMessage["meetingProposal"];
    meetingResponse?: ChatMessage["meetingResponse"];
    editedAt?: string;
    unsentAt?: string;
    reactions?: Record<string, string>;
    pending?: boolean;
  }>>([]);
  const [messageActionTarget, setMessageActionTarget] = useState<(typeof chatMessages)[number] | null>(null);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [meetingPromptNotice, setMeetingPromptNotice] = useState("");
  const [replyTarget, setReplyTarget] = useState<(typeof chatMessages)[number] | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<ScrollView | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<Array<{
    id: string;
    title: string;
    url: string;
    previewUrl: string;
  }>>([]);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifError, setGifError] = useState("");
  const [composerNotice, setComposerNotice] = useState("");
  const [fullscreenPhotoUri, setFullscreenPhotoUri] = useState("");
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [venue, setVenue] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<MapPlaceSuggestion | null>(null);
  const [venueSuggestions, setVenueSuggestions] = useState<MapPlaceSuggestion[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [proposal, setProposal] = useState<MeetProposal | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [proposalSaving, setProposalSaving] = useState(false);
  const [postMeetOpen, setPostMeetOpen] = useState(false);
  const [postMeetOutcomeOpen, setPostMeetOutcomeOpen] = useState(false);
  const [postMeetMissedReasonOpen, setPostMeetMissedReasonOpen] = useState(false);
  const [postMeetMissedReason, setPostMeetMissedReason] = useState("");
  const [postMeetMissedSaving, setPostMeetMissedSaving] = useState(false);
  const [postMeetMissedError, setPostMeetMissedError] = useState("");
  const [postMeetSubmitted, setPostMeetSubmitted] = useState(false);
  const [postMeetStatusChecking, setPostMeetStatusChecking] = useState(false);
  const [postMeetStatusCheckedKey, setPostMeetStatusCheckedKey] = useState("");
  const [completedPostMeetKeys, setCompletedPostMeetKeys] = useState<string[]>(completedPostMeetCheckKeys);
  const [postMeetThanksVisible, setPostMeetThanksVisible] = useState(false);
  const [proposalDetailsExpanded, setProposalDetailsExpanded] = useState(true);
  const [declinedMeetingNoticeVisible, setDeclinedMeetingNoticeVisible] = useState(false);
  const [postMeetPromptPreviewVisible, setPostMeetPromptPreviewVisible] = useState(false);
  const [now, setNow] = useState(Date.now());
  const postMeetPulse = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [meetVerificationGate, setMeetVerificationGate] = useState<"" | "send" | "accept">("");
  const [meetVerificationBusy, setMeetVerificationBusy] = useState<"" | "stripe" | "selfie">("");
  const [meetVerificationNotice, setMeetVerificationNotice] = useState("");
  const chatSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const photoSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const currentUserMeetVerified = verificationStatus === "verified";
  const postMeetCheckKey = useCallback((candidate: MeetProposal | null | undefined) => {
    if (!profile.id || !candidate?.scheduledAt) return "";
    return `${profile.id}:${Math.round(candidate.scheduledAt / 60_000)}`;
  }, [profile.id]);
  useEffect(() => {
    setCompletedPostMeetKeys(completedPostMeetCheckKeys);
  }, [completedPostMeetCheckKeys.join("|")]);
  const markPostMeetCheckCompleted = useCallback((key: string) => {
    if (!key) return;
    setCompletedPostMeetKeys((current) => current.includes(key) ? current : [...current, key]);
    onPostMeetCheckCompleted?.(key);
  }, [onPostMeetCheckCompleted]);
  const accepted = proposal?.status === "accepted";
  const declined = proposal?.status === "declined";
  const currentPostMeetKey = postMeetCheckKey(proposal);
  const meetingEnd = accepted ?
    proposal.scheduledAt + proposal.durationMinutes * 60_000
    : Number.POSITIVE_INFINITY;
  const meetingEnded = accepted && now >= meetingEnd;
  const meetingIsStale = accepted && meetingEnd < now - 7 * 24 * 60 * 60 * 1000;
  const postMeetDue = meetingEnded &&
    !meetingIsStale &&
    !postMeetSubmitted &&
    !postMeetStatusChecking &&
    Boolean(currentPostMeetKey) &&
    postMeetStatusCheckedKey === currentPostMeetKey;
  const needsPostMeetAcknowledgement = accepted && meetingEnded && !postMeetSubmitted;
  const activeAccepted = accepted && !meetingEnded && !postMeetSubmitted;
  const activeAcceptedBeforeDue = activeAccepted;
  const postMeetNeedsAction = postMeetDue || needsPostMeetAcknowledgement;
  const typingMode = keyboardVisible && !proposalOpen && !gifOpen;
  const hasPriorChat = chatMessages.some((item) =>
    ["text", "gif", "image", "audio", "video"].includes(item.kind) &&
    !item.unsentAt,
  );
  const hasAcceptedProposalHistory = postMeetSubmitted || chatMessages.some((item) =>
    item.kind === "meeting_response" &&
    item.meetingResponse?.status === "accepted",
  );
  const topMeetingActionLabel = postMeetNeedsAction ?
    "Post-meet check"
    : declined && declinedMeetingNoticeVisible ?
      "Meeting declined"
    : activeAcceptedBeforeDue ?
      "Meeting Set"
      : "Propose Meeting";
  const openTopMeetingAction = () => {
    Keyboard.dismiss();
    setMediaMenuOpen(false);
    if (postMeetNeedsAction) {
      setMeetingPromptNotice("You had a meeting last time. To activate a new meeting, please tell us about the last meeting.");
      setPostMeetOutcomeOpen(true);
      setPostMeetMissedReasonOpen(false);
      setPostMeetMissedReason("");
      setProposalDetailsExpanded(true);
      return;
    }
    if (activeAcceptedBeforeDue) {
      setProposalDetailsExpanded((value) => !value);
      return;
    }
    if (!hasPriorChat) {
      setMeetingPromptNotice("Chat first, then agree to meet.");
      return;
    }
    setMeetingPromptNotice(hasAcceptedProposalHistory ? "We're happy to see you continuing to meet!" : "");
    setProposalOpen((value) => !value);
  };

  const appendServerMessage = useCallback((incoming: ChatMessage) => {
    if (!profile.id) return;
    if (incoming.senderId !== profile.id && incoming.recipientId !== profile.id) return;
    const sentByMe = currentUserId ? incoming.senderId === currentUserId : incoming.senderId !== profile.id;
    setChatMessages((current) => {
      const nextMessage = {
        ...incoming,
        sender: sentByMe ? "me" : "them",
      } as (typeof current)[number];
      if (current.some((item) => item.id === incoming.id)) {
        return current.map((item) => item.id === incoming.id ? { ...item, ...nextMessage } : item);
      }
      return [...current, nextMessage];
    });
  }, [currentUserId, profile.id]);

  useEffect(() => {
    setChatMessages([]);
    if (!profile.id) {
      setComposerNotice("This chat cannot deliver in real time until the profile has a real account.");
      return;
    }
    let active = true;
    let socket: Socket | null = null;
    setComposerNotice("");
    getConversationMessages(profile.id)
      .then((result) => {
        if (!active) return;
        setChatMessages(result.messages.map((item) => ({
          ...item,
          sender: (currentUserId ? item.senderId === currentUserId : item.senderId !== profile.id) ? "me" : "them",
        })));
      })
      .catch((caught) => {
        if (!active) return;
        setComposerNotice(caught instanceof Error ? caught.message : "Messages could not be loaded.");
      });
    getChatSocketConfig()
      .then(({ url, token }) => {
        if (!active) return;
        socket = io(`${url}/chats`, {
          transports: ["websocket", "polling"],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 700,
        });
        socketRef.current = socket;
        socket.on("chat:message", appendServerMessage);
        socket.on("connect_error", () => {
          if (active) setComposerNotice("Real-time chat is reconnecting. Messages may be delayed.");
        });
        socket.on("connect", () => {
          if (active) setComposerNotice("");
        });
      })
      .catch((caught) => {
        if (!active) return;
        setComposerNotice(caught instanceof Error ? caught.message : "Real-time chat could not connect.");
      });
    return () => {
      active = false;
      if (socketRef.current === socket) socketRef.current = null;
      socket?.disconnect();
    };
  }, [appendServerMessage, currentUserId, profile.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!postMeetThanksVisible) return;
    const timer = setTimeout(() => setPostMeetThanksVisible(false), 5_000);
    return () => clearTimeout(timer);
  }, [postMeetThanksVisible]);
  useEffect(() => {
    if (!activeAcceptedBeforeDue || !proposalDetailsExpanded) return;
    const timer = setTimeout(() => setProposalDetailsExpanded(false), 5_000);
    return () => clearTimeout(timer);
  }, [activeAcceptedBeforeDue, proposalDetailsExpanded, proposal?.scheduledAt]);
  useEffect(() => {
    if (!declined || !declinedMeetingNoticeVisible) return;
    const timer = setTimeout(() => {
      setDeclinedMeetingNoticeVisible(false);
      setProposal(null);
    }, 8_000);
    return () => clearTimeout(timer);
  }, [declined, declinedMeetingNoticeVisible]);
  useEffect(() => {
    if (!postMeetNeedsAction || postMeetOutcomeOpen || postMeetOpen) return;
    setPostMeetMissedReasonOpen(false);
    setPostMeetMissedReason("");
    setPostMeetPromptPreviewVisible(true);
    const timer = setTimeout(() => setPostMeetPromptPreviewVisible(false), 7_000);
    return () => clearTimeout(timer);
  }, [postMeetNeedsAction, postMeetOutcomeOpen, postMeetOpen, currentPostMeetKey]);
  useEffect(() => {
    if (!postMeetNeedsAction) {
      postMeetPulse.stopAnimation();
      postMeetPulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(postMeetPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(postMeetPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [postMeetNeedsAction, postMeetPulse]);
  useEffect(() => {
    const showEvent = process.env.EXPO_OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = process.env.EXPO_OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  useEffect(() => {
    const meetingMessages = chatMessages.filter((item) =>
      (item.kind === "meeting_proposal" && item.meetingProposal) ||
      (item.kind === "meeting_response" && item.meetingResponse),
    );
    const latest = meetingMessages[meetingMessages.length - 1];
    if (!latest) return;
    if (latest.kind === "meeting_proposal" && latest.meetingProposal) {
      const nextProposal: MeetProposal = {
        venue: latest.meetingProposal.venue,
        scheduledAt: latest.meetingProposal.scheduledAt,
        durationMinutes: latest.meetingProposal.durationMinutes,
        latitude: latest.meetingProposal.latitude,
        longitude: latest.meetingProposal.longitude,
        status: "pending",
      };
      if (completedPostMeetKeys.includes(postMeetCheckKey(nextProposal))) {
        setPostMeetSubmitted(true);
        setPostMeetOpen(false);
        setPostMeetThanksVisible(false);
        setProposal(null);
        return;
      }
      setPostMeetSubmitted(false);
      setPostMeetStatusCheckedKey("");
      setProposal(nextProposal);
      setProposalDetailsExpanded(true);
      return;
    }
    if (latest.kind === "meeting_response" && latest.meetingResponse) {
      const nextProposal: MeetProposal = {
        venue: latest.meetingResponse.proposal.venue,
        scheduledAt: latest.meetingResponse.proposal.scheduledAt,
        durationMinutes: latest.meetingResponse.proposal.durationMinutes,
        latitude: latest.meetingResponse.proposal.latitude,
        longitude: latest.meetingResponse.proposal.longitude,
        status: latest.meetingResponse.status,
      };
      if (completedPostMeetKeys.includes(postMeetCheckKey(nextProposal))) {
        setPostMeetSubmitted(true);
        setPostMeetOpen(false);
        setPostMeetThanksVisible(false);
        setProposal(null);
        return;
      }
      if (postMeetSubmitted) return;
      setProposal(nextProposal);
      setPostMeetStatusCheckedKey("");
      setProposalOpen(false);
      setProposalDetailsExpanded(latest.meetingResponse.status === "accepted" || latest.meetingResponse.status === "declined");
      if (latest.meetingResponse.status === "declined") {
        setDeclinedMeetingNoticeVisible(true);
      }
    }
  }, [chatMessages, completedPostMeetKeys, postMeetCheckKey, postMeetSubmitted]);
  useEffect(() => {
    if (!profile.id || !proposal?.scheduledAt) return;
    let active = true;
    const key = postMeetCheckKey(proposal);
    const proposalMeetingEnd = proposal.scheduledAt + proposal.durationMinutes * 60_000;
    if (proposal.status === "accepted" && proposalMeetingEnd < Date.now() - 7 * 24 * 60 * 60 * 1000) {
      if (key) {
        markPostMeetCheckCompleted(key);
      }
      setPostMeetSubmitted(true);
      setPostMeetOpen(false);
      setPostMeetThanksVisible(false);
      setProposal(null);
      return;
    }
    if (key && completedPostMeetKeys.includes(key)) {
      setPostMeetSubmitted(true);
      setPostMeetOpen(false);
      setPostMeetThanksVisible(false);
      setProposal(null);
      return;
    }
    setPostMeetStatusChecking(true);
    setPostMeetStatusCheckedKey("");
    getPostMeetCheckStatus({
      otherUserId: profile.id,
      meetingStartedAt: new Date(proposal.scheduledAt).toISOString(),
      venue: proposal.venue,
    })
      .then((status) => {
        if (!active) return;
        if (!status.submitted) {
          setPostMeetStatusChecking(false);
          setPostMeetStatusCheckedKey(key);
          return;
        }
        if (key) {
          markPostMeetCheckCompleted(key);
        }
        setPostMeetSubmitted(true);
        setPostMeetOpen(false);
        setPostMeetThanksVisible(false);
        setProposal(null);
      })
      .catch(() => {
        if (!active) return;
        setPostMeetStatusCheckedKey("");
      })
      .finally(() => {
        if (active) {
          setPostMeetStatusChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [completedPostMeetKeys, markPostMeetCheckCompleted, postMeetCheckKey, profile.id, proposal]);
  useEffect(() => {
    if (!proposalOpen) {
      setVenueSuggestions([]);
      setVenueSearching(false);
      return;
    }
    const query = venue.trim();
    if (query.length < 3 || selectedVenue?.address === query) {
      setVenueSuggestions([]);
      setVenueSearching(false);
      return;
    }
    let active = true;
    setVenueSearching(true);
    const timer = setTimeout(() => {
      searchMapPlaces(query)
        .then((result) => {
          if (!active) return;
          setVenueSuggestions(result.results);
          if (!result.results.length) {
            setProposalError("Keep typing a public place with city so Maps can find it.");
          } else if (proposalError === "Keep typing a public place with city so Maps can find it.") {
            setProposalError("");
          }
        })
        .catch((caught) => {
          if (!active) return;
          setVenueSuggestions([]);
          setProposalError(caught instanceof Error ? caught.message : "Map address search is unavailable.");
        })
        .finally(() => {
          if (active) setVenueSearching(false);
        });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [proposalOpen, selectedVenue?.address, venue]);

  const sendProposal = async () => {
    if (!currentUserMeetVerified) {
      Keyboard.dismiss();
      setProposalOpen(false);
      setMeetVerificationGate("send");
      setMeetVerificationNotice("Verify first to send a meetup proposal.");
      return;
    }
    if (!venue.trim()) return;
    setProposalSaving(true);
    setProposalError("");
    try {
      const place =
        selectedVenue?.address === venue.trim()
          ? selectedVenue
          : (await searchMapPlaces(venue.trim())).results[0];
      if (!place) throw new Error("Choose a recognizable public meeting place from Maps before sending.");
      const outgoingProposal: MeetProposal = {
        venue: place.address,
        scheduledAt: scheduledAt.getTime(),
        durationMinutes,
        latitude: place.latitude,
        longitude: place.longitude,
        status: "pending",
      };
      setPostMeetSubmitted(false);
      const delivered = await sendRealtimeMessage("meeting_proposal", {
        meetingProposal: {
          venue: outgoingProposal.venue,
          scheduledAt: outgoingProposal.scheduledAt,
          durationMinutes: outgoingProposal.durationMinutes,
          latitude: outgoingProposal.latitude,
          longitude: outgoingProposal.longitude,
        },
      });
      if (!delivered) throw new Error("The meeting proposal could not be delivered.");
      setProposal(outgoingProposal);
      setVenue(place.address);
      setSelectedVenue(place);
      setVenueSuggestions([]);
      setProposalOpen(false);
      setDateOpen(false);
      setTimeOpen(false);
    } catch (caught) {
      setProposalError(caught instanceof Error ? caught.message : "The meeting place could not be found.");
    } finally {
      setProposalSaving(false);
    }
  };
  const scheduled = proposal ? new Date(proposal.scheduledAt) : null;
  const latestProposalMessage = [...chatMessages].reverse().find((item) => item.kind === "meeting_proposal" && item.meetingProposal);
  const proposalSentByMe = latestProposalMessage?.sender === "me";
  const sendRealtimeMessage = useCallback(async (
    kind: ChatMessage["kind"],
    payload: Partial<Pick<ChatMessage, "text" | "gifUrl" | "gifTitle" | "imageUri" | "videoUri" | "fileSizeBytes" | "audioUri" | "durationMillis" | "meetingProposal" | "meetingResponse">>,
  ) => {
    if (!profile.id) {
      setComposerNotice("This profile is not connected to a real account yet.");
      return false;
    }
    setComposerNotice("");
    const socket = socketRef.current;
    if (socket?.connected) {
      const ack = await new Promise<{ ok: boolean; message?: ChatMessage | string }>((resolve) => {
        socket.timeout(7000).emit("chat:send", { recipientId: profile.id, kind, payload }, (error: unknown, response: { ok: boolean; message?: ChatMessage | string }) => {
          if (error) resolve({ ok: false, message: "Message delivery timed out. Check the connection and try again." });
          else resolve(response);
        });
      });
      if (ack.ok && typeof ack.message === "object") {
        appendServerMessage(ack.message);
        onMessageSent?.(profile, ack.message);
        return true;
      }
      setComposerNotice(typeof ack.message === "string" ? ack.message : "Message could not be delivered.");
      return false;
    }
    try {
      const saved = await sendChatMessage(profile.id, kind, payload);
      appendServerMessage(saved);
      onMessageSent?.(profile, saved);
      return true;
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Message could not be delivered.");
      return false;
    }
  }, [appendServerMessage, profile.id]);
  const sendTextMessage = async () => {
    const text = message.trim();
    if (!text) {
      if (pendingChatMedia) {
        const mediaDelivered = await sendRealtimeMessage(pendingChatMedia.kind, pendingChatMedia.payload);
        if (mediaDelivered) {
          setPendingChatMedia(null);
          setMessage("");
          setReplyTarget(null);
        }
      }
      return;
    }
    const outgoingText = replyTarget ?
      `Replying to ${replyTarget.sender === "me" ? "you" : profile.name}: "${chatMessagePreview(replyTarget as ChatMessage)}"\n${text}`
      : text;
    const delivered = await sendRealtimeMessage("text", { text: outgoingText });
    if (delivered) {
      if (pendingChatMedia) {
        const mediaDelivered = await sendRealtimeMessage(pendingChatMedia.kind, pendingChatMedia.payload);
        if (mediaDelivered) setPendingChatMedia(null);
      }
      setMessage("");
      setReplyTarget(null);
    }
  };
  const respondToMeetingProposal = async (status: "accepted" | "declined") => {
    if (!proposal) return;
    if (status === "accepted" && !currentUserMeetVerified) {
      Keyboard.dismiss();
      setMeetVerificationGate("accept");
      setMeetVerificationNotice("Verify first to accept a meetup proposal.");
      return;
    }
    const responseProposal = {
      venue: proposal.venue,
      scheduledAt: proposal.scheduledAt,
      durationMinutes: proposal.durationMinutes,
      latitude: proposal.latitude,
      longitude: proposal.longitude,
    };
    const delivered = await sendRealtimeMessage("meeting_response", {
      meetingResponse: { status, proposal: responseProposal },
    });
    if (delivered) setProposal({ ...proposal, status });
  };
  const closeCompletedMeeting = useCallback(() => {
    if (!proposal) return;
    const key = postMeetCheckKey(proposal);
    if (key) {
      markPostMeetCheckCompleted(key);
    }
    setPostMeetOpen(false);
    setPostMeetOutcomeOpen(false);
    setPostMeetMissedReasonOpen(false);
    setPostMeetMissedReason("");
    setPostMeetMissedError("");
    setPostMeetSubmitted(true);
    setPostMeetThanksVisible(true);
    setProposal(null);
    setProposalDetailsExpanded(true);
  }, [markPostMeetCheckCompleted, postMeetCheckKey, proposal]);
  const submitMissedMeeting = async (reason: string) => {
    if (!proposal || !profile.id || postMeetMissedSaving) return;
    setPostMeetMissedSaving(true);
    setPostMeetMissedError("");
    try {
      await submitPostMeetCheck({
        otherUserId: profile.id,
        meetingStartedAt: new Date(proposal.scheduledAt).toISOString(),
        meetingEndedAt: new Date(proposal.scheduledAt + proposal.durationMinutes * 60_000).toISOString(),
        venue: proposal.venue,
        latitude: proposal.latitude,
        longitude: proposal.longitude,
        met: false,
        missedReason: reason,
        showedUp: "No",
        profileMatched: "Mostly",
        feltSafe: "Yes",
        respectful: "Mostly",
        wouldMeetAgain: "Maybe",
        notes: `Meetup did not happen: ${reason}`,
      });
      closeCompletedMeeting();
    } catch (caught) {
      setPostMeetMissedError(caught instanceof Error ? caught.message : "We could not save this yet. Please try again.");
    } finally {
      setPostMeetMissedSaving(false);
    }
  };
  const openMessageActions = (item: (typeof chatMessages)[number]) => {
    setMessageActionTarget(item);
    setEditingMessageId("");
    setEditDraft(item.text || "");
  };
  const closeMessageActions = () => {
    setMessageActionTarget(null);
    setEditingMessageId("");
    setEditDraft("");
    setMessageActionBusy(false);
    setDeleteMode(false);
    setSelectedDeleteIds([]);
  };
  const syncChatPreviewFromMessages = (messages: typeof chatMessages) => {
    const lastVisible = [...messages]
      .reverse()
      .find((item) => item.kind && item.createdAt);
    if (!lastVisible) {
      onMessageSent?.({
        ...profile,
        chatPreview: "You matched. Start the conversation.",
        chatPreviewFromMe: false,
        chatLastMessageAt: "",
        chatLastMessageSenderId: undefined,
      });
      return;
    }
    onMessageSent?.({
      ...profile,
      chatPreview: chatMessagePreview(lastVisible as ChatMessage),
      chatPreviewFromMe: lastVisible.sender === "me",
      chatLastMessageAt: lastVisible.createdAt,
      chatLastMessageSenderId: lastVisible.senderId,
    });
  };
  const saveEditedMessage = async () => {
    const target = messageActionTarget;
    const text = editDraft.trim();
    if (!target || !text || messageActionBusy) return;
    setMessageActionBusy(true);
    try {
      const updated = await editChatMessage(target.id, text);
      appendServerMessage(updated);
      closeMessageActions();
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Message could not be edited.");
      setMessageActionBusy(false);
    }
  };
  const unsendSelectedMessage = async () => {
    const target = messageActionTarget;
    if (!target || messageActionBusy) return;
    setMessageActionBusy(true);
    try {
      const updated = await unsendChatMessage(target.id);
      appendServerMessage(updated);
      closeMessageActions();
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Message could not be unsent.");
      setMessageActionBusy(false);
    }
  };
  const deleteSelectedMessage = async () => {
    const target = messageActionTarget;
    if (!target || messageActionBusy) return;
    setMessageActionBusy(true);
    try {
      await deleteChatMessageForMe(target.id);
      setChatMessages((current) => {
        const next = current.filter((item) => item.id !== target.id);
        syncChatPreviewFromMessages(next);
        return next;
      });
      closeMessageActions();
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Message could not be deleted.");
      setMessageActionBusy(false);
    }
  };
  const beginReplyToMessage = () => {
    const target = messageActionTarget;
    if (!target) return;
    setReplyTarget(target);
    closeMessageActions();
  };
  const reactToSelectedMessage = async (emoji: string) => {
    const target = messageActionTarget;
    if (!target || messageActionBusy) return;
    const reactorId = currentUserId || "me";
    setChatMessages((current) =>
      current.map((item) =>
        item.id === target.id ?
          { ...item, reactions: { ...(item.reactions || {}), [reactorId]: emoji } }
          : item,
      ),
    );
    closeMessageActions();
    try {
      const updated = await reactToChatMessage(target.id, emoji);
      appendServerMessage(updated);
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Reaction could not be saved.");
      setChatMessages((current) =>
        current.map((item) => {
          if (item.id !== target.id) return item;
          const nextReactions = { ...(item.reactions || {}) };
          delete nextReactions[reactorId];
          return { ...item, reactions: nextReactions };
        }),
      );
    }
  };
  const beginMultiDelete = () => {
    const target = messageActionTarget;
    if (!target) return;
    setDeleteMode(true);
    setSelectedDeleteIds([target.id]);
    setMessageActionTarget(null);
    setEditingMessageId("");
    setEditDraft("");
  };
  const toggleDeleteSelection = (id: string) => {
    setSelectedDeleteIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };
  const deleteSelectedMessages = async () => {
    if (!selectedDeleteIds.length || messageActionBusy) return;
    setMessageActionBusy(true);
    try {
      await Promise.all(selectedDeleteIds.map((id) => deleteChatMessageForMe(id)));
      setChatMessages((current) => {
        const next = current.filter((item) => !selectedDeleteIds.includes(item.id));
        syncChatPreviewFromMessages(next);
        return next;
      });
      closeMessageActions();
    } catch (caught) {
      setComposerNotice(caught instanceof Error ? caught.message : "Messages could not be deleted.");
      setMessageActionBusy(false);
    }
  };
  const queueChatMedia = async (
    kind: "image" | "video" | "audio",
    localUri: string,
    mimeType: Parameters<typeof uploadChatMedia>[0]["mimeType"],
    fileSizeBytes: number,
    durationMillis?: number,
  ) => {
    const fileBase64 = await new File(localUri).base64();
    const uploaded = await uploadChatMedia({ fileBase64, mimeType, sizeBytes: fileSizeBytes });
    const payload = kind === "image" ?
      { imageUri: uploaded.uri, fileSizeBytes: uploaded.sizeBytes }
      : kind === "video" ?
        { videoUri: uploaded.uri, fileSizeBytes: uploaded.sizeBytes, durationMillis }
        : { audioUri: uploaded.uri, durationMillis };
    setPendingChatMedia({
      kind,
      payload,
      label: kind === "image" ? "Photo ready" : kind === "video" ? "Video ready" : "Voice note ready",
    });
    setComposerNotice(`${kind === "image" ? "Photo" : kind === "video" ? "Video" : "Voice note"} ready. Tap send to share it, or type a message if you want.`);
  };
  const capturePhoto = async () => {
    setComposerNotice("");
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setComposerNotice("Camera permission is required to take and send a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.78 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileSizeBytes = getPickerAssetSize(asset);
    if (fileSizeBytes && fileSizeBytes > CHAT_PHOTO_MAX_BYTES) {
      setComposerNotice("Photos must be 10 MB or less.");
      return;
    }
    try {
      await queueChatMedia("image", asset.uri, asset.mimeType === "image/png" ? "image/png" : asset.mimeType === "image/webp" ? "image/webp" : "image/jpeg", fileSizeBytes || 1);
    } catch {
      setComposerNotice("Photo could not be prepared for sending. Try another photo.");
    }
  };
  const chooseMedia = async () => {
    setComposerNotice("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setComposerNotice("Media library permission is required to send photos or videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.82,
      videoMaxDuration: 45,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileSizeBytes = getPickerAssetSize(asset);
    if (asset.type === "video") {
      if (fileSizeBytes && fileSizeBytes > CHAT_VIDEO_MAX_BYTES) {
        setComposerNotice("Videos must be 50 MB or less.");
        return;
      }
      try {
        await queueChatMedia("video", asset.uri, asset.mimeType === "video/quicktime" ? "video/quicktime" : "video/mp4", fileSizeBytes || 1, typeof asset.duration === "number" ? asset.duration : undefined);
      } catch {
        setComposerNotice("Video could not be prepared for sending. Try another video.");
      }
      return;
    }
    if (fileSizeBytes && fileSizeBytes > CHAT_PHOTO_MAX_BYTES) {
      setComposerNotice("Photos must be 10 MB or less.");
      return;
    }
    try {
      await queueChatMedia("image", asset.uri, asset.mimeType === "image/png" ? "image/png" : asset.mimeType === "image/webp" ? "image/webp" : "image/jpeg", fileSizeBytes || 1);
    } catch {
      setComposerNotice("Photo could not be prepared for sending. Try another photo.");
    }
  };
  const toggleVoiceRecording = async () => {
    setComposerNotice("");
    try {
      if (recorderState.isRecording) {
        const durationMillis = recorderState.durationMillis;
        await audioRecorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const audioUri = audioRecorder.uri;
        if (audioUri) {
          const audioFile = new File(audioUri);
          await queueChatMedia("audio", audioUri, "audio/mp4", Number(audioFile.size) || 1, durationMillis);
        }
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setComposerNotice("Microphone permission is required to record a voice note.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      setComposerNotice("The voice note could not be recorded. Check microphone permission and try again.");
    }
  };
  const closeGifPicker = useCallback(() => {
    setGifOpen(false);
    setGifQuery("");
    setGifResults([]);
    setGifError("");
    setGifBusy(false);
  }, []);
  const sendGifMessage = useCallback(async (gif: { id: string; title: string; url: string; previewUrl: string }) => {
    const delivered = await sendRealtimeMessage("gif", { gifUrl: gif.url, gifTitle: gif.title });
    if (delivered) closeGifPicker();
  }, [closeGifPicker, sendRealtimeMessage]);
  const runGifSearch = async (overrideQuery?: string) => {
    const query = (overrideQuery ?? gifQuery).trim();
    if (!query) return;
    setGifBusy(true);
    setGifError("");
    try {
      const result = await searchGifs(query);
      setGifResults(result.results);
      if (!result.results.length) setGifError("No GIFs found. Try another search.");
    } catch (caught) {
      setGifError(caught instanceof Error ? caught.message : "GIF search is unavailable.");
    } finally {
      setGifBusy(false);
    }
  };
  useEffect(() => {
    if (!gifOpen || gifQuery || gifResults.length || gifBusy) return;
    setGifQuery("hello");
    runGifSearch("hello");
  }, [gifOpen, gifBusy, gifQuery, gifResults.length]);
  useEffect(() => {
    const timer = setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [chatMessages.length]);

  const startStripeMeetVerification = async () => {
    setMeetVerificationBusy("stripe");
    setMeetVerificationNotice("");
    try {
      const session = await startIdentityVerification();
      onVerificationStatusChange?.(session.status);
      onVerificationMethodChange?.(session.verificationMethod || "stripe_identity");
      if (session.url) await openKindredInAppSession(session.url, "kindredcube://verification-complete");
      const result = await getIdentityVerificationStatus();
      onVerificationStatusChange?.(result.status);
      onVerificationMethodChange?.(result.verificationMethod || "stripe_identity");
      setMeetVerificationNotice(
        result.status === "verified" ?
          "Verified securely by Stripe. You can continue with this meetup."
          : "Stripe verification is pending. Check again shortly.",
      );
      if (result.status === "verified") setMeetVerificationGate("");
    } catch (caught) {
      setMeetVerificationNotice(caught instanceof Error ? caught.message : "Stripe verification could not be started.");
    } finally {
      setMeetVerificationBusy("");
    }
  };

  const submitVideoSelfieMeetVerification = async (input: {
    videoBase64: string;
    mimeType: "video/mp4" | "video/quicktime" | "video/mov";
    sizeBytes: number;
    faceImageBase64: string;
    faceImageMimeType: "image/jpeg";
  }) => {
    setMeetVerificationBusy("selfie");
    setMeetVerificationNotice("");
    try {
      const saved = await submitVideoSelfieVerification({
        videoBase64: input.videoBase64,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        consentAccepted: true,
        faceImageBase64: input.faceImageBase64,
        faceImageMimeType: input.faceImageMimeType,
      });
      onVerificationStatusChange?.(saved.status);
      onVerificationMethodChange?.(saved.verificationMethod);
      setMeetVerificationNotice(selfieVerificationNotice(saved.status, saved.reasonCode));
      if (saved.status === "verified") setMeetVerificationGate("");
    } catch (caught) {
      setMeetVerificationNotice(caught instanceof Error ? caught.message : "Video selfie verification could not be completed.");
    } finally {
      setMeetVerificationBusy("");
    }
  };

  const chatHeaderProfile = normalizeProfileVerification(profile);
  const chatVerificationSummary = profileVerificationSummaryText(chatHeaderProfile);

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Math.max(0, insets.top + 8)}
      style={{ flex: 1, backgroundColor: "transparent", padding: typingMode ? 6 : 8, gap: typingMode ? 7 : 10 }}
      onTouchStart={(event) => {
        const touch = event.nativeEvent.touches[0];
        chatSwipeStart.current = touch ? { x: touch.pageX, y: touch.pageY } : null;
      }}
      onTouchEnd={(event) => {
        const start = chatSwipeStart.current;
        const touch = event.nativeEvent.changedTouches[0];
        chatSwipeStart.current = null;
        if (!start || !touch) return;
        const dx = touch.pageX - start.x;
        const dy = Math.abs(touch.pageY - start.y);
        if (dx > 45 && dy < 120) onBack();
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: insets.top + 8, paddingHorizontal: 10, paddingBottom: 10, borderRadius: 31, backgroundColor: "#F1EAE0", boxShadow: "0 7px 16px rgba(0,29,48,0.10)" }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={onBack} style={{ width: 34, height: 44, alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft width={27} height={27} color={C.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${chatHeaderProfile.name}\'s profile`} onPress={() => onProfilePress?.(chatHeaderProfile)} style={{ width: 50, height: 50, borderRadius: 25, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
            <ProfileImage profile={chatHeaderProfile} size={50} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 }}>
              <Text selectable numberOfLines={1} style={{ flexShrink: 1, color: C.ink, fontSize: 19, fontWeight: "900" }}>{chatHeaderProfile.name}, {chatHeaderProfile.age}</Text>
              <ProfileVerificationBadgeIcons profile={chatHeaderProfile} size={17} stacked />
            </View>
            {chatVerificationSummary ? (
              <Text selectable numberOfLines={1} style={{ color: profileVerificationBadgeColor(chatHeaderProfile), fontSize: 10, fontWeight: "900" }}>
                {chatVerificationSummary}
              </Text>
            ) : readyNearby ? (
              <Text selectable numberOfLines={1} style={{ color: C.sage, fontSize: 10, fontWeight: "900" }}>Ready nearby</Text>
            ) : null}
          </View>
        </View>
        <Animated.View style={{ display: "none" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={topMeetingActionLabel}
            onPress={openTopMeetingAction}
            style={{ width: postMeetDue ? 86 : 82, alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: postMeetDue ? "#1F7A3B" : activeAccepted ? "#E7F7EA" : "#1685E5", borderWidth: 1.5, borderColor: activeAccepted ? "#279447" : KINDREDCUBE_ORANGE, alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: activeAccepted ? "0 8px 18px rgba(39,148,71,0.22)" : "0 10px 22px rgba(245,130,32,0.46)" }}>
              {activeAccepted ? (
                <Text style={{ color: "#1F7A3B", fontSize: 19, fontWeight: "900" }}>+</Text>
              ) : postMeetDue ? (
                <Check width={22} height={22} color={C.paper} />
              ) : (
                <CalendarHeart width={34} height={34} color={C.paper} strokeWidth={2.7} />
              )}
            </View>
            <Text style={{ color: activeAccepted ? "#1F7A3B" : "#1685E5", fontSize: 9, lineHeight: 10, fontWeight: "900", textAlign: "center" }}>
              {activeAccepted ? "Safety" : topMeetingActionLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
      <View style={{ display: "none", flexDirection: "row", alignItems: "center", gap: 11, minHeight: typingMode ? 50 : 58, borderRadius: 28, backgroundColor: C.paper, paddingHorizontal: 13, paddingVertical: 9, zIndex: 5 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Ready to Meet map" onPress={onBack}>
          <ChevronLeft width={26} height={26} color={C.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${chatHeaderProfile.name}\'s profile`} onPress={() => onProfilePress?.(chatHeaderProfile)} style={{ width: 48, height: 48, borderRadius: 24, overflow: "hidden", boxShadow: "0 8px 18px rgba(0,29,48,0.22)" }}><ProfileImage profile={chatHeaderProfile} size={48} /></Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 }}>
            <Text selectable numberOfLines={1} style={{ flexShrink: 1, color: C.ink, fontSize: 17, fontWeight: "900" }}>{chatHeaderProfile.name}, {chatHeaderProfile.age}</Text>
            <ProfileVerificationBadgeIcons profile={chatHeaderProfile} size={17} stacked />
          </View>
          {readyNearby ? (
            <Text selectable numberOfLines={1} style={{ color: C.sage, fontSize: 11, fontWeight: "800" }}>
              Ready nearby{online ? " · online" : ""}
            </Text>
          ) : null}
          {chatVerificationSummary ? (
            <Text selectable numberOfLines={1} style={{ color: profileVerificationBadgeColor(chatHeaderProfile), fontSize: 10, fontWeight: "900" }}>
              {chatVerificationSummary}
            </Text>
          ) : null}
        </View>
      </View>

      <Modal
        visible={Boolean(meetVerificationGate)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMeetVerificationGate("")}
      >
        {meetVerificationGate ? (
          <ReadyMeetVerificationScreen
            mode={meetVerificationGate}
            busy={meetVerificationBusy}
            notice={meetVerificationNotice}
            onClose={() => setMeetVerificationGate("")}
            onStripe={startStripeMeetVerification}
            onSubmitSelfie={submitVideoSelfieMeetVerification}
            showStripe
          />
        ) : null}
      </Modal>

      {meetingPromptNotice && !proposalOpen && !typingMode ? (
        <View style={{ borderRadius: 20, backgroundColor: "#F7F3ED", paddingHorizontal: 15, paddingVertical: 13, alignItems: "center", justifyContent: "center", boxShadow: "0 10px 24px rgba(0,29,48,0.10)" }}>
          <Text selectable style={{ color: C.ink, fontSize: 14, lineHeight: 19, fontWeight: "900", textAlign: "center" }}>
            {meetingPromptNotice}
          </Text>
        </View>
      ) : null}

      {proposalOpen ? (
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            onPress={Keyboard.dismiss}
            style={{ borderRadius: 24, backgroundColor: "#F7F3ED", borderWidth: 1, borderColor: C.line, overflow: "hidden", boxShadow: "0 18px 38px rgba(0,29,48,0.24)" }}
          >
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ padding: 15, gap: 10 }}
            >
          <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>Meeting proposal</Text>
          <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
            Choose a public place from Maps, then send the same meeting details to {profile.name}.
          </Text>
          <TextInput
            value={venue}
            onChangeText={(text) => {
              setVenue(text);
              if (selectedVenue?.address !== text.trim()) setSelectedVenue(null);
              setProposalError("");
            }}
            placeholder="Public place and city"
            placeholderTextColor="#948A7F"
            style={{ minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: selectedVenue ? C.sage : C.line, backgroundColor: C.paper, paddingHorizontal: 13, color: C.ink }}
          />
          {selectedVenue ? (
            <Text selectable style={{ color: C.sage, fontSize: 11, fontWeight: "900" }}>
              Map location selected: {selectedVenue.name}
            </Text>
          ) : venueSearching ? (
            <Text selectable style={{ color: C.muted, fontSize: 11, fontWeight: "800" }}>
              Searching Maps for this place...
            </Text>
          ) : null}
          {venueSuggestions.length ? (
            <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }}>
              {venueSuggestions.map((place, index) => (
                <Pressable
                  key={`${place.provider}-${place.id}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedVenue(place);
                    setVenue(place.address);
                    setVenueSuggestions([]);
                    setProposalError("");
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    gap: 3,
                    borderBottomWidth: index === venueSuggestions.length - 1 ? 0 : 1,
                    borderBottomColor: C.line,
                  }}
                >
                  <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
                    {place.name}
                  </Text>
                  <Text selectable numberOfLines={2} style={{ color: C.muted, fontSize: 10, lineHeight: 14 }}>
                    {place.address}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { setDateOpen((v) => !v); setTimeOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: C.paper, padding: 10 }}><Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>DATE</Text><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{scheduledAt.toLocaleDateString()}</Text></Pressable>
            <Pressable onPress={() => { setTimeOpen((v) => !v); setDateOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: C.paper, padding: 10 }}><Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>TIME</Text><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{scheduledAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text></Pressable>
          </View>
          {dateOpen ? <DateTimePicker value={scheduledAt} mode="date" minimumDate={new Date()} onChange={(event, value) => {
            if (event.type !== "dismissed" && value) {
              setScheduledAt((current) => {
                const next = new Date(current);
                next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
                if (next.getTime() <= Date.now()) return new Date(Date.now() + 60 * 60 * 1000);
                return next;
              });
            }
            if (process.env.EXPO_OS !== "ios") setDateOpen(false);
          }} /> : null}
          {timeOpen ? <DateTimePicker value={scheduledAt} mode="time" onChange={(event, value) => {
            if (event.type !== "dismissed" && value) {
              setScheduledAt((current) => {
                const next = new Date(current);
                next.setHours(value.getHours(), value.getMinutes(), 0, 0);
                if (next.getTime() <= Date.now()) {
                  const tomorrow = new Date(next);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return tomorrow;
                }
                return next;
              });
            }
            if (process.env.EXPO_OS !== "ios") setTimeOpen(false);
          }} /> : null}
          <Text selectable style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Roughly how long?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{[30, 45, 60, 90, 120].map((minutes) => <Pressable key={minutes} onPress={() => setDurationMinutes(minutes)} style={{ borderRadius: 18, borderWidth: 1, borderColor: durationMinutes === minutes ? C.sage : C.line, backgroundColor: durationMinutes === minutes ? "#E7F2EA" : C.paper, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: durationMinutes === minutes ? C.sage : C.ink, fontSize: 11, fontWeight: "900" }}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}</Text></Pressable>)}</View>
          {proposalError ? <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 11, fontWeight: "800" }}>{proposalError}</Text> : null}
          <Button compact label={proposalSaving ? "Finding meeting place..." : "Send proposal"} disabled={proposalSaving || !venue.trim() || scheduledAt.getTime() <= Date.now()} onPress={sendProposal} />
          <Pressable onPress={() => setProposalOpen(false)} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel</Text></Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      ) : null}

      {proposal && scheduled && !typingMode && (
        proposal.status === "pending" ||
        (proposal.status === "declined" && declinedMeetingNoticeVisible) ||
        (proposal.status === "accepted" && (proposalDetailsExpanded || postMeetPromptPreviewVisible || postMeetOutcomeOpen))
      ) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={needsPostMeetAcknowledgement ? "Post-meet outcome" : proposal.status === "accepted" ? "Toggle accepted meeting details" : "Meeting proposal details"}
          onPress={() => {
            if (proposal.status === "accepted" && !postMeetDue) setProposalDetailsExpanded(false);
          }}
          style={{ borderRadius: 20, borderWidth: 1.5, borderColor: proposal.status === "accepted" ? C.sage : proposal.status === "declined" ? "#C84534" : "#D5B853", backgroundColor: proposal.status === "accepted" ? "#F1F8F3" : C.paper, padding: proposal.status === "accepted" && !postMeetDue ? 10 : 14, gap: proposal.status === "accepted" && !postMeetDue ? 6 : 9, boxShadow: proposal.status === "accepted" ? "0 18px 40px rgba(39,148,71,0.22)" : "0 14px 32px rgba(0,29,48,0.16)" }}
        >
          <Text selectable style={{ color: C.ink, fontSize: proposal.status === "accepted" && !needsPostMeetAcknowledgement ? 14 : 16, fontWeight: "900" }}>{needsPostMeetAcknowledgement ? "Did you meet?" : proposal.status === "accepted" ? "Meeting accepted" : proposal.status === "declined" ? "Meeting declined" : proposalSentByMe ? "Meeting proposal sent" : "Meeting proposal received"}</Text>
          <Text selectable numberOfLines={proposal.status === "accepted" && !postMeetDue ? 1 : undefined} style={{ color: C.ink, fontSize: proposal.status === "accepted" && !postMeetDue ? 11 : 13, lineHeight: proposal.status === "accepted" && !postMeetDue ? 14 : undefined, fontWeight: "900" }}>{proposal.venue}</Text>
          <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>{scheduled.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {scheduled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · about {proposal.durationMinutes} minutes</Text>
          {proposal.status === "pending" && !proposalSentByMe ? <View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Button compact label="Accept" onPress={() => respondToMeetingProposal("accepted")} /></View><Pressable onPress={() => respondToMeetingProposal("declined")} style={{ flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: "#C84534", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#B52E20", fontWeight: "900" }}>Decline</Text></Pressable></View> : null}
          {proposal.status === "pending" && proposalSentByMe ? <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16, textAlign: "center", fontWeight: "800" }}>Waiting for {profile.name} to accept or decline.</Text> : null}
          {proposal.status === "declined" ? <Button compact label="Create another proposal" onPress={() => { setProposal(null); setProposalOpen(true); }} /> : null}
          {needsPostMeetAcknowledgement ? (
            <View style={{ gap: 9 }}>
              <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
                Your scheduled meeting window has passed. Did you meet?
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button compact label="Yes, we met" onPress={() => setPostMeetOpen(true)} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPostMeetMissedReasonOpen(true)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: C.line,
                    backgroundColor: C.paper,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 8,
                  }}
                >
                  <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900", textAlign: "center" }}>No, we didn't</Text>
                </Pressable>
              </View>
              {postMeetMissedReasonOpen ? (
                <View style={{ gap: 8 }}>
                  <Text selectable style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>What happened?</Text>
                  {["They didn't show up", "I couldn't make it", "We rescheduled", "We changed our minds", "Other"].map((reason) => (
                    <Pressable
                      key={reason}
                      accessibilityRole="button"
                      disabled={postMeetMissedSaving}
                      onPress={() => {
                        setPostMeetMissedReason(reason);
                        submitMissedMeeting(reason);
                      }}
                      style={{
                        minHeight: 38,
                        borderRadius: 19,
                        borderWidth: 1,
                        borderColor: postMeetMissedReason === reason ? C.sage : C.line,
                        backgroundColor: postMeetMissedReason === reason ? "#E7F2EA" : C.paper,
                        paddingHorizontal: 12,
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: postMeetMissedReason === reason ? C.sage : C.ink, fontSize: 11, fontWeight: "900" }}>
                        {reason}
                      </Text>
                    </Pressable>
                  ))}
                  {postMeetMissedError ? (
                    <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 11, fontWeight: "800" }}>
                      {postMeetMissedError}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {proposal.status === "accepted" && !postMeetNeedsAction && proposalDetailsExpanded ? (
            <View style={{ gap: 5 }}>
              <Text selectable style={{ color: C.sage, fontSize: 11, lineHeight: 16, fontWeight: "900" }}>
                Meet in a public place and keep the agreed details in chat.
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
                After this meeting window ends, KindredCube will privately ask both of you whether you met.
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {proposal && needsPostMeetAcknowledgement ? (
        <PostMeetCheckModal
          visible={postMeetOpen}
          profile={profile}
          proposal={proposal}
          onCancel={() => setPostMeetOpen(false)}
          onDone={(result) => {
            if (result?.meetupVerified) onCurrentUserMeetupVerified?.();
            closeCompletedMeeting();
          }}
        />
      ) : null}

      {typingMode && proposal && scheduled ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: proposal.status === "accepted" ? C.sage : C.line, backgroundColor: proposal.status === "accepted" ? "#F1F8F3" : "#F7F3ED", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text selectable numberOfLines={1} style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
            {needsPostMeetAcknowledgement ? "Tell us about your last meeting" : proposal.status === "accepted" ? "Meeting accepted" : proposal.status === "declined" ? "Meeting declined" : "Meeting proposal"}
          </Text>
          <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 10, fontWeight: "800" }}>
            {proposal.venue}
          </Text>
        </View>
      ) : null}

      {accepted && !meetingEnded && scheduled && !typingMode ? <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }}>The post-meet check becomes available after {new Date(meetingEnd).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.</Text> : null}
      {postMeetSubmitted && postMeetThanksVisible && !typingMode ? <View style={{ borderRadius: 16, backgroundColor: "#E7F2EA", padding: 12 }}><Text selectable style={{ color: C.sage, fontSize: 12, fontWeight: "900" }}>Thank you. Your private post-meet check was submitted.</Text></View> : null}

      <ScrollView
        ref={chatScrollRef}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onLayout={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
        onTouchStart={() => {
          if (accepted && proposalDetailsExpanded) setProposalDetailsExpanded(false);
        }}
        style={{ flex: 1, minHeight: 0, opacity: proposalOpen || (accepted && proposalDetailsExpanded && !typingMode) ? 0.52 : 1 }}
        contentContainerStyle={{ gap: 8, paddingTop: 4, paddingBottom: typingMode ? 12 : 4 }}
      >
        {chatMessages.map((item, index) => {
          const sentByMe = item.sender === "me";
          const bubbleColor = sentByMe ? "rgba(245,130,32,0.40)" : "#FFFFFF";
          const bubbleBorder = KINDREDCUBE_ORANGE;
          const bubbleTextColor = C.ink;
          const softTextColor = sentByMe ? "rgba(34,31,27,0.72)" : C.muted;
          const selectedForDelete = selectedDeleteIds.includes(item.id);
          const previous = chatMessages[index - 1];
          const showDate = !previous || chatDayKey(previous.createdAt) !== chatDayKey(item.createdAt);
          const reactionValues = item.reactions ? Object.values(item.reactions).filter(Boolean) : [];
          return (
            <View key={item.id} style={{ width: "100%", gap: showDate ? 8 : 0 }}>
              {showDate ? (
                <View style={{ alignSelf: "center", borderRadius: 13, backgroundColor: "#F3EFE8", paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text selectable style={{ color: C.muted, fontSize: 10, fontWeight: "900" }}>{formatChatDate(item.createdAt)}</Text>
                </View>
              ) : null}
            <View style={{ alignSelf: sentByMe ? "flex-end" : "flex-start", maxWidth: "84%", paddingBottom: 12, position: "relative" }}>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  bottom: 5,
                  [sentByMe ? "right" : "left"]: 18,
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  backgroundColor: selectedForDelete ? "#FDE5E1" : bubbleColor,
                  borderWidth: selectedForDelete ? 2.5 : 1.5,
                  borderColor: selectedForDelete ? "#C84534" : bubbleBorder,
                  transform: [{ rotate: "45deg" }],
                  zIndex: 0,
                }}
              />
              <Pressable
                onPress={() => {
                  if (deleteMode) toggleDeleteSelection(item.id);
                }}
                onLongPress={() => openMessageActions(item)}
                delayLongPress={280}
                style={{ borderRadius: 16, borderCurve: "continuous", overflow: "hidden", backgroundColor: selectedForDelete ? "#FDE5E1" : bubbleColor, borderWidth: selectedForDelete ? 2.5 : 1.5, borderColor: selectedForDelete ? "#C84534" : bubbleBorder, padding: 10, zIndex: 2 }}
              >
                {item.kind === "gif" && item.gifUrl ? <Image source={{ uri: item.gifUrl }} accessibilityLabel={item.gifTitle || "GIF"} resizeMode="cover" style={{ width: 220, height: 165, borderRadius: 11 }} /> : null}
                {item.kind === "image" && item.imageUri ? (
                  <Pressable
                    accessibilityRole="imagebutton"
                    accessibilityLabel="Open chat photo"
                    onPress={() => setFullscreenPhotoUri(item.imageUri || "")}
                  >
                    <Image source={{ uri: item.imageUri }} accessibilityLabel="Chat photo" resizeMode="cover" style={{ width: 220, height: 220, borderRadius: 11 }} />
                  </Pressable>
                ) : null}
                {item.kind === "video" && item.videoUri ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open chat video"
                    onPress={() => Linking.openURL(item.videoUri || "").catch(() => undefined)}
                    style={{ width: 220, minHeight: 138, borderRadius: 11, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 }}
                  >
                    <Play width={34} height={34} color={C.paper} fill={C.paper} />
                    <Text style={{ color: C.paper, fontSize: 13, fontWeight: "900", textAlign: "center" }}>Video</Text>
                    <Text style={{ color: "#CEC8BE", fontSize: 10, fontWeight: "800", textAlign: "center" }}>
                      {item.durationMillis ? `${Math.round(item.durationMillis / 1000)}s` : "Tap to open"}
                    </Text>
                  </Pressable>
                ) : null}
                {item.kind === "audio" && item.audioUri ? <ChatAudioBubble uri={item.audioUri} durationMillis={item.durationMillis} /> : null}
                {item.kind === "text" ? <Text selectable style={{ color: bubbleTextColor, fontSize: 14, lineHeight: 19, fontWeight: item.unsentAt ? "800" : "700", fontStyle: item.unsentAt ? "italic" : "normal" }}>{item.text}</Text> : null}
                {item.kind === "meeting_proposal" && item.meetingProposal ? (
                  <View style={{ width: 230, gap: 5 }}>
                    <Text selectable style={{ color: bubbleTextColor, fontSize: 14, fontWeight: "900" }}>
                      {sentByMe ? "Meeting proposal sent" : "Meeting proposal"}
                    </Text>
                    <Text selectable style={{ color: bubbleTextColor, fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                      {item.meetingProposal.venue}
                    </Text>
                    <Text selectable style={{ color: softTextColor, fontSize: 10, lineHeight: 14 }}>
                      {new Date(item.meetingProposal.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {new Date(item.meetingProposal.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ? about {item.meetingProposal.durationMinutes} minutes
                    </Text>
                    {!sentByMe ? (
                      <Text selectable style={{ color: C.sage, fontSize: 10, lineHeight: 14, fontWeight: "900" }}>
                        Use the proposal card above to accept or decline.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {item.kind === "meeting_response" && item.meetingResponse ? (
                  <View style={{ width: 230, gap: 5 }}>
                    <Text selectable style={{ color: bubbleTextColor, fontSize: 14, fontWeight: "900" }}>
                      {item.meetingResponse.status === "accepted" ? "Meeting accepted" : "Meeting declined"}
                    </Text>
                    <Text selectable style={{ color: softTextColor, fontSize: 10, lineHeight: 14 }}>
                      {item.meetingResponse.proposal.venue}
                    </Text>
                  </View>
                ) : null}
                {reactionValues.length ? (
                  <View style={{ alignSelf: "flex-start", marginTop: 5, borderRadius: 12, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", gap: 3 }}>
                    {reactionValues.slice(0, 4).map((emoji, reactionIndex) => (
                      <Text key={`${emoji}-${reactionIndex}`} style={{ fontSize: 13 }}>{emoji}</Text>
                    ))}
                  </View>
                ) : null}
                {item.editedAt && !item.unsentAt ? <Text selectable style={{ color: "rgba(34,31,27,0.62)", fontSize: 10, fontWeight: "900", marginTop: 4 }}>Edited</Text> : null}
                <Text selectable style={{ alignSelf: "flex-end", color: softTextColor, fontSize: 9, fontWeight: "900", marginTop: 5 }}>
                  {formatChatTime(item.createdAt)}
                </Text>
              </Pressable>
            </View>
            </View>
          );
        })}
      </ScrollView>

      {composerNotice ? <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 10, fontWeight: "800", textAlign: "center" }}>{composerNotice}</Text> : null}
      {recorderState.isRecording ? <Text accessibilityRole="alert" selectable style={{ color: "#B52E20", fontSize: 11, fontWeight: "900", textAlign: "center" }}>Recording voice note ? {Math.max(1, Math.round(recorderState.durationMillis / 1000))}s ? tap stop to send</Text> : null}

      {deleteMode ? (
        <View style={{ borderRadius: 18, backgroundColor: "#FFF4EF", borderWidth: 1, borderColor: "#E5B8AE", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text selectable style={{ flex: 1, color: "#9C3225", fontSize: 12, fontWeight: "900" }}>
            {selectedDeleteIds.length} selected
          </Text>
          <Pressable accessibilityRole="button" disabled={!selectedDeleteIds.length || messageActionBusy} onPress={deleteSelectedMessages} style={{ minHeight: 34, borderRadius: 17, backgroundColor: "#9C3225", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>Delete</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={closeMessageActions} style={{ minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {gifOpen ? (
        <View style={{ maxHeight: 205, borderRadius: 22, backgroundColor: "#F7F3ED", padding: 12, gap: 10, borderWidth: 1, borderColor: C.line, boxShadow: "0 10px 24px rgba(0,29,48,0.14)" }}>
          <View style={{ flexDirection: "row", gap: 7 }}>
            <TextInput autoFocus value={gifQuery} onChangeText={setGifQuery} onSubmitEditing={() => runGifSearch()} returnKeyType="search" placeholder="Search GIFs" placeholderTextColor="#948A7F" style={{ flex: 1, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, color: C.ink, paddingHorizontal: 12, fontSize: 15 }} />
            <Pressable accessibilityRole="button" disabled={gifBusy || !gifQuery.trim()} onPress={() => runGifSearch()} style={{ minWidth: 65, borderRadius: 15, backgroundColor: gifQuery.trim() ? C.ink : "#BDB5AA", alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>{gifBusy ? "..." : "Search"}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel GIF search" onPress={closeGifPicker} style={{ minWidth: 54, borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>Cancel</Text></Pressable>
          </View>
          {gifError ? <Text accessibilityRole="alert" selectable style={{ color: "#9C3225", fontSize: 11, fontWeight: "800" }}>{gifError}</Text> : null}
          {gifResults.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
            {gifResults.map((gif) => <Pressable key={gif.id} accessibilityRole="button" accessibilityLabel={`Send ${gif.title}`} onPress={() => sendGifMessage(gif)} style={{ width: 126, height: 96, borderRadius: 12, overflow: "hidden", backgroundColor: C.line }}><Image source={{ uri: gif.previewUrl || gif.url }} resizeMode="cover" style={{ width: "100%", height: "100%" }} /></Pressable>)}
          </ScrollView> : null}
          <Text selectable style={{ color: C.muted, fontSize: 9, fontWeight: "900", textAlign: "right" }}>Powered by GIPHY</Text>
        </View>
      ) : null}
      {replyTarget ? (
        <View style={{ borderRadius: 16, backgroundColor: "#F7F3ED", borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text selectable numberOfLines={1} style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>Replying to {replyTarget.sender === "me" ? "your message" : profile.name}</Text>
            <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 10, fontWeight: "700" }}>{chatMessagePreview(replyTarget as ChatMessage)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTarget(null)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }}>
            <X width={17} height={17} color={C.ink} />
          </Pressable>
        </View>
      ) : null}
      {pendingChatMedia ? (
        <View style={{ borderRadius: 16, backgroundColor: "#FFF8EF", borderWidth: 1, borderColor: "#F4C28C", paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text selectable numberOfLines={1} style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>{pendingChatMedia.label}</Text>
            <Text selectable numberOfLines={1} style={{ color: C.muted, fontSize: 10, fontWeight: "700" }}>Tap send to share, or add a message.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove queued media" onPress={() => { setPendingChatMedia(null); setComposerNotice(""); }} style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }}>
            <X width={17} height={17} color={C.ink} />
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 29, backgroundColor: "rgba(255,253,249,0.88)", paddingHorizontal: 4, paddingTop: 4, paddingBottom: Math.max(4, typingMode ? 5 : 4), boxShadow: "0 -5px 14px rgba(0,29,48,0.08)" }}>
        {(() => {
          const actionIsDeclined = declined && declinedMeetingNoticeVisible;
          const actionIsAccepted = activeAcceptedBeforeDue;
          const actionIsDue = postMeetNeedsAction;
          const pulseScale = postMeetPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.12],
          });
          const pulseOpacity = postMeetPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.58],
          });
          const actionButton = (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={topMeetingActionLabel}
          onPress={openTopMeetingAction}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: actionIsDue || actionIsAccepted ? "#E7F7EA" : actionIsDeclined ? "#F8EAE7" : "#E6E3DC",
            borderWidth: 1,
            borderColor: actionIsDue || actionIsAccepted ? "#279447" : actionIsDeclined ? "#C84534" : "#D2CCC2",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(0,29,48,0.10)",
          }}
        >
          {actionIsAccepted || actionIsDue ? (
            <Check width={20} height={20} color="#1F7A3B" />
          ) : actionIsDeclined ? (
            <MinusCircle width={22} height={22} color="#C84534" strokeWidth={2.5} />
          ) : (
            <CalendarHeart width={22} height={22} color="#1685E5" strokeWidth={2.6} />
          )}
        </Pressable>
          );
          return actionIsDue ? (
            <Animated.View style={{ transform: [{ scale: pulseScale }], opacity: pulseOpacity }}>
              {actionButton}
            </Animated.View>
          ) : actionButton;
        })()}
        <View style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 24, backgroundColor: C.paper, justifyContent: "center", boxShadow: "0 8px 22px rgba(0,29,48,0.16)" }}>
          <TextInput value={message} onChangeText={setMessage} onSubmitEditing={sendTextMessage} returnKeyType="send" placeholder={`Message ${profile.name}...`} placeholderTextColor="#948A7F" style={{ minHeight: 46, paddingLeft: 14, paddingRight: 48, color: C.ink }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Choose GIF" onPress={() => setGifOpen((value) => !value)} style={{ position: "absolute", right: 4, width: 42, height: 40, borderRadius: 20, backgroundColor: gifOpen ? "#FCE5EE" : "transparent", alignItems: "center", justifyContent: "center" }}>
            <Image source={require("./assets/gif-icon.png")} resizeMode="contain" style={{ width: 28, height: 28 }} />
          </Pressable>
        </View>
        <View style={{ position: "relative" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open media options"
            onPress={() => {
              setGifOpen(false);
              setMediaMenuOpen((value) => !value);
            }}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#F3EFE8", alignItems: "center", justifyContent: "center" }}
          >
            <Plus width={22} height={22} color={C.ink} strokeWidth={2.6} />
          </Pressable>
          {mediaMenuOpen ? (
            <View style={{ position: "absolute", right: 0, bottom: 48, width: 150, borderRadius: 18, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 8, gap: 5, boxShadow: "0 10px 24px rgba(0,29,48,0.18)" }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" onPress={() => { setMediaMenuOpen(false); capturePhoto(); }} style={{ minHeight: 40, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 9 }}>
                <Camera width={19} height={19} color={C.ink} strokeWidth={2.2} />
                <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Camera</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Upload photo or video" onPress={() => { setMediaMenuOpen(false); chooseMedia(); }} style={{ minHeight: 40, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 9 }}>
                <FileText width={19} height={19} color={C.ink} strokeWidth={2.2} />
                <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Upload</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? "Stop and send voice note" : "Record voice note"} onPress={toggleVoiceRecording} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: recorderState.isRecording ? "#F9D9D4" : "#F3EFE8", alignItems: "center", justifyContent: "center" }}>
          {recorderState.isRecording ? <Square width={17} height={17} color="#B52E20" fill="#B52E20" /> : <Mic width={21} height={21} color={C.ink} strokeWidth={2.2} />}
        </Pressable>
        {message.trim() || pendingChatMedia ? <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={sendTextMessage} style={{ width: 44, height: 42, borderRadius: 21, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}><ChevronRight width={21} height={21} color={C.paper} strokeWidth={3} /></Pressable> : null}
      </View>
      <Modal transparent animationType="fade" visible={Boolean(fullscreenPhotoUri)} onRequestClose={() => setFullscreenPhotoUri("")}>
        <View
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", paddingHorizontal: 10, paddingVertical: Math.max(18, insets.top + 10) }}
          onTouchStart={(event) => {
            const touch = event.nativeEvent.touches[0];
            photoSwipeStart.current = touch ? { x: touch.pageX, y: touch.pageY } : null;
          }}
          onTouchEnd={(event) => {
            const start = photoSwipeStart.current;
            const touch = event.nativeEvent.changedTouches[0];
            photoSwipeStart.current = null;
            if (!start || !touch) return;
            const dy = touch.pageY - start.y;
            const dx = Math.abs(touch.pageX - start.x);
            if (dy > 45 && dx < 140) setFullscreenPhotoUri("");
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to chat"
            onPress={() => setFullscreenPhotoUri("")}
            style={{ position: "absolute", top: Math.max(14, insets.top + 6), left: 14, zIndex: 2, minHeight: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: C.paper, fontSize: 13, fontWeight: "900" }}>Back to chat</Text>
          </Pressable>
          {fullscreenPhotoUri ? (
            <Image source={{ uri: fullscreenPhotoUri }} accessibilityLabel="Full screen chat photo" resizeMode="contain" style={{ width: "100%", height: "100%" }} />
          ) : null}
        </View>
      </Modal>
      <Modal transparent animationType="fade" visible={Boolean(messageActionTarget)} onRequestClose={closeMessageActions}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(34,31,27,0.88)" }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Close message actions" onPress={closeMessageActions} style={{ flex: 1 }} />
          <View style={{ marginHorizontal: 14, marginBottom: Math.max(12, insets.bottom + 8), borderRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10, boxShadow: "0 18px 42px rgba(0,29,48,0.24)" }}>
            {messageActionTarget ? (
              <View style={{ flexDirection: "row", alignSelf: "center", borderRadius: 23, backgroundColor: "#FFF8EF", borderWidth: 1, borderColor: "#F4C28C", paddingHorizontal: 8, paddingVertical: 6, gap: 6 }}>
                {[
                  ["\u{1F44D}", "OK"],
                  ["\u{2764}\u{FE0F}", "Heart"],
                  ["\u{1F602}", "Laughing"],
                  ["\u{1F62E}", "Surprise"],
                  ["\u{1F61F}", "Worried"],
                  ["\u{1F64F}", "Thank You"],
                  ["\u{1F525}", "Fire"],
                ].map(([emoji, label]) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} reaction`}
                    onPress={() => reactToSelectedMessage(emoji)}
                    style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 21 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {messageActionTarget ? (
              <View style={{ alignSelf: messageActionTarget.sender === "me" ? "flex-end" : "flex-start", maxWidth: "86%", borderRadius: 17, borderWidth: 1.5, borderColor: KINDREDCUBE_ORANGE, backgroundColor: messageActionTarget.sender === "me" ? "rgba(245,130,32,0.40)" : "#FFFFFF", padding: 11 }}>
                <Text selectable numberOfLines={4} style={{ color: C.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" }}>
                  {chatMessagePreview(messageActionTarget as ChatMessage)}
                </Text>
                <Text selectable style={{ alignSelf: "flex-end", color: C.muted, fontSize: 9, fontWeight: "900", marginTop: 5 }}>
                  {formatChatTime(messageActionTarget.createdAt)}
                </Text>
              </View>
            ) : null}
            <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
              {deleteMode ? "Select messages to delete" : "Message options"}
            </Text>
            {editingMessageId && messageActionTarget ? (
              <View style={{ gap: 9 }}>
                <TextInput
                  autoFocus
                  multiline
                  value={editDraft}
                  onChangeText={setEditDraft}
                  placeholder="Edit your message"
                  placeholderTextColor="#948A7F"
                  style={{ minHeight: 86, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: "#F7F3ED", color: C.ink, padding: 12, textAlignVertical: "top", fontSize: 15 }}
                />
                <Button compact label={messageActionBusy ? "Saving..." : "Save edit"} disabled={messageActionBusy || !editDraft.trim()} onPress={saveEditedMessage} />
                <Pressable onPress={() => setEditingMessageId("")} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel edit</Text></Pressable>
              </View>
            ) : deleteMode ? (
              <View style={{ gap: 9 }}>
                <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>
                  Tap messages in the chat to add or remove them. {selectedDeleteIds.length} selected.
                </Text>
                <Button compact label={messageActionBusy ? "Deleting..." : `Delete ${selectedDeleteIds.length || ""}`.trim()} disabled={messageActionBusy || !selectedDeleteIds.length} onPress={deleteSelectedMessages} />
                <Pressable onPress={closeMessageActions} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel</Text></Pressable>
              </View>
            ) : messageActionTarget ? (
              <View style={{ gap: 8 }}>
                <Pressable accessibilityRole="button" disabled={messageActionBusy} onPress={beginReplyToMessage} style={{ minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <Reply width={17} height={17} color={C.ink} />
                  <Text style={{ flex: 1, color: C.ink, fontSize: 14, fontWeight: "900" }}>Reply</Text>
                </Pressable>
                {messageActionTarget.sender === "me" && messageActionTarget.kind === "text" && !messageActionTarget.unsentAt ? (
                  <Pressable accessibilityRole="button" onPress={() => setEditingMessageId(messageActionTarget.id)} style={{ minHeight: 46, borderRadius: 16, backgroundColor: "#F3EFE8", paddingHorizontal: 13, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 9 }}>
                    <Pencil width={17} height={17} color={C.ink} />
                    <Text style={{ flex: 1, color: C.ink, fontSize: 14, fontWeight: "900" }}>Edit</Text>
                  </Pressable>
                ) : null}
                {messageActionTarget.sender === "me" && !messageActionTarget.unsentAt ? (
                  <Pressable accessibilityRole="button" disabled={messageActionBusy} onPress={unsendSelectedMessage} style={{ minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: "#E5B8AE", paddingHorizontal: 13, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 9 }}>
                    <Undo2 width={17} height={17} color="#9C3225" />
                    <Text style={{ flex: 1, color: "#9C3225", fontSize: 14, fontWeight: "900" }}>Unsend</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" disabled={messageActionBusy} onPress={beginMultiDelete} style={{ minHeight: 46, borderRadius: 16, backgroundColor: "#FFF4EF", paddingHorizontal: 13, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <Trash2 width={17} height={17} color="#9C3225" />
                  <Text style={{ flex: 1, color: "#9C3225", fontSize: 14, fontWeight: "900" }}>Delete</Text>
                </Pressable>
                <Pressable onPress={closeMessageActions} style={{ minHeight: 38, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel</Text></Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getPickerAssetSize(asset: ImagePicker.ImagePickerAsset) {
  const size = Number(asset.fileSize);
  if (Number.isFinite(size) && size > 0) return Math.round(size);
  try {
    const file = new File(asset.uri);
    const detectedSize = Number(file.size);
    return Number.isFinite(detectedSize) && detectedSize > 0 ? Math.round(detectedSize) : undefined;
  } catch {
    return undefined;
  }
}

async function getPickerAssetBase64(asset: ImagePicker.ImagePickerAsset) {
  const fromPicker = typeof asset.base64 === "string" ? asset.base64.trim() : "";
  if (fromPicker) return fromPicker;
  try {
    return await LegacyFileSystem.readAsStringAsync(asset.uri, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
  } catch {
    // Fall through to the newer file API below. Some native gallery URIs only
    // work with one reader depending on platform/build.
  }
  try {
    return await new File(asset.uri).base64();
  } catch {
    return "";
  }
}

function estimateBase64SizeBytes(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function chatDayKey(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "today";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatChatDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "Today";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (chatDayKey(value) === chatDayKey(today.toISOString())) return "Today";
  if (chatDayKey(value) === chatDayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatChatTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function privacySafeAreaCoordinate(latitude: number, longitude: number) {
  const coarseLatitude = Math.round(latitude * 20) / 20;
  const coarseLongitude = Math.round(longitude * 20) / 20;
  return {
    latitude: coarseLatitude + 0.018,
    longitude: coarseLongitude - 0.021,
  };
}

const readyMeetEmptyQuotes = [
  { text: "With the right person, you will evolve rapidly.", author: "Beatrice Sparks" },
  { text: "In love, the paradox occurs that two beings become one and yet remain two.", author: "Erich Fromm" },
  { text: "The right person feels like peace, not pressure.", author: "KindredCube" },
  { text: "Real connection begins where performance ends.", author: "KindredCube" },
  { text: "A true kindred makes becoming yourself feel safe.", author: "KindredCube" },
  { text: "The best meetings feel less like chance and more like recognition.", author: "KindredCube" },
] as const;

function ReadyMeetEmptyStory() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const quote = readyMeetEmptyQuotes[quoteIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => {
        setQuoteIndex((current) => (current + 1) % readyMeetEmptyQuotes.length);
        Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      });
    }, 7000);
    return () => clearInterval(timer);
  }, [fade]);

  return (
    <View style={{ flex: 1, minHeight: 460, justifyContent: "center", gap: 16, paddingBottom: 24 }}>
      <View style={{ gap: 14 }}>
        <View style={{ height: 318, borderRadius: 30, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Image source={require("./assets/ready-meet/ready-meet-empty-loop.gif")} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
        </View>
        <View style={{ borderRadius: 22, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 16, paddingVertical: 13 }}>
          <Animated.View style={{ opacity: fade }}>
            <Text selectable style={{ color: C.paper, fontSize: 14, lineHeight: 20, fontWeight: "800", textAlign: "center" }}>“{quote.text}”</Text>
            <Text selectable style={{ color: "#AAB2C8", fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 6 }}>— {quote.author}</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function ReadyToMeetFeature({
  people,
  currentProfile,
  currentAvailability,
  onRefreshPeople,
  onAvailabilitySave,
  onOpenChat,
  canUseReadyMeetChat,
  walletBalance,
  paidChatIds,
  onUnlockReadyMeetChat,
  onOpenWallet,
  canOpenProfileWithoutReadyMeetAccess,
  likedProfileKeys,
  onLike,
  onBlock,
  onReport,
}: {
  people: readonly Profile[];
  currentProfile?: Profile;
  currentAvailability?: { available?: boolean; availableAt?: string; expiresAt?: string };
  onRefreshPeople?: () => void | Promise<void>;
  onAvailabilitySave?: (availability: { available: boolean; availableAt?: string; expiresAt?: string; latitude?: number; longitude?: number }) => void | Promise<void>;
  onOpenChat: (profile: Profile) => void;
  canUseReadyMeetChat: boolean;
  walletBalance?: number;
  paidChatIds: readonly string[];
  onUnlockReadyMeetChat: (profile: Profile) => Promise<boolean>;
  onOpenWallet?: () => void;
  canOpenProfileWithoutReadyMeetAccess?: (profile: Profile) => boolean;
  likedProfileKeys?: readonly string[];
  onLike: (profile: Profile) => void;
  onBlock: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onReport?: (profile: Profile, reason: MemberReportReason, details: string) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0.35)).current;
  const arrivalProgress = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const [showAllReadyProfiles, setShowAllReadyProfiles] = useState(false);
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [city, setCity] = useState("your area");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "ready" | "denied"
  >("idle");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [unlockingChat, setUnlockingChat] = useState(false);
  const [readyMeetFilterOpen, setReadyMeetFilterOpen] = useState(false);
  const [readyMeetDistanceMiles, setReadyMeetDistanceMiles] = useState<10 | 15 | 20 | 30 | 50>(30);
  const [readyMeetGenderFilter, setReadyMeetGenderFilter] = useState<"all" | "men" | "women">("all");
  const [availableToMeet, setAvailableToMeet] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);
  const [readyMeetDateTime, setReadyMeetDateTime] = useState(
    () => new Date(),
  );
  const [readyMeetEndDateTime, setReadyMeetEndDateTime] = useState(
    () => new Date(Date.now() + 3 * 60 * 60 * 1000),
  );
  const [readyMeetDatePickerOpen, setReadyMeetDatePickerOpen] = useState(false);
  const [readyMeetTimePickerOpen, setReadyMeetTimePickerOpen] = useState(false);
  const [readyMeetEndDatePickerOpen, setReadyMeetEndDatePickerOpen] = useState(false);
  const [readyMeetEndTimePickerOpen, setReadyMeetEndTimePickerOpen] = useState(false);
  const [arrivalDone, setArrivalDone] = useState(false);
  const selectedProfileRef = useRef<Profile | null>(null);
  selectedProfileRef.current = selected;
  useEffect(() => {
    const savedAt = currentAvailability?.availableAt ? new Date(currentAvailability.availableAt) : null;
    const expiresAt = currentAvailability?.expiresAt ? new Date(currentAvailability.expiresAt) : null;
    const active = currentAvailability?.available === true && (!expiresAt || expiresAt.getTime() > Date.now());
    setAvailableToMeet(active);
    setAvailabilitySaved(active);
    if (savedAt && Number.isFinite(savedAt.getTime())) setReadyMeetDateTime(savedAt);
    if (expiresAt && Number.isFinite(expiresAt.getTime())) setReadyMeetEndDateTime(expiresAt);
  }, [currentAvailability?.available, currentAvailability?.availableAt, currentAvailability?.expiresAt]);
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  useEffect(() => {
    if (!availableToMeet || !availabilitySaved) return;
    const delay = readyMeetEndDateTime.getTime() - Date.now();
    if (delay <= 0) {
      setAvailableToMeet(false);
      setAvailabilitySaved(false);
      onAvailabilitySave?.({ available: false });
      return;
    }
    const timer = setTimeout(() => {
      setAvailableToMeet(false);
      setAvailabilitySaved(false);
      onAvailabilitySave?.({ available: false });
    }, Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [availableToMeet, availabilitySaved, onAvailabilitySave, readyMeetEndDateTime]);
  useEffect(() => {
    if (!expanded) return;
    onRefreshPeople?.();
  }, [expanded, onRefreshPeople]);
  useEffect(() => {
    if (!expanded || coordinates) return;
    let active = true;
    setLocationStatus("loading");
    (async () => {
      try {
        const permission = await requestForegroundLocationOnce();
        if (permission.status !== "granted") {
          if (active) setLocationStatus("denied");
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const places = await Location.reverseGeocodeAsync(position.coords);
        if (!active) return;
        setCity(
          places[0]?.city ||
            places[0]?.subregion ||
            places[0]?.region ||
            "your area",
        );
        setCoordinates(privacySafeAreaCoordinate(position.coords.latitude, position.coords.longitude));
        setLocationStatus("ready");
      } catch {
        if (active) setLocationStatus("denied");
      }
    })();
    return () => {
      active = false;
    };
  }, [expanded, coordinates]);
  useEffect(() => {
    if (!expanded || locationStatus !== "ready") return;
    setArrivalDone(false);
    arrivalProgress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(650),
      Animated.timing(arrivalProgress, {
        toValue: 1,
        duration: 1050,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setArrivalDone(true);
    });
    return () => animation.stop();
  }, [expanded, locationStatus, arrivalProgress]);
  const currentUserReadyProfile = availableToMeet && availabilitySaved && currentProfile
    ? {
        ...currentProfile,
        id: currentProfile.id || "current-user-ready",
        role: currentProfile.role || "You",
      }
    : null;
  const distanceLimitKm = readyMeetDistanceMiles * 1.60934;
  const readyGenderAllowed = (profile: Profile) =>
    readyMeetGenderFilter === "all" ||
    (readyMeetGenderFilter === "men" && profile.gender === "Man") ||
    (readyMeetGenderFilter === "women" && profile.gender === "Woman");
  const readyPeople = [
    ...(currentUserReadyProfile && readyGenderAllowed(currentUserReadyProfile) ? [currentUserReadyProfile] : []),
    ...people.filter((profile) => {
      if (currentUserReadyProfile && (profile.id || profile.name) === (currentUserReadyProfile.id || currentUserReadyProfile.name)) return false;
      if (!readyGenderAllowed(profile)) return false;
      const distanceKm = profile.discovery?.distanceKm;
      return typeof distanceKm !== "number" || distanceKm <= distanceLimitKm;
    }),
  ];
  const readyPeopleTotal = readyPeople.length;
  const visibleReadyPeople = showAllReadyProfiles ? readyPeople : readyPeople.slice(0, 4);
  const canViewReadyMeetProfile = (profile: Profile) =>
    canUseReadyMeetChat ||
    paidChatIds.includes(profile.id || profile.name) ||
    canOpenProfileWithoutReadyMeetAccess?.(profile) === true;
  const requestReadyMeetAccess = (profile: Profile) => {
    setSelected(profile);
    setPaywall(true);
  };
  const openReadyMeetProfile = (profile: Profile) => {
    if (canViewReadyMeetProfile(profile)) {
      setSelected(profile);
      return;
    }
    requestReadyMeetAccess(profile);
  };
  const closeReadyToMeet = () => {
    setExpanded(false);
    setShowAllReadyProfiles(false);
    setSelected(null);
  };
  const readyMeetSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.05,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dx > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.08,
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => false,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 26 && Math.abs(gesture.dy) < 180) closeReadyToMeet();
      },
      onPanResponderTerminate: (_, gesture) => {
        if (gesture.dx > 26 && Math.abs(gesture.dy) < 180) closeReadyToMeet();
      },
    }),
  ).current;
  const takeReadyMeetOffline = () => {
    setAvailableToMeet(false);
    setAvailabilitySaved(false);
    setReadyMeetDatePickerOpen(false);
    setReadyMeetTimePickerOpen(false);
    setReadyMeetEndDatePickerOpen(false);
    setReadyMeetEndTimePickerOpen(false);
    onAvailabilitySave?.({ available: false });
  };
  const offsets = [
    [0.018, -0.023],
    [-0.015, 0.019],
    [0.029, 0.008],
    [-0.026, -0.014],
    [0.009, 0.032],
    [-0.034, 0.023],
  ];
  const distances = [2, 3, 5, 6, 8, 9];
  if (selected && !paywall)
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSelected(null)}>
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        <ProfileDetail
          profile={selected}
          onBack={() => setSelected(null)}
          onConnect={() => {
            onOpenChat(selected);
          }}
          readyMeetMode
          onBlock={onBlock}
          onReport={onReport}
        />
      </View>
      </Modal>
    );
  if (expanded)
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={closeReadyToMeet}>
      <View
        {...readyMeetSwipeResponder.panHandlers}
        style={{ flex: 1, minHeight: screenHeight, paddingHorizontal: 18, paddingTop: insets.top + 34, paddingBottom: insets.bottom + 18, gap: 13, backgroundColor: "#070A18" }}
      >
        <View style={{ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back from Ready to Meet"
            onPress={() => {
              if (showAllReadyProfiles) {
                setShowAllReadyProfiles(false);
                return;
              }
              closeReadyToMeet();
            }}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <ChevronLeft width={25} height={25} color={C.paper} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text selectable numberOfLines={1} style={{ color: C.paper, fontSize: 28, lineHeight: 31, fontWeight: "900", letterSpacing: -0.8 }}>
              {showAllReadyProfiles ? "More Online" : "Ready to Meet"}
            </Text>
            <Text selectable numberOfLines={1} style={{ color: "#AAB2C8", fontSize: 14, lineHeight: 17, fontWeight: "400" }}>
              {showAllReadyProfiles ? "All profiles currently available" : "People who are available now"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
            <Text selectable style={{ color: "#AAB2C8", fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
              {readyPeopleTotal} online
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter Ready to Meet distance"
              onPress={() => setReadyMeetFilterOpen((value) => !value)}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: readyMeetFilterOpen ? "#1685E5" : "rgba(255,255,255,0.08)" }}
            >
              <SlidersHorizontal width={21} height={21} color={C.paper} strokeWidth={2.6} />
            </Pressable>
          </View>
        </View>
        {readyMeetFilterOpen ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Ready to Meet filters"
              onPress={() => setReadyMeetFilterOpen(false)}
              style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(7,10,24,0.74)" }}
            />
            <View
              style={{
                position: "absolute",
                zIndex: 21,
                left: 18,
                right: 18,
                top: insets.top + 88,
                borderRadius: 24,
                backgroundColor: "rgba(18,23,41,0.97)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.16)",
                padding: 14,
                gap: 13,
                boxShadow: "0 18px 40px rgba(0,0,0,0.42)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ gap: 2 }}>
                  <Text selectable style={{ color: C.paper, fontSize: 16, fontWeight: "900" }}>Filters</Text>
                  <Text selectable style={{ color: "#AAB2C8", fontSize: 11, fontWeight: "800" }}>Ready to Meet</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setReadyMeetFilterOpen(false)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.09)" }}>
                  <X width={18} height={18} color={C.paper} />
                </Pressable>
              </View>
              <View style={{ gap: 8 }}>
                <Text selectable style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>Show</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    ["all", "View all"],
                    ["men", "Men only"],
                    ["women", "Women only"],
                  ] as const).map(([value, label]) => {
                    const activeGender = readyMeetGenderFilter === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeGender }}
                        onPress={() => setReadyMeetGenderFilter(value)}
                        style={{ flex: 1, minHeight: 38, borderRadius: 19, backgroundColor: activeGender ? "#1685E5" : "#0B1020", borderWidth: 1, borderColor: activeGender ? "#60A8F1" : "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}
                      >
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Text selectable style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>Distance</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {([10, 15, 20, 30, 50] as const).map((miles) => {
                    const activeDistance = readyMeetDistanceMiles === miles;
                    return (
                      <Pressable
                        key={miles}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeDistance }}
                        onPress={() => setReadyMeetDistanceMiles(miles)}
                        style={{ minHeight: 34, borderRadius: 17, backgroundColor: activeDistance ? "#1685E5" : "#0B1020", borderWidth: 1, borderColor: activeDistance ? "#60A8F1" : "rgba(255,255,255,0.14)", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>{miles} mi</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setReadyMeetFilterOpen(false)} style={{ minHeight: 42, borderRadius: 21, backgroundColor: C.paper, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#070A18", fontSize: 13, fontWeight: "900" }}>Apply filters</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: availableToMeet && availabilitySaved }}
          accessibilityLabel={availableToMeet && availabilitySaved ? "Go offline from Ready to Meet" : "Set Ready to Meet availability"}
          onPress={() => {
            if (availableToMeet && availabilitySaved) {
              takeReadyMeetOffline();
              return;
            }
            const now = new Date();
            const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
            setAvailableToMeet(true);
            setReadyMeetDateTime(now);
            setReadyMeetEndDateTime(end);
            setAvailabilitySaved(false);
          }}
          style={{ minHeight: 50, borderRadius: 25, backgroundColor: availableToMeet && availabilitySaved ? "#173F31" : C.paper, borderWidth: 1, borderColor: availableToMeet && availabilitySaved ? "#42E278" : "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, flexDirection: "row", gap: 9, boxShadow: "0 12px 28px rgba(0,0,0,0.28)" }}
        >
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: availableToMeet && availabilitySaved ? "#42E278" : C.pink }} />
          <Text style={{ color: availableToMeet && availabilitySaved ? C.paper : C.ink, fontSize: 14, fontWeight: "900" }}>
            {availableToMeet && availabilitySaved ? "Set me offline" : "Set availability"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (availableToMeet && availabilitySaved) {
              takeReadyMeetOffline();
              return;
            }
            const now = new Date();
            const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
            setAvailableToMeet(true);
            setReadyMeetDateTime(now);
            setReadyMeetEndDateTime(end);
            setAvailabilitySaved(false);
          }}
          style={{ display: "none" }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: availableToMeet && availabilitySaved ? "#42E278" : C.pink }} />
          <Text style={{ color: availableToMeet && availabilitySaved ? C.paper : C.ink, fontSize: 13, fontWeight: "900" }}>
            {availableToMeet && availabilitySaved ? "Take me off Ready to Meet" : "Choose when I'm available"}
          </Text>
        </Pressable>
        {availableToMeet && availabilitySaved ? (
          <Text selectable style={{ color: "#BDF7D0", fontSize: 11, fontWeight: "900", textAlign: "center" }}>
            You are available until {readyMeetEndDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </Text>
        ) : null}
        {availableToMeet && !availabilitySaved ? (
          <View style={{ borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", padding: 10, gap: 8 }}>
            <Text selectable style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>Pick your available window</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => { setReadyMeetDatePickerOpen((value) => !value); setReadyMeetTimePickerOpen(false); }} style={{ flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: "#121729", paddingHorizontal: 10, justifyContent: "center" }}>
                <Text style={{ color: "#AAB2C8", fontSize: 9, fontWeight: "900" }}>START DATE</Text>
                <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>{readyMeetDateTime.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setReadyMeetTimePickerOpen((value) => !value); setReadyMeetDatePickerOpen(false); }} style={{ flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: "#121729", paddingHorizontal: 10, justifyContent: "center" }}>
                <Text style={{ color: "#AAB2C8", fontSize: 9, fontWeight: "900" }}>START TIME</Text>
                <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>{readyMeetDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setReadyMeetEndTimePickerOpen((value) => !value); setReadyMeetTimePickerOpen(false); setReadyMeetDatePickerOpen(false); }} style={{ flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: "#121729", paddingHorizontal: 10, justifyContent: "center" }}>
                <Text style={{ color: "#AAB2C8", fontSize: 9, fontWeight: "900" }}>END TIME</Text>
                <Text style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}>{readyMeetEndDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
              </Pressable>
            </View>
            {readyMeetDatePickerOpen ? (
              <DateTimePicker value={readyMeetDateTime} mode="date" minimumDate={new Date()} textColor={C.paper} themeVariant="dark" onChange={(_, selectedDate) => {
                if (selectedDate) {
                  const next = new Date(readyMeetDateTime);
                  next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                  setReadyMeetDateTime(next);
                }
                if (process.env.EXPO_OS !== "ios") setReadyMeetDatePickerOpen(false);
              }} />
            ) : null}
            {readyMeetTimePickerOpen ? (
              <DateTimePicker value={readyMeetDateTime} mode="time" textColor={C.paper} themeVariant="dark" onChange={(_, selectedTime) => {
                if (selectedTime) {
                  const next = new Date(readyMeetDateTime);
                  next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                  setReadyMeetDateTime(next);
                  if (readyMeetEndDateTime.getTime() <= next.getTime()) setReadyMeetEndDateTime(new Date(next.getTime() + 3 * 60 * 60 * 1000));
                }
                if (process.env.EXPO_OS !== "ios") setReadyMeetTimePickerOpen(false);
              }} />
            ) : null}
            {readyMeetEndTimePickerOpen ? (
              <DateTimePicker value={readyMeetEndDateTime} mode="time" textColor={C.paper} themeVariant="dark" onChange={(_, selectedTime) => {
                if (selectedTime) {
                  const next = new Date(readyMeetEndDateTime);
                  next.setFullYear(readyMeetDateTime.getFullYear(), readyMeetDateTime.getMonth(), readyMeetDateTime.getDate());
                  next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                  setReadyMeetEndDateTime(next);
                }
                if (process.env.EXPO_OS !== "ios") setReadyMeetEndTimePickerOpen(false);
              }} />
            ) : null}
            <Pressable accessibilityRole="button" disabled={readyMeetEndDateTime.getTime() <= readyMeetDateTime.getTime()} onPress={() => {
              const now = new Date();
              const effectiveStart = readyMeetDateTime.getTime() <= now.getTime() ? now : readyMeetDateTime;
              setReadyMeetDatePickerOpen(false);
              setReadyMeetTimePickerOpen(false);
              setReadyMeetEndTimePickerOpen(false);
              setAvailabilitySaved(true);
              onAvailabilitySave?.({
                available: true,
                availableAt: effectiveStart.toISOString(),
                expiresAt: readyMeetEndDateTime.toISOString(),
                latitude: coordinates?.latitude,
                longitude: coordinates?.longitude,
              });
            }} style={{ minHeight: 38, borderRadius: 19, backgroundColor: readyMeetEndDateTime.getTime() <= readyMeetDateTime.getTime() ? "rgba(255,255,255,0.18)" : "#42E278", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: readyMeetEndDateTime.getTime() <= readyMeetDateTime.getTime() ? "#AAB2C8" : "#070A18", fontSize: 12, fontWeight: "900" }}>Save availability</Text>
            </Pressable>
          </View>
        ) : null}
        {readyPeopleTotal > 0 ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {visibleReadyPeople.map((profile, index) => {
                const isCurrentUserReadyCard = currentUserReadyProfile && (profile.id || profile.name) === (currentUserReadyProfile.id || currentUserReadyProfile.name);
                const cardWidth = Math.max(132, (screenWidth - 48) / 2);
                const cardImageHeight = screenHeight < 760 ? 128 : 148;
                const realDistanceMiles = typeof profile.discovery?.distanceKm === "number"
                  ? Math.max(1, Math.round(profile.discovery.distanceKm / 1.60934))
                  : null;
                const approximateDistance = realDistanceMiles || distances[index % distances.length];
                return (
                  <Pressable
                    key={profile.id || profile.name}
                    accessibilityRole="button"
                    accessibilityLabel={isCurrentUserReadyCard ? "Your Ready to Meet profile is available" : `View ${profile.name}, ready to meet`}
                    onPress={() => {
                      if (!isCurrentUserReadyCard) openReadyMeetProfile(profile);
                    }}
                    style={{ width: cardWidth, borderRadius: 16, overflow: "visible", backgroundColor: "transparent" }}
                  >
                    {isCurrentUserReadyCard ? (
                      <Text selectable style={{ color: "#42E278", fontSize: 11, fontWeight: "900", paddingBottom: 5 }}>
                        You are available
                      </Text>
                    ) : null}
                    <View style={{ height: cardImageHeight, borderRadius: 15, overflow: "hidden", backgroundColor: "#1C2338" }}>
                      <ProfileImage profile={profile} size={cardWidth} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isCurrentUserReadyCard ? "Your Ready to Meet card" : `Chat with ${profile.name}`}
                        disabled={Boolean(isCurrentUserReadyCard)}
                        onPress={(event) => {
                          event.stopPropagation();
                          if (isCurrentUserReadyCard) return;
                          if (canViewReadyMeetProfile(profile)) {
                            onOpenChat(profile);
                            return;
                          }
                          requestReadyMeetAccess(profile);
                        }}
                        style={{ position: "absolute", right: 8, top: 8, width: 31, height: 31, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" }}
                      >
                        <MessageCircle width={18} height={18} color={C.paper} strokeWidth={2.8} />
                      </Pressable>
                      <View style={{ position: "absolute", right: 8, bottom: 8, borderRadius: 10, backgroundColor: "#2DA85E", paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.paper }} />
                        <Text style={{ color: C.paper, fontSize: 10, fontWeight: "900" }}>Available</Text>
                      </View>
                    </View>
                    <View style={{ paddingTop: 7, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text selectable numberOfLines={1} style={{ flex: 1, color: C.paper, fontSize: 14, fontWeight: "900" }}>
                          {profile.name}, {profile.age}
                        </Text>
                        <ProfileVerificationBadgeIcons profile={profile} size={14} stroke="#121729" />
                      </View>
                      {!isCurrentUserReadyCard ? (
                        <Text selectable style={{ color: "#42E278", fontSize: 11, fontWeight: "900" }}>Available now</Text>
                      ) : null}
                      {!isCurrentUserReadyCard ? (
                        <Text selectable style={{ color: "#AAB2C8", fontSize: 10, fontWeight: "800" }}>Within {approximateDistance} miles</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {readyPeople.length > 4 && !showAllReadyProfiles ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View more Ready to Meet profiles"
                onPress={() => setShowAllReadyProfiles(true)}
                style={{ minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.paper, fontSize: 13, fontWeight: "900" }}>
                  More online ({readyPeople.length - 4})
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : <ReadyMeetEmptyStory />}
        {paywall && selectedProfileRef.current ? (
          <View
            style={{
              position: "absolute",
              zIndex: 50,
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(7,10,24,0.72)",
              paddingHorizontal: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 390,
                borderRadius: 26,
                backgroundColor: "#F3EDF9",
                borderWidth: 1,
                borderColor: "#C6B3E7",
                padding: 18,
                gap: 11,
                boxShadow: "0 22px 48px rgba(0,0,0,0.38)",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Ready to Meet access options"
                onPress={() => {
                  setPaywall(false);
                  setSelected(null);
                }}
                style={{ alignSelf: "flex-end" }}
              >
                <X width={21} height={21} color={C.ink} />
              </Pressable>
              <LockKeyhole width={27} height={27} color="#59359C" />
              <Text selectable style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}>
                Ready to Meet access
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>
                Ready to Meet access is {formatMoney(9.99)} for 7 days. Use it to view Ready-to-Meet profiles and start chats during that window. Premium and KindredPass include Ready-to-Meet access.
              </Text>
              <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                Wallet balance: {formatMoney(walletBalance)}
              </Text>
              <Text selectable style={{ color: "#59359C", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
                Wallet Ready to Meet pass: {formatMoney(9.99)} for 7 days.
              </Text>
              <Button
                compact
                label={walletBalance >= 9.99 ? (unlockingChat ? "Unlocking access..." : `Use Wallet · ${formatMoney(-9.99, { signed: true })}`) : "Load Wallet"}
                disabled={unlockingChat}
                onPress={async () => {
                  if (!selectedProfileRef.current) return;
                  if (walletBalance < 9.99) {
                    setPaywall(false);
                    setSelected(null);
                    closeReadyToMeet();
                    onOpenWallet();
                    return;
                  }
                  setUnlockingChat(true);
                  const unlocked = await onUnlockReadyMeetChat(selectedProfileRef.current);
                  setUnlockingChat(false);
                  if (unlocked) {
                    setPaywall(false);
                    setSelected(selectedProfileRef.current);
                  }
                }}
              />
              <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
                This Wallet deduction unlocks Ready to Meet access for 7 days. Wallet top-ups are non-refundable except where required by law.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      </Modal>
    );
  return (
    <View style={{ paddingHorizontal: 18, gap: 11 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => {
          setExpanded((value) => !value);
          setSelected(null);
        }}
        style={({ pressed }) => ({
          borderRadius: 23,
          backgroundColor: "#173F31",
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 13,
          opacity: pressed ? 0.88 : 1,
          boxShadow: "0 8px 20px rgba(23,63,49,0.18)",
        })}
      >
        <View
          style={{
            width: 43,
            height: 43,
            borderRadius: 22,
            backgroundColor: "rgba(255,255,255,0.14)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            style={{
              width: 15,
              height: 15,
              borderRadius: 8,
              backgroundColor: "#42E278",
              opacity: pulse,
              transform: [{ scale: pulse }],
            }}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            selectable
            style={{ color: C.paper, fontSize: 20, fontWeight: "900" }}
          >
            Ready to Meet
          </Text>
          <Text
            selectable
            style={{ color: "#CBE8D8", fontSize: 12, fontWeight: "800" }}
          >
            {expanded ?
              "Hide nearby people"
              : "Live now · click to view those ready to meet"}
          </Text>
        </View>
        <Text style={{ color: C.paper, fontSize: 23, fontWeight: "900" }}>
          {expanded ? "−" : "+"}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={{ gap: 10 }}>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
          >
            For privacy, faces are placed within broad nearby areas. Markers and
            distance labels are approximate and never reveal an exact meeting
            point or home location.
          </Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: availableToMeet && availabilitySaved }}
            onPress={() => {
              setAvailableToMeet((value) => {
                const next = !value;
                if (next) {
                  const now = new Date();
                  setReadyMeetDateTime(now);
                  setReadyMeetEndDateTime(new Date(now.getTime() + 3 * 60 * 60 * 1000));
                  setAvailabilitySaved(false);
                } else {
                  setAvailabilitySaved(false);
                  onAvailabilitySave?.({ available: false });
                }
                return next;
              });
              setReadyMeetDatePickerOpen(false);
              setReadyMeetTimePickerOpen(false);
              setReadyMeetEndDatePickerOpen(false);
              setReadyMeetEndTimePickerOpen(false);
            }}
            style={{ minHeight: 48, borderRadius: 24, backgroundColor: availableToMeet && availabilitySaved ? "#173F31" : C.paper, borderWidth: 1, borderColor: availableToMeet ? "#173F31" : C.line, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }}
          >
            <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: availableToMeet && availabilitySaved ? "#42E278" : C.line }} />
            <Text style={{ color: availableToMeet && availabilitySaved ? C.paper : C.ink, fontSize: 13, fontWeight: "900" }}>
              {availableToMeet && availabilitySaved ? "You're available to meet" : availableToMeet ? "Set your meet window" : "Make me available to meet"}
            </Text>
          </Pressable>
          {availableToMeet && !availabilitySaved ? (
            <View style={{ borderRadius: 20, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }}>
              <Text selectable style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}>When can you meet?</Text>
              <Text selectable style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>Choose a start and end window. You only become visible after saving, and you are removed automatically when the window ends.</Text>
              <Text selectable style={{ color: C.sage, fontSize: 10, fontWeight: "900" }}>STARTS</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => { setReadyMeetDatePickerOpen((value) => !value); setReadyMeetTimePickerOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: "#F3EFE8", paddingHorizontal: 12, justifyContent: "center" }}>
                  <Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>DATE</Text>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900", paddingTop: 2 }}>{readyMeetDateTime.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setReadyMeetTimePickerOpen((value) => !value); setReadyMeetDatePickerOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: "#F3EFE8", paddingHorizontal: 12, justifyContent: "center" }}>
                  <Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>TIME</Text>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900", paddingTop: 2 }}>{readyMeetDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
                </Pressable>
              </View>
              {readyMeetDatePickerOpen ? (
                <DateTimePicker
                  value={readyMeetDateTime}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_, selectedDate) => {
                    if (selectedDate) {
                      const next = new Date(readyMeetDateTime);
                      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                      setReadyMeetDateTime(next);
                    }
                    if (process.env.EXPO_OS !== "ios") setReadyMeetDatePickerOpen(false);
                  }}
                />
              ) : null}
              {readyMeetTimePickerOpen ? (
                <DateTimePicker
                  value={readyMeetDateTime}
                  mode="time"
                  onChange={(_, selectedTime) => {
                    if (selectedTime) {
                      const next = new Date(readyMeetDateTime);
                      next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                      setReadyMeetDateTime(next);
                    }
                    if (process.env.EXPO_OS !== "ios") setReadyMeetTimePickerOpen(false);
                  }}
                />
              ) : null}
              <Text selectable style={{ color: C.sage, fontSize: 10, fontWeight: "900" }}>ENDS</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => { setReadyMeetEndDatePickerOpen((value) => !value); setReadyMeetEndTimePickerOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: "#F3EFE8", paddingHorizontal: 12, justifyContent: "center" }}>
                  <Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>DATE</Text>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900", paddingTop: 2 }}>{readyMeetEndDateTime.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setReadyMeetEndTimePickerOpen((value) => !value); setReadyMeetEndDatePickerOpen(false); }} style={{ flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: "#F3EFE8", paddingHorizontal: 12, justifyContent: "center" }}>
                  <Text style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}>TIME</Text>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900", paddingTop: 2 }}>{readyMeetEndDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
                </Pressable>
              </View>
              {readyMeetEndDatePickerOpen ? (
                <DateTimePicker
                  value={readyMeetEndDateTime}
                  mode="date"
                  minimumDate={readyMeetDateTime}
                  onChange={(_, selectedDate) => {
                    if (selectedDate) {
                      const next = new Date(readyMeetEndDateTime);
                      next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                      setReadyMeetEndDateTime(next);
                    }
                    if (process.env.EXPO_OS !== "ios") setReadyMeetEndDatePickerOpen(false);
                  }}
                />
              ) : null}
              {readyMeetEndTimePickerOpen ? (
                <DateTimePicker
                  value={readyMeetEndDateTime}
                  mode="time"
                  onChange={(_, selectedTime) => {
                    if (selectedTime) {
                      const next = new Date(readyMeetEndDateTime);
                      next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
                      setReadyMeetEndDateTime(next);
                    }
                    if (process.env.EXPO_OS !== "ios") setReadyMeetEndTimePickerOpen(false);
                  }}
                />
              ) : null}
              <Text selectable style={{ color: C.sage, fontSize: 11, fontWeight: "900", textAlign: "center" }}>
                Available from {readyMeetDateTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} {readyMeetDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} to {readyMeetEndDateTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} {readyMeetEndDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </Text>
              <Button
                compact
                label="Save availability"
                disabled={readyMeetEndDateTime.getTime() <= Date.now() || readyMeetEndDateTime.getTime() <= readyMeetDateTime.getTime()}
                onPress={() => {
                  const now = new Date();
                  const effectiveStart = readyMeetDateTime.getTime() <= now.getTime() ? now : readyMeetDateTime;
                  setReadyMeetDatePickerOpen(false);
                  setReadyMeetTimePickerOpen(false);
                  setReadyMeetEndDatePickerOpen(false);
                  setReadyMeetEndTimePickerOpen(false);
                  setAvailabilitySaved(true);
                  onAvailabilitySave?.({
                    available: true,
                    availableAt: effectiveStart.toISOString(),
                    expiresAt: readyMeetEndDateTime.toISOString(),
                    latitude: coordinates?.latitude,
                    longitude: coordinates?.longitude,
                  });
                }}
              />
            </View>
          ) : null}
          {availableToMeet && availabilitySaved ? (
            <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit Ready to Meet availability"
              onPress={() => setAvailabilitySaved(false)}
              style={{ borderRadius: 15, backgroundColor: "#E7F2EA", paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              <Text selectable style={{ flex: 1, color: C.sage, fontSize: 11, lineHeight: 16, fontWeight: "900" }}>
                {readyMeetDateTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} {readyMeetDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {readyMeetEndDateTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </Text>
              <Text style={{ color: C.sage, fontSize: 11, fontWeight: "900" }}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take me off Ready to Meet"
              onPress={takeReadyMeetOffline}
              style={{ minHeight: 39, borderRadius: 20, backgroundColor: "#F8E7E2", borderWidth: 1, borderColor: "#E9B7AA", alignItems: "center", justifyContent: "center", paddingHorizontal: 13 }}
            >
              <Text style={{ color: "#9C3225", fontSize: 12, fontWeight: "900" }}>I'm no longer available</Text>
            </Pressable>
            </View>
          ) : null}
          {locationStatus === "loading" ? (
            <View
              style={{
                height: 310,
                borderRadius: 23,
                backgroundColor: C.paper,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text selectable style={{ color: C.ink, fontWeight: "900" }}>
                Finding your city map...
              </Text>
            </View>
          ) : locationStatus === "denied" ? (
            <View
              style={{
                borderRadius: 23,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: C.line,
                padding: 20,
                gap: 7,
              }}
            >
              <Text selectable style={{ color: C.ink, fontWeight: "900" }}>
                Location is needed for Ready to Meet
              </Text>
              <Text
                selectable
                style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}
              >
                Enable approximate location access to see people in your area.
                KindredCube does not publish your exact location.
              </Text>
            </View>
          ) : coordinates ? (
            <View
              style={{
                height: 340,
                borderRadius: 24,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: C.line,
              }}
            >
              <MapView
                style={{ width: "100%", height: "100%" }}
                initialRegion={{
                  ...coordinates,
                  latitudeDelta: 0.22,
                  longitudeDelta: 0.22,
                }}
                toolbarEnabled={false}
                showsMyLocationButton={false}
              >
                {readyPeople.map((profile, index) =>
                  index === 0 && !arrivalDone ? null : (
                    <Marker
                      key={profile.name}
                      coordinate={{
                        latitude: coordinates.latitude + offsets[index][0],
                        longitude: coordinates.longitude + offsets[index][1],
                      }}
                      title={`${profile.name}, ${profile.age}`}
                      description={`About ${distances[index]} miles away ? area only`}
                      onPress={() => openReadyMeetProfile(profile)}
                    >
                      <View style={{ width: 54, height: 54 }}>
                        <View
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            overflow: "hidden",
                            borderWidth: 3,
                            borderColor: C.paper,
                            backgroundColor: C.paper,
                          }}
                        >
                          <ProfileImage profile={profile} size={44} />
                        </View>
                      </View>
                    </Marker>
                  ),
                )}
              </MapView>
              {!arrivalDone && readyPeople[0] ? (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: arrivalProgress.interpolate({
                      inputRange: [0, 0.78, 1],
                      outputRange: [1, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: arrivalProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, screenWidth * 0.18],
                        }),
                      },
                      {
                        translateY: arrivalProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -78],
                        }),
                      },
                      {
                        scale: arrivalProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.28],
                        }),
                      },
                    ],
                  }}
                >
                  <View style={{ alignItems: "center", gap: 8 }}>
                    <View
                      style={{
                        width: 142,
                        height: 142,
                        borderRadius: 71,
                        overflow: "hidden",
                        borderWidth: 5,
                        borderColor: C.paper,
                        backgroundColor: C.paper,
                        boxShadow: "0 12px 30px rgba(34,31,27,0.28)",
                      }}
                    >
                      <Portrait index={readyPeople[0].portrait} size={132} />
                    </View>
                    <View
                      style={{
                        borderRadius: 17,
                        backgroundColor: "rgba(23,63,49,0.95)",
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          backgroundColor: "#42E278",
                        }}
                      />
                      <Text
                        selectable
                        style={{
                          color: C.paper,
                          fontSize: 13,
                          fontWeight: "900",
                        }}
                      >
                        {readyPeople[0].name} is ready to meet
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              ) : null}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 11,
                  top: 11,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,253,249,0.94)",
                  paddingHorizontal: 11,
                  paddingVertical: 7,
                }}
              >
                <Text
                  selectable
                  style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
                >
                  {city}
                </Text>
                <Text
                  selectable
                  style={{ color: C.sage, fontSize: 10, fontWeight: "800" }}
                >
                  Area-level locations only
                </Text>
              </View>
            </View>
          ) : null}
          {selectedProfileRef.current ? (
            <View
              style={{
                borderRadius: 20,
                backgroundColor: C.paper,
                borderWidth: 1,
                borderColor: C.line,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
              }}
            >
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  overflow: "hidden",
                }}
              >
                <ProfileImage profile={selectedProfileRef.current} size={58} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  selectable
                  style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}
                >
                  {selectedProfileRef.current.name}, {selectedProfileRef.current.age}
                </Text>
                <Text
                  selectable
                  style={{ color: C.sage, fontSize: 11, fontWeight: "800" }}
                >
                  Ready nearby · approximate area
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  onOpenChat(selectedProfileRef.current!)
                }
                style={{
                  borderRadius: 18,
                  backgroundColor: C.ink,
                  paddingHorizontal: 13,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{ color: C.paper, fontSize: 11, fontWeight: "900" }}
                >
                  Chat
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      {paywall && selectedProfileRef.current ? (
        <View
          style={{
            position: "absolute",
            zIndex: 50,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(7,10,24,0.72)",
            paddingHorizontal: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 390,
              borderRadius: 26,
              backgroundColor: "#F3EDF9",
              borderWidth: 1,
              borderColor: "#C6B3E7",
              padding: 18,
              gap: 11,
              boxShadow: "0 22px 48px rgba(0,0,0,0.38)",
            }}
          >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Premium message"
            onPress={() => {
              setPaywall(false);
              setSelected(null);
            }}
            style={{ alignSelf: "flex-end" }}
          >
            <X width={21} height={21} color={C.ink} />
          </Pressable>
          <LockKeyhole width={27} height={27} color="#59359C" />
          <Text
            selectable
            style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}
          >
            Ready to Meet access
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
          >
            Ready to Meet access is {formatMoney(9.99)} for 7 days. Use it to view Ready-to-Meet profiles and start chats during that window. Premium and KindredPass include Ready-to-Meet access.
          </Text>
          <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
            Wallet balance: {formatMoney(walletBalance)}
          </Text>
          <Text selectable style={{ color: "#59359C", fontSize: 12, lineHeight: 17, fontWeight: "900" }}>
            Wallet Ready to Meet pass: {formatMoney(9.99)} for 7 days.
          </Text>
          <Button
            compact
            label={walletBalance >= 9.99 ? (unlockingChat ? "Unlocking chat..." : `Use Wallet · ${formatMoney(-9.99, { signed: true })}`) : "Load Wallet"}
            disabled={unlockingChat}
            onPress={async () => {
              if (!selectedProfileRef.current) return;
              if (walletBalance < 9.99) {
                setPaywall(false);
                setSelected(null);
                onOpenWallet();
                return;
              }
              setUnlockingChat(true);
              const unlocked = await onUnlockReadyMeetChat(selectedProfileRef.current);
              setUnlockingChat(false);
              if (unlocked) {
                setPaywall(false);
                setSelected(selectedProfileRef.current);
              }
            }}
          />
          <Text selectable style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
            This Wallet deduction unlocks Ready to Meet chat access for 7 days. Wallet top-ups are non-refundable except where required by law.
          </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ExploreRecommendations({
  similarInterests,
  similarDatingGoals,
  communitiesInCommon,
  readyPeople,
  currentProfile,
  likedProfileKeys,
  currentReadyToMeetAvailability,
  onRefreshReadyToMeetPeople,
  onReadyToMeetAvailabilitySave,
  onProfilePress,
  onLike,
  onOpenChat,
  canUseReadyMeetChat,
  walletBalance,
  paidReadyMeetChatIds,
  onUnlockReadyMeetChat,
  onOpenWallet,
  canOpenReadyMeetProfileWithoutAccess,
  onBlock,
  onReport,
}: {
  similarInterests: readonly TaggedRecommendation[];
  similarDatingGoals: readonly TaggedRecommendation[];
  communitiesInCommon: readonly TaggedRecommendation[];
  readyPeople: readonly Profile[];
  currentProfile?: Profile;
  likedProfileKeys?: readonly string[];
  currentReadyToMeetAvailability?: { available?: boolean; availableAt?: string; expiresAt?: string };
  onRefreshReadyToMeetPeople?: () => void | Promise<void>;
  onReadyToMeetAvailabilitySave?: (availability: { available: boolean; availableAt?: string; expiresAt?: string; latitude?: number; longitude?: number }) => void | Promise<void>;
  onProfilePress?: (profile: Profile) => void;
  onLike: (profile: Profile) => void;
  onOpenChat: (profile: Profile) => void;
  canUseReadyMeetChat: boolean;
  walletBalance?: number;
  paidReadyMeetChatIds: readonly string[];
  onUnlockReadyMeetChat: (profile: Profile) => Promise<boolean>;
  onOpenWallet?: () => void;
  canOpenReadyMeetProfileWithoutAccess?: (profile: Profile) => boolean;
  onBlock: (profile: Profile, reason: MemberReportReason, details: string) => void;
  onReport?: (profile: Profile, reason: MemberReportReason, details: string) => void;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 34, gap: 17 }}
    >
      <View style={{ paddingHorizontal: 18 }}>
        <Logo size="compact" />
      </View>
      <ReadyToMeetFeature
        people={readyPeople}
        currentProfile={currentProfile}
        currentAvailability={currentReadyToMeetAvailability}
        onRefreshPeople={onRefreshReadyToMeetPeople}
        onAvailabilitySave={onReadyToMeetAvailabilitySave}
        onOpenChat={onOpenChat}
        canUseReadyMeetChat={canUseReadyMeetChat}
        walletBalance={walletBalance}
        paidChatIds={paidReadyMeetChatIds}
        onUnlockReadyMeetChat={onUnlockReadyMeetChat}
        onOpenWallet={onOpenWallet}
        canOpenProfileWithoutReadyMeetAccess={canOpenReadyMeetProfileWithoutAccess}
        likedProfileKeys={likedProfileKeys}
        onLike={onLike}
        onBlock={onBlock}
        onReport={onReport}
      />
      <View style={{ paddingHorizontal: 18, gap: 5 }}>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
        >
          Recommendations with promising common ground.
        </Text>
      </View>
      <RecommendationCarousel
        title="Similar interests"
        description="People who enjoy some of the same things you do."
        recommendations={similarInterests.slice(0, 6)}
        likedProfileKeys={likedProfileKeys}
        onProfilePress={onProfilePress}
        onLike={onLike}
      />
      <RecommendationCarousel
        title="Similar dating goals"
        description="Shared intentions can be a strong place to begin."
        recommendations={similarDatingGoals.slice(0, 6)}
        likedProfileKeys={likedProfileKeys}
        onProfilePress={onProfilePress}
        onLike={onLike}
      />
      <RecommendationCarousel
        title="Communities in common"
        description="You share a community or cause that matters."
        recommendations={communitiesInCommon.slice(0, 6)}
        likedProfileKeys={likedProfileKeys}
        onProfilePress={onProfilePress}
        onLike={onLike}
      />
    </ScrollView>
  );
}

function likeCommonGround(profile: Profile, viewerInterests: readonly string[], viewerGoals: readonly string[]) {
  const matching = profile.discovery?.matching || {};
  const candidateInterests = Array.isArray(matching.interests) ? matching.interests.filter((item): item is string => typeof item === "string") : [];
  const candidateGoals = Array.isArray(matching.relationshipGoals) ? matching.relationshipGoals.filter((item): item is string => typeof item === "string") : [];
  const sharedInterest = candidateInterests.find((item) => viewerInterests.includes(item));
  if (sharedInterest) return `Similar interest: ${sharedInterest}`;
  const sharedGoal = candidateGoals.find((item) => viewerGoals.includes(item));
  if (sharedGoal) return `Similar goal: ${sharedGoal}`;
  return "Promising common ground";
}

function incomingLikeMatchIsActive(like: IncomingLike) {
  if (!like.matched) return false;
  if (!like.matchExpiresAt) return true;
  return new Date(like.matchExpiresAt).getTime() > Date.now();
}

function chatMessagePreview(message: ChatMessage) {
  if (message.kind === "text" && message.text) return message.text.trim().slice(0, 140);
  if (message.kind === "gif") return message.gifTitle ? `GIF: ${message.gifTitle}` : "Sent a GIF";
  if (message.kind === "image") return "Sent a photo";
  if (message.kind === "video") return "Sent a video";
  if (message.kind === "audio") return "Sent a voice note";
  if (message.kind === "meeting_proposal") return "Sent a meeting proposal";
  if (message.kind === "meeting_response") {
    return message.meetingResponse?.status === "accepted"
      ? "Accepted the meeting proposal"
      : "Declined the meeting proposal";
  }
  return "New message";
}

function LikedYouExperience({
  likedProfiles,
  incomingLikes,
  hasIncomingLikes,
  subscribed,
  viewerInterests,
  viewerGoals,
  onProfilePress,
  onChat,
  walletBalance,
  onOpenWallet,
  onViewMembershipPlans,
  onWalletReveal,
  onLikeRevealed,
}: {
  likedProfiles: string[];
  incomingLikes: IncomingLike[];
  hasIncomingLikes: boolean;
  subscribed: boolean;
  viewerInterests?: readonly string[];
  viewerGoals?: readonly string[];
  onProfilePress?: (profile: Profile) => void;
  onChat: (profile: Profile) => void;
  walletBalance?: number;
  onOpenWallet?: () => void;
  onViewMembershipPlans: () => void;
  onWalletReveal: (like: IncomingLike, profile: Profile) => Promise<boolean>;
  onLikeRevealed: (like: IncomingLike, profile: Profile) => void;
}) {
  const [showPaywall, setShowPaywall] = useState<Profile | null>(null);
  const [walletRevealedProfiles, setWalletRevealedProfiles] = useState<
    string[]
  >([]);
  const incoming = incomingLikes
    .map((like) => ({
      like,
      profile: discoveryCandidateToProfile(like.profile),
    }));
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 30,
          gap: 15,
        }}
      >
        <Logo size="compact" />
        <View style={{ gap: 5 }}>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
          >
            See who is interested. Mutual likes unlock immediately as a match.
          </Text>
        </View>
        {!incoming.length ? (
          <View
            style={{
              borderRadius: 22,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 22,
              alignItems: "center",
              gap: 9,
            }}
          >
            <Heart width={36} height={36} color={C.pink} />
            <Text selectable style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>
              No likes yet
            </Text>
            <Text
              selectable
              style={{
                color: C.muted,
                fontSize: 13,
                lineHeight: 19,
                textAlign: "center",
              }}
            >
              Complete your profile and start connecting. Likes will
              appear here when someone is interested.
            </Text>
          </View>
        ) : (
        <View style={{ gap: 14 }}>
          {incoming.map(({ like, profile }) => {
            const mutual = incomingLikeMatchIsActive(like);
            const commonGround = likeCommonGround(profile, viewerInterests || [], viewerGoals || []);
            const locked =
              !subscribed &&
              !mutual &&
              !like.visible &&
              !walletRevealedProfiles.includes(profile.name);
            return (
              <Pressable
                accessibilityRole="button"
                key={profile.name}
                onPress={() =>
                  mutual ?
                    onChat(profile)
                    : locked ?
                      setShowPaywall(profile)
                      : onProfilePress(profile)
                }
                style={{
                  width: "100%",
                  borderRadius: 24,
                  overflow: "hidden",
                  backgroundColor: C.paper,
                  borderWidth: 1,
                  borderColor: mutual ? "#79B898" : C.line,
                }}
              >
                <View style={{ width: "100%", height: 360, overflow: "hidden", backgroundColor: "#E9E1D6" }}>
                  <ProfileImage profile={profile} size={360} blurred={locked} />
                  {locked ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(34,31,27,0.18)",
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: 0,
                          bottom: 0,
                          backgroundColor: "rgba(255,253,249,0.08)",
                        }}
                      />
                      <View
                        style={{
                          borderRadius: 20,
                          backgroundColor: "rgba(255,253,249,0.88)",
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: C.ink, fontSize: 11, fontWeight: "900" }}>
                          Someone likes you
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
                <View style={{ minHeight: 78, padding: 13, gap: 5 }}>
                  {locked ? (
                    <>
                      <View
                        style={{
                          width: "72%",
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: "#C9C1B6",
                        }}
                      />
                      <View
                        style={{
                          width: "48%",
                          height: 9,
                          borderRadius: 5,
                          backgroundColor: "#DDD6CB",
                        }}
                      />
                      {commonGround ? (
                        <Text selectable numberOfLines={2} style={{ color: C.sage, fontSize: 10, lineHeight: 14, fontWeight: "900", paddingTop: 3 }}>
                          {commonGround}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Text
                          selectable
                          style={{
                            color: C.ink,
                            fontSize: 17,
                            fontWeight: "900",
                          }}
                        >
                          {profile.name}, {profile.age}
                        </Text>
                        <ProfileVerificationBadgeIcons profile={profile} size={15} />
                      </View>
                      <Text
                        selectable
                        style={{
                          color: mutual ? C.sage : C.muted,
                          fontSize: 11,
                          fontWeight: mutual ? "900" : "700",
                        }}
                      >
                        {mutual ? "It's a match ? Chat now" : profile.culture}
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
        )}
      </ScrollView>
      {showPaywall ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(34,31,27,0.52)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 390,
              borderRadius: 27,
              backgroundColor: C.paper,
              padding: 22,
              gap: 14,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setShowPaywall(null)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={24} height={24} color={C.ink} />
            </Pressable>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#FCE5EE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LockKeyhole width={27} height={27} color={C.pink} />
            </View>
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 28,
                fontWeight: "900",
              }}
            >
              See who liked you
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
            >
              Someone already noticed you. Reveal who it is so you can focus on
              warmer connections, save time, and decide whether the interest is
              worth exploring.
            </Text>
            <Button
              label="View membership plans"
              onPress={() => {
                setShowPaywall(null);
                onViewMembershipPlans();
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                if (walletBalance <= 0) {
                  setShowPaywall(null);
                  onOpenWallet();
                  return;
                }
                const paid = await onWalletReveal(
                  incoming.find((item) => item.profile.name === showPaywall.name)?.like || incoming[0]!.like,
                  showPaywall,
                );
                if (!paid) return;
                setWalletRevealedProfiles((current) =>
                  current.includes(showPaywall.name) ?
                    current
                    : [...current, showPaywall.name],
                );
                const revealedLike = incoming.find((item) => item.profile.name === showPaywall.name)?.like;
                if (revealedLike) onLikeRevealed(revealedLike, showPaywall);
                setShowPaywall(null);
              }}
              style={{
                minHeight: 50,
                borderRadius: 25,
                borderWidth: 1.5,
                borderColor: C.ink,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Wallet width={20} height={20} color={C.ink} />
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                {walletBalance > 0 ? "Use Wallet" : "Load Wallet"}
              </Text>
            </Pressable>
            <Text
              selectable
              style={{
                color: C.muted,
                fontSize: 10,
                lineHeight: 15,
                textAlign: "center",
              }}
            >
              The Wallet reveal price will be shown before confirmation once
              pricing is set. No amount is deducted yet.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MembershipOptionsModal({
  visible,
  onClose,
  onPurchasePlan,
  premiumActive,
  kindredPassActive,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchasePlan: (plan: "premium" | "kindred_pass") => Promise<boolean>;
  premiumActive: boolean;
  kindredPassActive: boolean;
}) {
  const [busyPlan, setBusyPlan] = useState<"premium" | "kindred_pass" | "">("");
  const [notice, setNotice] = useState("");
  const buyPlan = async (plan: "premium" | "kindred_pass") => {
    setBusyPlan(plan);
    setNotice("");
    try {
      const confirmed = await onPurchasePlan(plan);
      if (confirmed) {
        setNotice(plan === "premium" ? "Premium is active." : "KindredPass is active for 7 days.");
      } else {
        setNotice("Checkout was not completed or Stripe is still confirming it.");
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Checkout could not be opened.");
    } finally {
      setBusyPlan("");
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(34,31,27,0.56)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 430,
            borderRadius: 30,
            backgroundColor: C.paper,
            padding: 20,
            gap: 14,
            boxShadow: "0 24px 56px rgba(0,0,0,0.30)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ gap: 3, flex: 1 }}>
              <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 26, fontWeight: "900" }}>
                Choose your access
              </Text>
              <Text selectable style={{ color: C.muted, fontSize: 12, lineHeight: 17, fontWeight: "800" }}>
                Reveal likes faster and unlock richer connection tools.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close membership options"
              onPress={onClose}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#F1E9DD" }}
            >
              <X width={21} height={21} color={C.ink} />
            </Pressable>
          </View>
          <View style={{ gap: 11 }}>
            <View
              style={{
                borderRadius: 24,
                backgroundColor: "#F1E8FF",
                borderWidth: 1,
                borderColor: "#C8AFE8",
                padding: 15,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text selectable style={{ color: "#59359C", fontSize: 22, fontWeight: "900" }}>KindredPass</Text>
                  <Text selectable style={{ color: C.muted, fontSize: 12, fontWeight: "800" }}>$19.99 · Premium access for one week</Text>
                </View>
                <BadgeCheck width={29} height={29} color="#59359C" />
              </View>
              <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>
                Best for trying Premium, travel days, events, and short bursts of active matching.
              </Text>
              <Button
                compact
                disabled={kindredPassActive || Boolean(busyPlan)}
                label={kindredPassActive ? "KindredPass active" : busyPlan === "kindred_pass" ? "Opening checkout..." : "Get KindredPass"}
                onPress={() => buyPlan("kindred_pass")}
              />
            </View>
            <View
              style={{
                borderRadius: 24,
                backgroundColor: "#FFF1B8",
                borderWidth: 1,
                borderColor: "#E4C23B",
                padding: 15,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Premium</Text>
                  <Text selectable style={{ color: C.muted, fontSize: 12, fontWeight: "800" }}>$49.99 ? the full KindredCube experience</Text>
                </View>
                <Star width={30} height={30} color="#B78100" fill="#E7B51E" />
              </View>
              <Text selectable style={{ color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: "800" }}>
                See who liked you, use Ready to Meet, send photo comments, and apply advanced filters.
              </Text>
              <Button
                compact
                disabled={premiumActive || Boolean(busyPlan)}
                label={premiumActive ? "Premium active" : busyPlan === "premium" ? "Opening checkout..." : "Get Premium"}
                onPress={() => buyPlan("premium")}
              />
            </View>
          </View>
          {notice ? (
            <Text selectable style={{ color: notice.includes("active") ? C.sage : C.clay, fontSize: 12, lineHeight: 17, textAlign: "center", fontWeight: "900" }}>
              {notice}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function profileInterestsForCard(profile: Profile) {
  const signals = profileMatchingSignals(profile);
  const realInterests = Array.isArray(signals.interests) ? signals.interests : [];
  if (realInterests.length) return realInterests.slice(0, 5);
  const sets = [
    ["Museums & galleries", "Exploring new cities", "Live music", "Walking"],
    ["Cooking", "International travel", "Photography", "Food experiences"],
    ["Hiking", "Camping", "Volunteering", "Reading"],
  ];
  const safeIndex = Math.abs(profile.portrait || 0) % sets.length;
  return sets[safeIndex] || sets[0];
}

function profileBioForCard(profile: Profile) {
  const matching = profile.discovery?.matching || {};
  if (typeof matching.bio === "string" && matching.bio.trim()) return matching.bio.trim();
  if (profile.realMember || profile.discovery) return "Bio not added yet.";
  const bios = [
    `${profile.name} enjoys thoughtful conversations, discovering local places, and making time for the people who matter.`,
    `${profile.name} is curious, grounded, and happiest when sharing good food, laughter, and a new experience.`,
    `${profile.name} values kindness, consistency, and building a connection that feels natural and genuine.`,
  ];
  const safeIndex = Math.abs(profile.portrait || 0) % bios.length;
  return bios[safeIndex] || bios[0];
}

function extractProfilePromptEntries(profile: Profile) {
  const matching = profile.discovery?.matching || {};
  const profileRecord = profile as unknown as Record<string, unknown>;
  const discoveryRecord =
    profile.discovery && typeof profile.discovery === "object" && !Array.isArray(profile.discovery)
      ? profile.discovery as unknown as Record<string, unknown>
      : {};
  const discoveryMatching =
    discoveryRecord.matching && typeof discoveryRecord.matching === "object" && !Array.isArray(discoveryRecord.matching)
      ? discoveryRecord.matching as Record<string, unknown>
      : {};
  const matchingProfile =
    matching && typeof matching === "object" && !Array.isArray(matching) &&
    (matching as Record<string, unknown>).profile &&
    typeof (matching as Record<string, unknown>).profile === "object" &&
    !Array.isArray((matching as Record<string, unknown>).profile)
      ? (matching as Record<string, unknown>).profile as Record<string, unknown>
      : {};
  const containers: unknown[] = [
    profile.promptAnswers,
    profileRecord.prompts,
    discoveryRecord.promptAnswers,
    discoveryRecord.prompts,
    discoveryMatching.promptAnswers,
    discoveryMatching.prompts,
    (matching as Record<string, unknown>).promptAnswers,
    (matching as Record<string, unknown>).prompts,
    matchingProfile.promptAnswers,
    matchingProfile.prompts,
  ];
  const entries: Array<{ prompt: string; answer: string }> = [];
  const addEntries = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      try {
        addEntries(JSON.parse(value));
      } catch {
        return;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(addEntries);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const prompt =
      typeof record.prompt === "string" ? record.prompt.trim() :
      typeof record.question === "string" ? record.question.trim() :
      typeof record.title === "string" ? record.title.trim() :
      "";
    const answer =
      typeof record.answer === "string" ? record.answer.trim() :
      typeof record.response === "string" ? record.response.trim() :
      typeof record.value === "string" ? record.value.trim() :
      "";
    if (prompt && answer) {
      entries.push({ prompt, answer });
      return;
    }
    Object.values(record).forEach(addEntries);
  };
  containers.forEach(addEntries);
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.prompt}\n${entry.answer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function profilePromptForPhoto(profile: Profile) {
  const promptEntry = extractProfilePromptEntries(profile)[0];

  if (promptEntry?.prompt && promptEntry?.answer) {
    return {
      prompt: promptEntry.prompt.trim(),
      answer: promptEntry.answer.trim(),
    };
  }

  return null;
}

function profilePromptsForGallery(profile: Profile) {
  const prompts = extractProfilePromptEntries(profile);

  const fallback = profilePromptForPhoto(profile);
  return prompts.length ? prompts : fallback ? [fallback] : [];
}

function profileGoalsForCard(profile: Profile) {
  const signals = profileMatchingSignals(profile);
  const realGoals = Array.isArray(signals.relationshipGoals) ? signals.relationshipGoals : [];
  if (realGoals.length) return realGoals.slice(0, 4);
  const goals = [
    ["Long-term relationship", "Life partner"],
    ["Something serious", "Open to seeing where things go"],
    ["Marriage", "Long-term relationship"],
  ];
  const safeIndex = Math.abs(profile.portrait || 0) % goals.length;
  return goals[safeIndex] || goals[0];
}

function profileEducation(profile: Profile) {
  const details = profile.discovery?.matching?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const value = (details as Record<string, unknown>).Education;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function profileOccupationEducationLine(profile: Profile) {
  return [
    profile.role ? `\u{1F4BC} ${profile.role}` : "",
    profileEducation(profile) ? `\u{1F393} ${profileEducation(profile)}` : "",
  ].filter(Boolean).join(" • ");
}

function profileDetailEmoji(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("education")) return "\u{1F393}";
  if (normalized.includes("gender")) return "\u{26A7}\u{FE0F}";
  if (normalized.includes("height")) return "\u{1F4CF}";
  if (normalized.includes("exercise")) return "\u{1F3C3}";
  if (normalized.includes("cannabis")) return "\u{1F33F}";
  if (normalized.includes("smoke")) return "\u{1F6AD}";
  if (normalized.includes("drink")) return "\u{1F377}";
  if (normalized.includes("want kids")) return "\u{1F6BC}";
  if (normalized.includes("kids")) return "\u{1F9F8}";
  if (normalized.includes("star")) return "\u{1F382}";
  if (normalized.includes("politics")) return "\u{1F5F3}\u{FE0F}";
  if (normalized.includes("religion")) return "\u{1F54A}\u{FE0F}";
  if (normalized.includes("language")) return "\u{1F3F3}\u{FE0F}";
  if (normalized.includes("occupation") || normalized.includes("work")) return "\u{1F4BC}";
  return "\u{2728}";
}

function goalEmoji(item: string) {
  const normalized = item.toLowerCase();
  if (normalized.includes("marriage")) return "\u{1F48D}";
  if (normalized.includes("life partner")) return "\u{1F491}";
  if (normalized.includes("long-term") || normalized.includes("serious")) return "\u{1F496}";
  if (normalized.includes("casual")) return "\u{1F31F}";
  if (normalized.includes("ethical") || normalized.includes("monogamy")) return "\u{1F91D}";
  if (normalized.includes("open")) return "\u{1F9ED}";
  return "\u{1F49E}";
}

function interestEmoji(item: string) {
  const normalized = item.toLowerCase();
  if (normalized.includes("city")) return "\u{1F3D9}\u{FE0F}";
  if (normalized.includes("garden")) return "\u{1F343}";
  if (normalized.includes("travel") || normalized.includes("countries")) return "\u{2708}\u{FE0F}";
  if (normalized.includes("museum") || normalized.includes("gallery")) return "\u{1F5BC}\u{FE0F}";
  if (normalized.includes("camp")) return "\u{26FA}";
  if (normalized.includes("horse")) return "\u{1F40E}";
  if (normalized.includes("walk")) return "\u{1F6B6}";
  if (normalized.includes("music")) return "\u{1F3B5}";
  if (normalized.includes("cook") || normalized.includes("food")) return "\u{1F372}";
  if (normalized.includes("soccer")) return "\u{26BD}";
  if (normalized.includes("photo")) return "\u{1F4F7}";
  if (normalized.includes("read")) return "\u{1F4DA}";
  return "\u{2728}";
}

function languageFlagEmoji(language: string) {
  const normalized = language.trim().toLowerCase();
  if (normalized.includes("english")) return "\u{1F1EC}\u{1F1E7}";
  if (normalized.includes("german")) return "\u{1F1E9}\u{1F1EA}";
  if (normalized.includes("french")) return "\u{1F1EB}\u{1F1F7}";
  if (normalized.includes("zulu")) return "\u{1F1FF}\u{1F1E6}";
  if (normalized.includes("shona")) return "\u{1F1FF}\u{1F1FC}";
  if (normalized.includes("spanish")) return "\u{1F1EA}\u{1F1F8}";
  if (normalized.includes("japanese")) return "\u{1F1EF}\u{1F1F5}";
  if (normalized.includes("mandarin") || normalized.includes("chinese")) return "\u{1F1E8}\u{1F1F3}";
  if (normalized.includes("korean")) return "\u{1F1F0}\u{1F1F7}";
  if (normalized.includes("thai")) return "\u{1F1F9}\u{1F1ED}";
  if (normalized.includes("arabic")) return "\u{1F310}";
  return "\u{1F3F3}\u{FE0F}";
}

function isInstagramPhotoRecord(photo: unknown) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) return false;
  const record = photo as Record<string, unknown>;
  return [record.source, record.provider, record.origin, record.importedFrom]
    .some((value) => typeof value === "string" && value.toLowerCase().includes("instagram"));
}

function instagramPhotoUrisFromRecords(photos: unknown) {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter(isInstagramPhotoRecord)
    .map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined)
    .map(cleanMediaUri)
    .filter((uri): uri is string => uri.length > 0);
}

function profilePhotoUris(profile: Profile) {
  const matching = profile.discovery?.matching || {};
  const matchingPhotos = Array.isArray(matching.photos)
    ? matching.photos
        .map((photo) =>
          photo && typeof photo === "object" && "uri" in photo ?
            (photo as { uri?: unknown }).uri
            : undefined,
        )
        .filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0)
    : [];
  return [
    ...new Set(
      [
        ...(profile.photoUris || []),
        profile.photoUri,
        ...(profile.discovery?.photoUris || []),
        profile.discovery?.photoUri,
        typeof matching.bestPhotoUri === "string" ? matching.bestPhotoUri : undefined,
        ...matchingPhotos,
      ].map(cleanMediaUri).filter((uri): uri is string => uri.length > 0),
    ),
  ];
}

type ProfileGalleryItem = { kind: "uri" | "portrait"; value: string | number; source?: "instagram" };

function profileGalleryItems(profile: Profile): ProfileGalleryItem[] {
  const uris = profilePhotoUris(profile);
  if (uris.length) {
    const matching = profile.discovery?.matching || {};
    const instagramUris = new Set([
      ...(profile.instagramPhotoUris || []).map(cleanMediaUri),
      ...instagramPhotoUrisFromRecords(Array.isArray(matching.photos) ? matching.photos : []),
      ...instagramPhotoUrisFromRecords((profile.discovery as unknown as Record<string, unknown> | undefined)?.photos),
    ].filter((uri): uri is string => uri.length > 0));
    return uris.map((uri) => ({
      kind: "uri",
      value: uri,
      source: instagramUris.has(uri) ? "instagram" : undefined,
    }));
  }
  const portrait = Math.abs(profile.portrait || 0);
  if (portrait >= 16) {
    const first = portrait - 16;
    return [0, 1, 2].map((offset) => ({ kind: "portrait", value: 16 + ((first + offset) % 6) }));
  }
  return [0, 1, 2].map((offset) => ({ kind: "portrait", value: (portrait + offset) % 16 }));
}

function profileGalleryPortraits(profile: Profile) {
  return profileGalleryItems(profile)
    .filter((item): item is { kind: "portrait"; value: number } => item.kind === "portrait")
    .map((item) => item.value);
}

function InstagramPhotoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: compact ? 6 : 14,
        right: compact ? 6 : 14,
        borderRadius: compact ? 12 : 16,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(126,43,143,0.32)",
        paddingHorizontal: compact ? 7 : 10,
        paddingVertical: compact ? 4 : 6,
        flexDirection: "row",
        alignItems: "center",
        gap: compact ? 3 : 5,
      }}
    >
      <Image source={INSTAGRAM_ICON} resizeMode="contain" style={{ width: compact ? 12 : 16, height: compact ? 12 : 16 }} />
      <Text style={{ color: C.ink, fontSize: compact ? 7 : 9, fontWeight: "900" }}>
        From Instagram
      </Text>
    </View>
  );
}

function ProfilePhotoGallery({
  profile,
  initialIndex,
  onClose,
  walletBalance = 0,
  hasCommentPlan = false,
  onOpenWallet,
  onPhotoComment,
}: {
  profile: Profile;
  initialIndex: number;
  onClose: () => void;
  walletBalance?: number;
  hasCommentPlan?: boolean;
  onOpenWallet?: () => void;
  onPhotoComment?: (profile: Profile, photoIndex: number) => Promise<boolean> | boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const photos = profileGalleryItems(profile);
  const photoCount = photos.length;
  const photoPrompts = profilePromptsForGallery(profile);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [commentedPhotoIndexes, setCommentedPhotoIndexes] = useState<number[]>([]);
  const [commentMessage, setCommentMessage] = useState("");
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentConfirmOpen, setCommentConfirmOpen] = useState(false);
  const galleryRef = useRef<ScrollView | null>(null);
  const closePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dy > 18 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 18 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 58 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1) onClose();
      },
    }),
  ).current;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      galleryRef.current?.scrollTo({ x: initialIndex * width, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialIndex, width]);
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View {...closePan.panHandlers} style={{ flex: 1, backgroundColor: "#141210", paddingTop: insets.top }}>
        <View style={{ minHeight: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${profile.name} profile`} onPress={onClose} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
            <ChevronLeft width={24} height={24} color={C.paper} />
            <Text numberOfLines={1} style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>
              Back to {profile.name} profile
            </Text>
          </Pressable>
          <Text selectable style={{ color: "#CFC7BC", fontSize: 12, fontWeight: "800" }}>
            {activeIndex + 1} of {photoCount}
          </Text>
        </View>
        <ScrollView
          ref={galleryRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={(event) => {
            setActiveIndex(
              Math.max(
                0,
                Math.min(photoCount - 1, Math.round(event.nativeEvent.contentOffset.x / width)),
              ),
            );
          }}
          style={{ flex: 1 }}
        >
          {photos.map((photo, index) => (
            <View key={`${profile.name}-gallery-${photo.kind}-${photo.value}-${index}`} style={{ width, height: height - insets.top - insets.bottom - 90, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width, height: Math.min(width * 1.25, height - insets.top - insets.bottom - 120), overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "#211E1A", position: "relative" }}>
                {photo.kind === "uri" ? (
                  <Image source={{ uri: String(photo.value) }} resizeMode="cover" style={{ width, height: Math.min(width * 1.25, height - insets.top - insets.bottom - 120) }} />
                ) : (
                  <Portrait index={Number(photo.value)} size={width} />
                )}
                {photo.source === "instagram" ? <InstagramPhotoBadge /> : null}
                {index > 0 && photoPrompts[index - 1] ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 18,
                      right: 18,
                      bottom: 20,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.55)",
                      backgroundColor: "rgba(255,253,249,0.34)",
                      paddingHorizontal: 13,
                      paddingVertical: 10,
                      boxShadow: "0 12px 30px rgba(0,0,0,0.24)",
                    }}
                  >
                    <Text
                      selectable
                      numberOfLines={1}
                      style={{
                        color: C.paper,
                        fontSize: 10,
                        letterSpacing: 0.45,
                        textTransform: "uppercase",
                        fontWeight: "900",
                        textShadowColor: "rgba(0,0,0,0.5)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {photoPrompts[index - 1]?.prompt || ""}
                    </Text>
                    <Text
                      selectable
                      numberOfLines={2}
                      style={{
                        color: C.paper,
                        fontSize: 13,
                        lineHeight: 17,
                        fontWeight: "900",
                        textShadowColor: "rgba(0,0,0,0.45)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {photoPrompts[index - 1]?.answer || ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingBottom: Math.max(insets.bottom, 14), minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {onPhotoComment ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Comment on ${profile.name}'s current photo`}
              onPress={() => {
                setCommentMessage("");
                setCommentConfirmOpen(false);
                setCommentDraft("");
                setCommentComposerOpen(true);
              }}
              style={{
                minHeight: 38,
                borderRadius: 19,
                backgroundColor: commentedPhotoIndexes.includes(activeIndex) ? C.pink : C.paper,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 7,
              }}
            >
              <MessageSquare width={18} height={18} color={commentedPhotoIndexes.includes(activeIndex) ? C.paper : C.pink} />
              <Text style={{ color: commentedPhotoIndexes.includes(activeIndex) ? C.paper : C.ink, fontSize: 12, fontWeight: "900" }}>
                Comment
              </Text>
            </Pressable>
          ) : null}
          {Array.from({ length: photoCount }).map((_, index) => (
            <View key={`${profile.name}-gallery-dot-${index}`} style={{ width: activeIndex === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: activeIndex === index ? C.pink : "#746D65" }} />
          ))}
        </View>
        {commentComposerOpen ? (
          <KeyboardAvoidingView
            behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Math.max(insets.top, 12)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom + 14, 24),
              paddingTop: 10,
              backgroundColor: "rgba(20,18,16,0.18)",
            }}
          >
            <View
              style={{
                borderRadius: 18,
                backgroundColor: "rgba(255,253,249,0.98)",
                padding: 13,
                gap: 9,
                boxShadow: "0 16px 35px rgba(0,0,0,0.28)",
              }}
            >
              <Text selectable style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}>
                Comment on this photo
              </Text>
              <TextInput
                value={commentDraft}
                onChangeText={setCommentDraft}
                placeholder={`Write something thoughtful for ${profile.name}...`}
                placeholderTextColor="#948A7F"
                multiline
                maxLength={220}
                autoFocus
                scrollEnabled
                style={{
                  minHeight: 92,
                  maxHeight: Math.max(120, height * 0.22),
                  borderRadius: 15,
                  borderWidth: 1,
                  borderColor: C.line,
                  backgroundColor: C.paper,
                  color: C.ink,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  textAlignVertical: "top",
                  fontSize: 14,
                  lineHeight: 20,
                }}
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text selectable style={{ color: C.muted, fontSize: 10, fontWeight: "800" }}>
                  {commentDraft.trim().length}/220
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setCommentComposerOpen(false);
                      setCommentConfirmOpen(false);
                      setCommentDraft("");
                    }}
                    style={{ minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={async () => {
                      if (!commentDraft.trim()) {
                        setCommentMessage("Write your comment first.");
                        return;
                      }
                      setCommentMessage("");
                      if (hasCommentPlan) {
                        const ok = await onPhotoComment?.(profile, activeIndex);
                        if (ok) {
                          setCommentComposerOpen(false);
                          setCommentedPhotoIndexes((current) =>
                            current.includes(activeIndex) ? current : [...current, activeIndex],
                          );
                          setCommentMessage("Photo comment sent.");
                        } else {
                          setCommentMessage("Comment could not be sent.");
                        }
                        return;
                      }
                      setCommentComposerOpen(false);
                      setCommentConfirmOpen(true);
                    }}
                    style={{ minHeight: 38, borderRadius: 19, backgroundColor: C.ink, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>Send</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
        {commentConfirmOpen ? (
          <View
            style={{
              position: "absolute",
              left: 18,
              right: 18,
              bottom: Math.max(insets.bottom + 72, 92),
              minHeight: Math.min(330, height * 0.38),
              borderRadius: 28,
              backgroundColor: "rgba(255,253,249,0.78)",
              borderWidth: 1,
              borderColor: "rgba(255,253,249,0.7)",
              padding: 18,
              gap: 12,
              justifyContent: "center",
              boxShadow: "0 18px 38px rgba(0,0,0,0.32)",
            }}
          >
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 30, lineHeight: 34, fontWeight: "900", textAlign: "center" }}>
              Comments are one of the best ways to get noticed.
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: "800", textAlign: "center" }}>
              Your profile and comment will show up in Liked You.
            </Text>
            <Text selectable style={{ color: C.clay, fontSize: 11, fontWeight: "900", textAlign: "center" }}>
              Photo comment · {formatMoney(-2.5, { signed: true })}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setCommentConfirmOpen(false);
                  setCommentComposerOpen(true);
                }}
                style={{ flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  if (walletBalance < 2.5) {
                    onOpenWallet?.();
                    return;
                  }
                  const ok = await onPhotoComment?.(profile, activeIndex);
                  if (ok) {
                    setCommentConfirmOpen(false);
                    setCommentComposerOpen(false);
                    setCommentedPhotoIndexes((current) =>
                      current.includes(activeIndex) ? current : [...current, activeIndex],
                    );
                    setCommentMessage("Photo comment sent.");
                  } else {
                    setCommentMessage("Wallet payment could not be completed.");
                  }
                }}
                style={{ flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>
                  {walletBalance >= 2.5 ? `Wallet · ${formatMoney(-2.5, { signed: true })}` : "Load Wallet"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {commentMessage ? (
          <Text selectable style={{ color: C.paper, fontSize: 11, fontWeight: "800", textAlign: "center", paddingBottom: Math.max(insets.bottom, 8) }}>
            {commentMessage}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

function ConnectExperience(props: {
  people: Profile[];
  onProfilePress?: (profile: Profile) => void;
  onLike: (profile: Profile) => void;
  onPass: (profile: Profile) => void;
  hasCommentPlan?: boolean;
  walletBalance?: number;
  onWalletSpend: (amount: number) => void;
  onPhotoComment?: (profile: Profile, photoIndex: number) => Promise<boolean>;
  onOpenWallet?: () => void;
}) {
  if (!props.people.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <View style={{ width: "100%", maxWidth: 430, borderRadius: 28, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line, padding: 24, gap: 12, alignItems: "center" }}>
          <PeopleIcon size={58} />
          <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 28, fontWeight: "900", textAlign: "center" }}>
            Your strongest connections are being prepared
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
            Complete more of your profile or adjust your filters to help KindredCube find people who clear your compatibility threshold.
          </Text>
        </View>
      </View>
    );
  }
  return <ConnectExperienceDeck {...props} />;
}

function ConnectExperienceDeck({
  people,
  onProfilePress,
  onLike,
  onPass,
  hasCommentPlan,
  walletBalance,
  onWalletSpend,
  onPhotoComment,
  onOpenWallet,
}: {
  people: Profile[];
  onProfilePress?: (profile: Profile) => void;
  onLike: (profile: Profile) => void;
  onPass: (profile: Profile) => void;
  hasCommentPlan?: boolean;
  walletBalance?: number;
  onWalletSpend: (amount: number) => void;
  onPhotoComment?: (profile: Profile, photoIndex: number) => Promise<boolean>;
  onOpenWallet?: () => void;
}) {
  const { width } = useWindowDimensions();
  const deck = people;
  const [index, setIndex] = useState(0);
  const [commentGate, setCommentGate] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [walletGate, setWalletGate] = useState(false);
  const [comment, setComment] = useState("");
  const [swiping, setSwiping] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const current = deck[index % deck.length];
  const currentPhotoPrompts = current ? profilePromptsForGallery(current) : [];
  const advancingRef = useRef(false);
  const advanceRef = useRef<(direction: "like" | "pass") => void>(() => {});
  const advance = (direction: "like" | "pass") => {
    if (advancingRef.current) return;
    const swipedProfile = current;
    advancingRef.current = true;
    setSwiping(true);
    Animated.timing(position, {
      toValue: { x: direction === "like" ? width * 1.15 : -width * 1.15, y: 0 },
      duration: 230,
      useNativeDriver: true,
    }).start(() => {
      if (direction === "like") onLike(swipedProfile);
      else onPass(swipedProfile);
      position.setValue({ x: 0, y: 0 });
      setIndex((value) => value + 1);
      setComment("");
      setSwiping(false);
      advancingRef.current = false;
    });
  };
  advanceRef.current = advance;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 7 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 9 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: () => {
        setSwiping(true);
        position.stopAnimation();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) =>
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.08 }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 70 || gesture.vx > 0.65)
          advanceRef.current("like");
        else if (gesture.dx < -70 || gesture.vx < -0.65)
          advanceRef.current("pass");
        else
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            speed: 22,
            bounciness: 5,
            useNativeDriver: true,
          }).start(() => setSwiping(false));
      },
      onPanResponderTerminate: () =>
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          speed: 22,
          bounciness: 5,
          useNativeDriver: true,
        }).start(() => setSwiping(false)),
    }),
  ).current;
  const cardWidth = Math.min(width - 32, 410);
  const rotate = position.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ["-9deg", "0deg", "9deg"],
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [24, 92],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-92, -24],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const details = moreAboutForProfile(current);
  const requestComment = () =>
    hasCommentPlan ? setComposerOpen(true) : setCommentGate(true);
  const superLike = () => {
    setWalletGate(true);
  };
  const visibleInterests = profileInterestsForCard(current);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        scrollEnabled={!swiping}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 32,
          gap: 13,
        }}
      >
        <Animated.View
          {...pan.panHandlers}
          style={{
            width: cardWidth,
            borderRadius: 25,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.paper,
            boxShadow: "0 12px 30px rgba(54,42,31,0.15)",
            transform: [
              { translateX: position.x },
              { translateY: position.y },
              { rotate },
            ],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Enlarge ${current.name}'s photo`}
            onPress={() => setGalleryIndex(0)}
          >
            <View
              style={{
                width: cardWidth,
                height: Math.min(cardWidth, 360),
                overflow: "hidden",
              }}
            >
              <ProfileImage profile={current} size={cardWidth} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share KindredCube"
                onPress={(event) => {
                  event.stopPropagation();
                  Share.share({
                    title: "KindredCube",
                    message:
                      "I found a potential kindred on KindredCube who I think might be a good fit for you.\n\nJoin KindredCube: https://kindredcube.com",
                    url: "https://kindredcube.com",
                  }).catch(() => undefined);
                }}
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 12,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(255,253,249,0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Share2 width={22} height={22} color={C.ink} strokeWidth={2.7} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Comment on this photo"
                onPress={(event) => {
                  event.stopPropagation();
                  requestComment();
                }}
                style={{
                  position: "absolute",
                  left: 64,
                  bottom: 12,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(255,253,249,0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MessageSquare width={22} height={22} color={C.ink} />
              </Pressable>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 20,
                  right: 18,
                  opacity: likeOpacity,
                  borderRadius: 18,
                  borderWidth: 3,
                  borderColor: C.pink,
                  backgroundColor: "rgba(255,253,249,0.86)",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  transform: [{ rotate: "10deg" }],
                }}
              >
                <Text style={{ color: C.pink, fontSize: 18, fontWeight: "900" }}>
                  LIKE
                </Text>
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 20,
                  left: 18,
                  opacity: passOpacity,
                  borderRadius: 18,
                  borderWidth: 3,
                  borderColor: C.muted,
                  backgroundColor: "rgba(255,253,249,0.86)",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  transform: [{ rotate: "-10deg" }],
                }}
              >
                <Text style={{ color: C.muted, fontSize: 18, fontWeight: "900" }}>
                  PASS
                </Text>
              </Animated.View>
            </View>
          </Pressable>
          <View style={{ padding: 15, gap: 4 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Text
                selectable
                style={{
                  color: C.ink,
                  fontFamily: BRAND_FONT,
                  fontSize: 28,
                  fontWeight: "900",
                }}
              >
                {current.name}, {current.age}
              </Text>
              <ProfileVerificationBadgeIcons profile={current} size={19} stacked />
            </View>
            <Text
              selectable
              style={{ color: C.clay, fontSize: 12, fontWeight: "900" }}
            >
              {profileOccupationEducationLine(current) || "Profile details not added"}
            </Text>
            <VerificationBadges profile={current} />
          </View>
        </Animated.View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 24,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pass"
            onPress={() => advance("pass")}
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X width={29} height={29} color={C.muted} strokeWidth={2.8} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Super Like for ${formatMoney(-2.5, { signed: true })}. Wallet balance ${formatMoney(walletBalance)}`}
            onPress={superLike}
            style={{
              width: 61,
              height: 61,
              borderRadius: 31,
              backgroundColor: "#FFF5D5",
              borderWidth: 1,
              borderColor: "#E5C658",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Star width={29} height={29} color="#D39B00" fill="#E7B51E" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Like"
            onPress={() => advance("like")}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "#FCE5EE",
              borderWidth: 1,
              borderColor: "#F3A4C2",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Heart width={30} height={30} color={C.pink} fill={C.pink} />
          </Pressable>
        </View>
        <Text selectable style={{ color: C.muted, fontSize: 10, fontWeight: "900" }}>
          Super Like
        </Text>
        {composerOpen ? (
          <View
            style={{
              width: cardWidth,
              borderRadius: 18,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 12,
              gap: 8,
            }}
          >
            <TextInput
              autoFocus
              value={comment}
              onChangeText={setComment}
              placeholder="Write a thoughtful photo comment..."
              placeholderTextColor="#948A7F"
              style={{ minHeight: 48, color: C.ink }}
            />
            <Button
              compact
              label="Send comment"
              disabled={!comment.trim()}
              onPress={() => {
                setComposerOpen(false);
                setComment("");
              }}
            />
          </View>
        ) : null}
        <View style={{ width: cardWidth, gap: 11 }}>
          <View
            style={{
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 16,
              gap: 8,
            }}
          >
            <Text
              selectable
              style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}
            >
              Bio
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}
            >
              {profileBioForCard(current)}
            </Text>
          </View>
          <View
            style={{
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 16,
              gap: 11,
            }}
          >
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 23,
                fontWeight: "900",
              }}
            >
              More about {current.name}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {details.map(([label, value], itemIndex) => (
                <View
                  key={label}
                  style={{
                    borderRadius: 16,
                    backgroundColor: itemIndex === 0 ? "#F3EDF9" : "#F3EFE8",
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                    gap: 2,
                  }}
                >
                  <Text
                    selectable
                    style={{ color: C.muted, fontSize: 9, fontWeight: "900" }}
                  >
                    {profileDetailEmoji(label)} {label.toUpperCase()}
                  </Text>
                  <Text
                    selectable
                    style={{
                      color: itemIndex === 0 ? "#59359C" : C.ink,
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View
            style={{
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 16,
              gap: 9,
            }}
          >
            <Text
              selectable
              style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}
            >
              Interests
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {visibleInterests.map((item, itemIndex) => (
                <View
                  key={item}
                  style={{
                    borderRadius: 16,
                    backgroundColor: itemIndex % 2 ? "#F3EFE8" : "#EAF2EC",
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    selectable
                    style={{ color: C.ink, fontSize: 12, fontWeight: "800" }}
                  >
                    {interestEmoji(item)} {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View
            style={{
              borderRadius: 21,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 16,
              gap: 9,
            }}
          >
            <Text
              selectable
              style={{ color: C.ink, fontSize: 19, fontWeight: "900" }}
            >
              Searching for
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {profileGoalsForCard(current).map((item) => (
                <View
                  key={item}
                  style={{
                    borderRadius: 16,
                    backgroundColor: "#FCE5EE",
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    selectable
                    style={{
                      color: "#A5164D",
                      fontSize: 12,
                      fontWeight: "900",
                    }}
                  >
                    {goalEmoji(item)} {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 9 }}>
            {profileGalleryItems(current).slice(1).map((photo, photoIndex) => {
              const savedPrompt = currentPhotoPrompts[photoIndex] || null;
              return (
                <Pressable
                  key={`${photo.kind}-${photo.value}-${photoIndex}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Enlarge ${current.name}'s photo ${photoIndex + 2}`}
                  onPress={() => setGalleryIndex(photoIndex + 1)}
                  style={{
                    flex: 1,
                    aspectRatio: 0.9,
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  {photo.kind === "uri" ? (
                    <Image source={{ uri: String(photo.value) }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Portrait index={Number(photo.value) % 18} size={210} />
                  )}
                  {photo.source === "instagram" ? <InstagramPhotoBadge compact /> : null}
                  {savedPrompt ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        bottom: 8,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.48)",
                        backgroundColor: "rgba(255,255,255,0.24)",
                        paddingHorizontal: 8,
                        paddingVertical: 7,
                      }}
                    >
                      <Text
                        selectable
                        numberOfLines={1}
                        style={{
                          color: "#FFFFFF",
                          fontSize: 9,
                          fontWeight: "900",
                          textShadowColor: "rgba(0,0,0,0.55)",
                          textShadowRadius: 5,
                        }}
                      >
                        {savedPrompt?.prompt || ""}
                      </Text>
                      <Text
                        selectable
                        numberOfLines={2}
                        style={{
                          color: "#FFFFFF",
                          fontSize: 10,
                          fontWeight: "800",
                          lineHeight: 13,
                          textShadowColor: "rgba(0,0,0,0.58)",
                          textShadowRadius: 5,
                        }}
                      >
                        {savedPrompt?.answer || ""}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      {galleryIndex !== null ? (
        <ProfilePhotoGallery
          profile={current}
          initialIndex={galleryIndex}
          walletBalance={walletBalance}
          hasCommentPlan={hasCommentPlan}
          onOpenWallet={onOpenWallet}
          onPhotoComment={onPhotoComment}
          onClose={() => setGalleryIndex(null)}
        />
      ) : null}
      {commentGate ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(34,31,27,0.52)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              borderRadius: 27,
              backgroundColor: C.paper,
              padding: 22,
              gap: 14,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setCommentGate(false)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={24} height={24} color={C.ink} />
            </Pressable>
            <MessageSquare width={35} height={35} color={C.pink} />
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 27,
                fontWeight: "900",
              }}
            >
              Send photo comments
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
            >
              Use Premium or KindredPass, or send this one comment from your Wallet.
              Your comment will be delivered to {current.name} only after confirmation.
            </Text>
            <Button
              label="View Premium plans"
              onPress={() => setCommentGate(false)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCommentGate(false);
                if (walletBalance > 0) {
                  setComposerOpen(true);
                } else {
                  onOpenWallet();
                }
              }}
              style={{
                minHeight: 48,
                borderRadius: 24,
                borderWidth: 1.5,
                borderColor: C.ink,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Wallet width={19} height={19} color={C.ink} />
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
                {walletBalance > 0 ? "Use Wallet to comment" : "Load Wallet to send comment"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {walletGate ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(34,31,27,0.52)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              borderRadius: 27,
              backgroundColor: C.paper,
              padding: 22,
              gap: 14,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close wallet message"
              onPress={() => setWalletGate(false)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={24} height={24} color={C.ink} />
            </Pressable>
            <Wallet width={36} height={36} color={C.pink} />
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 27,
                fontWeight: "900",
              }}
            >
              Super Like
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
            >
              Super Like costs {formatMoney(-2.5, { signed: true })}.
            </Text>
            <Button
              label={walletBalance >= 2.5 ? "Pay with Wallet" : "Load Wallet"}
              onPress={() => {
                setWalletGate(false);
                if (walletBalance >= 2.5) {
                  onWalletSpend(2.5);
                  onLike(current);
                  advance("like");
                } else {
                  onOpenWallet();
                }
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ExploreScreen() {
  const communities = [
    "New & Verified",
    "Open to Relocate",
    "Shared Values",
    "Nearby Cultures",
  ];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 30,
        gap: 16,
      }}
    >
      <Logo size="compact" />
      <View style={{ gap: 5 }}>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
        >
          Discover people through cultures, values, and communities.
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {communities.map((item, index) => (
          <View
            key={item}
            style={{
              width: "48%",
              minHeight: 112,
              borderRadius: 20,
              borderCurve: "continuous",
              backgroundColor: index % 2 ? "#FCE5EE" : C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 15,
              justifyContent: "flex-end",
              gap: 5,
            }}
          >
            <Text
              style={{ color: index % 2 ? C.pink : "#5A3AC7", fontSize: 23 }}
            >
              {index % 2 ? "♥" : "◆"}
            </Text>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 15, fontWeight: "900" }}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function LikedYouScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 30,
        gap: 16,
      }}
    >
      <Logo size="compact" />
      <View style={{ gap: 5 }}>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
        >
          People who are interested in connecting with you will appear here.
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            width: 82,
            height: 82,
            borderRadius: 41,
            backgroundColor: "#FCE5EE",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Heart width={42} height={42} color={C.pink} fill="#F7A7C6" strokeWidth={2.4} />
          <View
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: C.clay,
            }}
          />
        </View>
        <Text
          selectable
          style={{
            color: C.ink,
            fontSize: 20,
            fontWeight: "900",
            textAlign: "center",
          }}
        >
          Your admirers will show here
        </Text>
        <Text
          selectable
          style={{
            color: C.muted,
            fontSize: 14,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          Complete your profile to help the right people find you.
        </Text>
      </View>
    </ScrollView>
  );
}

function FilterPanel({ onClose }: { onClose: () => void }) {
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [nearbyOnly, setNearbyOnly] = useState(true);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 24,
        gap: 15,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          selectable
          style={{
            color: C.ink,
            fontFamily: BRAND_FONT,
            fontSize: 31,
            fontWeight: "900",
          }}
        >
          Connect filters
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          onPress={onClose}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: C.paper,
            borderWidth: 1,
            borderColor: C.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X width={23} height={23} color={C.ink} strokeWidth={2.8} />
        </Pressable>
      </View>
      <Text selectable style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
        Refine who appears in Connect. Your saved culture and age preferences
        remain selected.
      </Text>
      <View
        style={{
          borderRadius: 22,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 10,
        }}
      >
        <Choice
          label="Nearby only"
          selected={nearbyOnly}
          onPress={() => setNearbyOnly((value) => !value)}
        />
        <Choice
          label="Verified only"
          selected={verifiedOnly}
          onPress={() => setVerifiedOnly((value) => !value)}
        />
        <Choice
          label="Open to relocate"
          selected={false}
          onPress={() => undefined}
        />
        <Choice
          label="Recently active"
          selected={false}
          onPress={() => undefined}
        />
      </View>
      <Button label="Show connections" onPress={onClose} />
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{
        minHeight: 50,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        selectable
        style={{
          color: C.ink,
          fontSize: 13,
          lineHeight: 18,
          fontWeight: "800",
          flex: 1,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          backgroundColor: value ? C.pink : "#C9C1B6",
          padding: 3,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: C.paper,
          }}
        />
      </View>
    </Pressable>
  );
}

function SingleSlider({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  const startRef = useRef(value);
  valueRef.current = value;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = valueRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(
          min,
          Math.min(
            max,
            Math.round(
              startRef.current +
                (gesture.dx / Math.max(1, widthRef.current)) * (max - min),
            ),
          ),
        );
        valueRef.current = next;
        onChange(next);
      },
    }),
  ).current;
  const x = ((value - min) / (max - min)) * width;
  return (
    <View style={{ gap: 5 }}>
      <Text
        selectable
        style={{
          color: C.clay,
          fontSize: 19,
          fontWeight: "900",
          textAlign: "center",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value} {suffix}
      </Text>
      <View
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          setWidth(event.nativeEvent.layout.width);
        }}
        style={{ height: 42, justifyContent: "center" }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line }} />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            width: x,
            height: 6,
            borderRadius: 3,
            backgroundColor: C.pink,
          }}
        />
        <View
          {...pan.panHandlers}
          style={{
            position: "absolute",
            left: x - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 3,
            borderColor: C.pink,
            backgroundColor: C.paper,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: C.muted, fontSize: 10 }}>{min}</Text>
        <Text style={{ color: C.muted, fontSize: 10 }}>{max}</Text>
      </View>
    </View>
  );
}

function ConnectFilters({
  onClose,
  profileInterests,
}: {
  onClose: () => void;
  profileInterests: string[];
}) {
  const [dating, setDating] = useState<string[]>(["Women"]);
  const [openEveryone, setOpenEveryone] = useState(false);
  const [minAge, setMinAge] = useState(25);
  const [maxAge, setMaxAge] = useState(40);
  const [expandAge, setExpandAge] = useState(true);
  const [distance, setDistance] = useState(25);
  const [distanceUnit, setDistanceUnit] = useState<"mi" | "km">("mi");
  const [mustShareInterests, setMustShareInterests] =
    useState<string[]>(profileInterests);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [interestPickerOpen, setInterestPickerOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [premiumGate, setPremiumGate] = useState(false);
  const toggle = (
    item: string,
    current: string[],
    setter: (value: string[]) => void,
    max = 5,
  ) =>
    setter(
      current.includes(item) ?
        current.filter((value) => value !== item)
        : current.length < max ?
          [...current, item]
          : current,
    );
  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{
        minHeight: 39,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? C.pink : C.line,
        backgroundColor: selected ? "#FCE5EE" : C.paper,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: selected ? "#A5164D" : C.ink,
          fontSize: 12,
          fontWeight: selected ? "900" : "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 18,
        paddingBottom: 32,
        gap: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View>
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 31,
              fontWeight: "900",
            }}
          >
            Connect filters
          </Text>
          <Text selectable style={{ color: C.muted, fontSize: 12 }}>
            Refine your closest matches.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: C.paper,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: C.line,
          }}
        >
          <X width={22} height={22} color={C.ink} />
        </Pressable>
      </View>
      <View
        style={{
          borderRadius: 23,
          backgroundColor: C.paper,
          borderWidth: 1,
          borderColor: C.line,
          padding: 16,
          gap: 17,
        }}
      >
        <View>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}
          >
            Basic filters
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 12, paddingTop: 3 }}
          >
            Included for every KindredCube member.
          </Text>
        </View>
        <View style={{ gap: 9 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
          >
            Who would you like to date?
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Men", "Women", "Nonbinary"].map((item) =>
              chip(item, dating.includes(item) && !openEveryone, () => {
                setOpenEveryone(false);
                toggle(item, dating, setDating, 3);
              }),
            )}
          </View>
          <ToggleRow
            label="I'm open to dating everyone"
            value={openEveryone}
            onChange={(value) => {
              setOpenEveryone(value);
              if (value) setDating(["Men", "Women", "Nonbinary"]);
            }}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
          >
            Interested age
          </Text>
          <AgeRangeSlider
            minAge={minAge}
            maxAge={maxAge}
            onChange={(minimum, maximum) => {
              setMinAge(minimum);
              setMaxAge(maximum);
            }}
          />
          <ToggleRow
            label="See people 2 years either side if I run out"
            value={expandAge}
            onChange={setExpandAge}
          />
        </View>
        <View style={{ gap: 9 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              selectable
              style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
            >
              Maximum distance
            </Text>
            <View
              style={{
                flexDirection: "row",
                borderRadius: 16,
                backgroundColor: "#F3EFE8",
                padding: 3,
              }}
            >
              {(["mi", "km"] as const).map((unit) => (
                <Pressable
                  key={unit}
                  onPress={() => setDistanceUnit(unit)}
                  style={{
                    borderRadius: 13,
                    backgroundColor:
                      distanceUnit === unit ? C.paper : "transparent",
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      color: distanceUnit === unit ? C.ink : C.muted,
                      fontSize: 11,
                      fontWeight: "900",
                    }}
                  >
                    {unit === "mi" ? "Miles" : "KM"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <SingleSlider
            value={distance}
            min={1}
            max={distanceUnit === "mi" ? 100 : 160}
            suffix={distanceUnit}
            onChange={setDistance}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
          >
            Must they share any interests?
          </Text>
          <Text
            selectable
            style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
          >
            Your profile interests appear first. Add or remove up to 5 interests
            you want a match to share.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {[...new Set([...profileInterests, ...interestOptions])].map(
              (item) =>
                chip(item, mustShareInterests.includes(item), () =>
                  toggle(item, mustShareInterests, setMustShareInterests, 5),
                ),
            )}
          </View>
        </View>
        <ToggleRow
          label="Only show verified people"
          value={verifiedOnly}
          onChange={setVerifiedOnly}
        />
        <View style={{ gap: 8 }}>
          <Text
            selectable
            style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
          >
            Languages they must know
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {detailOptions.Languages.map((item) =>
              chip(item, languages.includes(item), () =>
                toggle(item, languages, setLanguages, 3),
              ),
            )}
          </View>
        </View>
      </View>
      <View
        style={{
          borderRadius: 23,
          backgroundColor: "#F3EDF9",
          borderWidth: 1,
          borderColor: "#C6B3E7",
          padding: 16,
          gap: 13,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <LockKeyhole width={22} height={22} color="#59359C" />
          <View>
            <Text
              selectable
              style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}
            >
              Advanced filters
            </Text>
            <Text
              selectable
              style={{ color: "#59359C", fontSize: 11, fontWeight: "900" }}
            >
              PREMIUM & ELITE
            </Text>
          </View>
        </View>
        <Text
          selectable
          style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
        >
          Unlock precise height preferences and filter by what the other person
          is looking for.
        </Text>
        <View pointerEvents="none" style={{ opacity: 0.52, gap: 12 }}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ color: C.ink, fontWeight: "900" }}>
              Height range
            </Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>Feet / meters</Text>
          </View>
          <SingleSlider
            value={175}
            min={145}
            max={210}
            suffix="cm"
            onChange={() => undefined}
          />
          <Text style={{ color: C.ink, fontWeight: "900" }}>
            What are they looking for?
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {relationshipOptions.map((item) =>
              chip(item, false, () => undefined),
            )}
          </View>
        </View>
        <Button label="Unlock advanced filters" onPress={() => undefined} />
      </View>
      <Button label="Apply basic filters" onPress={onClose} />
    </ScrollView>
  );
}

function FilterChipButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 39,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? C.pink : C.line,
        backgroundColor: selected ? "#FCE5EE" : C.paper,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: selected ? "#A5164D" : C.ink,
          fontSize: 12,
          fontWeight: selected ? "900" : "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ConnectFiltersTabbed({
  onClose,
  profileInterests,
}: {
  onClose: () => void;
  profileInterests: string[];
}) {
  const safeProfileInterests = Array.isArray(profileInterests) ? profileInterests : [];
  const [tab, setTab] = useState<"basic" | "advanced">("basic");
  const [dating, setDating] = useState<string[]>(["Women"]);
  const [openEveryone, setOpenEveryone] = useState(false);
  const [minAge, setMinAge] = useState(25);
  const [maxAge, setMaxAge] = useState(40);
  const [expandAge, setExpandAge] = useState(true);
  const [distance, setDistance] = useState(25);
  const [distanceUnit, setDistanceUnit] = useState<"mi" | "km">("mi");
  const [mustShareInterests, setMustShareInterests] = useState<string[]>(
    safeProfileInterests.slice(0, 5),
  );
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [interestPickerOpen, setInterestPickerOpen] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [premiumGate, setPremiumGate] = useState(false);
  const [heightMin, setHeightMin] = useState(155);
  const [heightMax, setHeightMax] = useState(190);
  const [heightUnit, setHeightUnit] = useState<"ft" | "m">("ft");
  const [advancedValues, setAdvancedValues] = useState<
    Record<string, string[]>
  >({});

  const toggle = (
    item: string,
    current: string[],
    setter: (value: string[]) => void,
    max = 5,
  ) =>
    setter(
      current.includes(item) ?
        current.filter((value) => value !== item)
        : current.length < max ?
          [...current, item]
          : current,
    );
  const toggleAdvanced = (group: string, item: string, max = 5) =>
    setAdvancedValues((current) => {
      const selected = current[group] ?? [];
      return {
        ...current,
        [group]: selected.includes(item) ?
          selected.filter((value) => value !== item)
          : selected.length < max ?
            [...selected, item]
            : selected,
      };
    });
  const heightLabel = (cm: number) => {
    if (heightUnit === "m") return `${(cm / 100).toFixed(2)} m`;
    const totalInches = Math.round(cm / 2.54);
    return `${Math.floor(totalInches / 12)}'${totalInches % 12}\"`;
  };
  const filterOptions = (...keys: string[]) =>
    keys.flatMap((key) => (Array.isArray(detailOptions[key]) ? detailOptions[key] : []));
  const advancedGroups: {
    title: string;
    key: string;
    options: string[];
    max?: number;
  }[] = [
    {
      title: "Hard filters",
      key: "hardFilters",
      options: [
        "Only show people who want children",
        "Only show people seeking marriage",
        "Only show non-smokers",
        "Only show non-drinkers",
        "Only show people with the same religion",
        "Only show people within my selected distance",
        "Only show people within my selected age range",
      ],
      max: 7,
    },
    {
      title: "What are they looking for?",
      key: "relationship",
      options: relationshipOptions,
    },
    {
      title: "Children preferences",
      key: "kids",
      options: [
        ...new Set(filterOptions("Have kids", "Want kids").filter((item) => item !== "Skip")),
      ],
      max: 3,
    },
    {
      title: "Education",
      key: "education",
      options: filterOptions("Education"),
      max: 3,
    },
    {
      title: "Exercise",
      key: "exercise",
      options: filterOptions("Exercise"),
      max: 3,
    },
    {
      title: "Cannabis",
      key: "cannabis",
      options: filterOptions("Cannabis"),
      max: 3,
    },
    {
      title: "Politics",
      key: "politics",
      options: filterOptions("Politics"),
      max: 3,
    },
    {
      title: "Religion",
      key: "religion",
      options: filterOptions("Religion"),
      max: 4,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 34,
          gap: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 31,
                fontWeight: "900",
              }}
            >
              Connect filters
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 12 }}>
              Refine your closest matches.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: C.paper,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: C.line,
            }}
          >
            <X width={22} height={22} color={C.ink} />
          </Pressable>
        </View>
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: "#EEE7DC",
            padding: 4,
          }}
        >
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "basic" }}
            onPress={() => setTab("basic")}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 14,
              backgroundColor: tab === "basic" ? C.paper : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: tab === "basic" ? C.ink : C.muted,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              Basic Filters
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === "advanced" }}
            onPress={() => setTab("advanced")}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 14,
              backgroundColor: tab === "advanced" ? "#F3EDF9" : "transparent",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
            }}
          >
            <LockKeyhole
              width={14}
              height={14}
              color={tab === "advanced" ? "#59359C" : C.muted}
            />
            <Text
              style={{
                color: tab === "advanced" ? "#59359C" : C.muted,
                fontSize: 14,
                fontWeight: "900",
              }}
            >
              Advanced Filters
            </Text>
          </Pressable>
        </View>

        {tab === "basic" ? (
          <View
            style={{
              borderRadius: 23,
              backgroundColor: C.paper,
              borderWidth: 1,
              borderColor: C.line,
              padding: 16,
              gap: 18,
            }}
          >
            <Text selectable style={{ color: C.muted, fontSize: 12 }}>
              Included for every KindredCube member.
            </Text>
            <View style={{ gap: 9 }}>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
              >
                Who would you like to date?
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Men", "Women", "Nonbinary"].map((item) => (
                  <FilterChipButton
                    key={item}
                    label={item}
                    selected={dating.includes(item) && !openEveryone}
                    onPress={() => {
                      setOpenEveryone(false);
                      toggle(item, dating, setDating, 3);
                    }}
                  />
                ))}
              </View>
              <ToggleRow
                label="I'm open to dating everyone"
                value={openEveryone}
                onChange={(value) => {
                  setOpenEveryone(value);
                  if (value) setDating(["Men", "Women", "Nonbinary"]);
                }}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
              >
                Interested age
              </Text>
              <AgeRangeSlider
                minAge={minAge}
                maxAge={maxAge}
                onChange={(minimum, maximum) => {
                  setMinAge(minimum);
                  setMaxAge(maximum);
                }}
              />
              <ToggleRow
                label="See people 2 years either side if I run out"
                value={expandAge}
                onChange={setExpandAge}
              />
            </View>
            <View style={{ gap: 9 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  selectable
                  style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
                >
                  Maximum distance
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    borderRadius: 16,
                    backgroundColor: "#F3EFE8",
                    padding: 3,
                  }}
                >
                  {(["mi", "km"] as const).map((unit) => (
                    <Pressable
                      key={unit}
                      onPress={() => setDistanceUnit(unit)}
                      style={{
                        borderRadius: 13,
                        backgroundColor:
                          distanceUnit === unit ? C.paper : "transparent",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text
                        style={{
                          color: distanceUnit === unit ? C.ink : C.muted,
                          fontSize: 11,
                          fontWeight: "900",
                        }}
                      >
                        {unit === "mi" ? "Miles" : "KM"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <SingleSlider
                value={distance}
                min={1}
                max={distanceUnit === "mi" ? 100 : 160}
                suffix={distanceUnit}
                onChange={setDistance}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
              >
                Must they share any interests?
              </Text>
              <Text
                selectable
                style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}
              >
                Your Profile interests appear here. Add or remove interests, up
                to a maximum of 8.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {mustShareInterests.map((item) => (
                  <FilterChipButton
                    key={item}
                    label={`${item} ×`}
                    selected
                    onPress={() =>
                      toggle(item, mustShareInterests, setMustShareInterests, 8)
                    }
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setInterestPickerOpen((value) => !value)}
                style={{
                  alignSelf: "flex-start",
                  minHeight: 38,
                  borderRadius: 19,
                  borderWidth: 1,
                  borderColor: C.pink,
                  paddingHorizontal: 13,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: C.pink, fontSize: 12, fontWeight: "900" }}
                >
                  {interestPickerOpen ? "Done choosing" : "+ Add interests"}
                </Text>
              </Pressable>
              {interestPickerOpen ? (
                <View
                  style={{
                    borderRadius: 17,
                    backgroundColor: "#FAF7F2",
                    padding: 11,
                    gap: 8,
                  }}
                >
                  <Text
                    selectable
                    style={{ color: C.muted, fontSize: 10, fontWeight: "800" }}
                  >
                    {mustShareInterests.length} OF 8 SELECTED
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    {interestOptions.map((item) => (
                      <FilterChipButton
                        key={item}
                        label={item}
                        selected={mustShareInterests.includes(item)}
                        onPress={() =>
                          toggle(
                            item,
                            mustShareInterests,
                            setMustShareInterests,
                            8,
                          )
                        }
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
            <ToggleRow
              label="Only show verified people"
              value={verifiedOnly}
              onChange={setVerifiedOnly}
            />
            <View style={{ gap: 8 }}>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
              >
                Languages they must know
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {languages.map((item) => (
                  <FilterChipButton
                    key={item}
                    label={`${item} ×`}
                    selected
                    onPress={() => setLanguages([])}
                  />
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setLanguagePickerOpen((value) => !value)}
                style={{
                  alignSelf: "flex-start",
                  minHeight: 38,
                  borderRadius: 19,
                  borderWidth: 1,
                  borderColor: C.pink,
                  paddingHorizontal: 13,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: C.pink, fontSize: 12, fontWeight: "900" }}
                >
                  {languagePickerOpen ?
                    "Close languages"
                    : languages.length ?
                      "Change language"
                      : "+ Choose language"}
                </Text>
              </Pressable>
              {languagePickerOpen ? (
                <View
                  style={{
                    borderRadius: 17,
                    backgroundColor: "#FAF7F2",
                    padding: 11,
                  }}
                >
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    {majorGlobalLanguages.map((item) => (
                      <FilterChipButton
                        key={item}
                        label={item}
                        selected={languages.includes(item)}
                        onPress={() => {
                          setLanguages([item]);
                          setLanguagePickerOpen(false);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
            <Button label="Apply basic filters" onPress={onClose} />
          </View>
        ) : (
          <View
            style={{
              borderRadius: 23,
              backgroundColor: "#F9F5FC",
              borderWidth: 1,
              borderColor: "#C6B3E7",
              padding: 16,
              gap: 19,
            }}
          >
            <View style={{ gap: 4 }}>
              <Text
                selectable
                style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}
              >
                Advanced filters
              </Text>
              <Text
                selectable
                style={{ color: "#59359C", fontSize: 11, fontWeight: "900" }}
              >
                PREMIUM & ELITE
              </Text>
              <Text
                selectable
                style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}
              >
                Every advanced setting is shown below. Choose the details that
                matter most to you.
              </Text>
            </View>
            <View style={{ gap: 9 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  selectable
                  style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
                >
                  Height range
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    borderRadius: 16,
                    backgroundColor: "#E9E0F1",
                    padding: 3,
                  }}
                >
                  {(["ft", "m"] as const).map((unit) => (
                    <Pressable
                      key={unit}
                      onPress={() => setHeightUnit(unit)}
                      style={{
                        borderRadius: 13,
                        backgroundColor:
                          heightUnit === unit ? C.paper : "transparent",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text
                        style={{
                          color: heightUnit === unit ? C.ink : C.muted,
                          fontSize: 11,
                          fontWeight: "900",
                        }}
                      >
                        {unit === "ft" ? "Feet" : "Meters"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text
                style={{
                  color: "#59359C",
                  fontSize: 17,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                {heightLabel(heightMin)} - {heightLabel(heightMax)}
              </Text>
              <Text style={{ color: C.muted, fontSize: 11 }}>
                Minimum height
              </Text>
              <SingleSlider
                value={heightMin}
                min={140}
                max={heightMax - 1}
                suffix="cm"
                onChange={setHeightMin}
              />
              <Text style={{ color: C.muted, fontSize: 11 }}>
                Maximum height
              </Text>
              <SingleSlider
                value={heightMax}
                min={heightMin + 1}
                max={220}
                suffix="cm"
                onChange={setHeightMax}
              />
            </View>
            {advancedGroups.map((group) => (
              <View key={group.key} style={{ gap: 8 }}>
                <Text
                  selectable
                  style={{ color: C.ink, fontSize: 14, fontWeight: "900" }}
                >
                  {group.title}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                >
                  {group.options.map((item) => (
                    <FilterChipButton
                      key={item}
                      label={item}
                      selected={(advancedValues[group.key] ?? []).includes(
                        item,
                      )}
                      onPress={() => toggleAdvanced(group.key, item, group.max)}
                    />
                  ))}
                </View>
              </View>
            ))}
            <Button
              label="Save advanced filters"
              onPress={() => setPremiumGate(true)}
            />
          </View>
        )}
      </ScrollView>
      {premiumGate ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(34,31,27,0.55)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              borderRadius: 27,
              backgroundColor: C.paper,
              padding: 22,
              gap: 14,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Premium message"
              onPress={() => setPremiumGate(false)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={24} height={24} color={C.ink} />
            </Pressable>
            <LockKeyhole width={35} height={35} color="#59359C" />
            <Text
              selectable
              style={{
                color: C.ink,
                fontFamily: BRAND_FONT,
                fontSize: 27,
                fontWeight: "900",
              }}
            >
              Advanced Filters are Premium
            </Text>
            <Text
              selectable
              style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}
            >
              You can explore and configure every Advanced Filter, but saving
              them requires Premium or Elite.
            </Text>
            <Button
              label="View Premium plans"
              onPress={() => setPremiumGate(false)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setPremiumGate(false)}
              style={{
                minHeight: 42,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
                Keep editing
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

async function registerDeviceForMessagePush() {
  if (process.env.EXPO_OS === "web") return;
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ?
    existing
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#EF2D6F",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "2cf58077-efbd-4743-8035-9868ff7de9ab";
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  await registerPushToken(
    token.data,
    Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
  );
}

function SignedInHome({
  people,
  onProfilePress,
  onLogout,
  initialUser,
  startInProfileEditor = false,
}: {
  people: Profile[];
  onProfilePress?: (profile: Profile) => void;
  onLogout: () => void;
  initialUser?: AuthenticatedUser | null;
  startInProfileEditor?: boolean;
}) {
  const [tab, setTab] = useState<
    "profile" | "explore" | "connect" | "liked" | "chats"
  >(startInProfileEditor ? "profile" : "connect");
  const [showRecommendation, setShowRecommendation] = useState(
    !startInProfileEditor,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState("");
  const [profileStrength, setProfileStrength] = useState(0);
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileBio, setProfileBio] = useState("");
  const [searchingFor, setSearchingFor] = useState<string[]>([]);
  const [memberUsername, setMemberUsername] = useState(
    initialUser?.username || "Member",
  );
  const [privateProfile, setPrivateProfile] = useState<Record<string, unknown>>(
    {},
  );
  const [privateSettings, setPrivateSettings] = useState<Record<string, unknown>>(
    {},
  );
  const [privateSpaceLoaded, setPrivateSpaceLoaded] = useState(false);
  const [privateSpaceLoadError, setPrivateSpaceLoadError] = useState("");
  const [privateSpaceReloadKey, setPrivateSpaceReloadKey] = useState(0);
  const [identityVerificationStatus, setIdentityVerificationStatus] = useState<IdentityVerificationStatus>("not_started");
  const [identityVerificationMethod, setIdentityVerificationMethod] = useState<IdentityVerificationMethod>("");
  const privateProfileRef = useRef<Record<string, unknown>>({});
  const privateSettingsRef = useRef<Record<string, unknown>>({});
  const savePrivateSpaceTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const amaraReadSaveRef = useRef<Promise<unknown> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(startInProfileEditor);
  const [profileEditorVersion, setProfileEditorVersion] = useState(0);
  const [startSettingsInWallet, setStartSettingsInWallet] = useState(false);
  const [membershipOptionsOpen, setMembershipOptionsOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [premiumActive, setPremiumActive] = useState(false);
  const [kindredPassActive, setKindredPassActive] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadChatIds, setUnreadChatIds] = useState<string[]>([]);
  const seenChatMessageTimesRef = useRef<Record<string, string>>({});
  const [assistantAvailable, setAssistantAvailable] = useState(false);
  const [assistantUnread, setAssistantUnread] = useState(false);
  const [memberChat, setMemberChat] = useState<Profile | null>(null);
  const [memberChats, setMemberChats] = useState<Profile[]>([]);
  const [activeMemberChat, setActiveMemberChat] = useState<Profile | null>(null);
  const [memberChatReadyNearby, setMemberChatReadyNearby] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<Profile | null>(null);
  const [matchCelebrationProfile, setMatchCelebrationProfile] = useState<Profile | null>(null);
  const [chatPaywallProfile, setChatPaywallProfile] = useState<Profile | null>(null);
  const [chatUnlocking, setChatUnlocking] = useState(false);
  const [blockedProfileIds, setBlockedProfileIds] = useState<string[]>([]);
  const [paidReadyMeetChatIds, setPaidReadyMeetChatIds] = useState<string[]>([]);
  const [readyMeetPassExpiresAt, setReadyMeetPassExpiresAt] = useState("");
  const [likedProfiles, setLikedProfiles] = useState<string[]>([]);
  const [matchedProfileIds, setMatchedProfileIds] = useState<string[]>([]);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<Record<string, string>>({});
  const [incomingLikes, setIncomingLikes] = useState<IncomingLike[]>([]);
  const [revealedIncomingLikeIds, setRevealedIncomingLikeIds] = useState<string[]>([]);
  const [completedPostMeetCheckKeys, setCompletedPostMeetCheckKeys] = useState<string[]>([]);
  const [realDiscoveryPeople, setRealDiscoveryPeople] = useState<Profile[]>([]);
  const [realReadyToMeetPeople, setRealReadyToMeetPeople] = useState<Profile[]>([]);
  const readyMeetSeenAtRef = useRef<Record<string, number>>({});
  const incomingChatSocketRef = useRef<Socket | null>(null);
  const homeCacheRef = useRef<Partial<HomeStartupCache>>({});
  const homeCacheSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueHomeCacheSave = useCallback((patch: Partial<HomeStartupCache>) => {
    if (!initialUser?.id) return;
    homeCacheRef.current = { ...homeCacheRef.current, ...patch };
    if (homeCacheSaveTimer.current) clearTimeout(homeCacheSaveTimer.current);
    homeCacheSaveTimer.current = setTimeout(() => {
      writeHomeStartupCache(initialUser.id, homeCacheRef.current).catch(() => undefined);
    }, 250);
  }, [initialUser?.id]);
  const applyPrivateSpaceSnapshot = useCallback((profile: Record<string, unknown>, settings: Record<string, unknown>) => {
    const normalizedProfile = normalizeProfileMediaUris(profile);
    privateProfileRef.current = normalizedProfile;
    privateSettingsRef.current = settings;
    setPrivateProfile(normalizedProfile);
    setPrivateSettings(settings);
    setBlockedProfileIds(Array.isArray(settings.blockedProfileIds) ? settings.blockedProfileIds as string[] : []);
    setPaidReadyMeetChatIds(Array.isArray(settings.paidReadyMeetChatIds) ? settings.paidReadyMeetChatIds as string[] : []);
    setReadyMeetPassExpiresAt(typeof settings.readyMeetPassExpiresAt === "string" ? settings.readyMeetPassExpiresAt : "");
    setCompletedPostMeetCheckKeys(
      Array.isArray(settings.completedPostMeetCheckKeys) ?
        (settings.completedPostMeetCheckKeys as unknown[]).filter((item): item is string => typeof item === "string")
        : [],
    );
    setLikedProfiles(Array.isArray(settings.likedProfileIds) ? settings.likedProfileIds as string[] : []);
    setRevealedIncomingLikeIds(
      Array.isArray(settings.revealedIncomingLikeIds) ?
        (settings.revealedIncomingLikeIds as unknown[]).filter((item): item is string => typeof item === "string")
        : [],
    );
    setDismissedRecommendationIds(
      settings.dismissedRecommendationIds &&
      typeof settings.dismissedRecommendationIds === "object" &&
      !Array.isArray(settings.dismissedRecommendationIds) ?
        settings.dismissedRecommendationIds as Record<string, string>
        : {},
    );
    const normalizedPhotos = Array.isArray(normalizedProfile.photos) ?
      (normalizedProfile.photos as Array<{ uri?: unknown }>)
      : [];
    const firstSavedPhotoUri =
      normalizedPhotos
        .map((photo) => cleanMediaUri(photo?.uri))
        .find((uri) => uri.length > 0) || "";
    setProfilePhotoUri(
      typeof normalizedProfile.bestPhotoUri === "string" && normalizedProfile.bestPhotoUri.trim() ?
        resolveServerMediaUri(normalizedProfile.bestPhotoUri)
        : firstSavedPhotoUri,
    );
    const recalculatedProfileStrength = calculateProfileStrengthValue(
      normalizedProfile,
      identityVerificationStatus,
      identityVerificationMethod,
    );
    setProfileStrength(recalculatedProfileStrength);
    if (recalculatedProfileStrength >= 100) {
      setShowRecommendation(false);
    }
    setProfileInterests(
      Array.isArray(normalizedProfile.interests) ?
        (normalizedProfile.interests as string[])
        : [],
    );
    setProfileBio(typeof normalizedProfile.bio === "string" ? normalizedProfile.bio : "");
    setSearchingFor(
      Array.isArray(normalizedProfile.relationshipGoals) ?
        (normalizedProfile.relationshipGoals as string[])
        : [],
    );
    return normalizedProfile;
  }, [identityVerificationMethod, identityVerificationStatus]);
  useEffect(() => {
    const count = unreadChatIds.length + (assistantUnread ? 1 : 0);
    setUnreadMessageCount(count);
    setHasNewMessage(count > 0);
  }, [assistantUnread, unreadChatIds]);
  useEffect(() => {
    if (!initialUser?.id) return;
    registerDeviceForMessagePush().catch(() => undefined);
  }, [initialUser?.id]);
  const refreshDiscoveryPeople = useCallback(async () => {
    const result = await getDiscoveryCandidates();
    const profiles = result.candidates.map(discoveryCandidateToProfile);
    setRealDiscoveryPeople(profiles);
    queueHomeCacheSave({ discoveryPeople: profiles });
  }, [queueHomeCacheSave]);
  const refreshReadyToMeetPeople = useCallback(async () => {
    const result = await getReadyToMeetCandidates();
    const profiles = result.candidates.map(discoveryCandidateToProfile);
    setRealReadyToMeetPeople(profiles);
    queueHomeCacheSave({ readyToMeetPeople: profiles });
  }, [queueHomeCacheSave]);
  const refreshPaymentState = useCallback(async () => {
    const summary = await getPaymentSummary();
    setWalletBalance(summary.walletBalanceCents / 100);
    setPremiumActive(summary.premiumActive);
    setKindredPassActive(summary.kindredPassActive);
    queueHomeCacheSave({
      walletBalanceCents: summary.walletBalanceCents,
      premiumActive: summary.premiumActive,
      kindredPassActive: summary.kindredPassActive,
    });
    return summary;
  }, [queueHomeCacheSave]);
  const refreshIncomingLikes = useCallback(async () => {
    const result = await getIncomingLikes();
    setIncomingLikes((current) => {
      const next = new Map<string, IncomingLike>();
      current.forEach((like) => {
        if (revealedIncomingLikeIds.includes(like.id)) return;
        if (like.chatStarted) return;
        next.set(like.id, like);
      });
      result.likes.forEach((like) => next.set(like.id, like));
      return Array.from(next.values()).sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
    });
    setMatchedProfileIds((current) => {
      const next = new Set(current);
      result.likes.forEach((like) => {
        const profile = discoveryCandidateToProfile(like.profile);
        const key = likeProfileKey(profile);
        if (incomingLikeMatchIsActive(like) || likedProfiles.includes(key)) next.add(key);
      });
      return Array.from(next);
    });
    queueHomeCacheSave({ incomingLikes: result.likes });
    return result.likes;
  }, [likedProfiles, queueHomeCacheSave, revealedIncomingLikeIds]);
  const refreshChatConversations = useCallback(async (markIncomingUnread = false) => {
    const result = await getChatConversations();
    const profiles: Profile[] = result.conversations
      .map((conversation) => {
        const profile = discoveryCandidateToProfile(conversation.profile);
        return {
          ...profile,
          chatPreview: conversation.lastMessagePreview,
          chatPreviewFromMe: conversation.lastMessageSenderId === initialUser?.id,
          chatLastMessageAt: conversation.lastMessageAt,
          chatLastMessageSenderId: conversation.lastMessageSenderId,
        };
      });
    if (markIncomingUnread) {
      const activeKey = activeMemberChat ? likeProfileKey(activeMemberChat) : "";
      setUnreadChatIds((current) => {
        const next = new Set(current);
        profiles.forEach((profile) => {
          const key = likeProfileKey(profile);
          if (!profile.chatLastMessageAt || profile.chatLastMessageSenderId === initialUser?.id || activeKey === key) return;
          const previouslySeenAt = seenChatMessageTimesRef.current[key];
          if (!previouslySeenAt || previouslySeenAt !== profile.chatLastMessageAt) next.add(key);
          seenChatMessageTimesRef.current[key] = profile.chatLastMessageAt;
        });
        return Array.from(next);
      });
    } else {
      profiles.forEach((profile) => {
        const key = likeProfileKey(profile);
        if (profile.chatLastMessageAt) seenChatMessageTimesRef.current[key] = profile.chatLastMessageAt;
      });
    }
    let mergedProfiles = profiles;
    setMemberChats((current) => {
      mergedProfiles = mergeChatProfiles(profiles, current);
      return mergedProfiles;
    });
    const latest = mergedProfiles[0] || null;
    setMemberChat((current) => latest || current);
    if (latest) {
      setMemberChatReadyNearby(Boolean(profileMatchingSignals(latest).readyToMeet));
    }
    queueHomeCacheSave({ memberChats: mergedProfiles, memberChat: latest });
    return mergedProfiles;
  }, [activeMemberChat, initialUser?.id, memberChats, queueHomeCacheSave]);
  const openPaymentCheckout = useCallback(async (
    purchaseType: "wallet" | "kindred_pass" | "premium",
    walletAmount?: number,
  ) => {
    const before = await refreshPaymentState();
    const checkout = await createPaymentCheckout(purchaseType, walletAmount);
    const browserResult = await openKindredInAppSession(checkout.url, "kindredcube://payment-complete");
    const completedUrl = "url" in browserResult ? browserResult.url : undefined;
    if (browserResult.type !== "success" || !completedUrl || completedUrl.includes("canceled=true")) return false;
    const sessionId = completedUrl.match(/[?&]session_id=([^&]+)/)?.[1];
    if (sessionId) {
      const confirmedSummary = await confirmPaymentCheckout(decodeURIComponent(sessionId));
      setWalletBalance(confirmedSummary.walletBalanceCents / 100);
      setPremiumActive(confirmedSummary.premiumActive);
      setKindredPassActive(confirmedSummary.kindredPassActive);
    }
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const summary = await refreshPaymentState();
      const confirmed = purchaseType === "wallet" ?
        summary.walletBalanceCents > before.walletBalanceCents
        : purchaseType === "premium" ?
          summary.premiumActive
          : summary.kindredPassActive;
      if (confirmed) return true;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return false;
  }, [refreshPaymentState]);
  useEffect(() => {
    refreshPaymentState().catch(() => undefined);
  }, [initialUser?.id, refreshPaymentState]);
  const likeProfileKey = (profile: Profile) => profile.id || profile.name;
  const profileIsMatched = useCallback(
    (profile: Profile) => matchedProfileIds.includes(likeProfileKey(profile)),
    [matchedProfileIds],
  );
  const profileIsInChats = useCallback(
    (profile: Profile) => {
      const key = likeProfileKey(profile);
      return (
        Boolean(memberChat && likeProfileKey(memberChat) === key) ||
        Boolean(activeMemberChat && likeProfileKey(activeMemberChat) === key) ||
        memberChats.some((chatProfile) => likeProfileKey(chatProfile) === key)
      );
    },
    [activeMemberChat, memberChat, memberChats],
  );
  const saveSettingsPatch = useCallback((settings: Record<string, unknown>) => {
    const merged = { ...privateSettingsRef.current, ...settings };
    privateSettingsRef.current = merged;
    setPrivateSettings(merged);
    queueHomeCacheSave({ privateProfile: privateProfileRef.current, privateSettings: merged });
    updatePrivateSpace(privateProfileRef.current, merged).catch(
      () => undefined,
    );
  }, [queueHomeCacheSave]);
  const dismissRecommendation = useCallback((profile: Profile, days?: number) => {
    const key = likeProfileKey(profile);
    const until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : "never";
    setDismissedRecommendationIds((current) => {
      const next = { ...current, [key]: until };
      saveSettingsPatch({ dismissedRecommendationIds: next });
      return next;
    });
  }, [saveSettingsPatch]);
  const saveLocalLike = useCallback((profile: Profile) => {
    const key = likeProfileKey(profile);
    setLikedProfiles((current) => {
      const next = current.includes(key) ? current : [...current, key];
      saveSettingsPatch({ likedProfileIds: next });
      return next;
    });
    dismissRecommendation(profile, 7);
  }, [dismissRecommendation, saveSettingsPatch]);
  const rememberLike = useCallback((profile: Profile, source: "connect" | "explore" | "ready_to_meet" = "connect") => {
    const key = likeProfileKey(profile);
    if (profile.id && profile.realMember) {
      likeMemberProfile(profile.id, source)
        .then((result) => {
          if (!result.liked) return;
          saveLocalLike(profile);
          if (result.matched) {
            setMatchedProfileIds((current) =>
              current.includes(key) ? current : [...current, key],
            );
            dismissRecommendation(profile, 7);
            setSelectedMemberProfile(null);
            setFilterOpen(false);
            setMatchCelebrationProfile(profile);
            refreshIncomingLikes().catch(() => undefined);
            refreshChatConversations().catch(() => undefined);
          }
        })
        .catch(() => undefined);
      return;
    }
    saveLocalLike(profile);
  }, [dismissRecommendation, refreshChatConversations, refreshIncomingLikes, saveLocalLike]);
  const passRecommendation = useCallback((profile: Profile) => {
    dismissRecommendation(profile);
    setSelectedMemberProfile((current) => current && likeProfileKey(current) === likeProfileKey(profile) ? null : current);
  }, [dismissRecommendation]);
  const commentOnPhotoWithWallet = useCallback(async (profile: Profile, photoIndex: number) => {
    try {
      const profileId = profile.id || `profile-${profile.name.toLowerCase()}`;
      const result = await spendWallet(
        "photo_comment",
        `${initialUser?.id}-photo-comment-${profileId}-${photoIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      setWalletBalance(result.walletBalanceCents / 100);
      return true;
    } catch {
      return false;
    }
  }, [initialUser?.id]);
  const openMemberChat = useCallback((profile: Profile) => {
    const key = likeProfileKey(profile);
    const existing = memberChats.find((item) => likeProfileKey(item) === key);
    const chatProfile = mergeFreshProfileIntoChatProfile(profile, existing);
    setMemberChat(chatProfile);
    setMemberChats((current) => [
      chatProfile,
      ...current.filter((item) => likeProfileKey(item) !== key),
    ]);
    setActiveMemberChat(chatProfile);
    setMemberChatReadyNearby(Boolean(profileMatchingSignals(chatProfile).readyToMeet));
    setUnreadChatIds((current) => {
      return current.filter((item) => item !== key);
    });
    setSelectedMemberProfile(null);
    setTab("chats");
    setFilterOpen(false);
  }, [memberChats]);
  const findKnownChatProfile = useCallback((profileId: string) => {
    const incomingProfile = incomingLikes
      .map((like) => discoveryCandidateToProfile(like.profile))
      .find((profile) => profile.id === profileId);
    if (incomingProfile) return incomingProfile;
    const discoveredProfile = realDiscoveryPeople.find((profile) => profile.id === profileId);
    if (discoveredProfile) return discoveredProfile;
    const readyProfile = realReadyToMeetPeople.find((profile) => profile.id === profileId);
    if (readyProfile) return readyProfile;
    const chatProfile = memberChats.find((profile) => profile.id === profileId);
    if (chatProfile) return chatProfile;
    if (memberChat?.id === profileId) return memberChat;
    return null;
  }, [incomingLikes, memberChat, memberChats, realDiscoveryPeople, realReadyToMeetPeople]);
  useEffect(() => {
    if (!initialUser?.id) return;
    let active = true;
    let socket: Socket | null = null;
    getChatSocketConfig()
      .then(({ url, token }) => {
        if (!active) return;
        socket = io(`${url}/chats`, {
          transports: ["websocket", "polling"],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 700,
        });
        incomingChatSocketRef.current = socket;
        socket.on("ready-to-meet:presence", (update: { userId?: string; available?: boolean; availableAt?: string; expiresAt?: string; profile?: DiscoveryCandidate }) => {
          if (!active) return;
          if (update.userId && update.userId !== initialUser.id) {
            setRealReadyToMeetPeople((current) => {
              const withoutProfile = current.filter((profile) => profile.id !== update.userId);
              if (update.available && update.profile) {
                const readyProfile = discoveryCandidateToProfile({
                  ...update.profile,
                  matching: {
                    ...(update.profile.matching || {}),
                    readyToMeet: true,
                    readyToMeetAt: update.availableAt || update.profile.matching?.readyToMeetAt,
                    readyToMeetExpiresAt: update.expiresAt || update.profile.matching?.readyToMeetExpiresAt,
                  },
                });
                return [readyProfile, ...withoutProfile];
              }
              return withoutProfile;
            });
          }
          refreshReadyToMeetPeople().catch(() => undefined);
        });
        socket.on("chat:message", (message: ChatMessage) => {
          if (!active) return;
          const fromMe = message.senderId === initialUser.id;
          const conversationProfileId = fromMe ? message.recipientId : message.senderId;
          if (!conversationProfileId) return;
          const profile = findKnownChatProfile(conversationProfileId);
          if (!profile) {
            refreshChatConversations().catch(() => undefined);
            if (!fromMe) {
              setUnreadChatIds((current) => {
                return current.includes(conversationProfileId) ? current : [...current, conversationProfileId];
              });
            }
            return;
          }
          const incomingPreview = chatMessagePreview(message);
          const incomingProfile = {
            ...profile,
            chatPreview: incomingPreview,
            chatPreviewFromMe: fromMe,
            chatLastMessageAt: message.createdAt,
            chatLastMessageSenderId: message.senderId,
          };
          setMemberChat((current) =>
            current && likeProfileKey(current) === likeProfileKey(incomingProfile) ? { ...current, ...incomingProfile } : incomingProfile,
          );
          setMemberChats((current) => [
            incomingProfile,
            ...current.filter((item) => likeProfileKey(item) !== likeProfileKey(incomingProfile)),
          ]);
          setMemberChatReadyNearby(Boolean(profileMatchingSignals(incomingProfile).readyToMeet));
          const activeKey = activeMemberChat ? likeProfileKey(activeMemberChat) : "";
          const profileKey = likeProfileKey(incomingProfile);
          const shouldNotify = !fromMe && (activeKey !== profileKey || message.kind === "meeting_proposal" || message.kind === "meeting_response");
          if (shouldNotify) {
            setUnreadChatIds((current) => {
              return current.includes(profileKey) ? current : [...current, profileKey];
            });
          }
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (incomingChatSocketRef.current === socket) incomingChatSocketRef.current = null;
      socket?.disconnect();
    };
  }, [activeMemberChat, findKnownChatProfile, initialUser?.id, refreshChatConversations, refreshReadyToMeetPeople]);
  const profilePaidChatId = (profile: Profile) => profile.id || `profile-${profile.name.toLowerCase()}`;
  const readyMeetPassActive = readyMeetPassExpiresAt ? new Date(readyMeetPassExpiresAt).getTime() > Date.now() : false;
  const requestPaidMemberChat = useCallback((profile: Profile) => {
    const profileId = profilePaidChatId(profile);
    if (profileIsMatched(profile) || premiumActive || kindredPassActive || readyMeetPassActive || paidReadyMeetChatIds.includes(profileId)) {
      openMemberChat(profile);
      return;
    }
    setChatPaywallProfile(profile);
  }, [kindredPassActive, openMemberChat, paidReadyMeetChatIds, premiumActive, profileIsMatched, readyMeetPassActive]);
  useEffect(() => {
    let active = true;
    setPrivateSpaceLoaded(false);
    setPrivateSpaceLoadError("");
    if (initialUser?.id) {
      readHomeStartupCache(initialUser.id)
        .then((cache) => {
          if (!active || !cache) return;
          homeCacheRef.current = cache;
          if (cache.privateProfile && cache.privateSettings) {
            applyPrivateSpaceSnapshot(cache.privateProfile, cache.privateSettings);
            setPrivateSpaceLoaded(true);
          }
          if (Array.isArray(cache.discoveryPeople)) setRealDiscoveryPeople(cache.discoveryPeople);
          if (Array.isArray(cache.readyToMeetPeople)) setRealReadyToMeetPeople(cache.readyToMeetPeople);
          if (Array.isArray(cache.incomingLikes)) setIncomingLikes(cache.incomingLikes);
          if (Array.isArray(cache.memberChats)) setMemberChats(cache.memberChats);
          if (cache.memberChat) setMemberChat(cache.memberChat);
          if (typeof cache.walletBalanceCents === "number") setWalletBalance(cache.walletBalanceCents / 100);
          if (typeof cache.premiumActive === "boolean") setPremiumActive(cache.premiumActive);
          if (typeof cache.kindredPassActive === "boolean") setKindredPassActive(cache.kindredPassActive);
        })
        .catch(() => undefined);
    }
    getPrivateSpace()
      .then(({ profile, settings }) => {
        if (!active) return;
        const normalizedProfile = applyPrivateSpaceSnapshot(profile, settings);
        queueHomeCacheSave({ privateProfile: normalizedProfile, privateSettings: settings });
        setPrivateSpaceLoaded(true);
      })
      .catch((caught) => {
        if (!active) return;
        setPrivateSpaceLoadError(
          caught instanceof Error ?
            caught.message
            : "Your saved profile could not be loaded. Check your connection and try again.",
        );
      });
    return () => {
      active = false;
      if (savePrivateSpaceTimer.current)
        clearTimeout(savePrivateSpaceTimer.current);
      if (homeCacheSaveTimer.current)
        clearTimeout(homeCacheSaveTimer.current);
    };
  }, [applyPrivateSpaceSnapshot, initialUser?.id, privateSpaceReloadKey, queueHomeCacheSave]);
  useEffect(() => {
    if (!privateSpaceLoaded) return;
    refreshDiscoveryPeople().catch(() => setRealDiscoveryPeople([]));
    refreshReadyToMeetPeople().catch(() => undefined);
    refreshIncomingLikes().catch(() => undefined);
    refreshChatConversations().catch(() => undefined);
  }, [privateSpaceLoaded, refreshChatConversations, refreshDiscoveryPeople, refreshIncomingLikes, refreshReadyToMeetPeople]);
  useEffect(() => {
    if (!privateSpaceLoaded) return;
    const timer = setInterval(() => {
      refreshChatConversations(true).catch(() => undefined);
    }, 4_000);
    return () => clearInterval(timer);
  }, [privateSpaceLoaded, refreshChatConversations]);
  useEffect(() => {
    if (!privateSpaceLoaded) return;
    const timer = setInterval(() => {
      refreshReadyToMeetPeople().catch(() => undefined);
    }, 15_000);
    return () => clearInterval(timer);
  }, [privateSpaceLoaded, refreshReadyToMeetPeople]);
  useEffect(() => {
    let active = true;
    getIdentityVerificationStatus()
      .then((result) => {
        if (active) {
          setIdentityVerificationStatus(result.status);
          setIdentityVerificationMethod(result.verificationMethod || "");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialUser?.id]);
  useEffect(() => {
    if (identityVerificationStatus !== "processing") return;
    let active = true;
    const refresh = () => {
      getIdentityVerificationStatus()
        .then((result) => {
          if (active) {
            setIdentityVerificationStatus(result.status);
            setIdentityVerificationMethod(result.verificationMethod || "");
          }
        })
        .catch(() => undefined);
    };
    const timer = setInterval(refresh, 4_000);
    refresh();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [identityVerificationStatus]);
  const persistProfileData = useCallback(
    (profile: Record<string, unknown>) => {
      const merged = {
        ...privateProfileRef.current,
        ...profile,
        identity: initialUser?.identity || privateProfileRef.current.identity,
        seeking: initialUser?.seeking || privateProfileRef.current.seeking,
      };
      privateProfileRef.current = merged;
      setPrivateProfile(merged);
      queueHomeCacheSave({ privateProfile: merged, privateSettings: privateSettingsRef.current });
      if (savePrivateSpaceTimer.current)
        clearTimeout(savePrivateSpaceTimer.current);
      savePrivateSpaceTimer.current = setTimeout(() => {
        updatePrivateSpace(merged, privateSettingsRef.current).catch(
          () => undefined,
        );
      }, 650);
    },
    [initialUser?.identity, initialUser?.seeking, queueHomeCacheSave],
  );
  const persistSettingsData = useCallback(
    (settings: Record<string, unknown>) => {
      saveSettingsPatch(settings);
    },
    [saveSettingsPatch],
  );
  const rememberCompletedPostMeetCheck = useCallback((key: string) => {
    if (!key) return;
    setCompletedPostMeetCheckKeys((current) => {
      if (current.includes(key)) return current;
      const next = [...current, key].slice(-250);
      persistSettingsData({ completedPostMeetCheckKeys: next });
      return next;
    });
  }, [persistSettingsData]);
  useEffect(() => {
    if (!privateSpaceLoaded) return;
    const nextStrength = calculateProfileStrengthValue(
      privateProfileRef.current,
      identityVerificationStatus,
      identityVerificationMethod,
    );
    setProfileStrength(nextStrength);
    if (privateProfileRef.current.profileStrength === nextStrength) return;
    persistProfileData({
      profileStrength: nextStrength,
      verificationStrengthBonusApplied: identityVerificationStatus === "verified",
    });
  }, [identityVerificationMethod, identityVerificationStatus, persistProfileData, privateSpaceLoaded]);
  const blockMember = useCallback((profile: Profile, reason?: MemberReportReason, details = "") => {
    const profileId = profile.id || `dummy-${profile.name.toLowerCase()}`;
    const next = blockedProfileIds.includes(profileId) ? blockedProfileIds : [...blockedProfileIds, profileId];
    setBlockedProfileIds(next);
    persistSettingsData({ blockedProfileIds: next });
    setLikedProfiles((current) => current.filter((name) => name !== profile.name));
    setMemberChat((current) => current?.name === profile.name ? null : current);
    setActiveMemberChat((current) => current?.name === profile.name ? null : current);
    setSelectedMemberProfile((current) => current?.name === profile.name ? null : current);
    blockMemberProfile(profileId, memberSafetyReasonCode(reason), details).catch(() => undefined);
  }, [blockedProfileIds, persistSettingsData]);
  const reportMember = useCallback((profile: Profile, reason: MemberReportReason, details: string) => {
    const existing = Array.isArray(privateSettingsRef.current.memberReports) ? privateSettingsRef.current.memberReports as Record<string, unknown>[] : [];
    const report = {
      profileId: profile.id || `dummy-${profile.name.toLowerCase()}`,
      reason,
      details,
      reportedAt: new Date().toISOString(),
      status: "submitted",
    };
    persistSettingsData({ memberReports: [...existing, report] });
    const reasonCode = memberSafetyReasonCode(reason) || "other";
    reportMemberProfile({ profileId: report.profileId, reason: reasonCode, details }).catch(() => undefined);
  }, [persistSettingsData]);
  const saveProfileNow = useCallback(async (patch: Record<string, unknown>) => {
    if (savePrivateSpaceTimer.current) {
      clearTimeout(savePrivateSpaceTimer.current);
      savePrivateSpaceTimer.current = null;
    }
    if (patch) {
      privateProfileRef.current = {
        ...privateProfileRef.current,
        ...patch,
        identity: initialUser?.identity || privateProfileRef.current.identity,
        seeking: initialUser?.seeking || privateProfileRef.current.seeking,
      };
      setPrivateProfile(privateProfileRef.current);
    }
    const saved = await updatePrivateSpace(
      privateProfileRef.current,
      privateSettingsRef.current,
    );
    privateProfileRef.current = saved.profile;
    privateSettingsRef.current = saved.settings;
    setPrivateProfile(saved.profile);
    setPrivateSettings(saved.settings);
    queueHomeCacheSave({ privateProfile: saved.profile, privateSettings: saved.settings });
    setProfileStrength(calculateProfileStrengthValue(
      saved.profile,
      identityVerificationStatus,
      identityVerificationMethod,
    ));
    await refreshDiscoveryPeople();
    await refreshReadyToMeetPeople();
  }, [identityVerificationMethod, identityVerificationStatus, initialUser?.identity, initialUser?.seeking, queueHomeCacheSave, refreshDiscoveryPeople, refreshReadyToMeetPeople]);
  const flushAndLogout = useCallback(async () => {
    if (savePrivateSpaceTimer.current) {
      clearTimeout(savePrivateSpaceTimer.current);
      savePrivateSpaceTimer.current = null;
    }
    await updatePrivateSpace(
      privateProfileRef.current,
      privateSettingsRef.current,
    ).catch(() => undefined);
    await amaraReadSaveRef.current?.catch(() => undefined);
    onLogout();
  }, [onLogout]);
  const handleDeleteAccount = useCallback(async (reasons: string[], details: string) => {
    if (savePrivateSpaceTimer.current) {
      clearTimeout(savePrivateSpaceTimer.current);
      savePrivateSpaceTimer.current = null;
    }
    await deleteAccount({ reasons, details });
    onLogout();
  }, [onLogout]);
  useEffect(() => {
    if (!privateSpaceLoaded) return;
    let active = true;
    let deliveryTimer: ReturnType<typeof setTimeout> | null = null;

    getAmaraWelcomeReceipt()
      .then((receipt) => {
        if (!active) return;
        if (receipt.delivered) {
          setAssistantAvailable(true);
          setAssistantUnread(!receipt.read);
          return;
        }
        deliveryTimer = setTimeout(() => {
          markAmaraWelcomeDelivered()
            .then((delivered) => {
              if (!active) return;
              setAssistantAvailable(true);
              setAssistantUnread(!delivered.read);
            })
            .catch(() => undefined);
        }, 20_000);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (deliveryTimer) clearTimeout(deliveryTimer);
    };
  }, [initialUser?.id, privateSpaceLoaded]);
  const markAssistantRead = useCallback(() => {
    setAssistantUnread(false);
    const save = markAmaraWelcomeRead();
    amaraReadSaveRef.current = save;
    void save.finally(() => {
      if (amaraReadSaveRef.current === save) amaraReadSaveRef.current = null;
    });
  }, []);
  if (!privateSpaceLoaded) {
    return (
      <WelcomeLoadingScreen
        title="Loading your saved profile"
        message="Restoring your photos and profile information…"
        error={privateSpaceLoadError}
        onRetry={() => setPrivateSpaceReloadKey((value) => value + 1)}
      />
    );
  }
  const viewerSignals = viewerMatchingSignals(privateProfile, initialUser, blockedProfileIds);
  const viewerDating = {
    identity: initialUser?.identity || (typeof privateProfile.identity === "string" ? privateProfile.identity : undefined),
    seeking: initialUser?.seeking || (typeof privateProfile.seeking === "string" ? privateProfile.seeking : undefined),
  };
  const recommendationPool = realDiscoveryPeople.filter((profile) =>
    datingDirectionMatches(viewerDating, profile) &&
    !likedProfiles.includes(likeProfileKey(profile)) &&
    !profileIsMatched(profile),
  );
  const recommendationAvailable = (profile: Profile) => {
    const hiddenUntil = dismissedRecommendationIds[likeProfileKey(profile)];
    if (!hiddenUntil) return true;
    if (hiddenUntil === "never") return false;
    return new Date(hiddenUntil).getTime() <= Date.now();
  };
  const filteredIncomingLikes = incomingLikes.filter((like) =>
    !incomingLikeMatchIsActive(like) &&
    datingDirectionMatches(viewerDating, discoveryCandidateToProfile(like.profile)),
  );
  const rankedRecommendations = rankMatches(
    viewerSignals,
    recommendationPool.filter((profile) =>
      recommendationAvailable(profile) &&
      !blockedProfileIds.includes(profile.id || `dummy-${profile.name.toLowerCase()}`),
    ),
    profileMatchingSignals,
  );
  const connectPeople = rankedRecommendations
    .filter(({ result }) => result.placement === "kindred-picks" || result.placement === "connect")
    .map(({ candidate }) => candidate);
  const explorePeople = rankedRecommendations
    .filter(({ result }) => result.placement === "explore")
    .map(({ candidate }) => candidate);
  const categorizedRecommendations = categorizedExploreRecommendations(
    explorePeople,
    viewerSignals,
  );
  const similarInterestRecommendations = categorizedRecommendations.interests;
  const similarDatingGoalRecommendations = categorizedRecommendations.datingGoals;
  const communityInCommonRecommendations = categorizedRecommendations.communities;
  const readyToMeetPeople = (() => {
    const merged = new Map<string, Profile>();
    const addReadyProfile = (profile: Profile) => {
      const key = profile.id || profile.name;
      if (!key || blockedProfileIds.includes(key) || blockedProfileIds.includes(`dummy-${profile.name.toLowerCase()}`)) return;
      if (!profileReadyToMeetIsActive(profile)) return;
      merged.set(key, { ...(merged.get(key) || {}), ...profile });
    };
    realReadyToMeetPeople.forEach(addReadyProfile);
    memberChats.forEach(addReadyProfile);
    incomingLikes.forEach((like) => addReadyProfile(discoveryCandidateToProfile(like.profile)));
    realDiscoveryPeople.forEach(addReadyProfile);
    return Array.from(merged.values());
  })();
  const currentReadyMeetPhotoUris = [
    ...new Set(
      [
        profilePhotoUri,
        typeof privateProfile.bestPhotoUri === "string" ? privateProfile.bestPhotoUri : undefined,
        ...(
          Array.isArray(privateProfile.photos)
            ? privateProfile.photos
                .map((photo) => photo && typeof photo === "object" && "uri" in photo ? (photo as { uri?: unknown }).uri : undefined)
            : []
        ),
      ].map(cleanMediaUri).filter((uri): uri is string => uri.length > 0),
    ),
  ];
  const currentReadyMeetProfile: Profile = {
    id: initialUser?.id || "current-user-ready",
    name: memberUsername || initialUser?.username || "You",
    gender: initialUser?.identity || (typeof privateProfile.identity === "string" ? privateProfile.identity : ""),
    age: typeof privateProfile.dateOfBirth === "string" ?
      ageFromDate(new Date(`${privateProfile.dateOfBirth}T00:00:00`))
      : 0,
    culture: typeof privateProfile.culture === "string" ? privateProfile.culture : "",
    role: typeof privateProfile.occupation === "string" && privateProfile.occupation.trim() ? privateProfile.occupation.trim() : "You",
    portrait: -1,
    photoUri: currentReadyMeetPhotoUris[0],
    photoUris: currentReadyMeetPhotoUris,
    realMember: true,
    idVerified: identityVerificationStatus === "verified" && identityVerificationMethod !== "video_selfie",
    selfieVerified: identityVerificationStatus === "verified" && identityVerificationMethod === "video_selfie",
    meetupVerified: privateProfile.meetupVerified === true || privateSettings.meetupVerified === true,
    promptAnswers: safeProfilePromptAnswers(privateProfile.promptAnswers),
  };
  const selectedProfileIsConnected = selectedMemberProfile
    ? profileIsMatched(selectedMemberProfile) ||
      profileIsInChats(selectedMemberProfile)
    : false;
  const content = selectedMemberProfile ? (
    <ProfileDetail
      profile={selectedMemberProfile}
      onBack={() => setSelectedMemberProfile(null)}
      onConnect={() => requestPaidMemberChat(selectedMemberProfile)}
      onLike={selectedProfileIsConnected ? undefined : () => {
        rememberLike(selectedMemberProfile, "explore");
        setSelectedMemberProfile(null);
      }}
      onPass={selectedProfileIsConnected ? undefined : () => passRecommendation(selectedMemberProfile)}
      liked={likedProfiles.includes(selectedMemberProfile.id || selectedMemberProfile.name)}
      onBlock={blockMember}
      onReport={reportMember}
      walletBalance={walletBalance}
      hasCommentPlan={selectedProfileIsConnected || premiumActive || kindredPassActive}
      onOpenWallet={() => {
        setTab("profile");
        setStartSettingsInWallet(true);
        setSettingsOpen(true);
      }}
      onPhotoComment={selectedProfileIsConnected ? async () => true : commentOnPhotoWithWallet}
    />
  ) : filterOpen ? (
    <ConnectFiltersTabbed
      onClose={() => setFilterOpen(false)}
      profileInterests={profileInterests}
    />
  ) : tab === "profile" ? null : tab === "explore" ? (
    <ExploreRecommendations
      similarInterests={similarInterestRecommendations}
      similarDatingGoals={similarDatingGoalRecommendations}
      communitiesInCommon={communityInCommonRecommendations}
      readyPeople={readyToMeetPeople}
      currentProfile={currentReadyMeetProfile}
      likedProfileKeys={likedProfiles}
      currentReadyToMeetAvailability={
        privateSettings.readyToMeetAvailability &&
        typeof privateSettings.readyToMeetAvailability === "object" &&
        !Array.isArray(privateSettings.readyToMeetAvailability) ?
          privateSettings.readyToMeetAvailability as { available?: boolean; availableAt?: string; expiresAt?: string }
          : undefined
      }
      onRefreshReadyToMeetPeople={refreshReadyToMeetPeople}
      onReadyToMeetAvailabilitySave={async (availability) => {
        const saved = await saveReadyToMeetAvailability(availability);
        privateProfileRef.current = saved.profile;
        privateSettingsRef.current = saved.settings;
        setPrivateProfile(saved.profile);
        setPrivateSettings(saved.settings);
        await refreshDiscoveryPeople();
        await refreshReadyToMeetPeople();
      }}
      onProfilePress={setSelectedMemberProfile}
      onLike={(profile) => rememberLike(profile, "explore")}
      onOpenChat={openMemberChat}
      canUseReadyMeetChat={premiumActive || kindredPassActive || readyMeetPassActive}
      walletBalance={walletBalance}
      paidReadyMeetChatIds={paidReadyMeetChatIds}
      onOpenWallet={() => {
        setTab("profile");
        setStartSettingsInWallet(true);
        setSettingsOpen(true);
      }}
      canOpenReadyMeetProfileWithoutAccess={(profile) =>
        profileIsMatched(profile) || profileIsInChats(profile)
      }
      onUnlockReadyMeetChat={async (profile) => {
        const profileId = profile.id || `dummy-${profile.name.toLowerCase()}`;
        if (readyMeetPassActive || paidReadyMeetChatIds.includes(profileId)) return true;
        try {
          const result = await spendWallet(
            "ready_to_meet_chat",
            `${initialUser?.id}-ready-meet-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          );
          setWalletBalance(result.walletBalanceCents / 100);
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          setReadyMeetPassExpiresAt(expiresAt);
          persistSettingsData({ readyMeetPassExpiresAt: expiresAt });
          return true;
        } catch {
          return false;
        }
      }}
      onBlock={blockMember}
      onReport={reportMember}
    />
  ) : tab === "liked" ? (
    <LikedYouExperience
      likedProfiles={likedProfiles}
      incomingLikes={filteredIncomingLikes}
      hasIncomingLikes={filteredIncomingLikes.some((like) => like.visible)}
      subscribed={premiumActive || kindredPassActive}
      viewerInterests={profileInterests}
      viewerGoals={searchingFor}
      onProfilePress={setSelectedMemberProfile}
      onChat={(profile) => {
        openMemberChat(profile);
      }}
      walletBalance={walletBalance}
      onOpenWallet={() => {
        setTab("profile");
        setStartSettingsInWallet(true);
        setSettingsOpen(true);
      }}
      onViewMembershipPlans={() => setMembershipOptionsOpen(true)}
      onWalletReveal={async () => {
        try {
          const result = await spendWallet(
            "liked_you_reveal",
            `${initialUser?.id}-liked-you-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          );
          setWalletBalance(result.walletBalanceCents / 100);
          return true;
        } catch {
          return false;
        }
      }}
      onLikeRevealed={(like) => {
        setRevealedIncomingLikeIds((current) => {
          if (current.includes(like.id)) return current;
          const next = [...current, like.id];
          persistSettingsData({ revealedIncomingLikeIds: next });
          return next;
        });
      }}
    />
  ) : tab === "chats" ? (
    <MessagesScreen
      username={memberUsername}
      assistantAvailable={assistantAvailable}
      memberChat={memberChat}
      memberChats={memberChats}
      unreadChatIds={unreadChatIds}
      currentUserId={initialUser?.id}
      activeMemberChat={activeMemberChat}
      onOpenMemberChat={(profile) => openMemberChat(profile)}
      onProfilePress={(profile) => {
        setSelectedMemberProfile(profile);
        setTab("chats");
      }}
      onCloseMemberChat={() => setActiveMemberChat(null)}
      onBlockMember={blockMember}
      onReportMember={reportMember}
      memberReadyNearby={memberChatReadyNearby}
      verificationStatus={identityVerificationStatus}
      verificationMethod={identityVerificationMethod}
      onVerificationStatusChange={setIdentityVerificationStatus}
      onVerificationMethodChange={setIdentityVerificationMethod}
      completedPostMeetCheckKeys={completedPostMeetCheckKeys}
      onPostMeetCheckCompleted={rememberCompletedPostMeetCheck}
      onCurrentUserMeetupVerified={() => {
        setPrivateProfile((current) => ({ ...current, meetupVerified: true }));
        privateProfileRef.current = { ...privateProfileRef.current, meetupVerified: true };
        persistProfileData({ meetupVerified: true });
        setPrivateSettings((current) => ({ ...current, meetupVerified: true }));
        persistSettingsData({ meetupVerified: true });
      }}
      onMemberMessageSent={(profile, message) => {
        const sentProfile = message
          ? {
              ...profile,
              chatPreview: chatMessagePreview(message),
              chatPreviewFromMe: true,
              chatLastMessageAt: message.createdAt,
              chatLastMessageSenderId: message.senderId,
            }
          : profile;
        setMemberChat(sentProfile);
        setMemberChats((current) => [
          sentProfile,
          ...current.filter((item) => likeProfileKey(item) !== likeProfileKey(sentProfile)),
        ]);
        setMatchedProfileIds((current) => {
          const key = likeProfileKey(profile);
          return current.includes(key) ? current : [...current, key];
        });
        refreshIncomingLikes().catch(() => undefined);
        refreshChatConversations().catch(() => undefined);
      }}
      onCompleteProfile={() => {
        setTab("profile");
        setSettingsOpen(false);
        setStartSettingsInWallet(false);
        setProfileEditorVersion((value) => value + 1);
        setProfileEditing(true);
      }}
      onMessageRead={markAssistantRead}
    />
  ) : showRecommendation && profileStrength < 100 ? (
    <CompleteProfileRecommendation
      profileStrength={profileStrength}
      onComplete={() => {
        setTab("profile");
        setProfileEditorVersion((value) => value + 1);
        setProfileEditing(true);
      }}
      onBrowse={() => setShowRecommendation(false)}
    />
  ) : (
    <ConnectExperience
      people={connectPeople}
      onProfilePress={setSelectedMemberProfile}
      onLike={rememberLike}
      onPass={passRecommendation}
      hasCommentPlan={
        premiumActive || kindredPassActive
      }
      walletBalance={walletBalance}
      onWalletSpend={(amount) => {
        const item = amount >= 2.5 ? "super_like" : "photo_comment";
        spendWallet(item, `${initialUser?.id}-${item}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          .then((result) => setWalletBalance(result.walletBalanceCents / 100))
          .catch(() => undefined);
      }}
      onPhotoComment={commentOnPhotoWithWallet}
      onOpenWallet={() => {
        setTab("profile");
        setStartSettingsInWallet(true);
        setSettingsOpen(true);
      }}
    />
  );
  const tabs = [
    { key: "profile" as const, icon: "◯", label: "Profile" },
    { key: "explore" as const, icon: "", label: "Explore" },
    { key: "connect" as const, icon: "♥", label: "Connect" },
    { key: "liked" as const, icon: "♡", label: "Liked You" },
    { key: "chats" as const, icon: "", label: "Chats" },
  ];
  const likedActivityCount = filteredIncomingLikes.filter((like) =>
    !incomingLikeMatchIsActive(like) &&
    !like.chatStarted &&
    !revealedIncomingLikeIds.includes(like.id)
  ).length;
  const showConnectHeader = tab === "connect" && (!showRecommendation || profileStrength >= 100);
  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <View style={{ flex: 1 }}>
        {showConnectHeader && (
          <View style={{ paddingHorizontal: 16 }}>
            <AppHeader onFilter={() => setFilterOpen(true)} />
          </View>
        )}
        <View style={{ flex: 1, display: tab === "profile" ? "flex" : "none" }}>
          <View style={{ flex: 1, display: settingsOpen ? "flex" : "none" }}>
            <SettingsScreen
              balance={walletBalance}
              initialSettings={privateSettings}
              onSettingsDataChange={persistSettingsData}
              onAddFunds={(amount) => openPaymentCheckout("wallet", amount)}
              onCancel={() => {
                setSettingsOpen(false);
                setStartSettingsInWallet(false);
              }}
              onDone={() => {
                setSettingsOpen(false);
                setStartSettingsInWallet(false);
              }}
              onLogout={flushAndLogout}
              onDeleteAccount={handleDeleteAccount}
              userEmail={initialUser?.email || ""}
              startInWallet={startSettingsInWallet}
            />
          </View>
          <View
            style={{
              flex: 1,
              display: !settingsOpen && profileEditing ? "flex" : "none",
            }}
          >
            {!privateSpaceLoaded ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text selectable style={{ color: C.muted, fontWeight: "800" }}>
                  Loading your private profile...
                </Text>
              </View>
            ) : (
            <EditableProfileScreen
              key={`profile-editor-${profileEditorVersion}`}
              displayName={memberUsername}
              initialProfile={privateProfile}
              onUsernameChange={async (username) => {
                const result = await updateAccountUsername(username);
                setMemberUsername(result.username);
              }}
              onConnect={() => setProfileEditing(false)}
              onSettings={() => {
                setStartSettingsInWallet(false);
                setSettingsOpen(true);
              }}
              onProfilePhotoChange={(uri) => setProfilePhotoUri(uri || "")}
              onProfileStrengthChange={setProfileStrength}
              onSaveProfile={saveProfileNow}
              verificationStatus={identityVerificationStatus}
              verificationMethod={identityVerificationMethod}
              onVerificationStatusChange={setIdentityVerificationStatus}
              onVerificationMethodChange={setIdentityVerificationMethod}
              onInterestsChange={setProfileInterests}
              onBioChange={setProfileBio}
              onSearchingForChange={setSearchingFor}
            />
            )}
          </View>
          <View
            style={{
              flex: 1,
              display: !settingsOpen && !profileEditing ? "flex" : "none",
            }}
          >
            <ProfileHubScreen
              balance={walletBalance}
              profile={currentReadyMeetProfile}
              displayName={memberUsername}
              profilePhotoUri={profilePhotoUri}
              profileStrength={profileStrength}
              verificationStatus={identityVerificationStatus}
              verificationMethod={identityVerificationMethod}
              onEditProfile={() => {
                setProfileEditorVersion((value) => value + 1);
                setProfileEditing(true);
              }}
              onSettings={() => {
                setStartSettingsInWallet(false);
                setSettingsOpen(true);
              }}
              onOpenWallet={() => {
                setStartSettingsInWallet(true);
                setSettingsOpen(true);
              }}
              onPurchasePlan={(plan) => openPaymentCheckout(plan)}
              onDeleteAccount={handleDeleteAccount}
              premiumActive={premiumActive}
              kindredPassActive={kindredPassActive}
            />
          </View>
        </View>
        {tab === "profile" ? null : content}
      </View>
      <MembershipOptionsModal
        visible={membershipOptionsOpen}
        onClose={() => setMembershipOptionsOpen(false)}
        onPurchasePlan={(plan) => openPaymentCheckout(plan)}
        premiumActive={premiumActive}
        kindredPassActive={kindredPassActive}
      />
      <Modal
        visible={Boolean(matchCelebrationProfile)}
        transparent
        animationType="fade"
        onRequestClose={() => setMatchCelebrationProfile(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(34,31,27,0.56)",
            alignItems: "center",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 430,
              borderRadius: 30,
              backgroundColor: C.paper,
              padding: 22,
              gap: 14,
              alignItems: "center",
              boxShadow: "0 22px 52px rgba(0,0,0,0.28)",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close match message"
              onPress={() => setMatchCelebrationProfile(null)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={22} height={22} color={C.ink} />
            </Pressable>
            {matchCelebrationProfile ? (
              <View style={{ width: 112, height: 112, borderRadius: 56, overflow: "hidden", borderWidth: 4, borderColor: C.pink }}>
                <ProfileImage profile={matchCelebrationProfile} size={112} />
              </View>
            ) : null}
            <Text selectable style={{ color: C.ink, fontFamily: BRAND_FONT, fontSize: 32, fontWeight: "900", textAlign: "center" }}>
              It's a match
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
              You and {matchCelebrationProfile?.name || "this member"} liked each other. You can start chatting now.
            </Text>
            <Button
              label="Start chat"
              onPress={() => {
                const profile = matchCelebrationProfile;
                setMatchCelebrationProfile(null);
                if (profile) openMemberChat(profile);
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setMatchCelebrationProfile(null)}
              style={{ minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>Keep browsing</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(chatPaywallProfile)}
        transparent
        animationType="fade"
        onRequestClose={() => setChatPaywallProfile(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(34,31,27,0.52)",
            alignItems: "center",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 430,
              borderRadius: 26,
              backgroundColor: C.paper,
              padding: 20,
              gap: 12,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close chat payment"
              onPress={() => setChatPaywallProfile(null)}
              style={{ alignSelf: "flex-end" }}
            >
              <X width={22} height={22} color={C.ink} />
            </Pressable>
            <LockKeyhole width={31} height={31} color="#59359C" />
            <Text selectable style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>
              Connect with {chatPaywallProfile?.name}
            </Text>
            <Text selectable style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
              Ready to Meet access is {formatMoney(9.99)} for 7 days. Premium and KindredPass members can connect without the Wallet charge.
            </Text>
            <Text selectable style={{ color: C.ink, fontSize: 13, fontWeight: "900" }}>
              Wallet balance: {formatMoney(walletBalance)}
            </Text>
            <Button
              compact
              label={walletBalance >= 9.99 ? (chatUnlocking ? "Unlocking chat..." : `Pay with Wallet · ${formatMoney(-9.99, { signed: true })}`) : "Load Wallet"}
              disabled={chatUnlocking}
              onPress={async () => {
                const profile = chatPaywallProfile;
                if (!profile) return;
                if (walletBalance < 9.99) {
                  setChatPaywallProfile(null);
                  setTab("profile");
                  setStartSettingsInWallet(true);
                  setSettingsOpen(true);
                  return;
                }
                setChatUnlocking(true);
                try {
                  const result = await spendWallet(
                    "ready_to_meet_chat",
                    `${initialUser?.id}-ready-meet-pass-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  );
                  setWalletBalance(result.walletBalanceCents / 100);
                  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                  setReadyMeetPassExpiresAt(expiresAt);
                  persistSettingsData({ readyMeetPassExpiresAt: expiresAt });
                  setChatPaywallProfile(null);
                  openMemberChat(profile);
                } finally {
                  setChatUnlocking(false);
                }
              }}
            />
          </View>
        </View>
      </Modal>
      <View
        style={{
          minHeight: 74,
          paddingBottom: 7,
          paddingTop: 5,
          flexDirection: "row",
          backgroundColor: C.paper,
          borderTopWidth: 1,
          borderTopColor: C.line,
          boxShadow: "0 -5px 18px rgba(54,42,31,0.06)",
        }}
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          const attention =
            (item.key === "liked" && likedActivityCount > 0) ||
            (item.key === "chats" && hasNewMessage);
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => {
                setTab(item.key);
                setFilterOpen(false);
                setSelectedMemberProfile(null);
                setActiveMemberChat(null);
                if (item.key === "profile") {
                  setSettingsOpen(false);
                  setStartSettingsInWallet(false);
                  setProfileEditing(false);
                }
                if (item.key === "liked") {
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <View
                style={{
                  minHeight: 29,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.key === "profile" ? (
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      overflow: "hidden",
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? C.pink : C.muted,
                    }}
                  >
                    {profilePhotoUri ? (
                      <Image
                        source={{ uri: profilePhotoUri }}
                        resizeMode="cover"
                        style={{ width: 30, height: 30 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          backgroundColor: "#EFEAE1",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Camera width={16} height={16} color={C.muted} />
                      </View>
                    )}
                  </View>
                ) : item.key === "connect" ? (
                  <PeopleIcon size={28} />
                ) : item.key === "explore" ? (
                  <ExploreIcon active={active} />
                ) : item.key === "chats" ? (
                  <View style={{ position: "relative" }}>
                    <MessageCircle
                      width={29}
                      height={29}
                      color={attention ? "#D62D43" : active ? C.pink : C.muted}
                      strokeWidth={attention ? 2.8 : 2.25}
                      fill={attention ? "#FAD7DE" : "transparent"}
                    />
                    {unreadMessageCount > 0 ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -8,
                          top: -7,
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: "#D62D43",
                          borderWidth: 2,
                          borderColor: C.paper,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 3,
                        }}
                      >
                        <Text style={{ color: C.paper, fontSize: 9, fontWeight: "900" }}>
                          {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : item.key === "liked" ? (
                  <View style={{ position: "relative" }}>
                    <Heart
                      width={27}
                      height={27}
                      color={attention ? "#D62D43" : active ? C.pink : C.muted}
                      fill={attention ? "#D62D43" : "transparent"}
                    />
                    {likedActivityCount > 0 ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -9,
                          top: -8,
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: "#D62D43",
                          borderWidth: 2,
                          borderColor: C.paper,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: 3,
                        }}
                      >
                        <Text style={{ color: C.paper, fontSize: 9, fontWeight: "900" }}>
                          {likedActivityCount > 9 ? "9+" : likedActivityCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  color: attention ? "#D62D43" : active ? C.pink : C.muted,
                  fontSize: 10,
                  fontWeight: active || attention ? "900" : "700",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LifestylePicker({
  value,
  values,
  multiple,
  onSelect,
}: {
  value?: string;
  values?: string[];
  multiple?: boolean;
  onSelect: (value: string) => void;
}) {
  const [group, setGroup] = useState("");
  const [custom, setCustom] = useState("");
  const selected = (item: string) =>
    multiple ? Boolean(values?.includes(item)) : value === item;
  const groupSelected = (name: string) =>
    multiple ?
      Boolean(values?.some((item) => lifestyleGroups[name].includes(item)))
      : Boolean(value && lifestyleGroups[name].includes(value));
  const choose = (item: string) => {
    onSelect(item);
    if (group && group !== "Other" && !multiple) setGroup("");
  };
  if (group === "Other")
    return (
      <View style={{ gap: 10 }}>
        <Pressable
          onPress={() => setGroup("")}
          style={{ alignSelf: "flex-start", paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <ChevronLeft width={15} height={15} color={C.clay} strokeWidth={3} />
          <Text style={{ color: C.clay, fontWeight: "800" }}>All lifestyles</Text>
        </Pressable>
        <Text style={{ color: C.ink, fontSize: 14, fontWeight: "800" }}>
          Describe it in your own words
        </Text>
        <TextInput
          autoFocus
          value={custom}
          onChangeText={setCustom}
          placeholder="For example: Gothic, outdoorsy, faith-centered..."
          placeholderTextColor="#948A7F"
          style={{
            minHeight: 50,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.paper,
            borderRadius: 14,
            paddingHorizontal: 14,
            color: C.ink,
            fontSize: 14,
          }}
        />
        <Button
          compact
          label={multiple ? "Add lifestyle" : "Use this lifestyle"}
          disabled={!custom.trim()}
          onPress={() => {
            choose(custom.trim());
            setCustom("");
            setGroup("");
          }}
        />
      </View>
    );
  if (group)
    return (
      <View style={{ gap: 8 }}>
        <Pressable
          onPress={() => setGroup("")}
          style={{ alignSelf: "flex-start", paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <ChevronLeft width={15} height={15} color={C.clay} strokeWidth={3} />
          <Text style={{ color: C.clay, fontWeight: "800" }}>All lifestyles</Text>
        </Pressable>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ color: C.ink, fontSize: 14, fontWeight: "800" }}>
            Specify {group}
          </Text>
          {multiple && (
            <Text style={{ color: C.sage, fontSize: 12, fontWeight: "800" }}>
              {values?.length || 0} selected
            </Text>
          )}
        </View>
        {multiple && (
          <Text style={{ color: C.muted, fontSize: 11 }}>
            Select as many as you like. Tap again to remove one.
          </Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {lifestyleGroups[group].map((item) => (
            <Choice
              key={item}
              columns={3}
              compact
              label={item}
              selected={selected(item)}
              onPress={() => choose(item)}
            />
          ))}
        </View>
        {multiple && Boolean(values?.length) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setGroup("")}
            style={{
              minHeight: 38,
              borderRadius: 19,
              backgroundColor: "#FCE5EE",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: "#A5164D", fontSize: 12, fontWeight: "900" }}>
              Choose another culture
            </Text>
          </Pressable>
        )}
      </View>
    );
  return (
    <View style={{ gap: 9 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {groupNames.map((item) => (
          <Choice
            key={item}
            columns={3}
            compact
            label={item}
            selected={groupSelected(item)}
            onPress={() => setGroup(item)}
          />
        ))}
        <Choice
          columns={3}
          compact
          label="Open to everyone"
          selected={selected("Open to everyone")}
          onPress={() => choose("Open to everyone")}
        />
        <Choice
          columns={3}
          compact
          label="Other"
          selected={false}
          onPress={() => setGroup("Other")}
        />
      </View>
      {multiple && (
        <Text
          numberOfLines={3}
          style={{
            color: values?.length ? C.sage : C.muted,
            fontSize: 12,
            lineHeight: 16,
            fontWeight: "700",
          }}
        >
          {values?.length
            ? `${values.length} selected: ${values.join(", ")}`
            : "Select one or more cultures."}
        </Text>
      )}
      {!multiple && value && (
        <Text
          numberOfLines={2}
          style={{ color: C.sage, fontSize: 12, fontWeight: "700" }}
        >
          Selected: {value}
        </Text>
      )}
    </View>
  );
}

function FuturisticBirthDatePicker({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 430 || height < 820;
  const panelMaxHeight = Math.min(620, Math.max(470, height - 48));
  const today = new Date();
  const minimumYear = 1900;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const [visibleMonth, setVisibleMonth] = useState(value.getMonth());
  const [visibleYear, setVisibleYear] = useState(value.getFullYear());
  const [selectedDate, setSelectedDate] = useState(value);

  useEffect(() => {
    if (!visible) return;
    setVisibleMonth(value.getMonth());
    setVisibleYear(value.getFullYear());
    setSelectedDate(value);
  }, [value, visible]);

  const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
  const firstDay = new Date(visibleYear, visibleMonth, 1).getDay();
  const calendarSlots = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarSlots.length % 7 !== 0) calendarSlots.push(null);

  const clampYear = (year: number) =>
    Math.max(minimumYear, Math.min(today.getFullYear(), year));
  const updateYear = (year: number) => {
    const nextYear = clampYear(year);
    setVisibleYear(nextYear);
    if (nextYear === today.getFullYear() && visibleMonth > today.getMonth()) {
      setVisibleMonth(today.getMonth());
    }
  };
  const isFutureDay = (day: number) => {
    const date = new Date(visibleYear, visibleMonth, day);
    return date > today;
  };
  const selectDay = (day: number) => {
    if (isFutureDay(day)) return;
    setSelectedDate(new Date(visibleYear, visibleMonth, day));
  };
  const confirm = () => {
    onChange(selectedDate);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(6,10,25,0.72)",
          paddingHorizontal: 14,
          paddingVertical: 18,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
            maxHeight: panelMaxHeight,
            alignSelf: "center",
            borderRadius: 28,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: "#0D1535",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: compact ? 12 : 16,
              gap: compact ? 10 : 13,
            }}
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#FFD234", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }}>
                  BIRTH DATE
                </Text>
                <Text style={{ color: C.paper, fontFamily: BRAND_FONT, fontSize: compact ? 22 : 27, fontWeight: "700" }}>
                  Choose your day
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 17 }}>
                  A clean private age check. Only your age is shown.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={onClose}
                style={{
                  width: compact ? 38 : 42,
                  height: compact ? 38 : 42,
                  borderRadius: compact ? 19 : 21,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.11)",
                }}
              >
                <X size={20} color={C.paper} />
              </Pressable>
            </View>

            <View
              style={{
                borderRadius: 22,
                padding: compact ? 10 : 12,
                backgroundColor: "rgba(255,255,255,0.09)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  onPress={() => updateYear(visibleYear - 1)}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.10)" }}
                >
                  <ChevronLeft size={19} color={C.paper} />
                </Pressable>
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Text style={{ color: C.paper, fontSize: compact ? 21 : 24, fontWeight: "900" }}>{visibleYear}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.56)", fontSize: 10, fontWeight: "800" }}>tap arrows to adjust</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  onPress={() => updateYear(visibleYear + 1)}
                  style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.10)" }}
                >
                  <ChevronRight size={19} color={C.paper} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable onPress={() => updateYear(visibleYear - 10)} style={{ flex: 1, minHeight: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" }}>
                  <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "900" }}>-10 years</Text>
                </Pressable>
                <Pressable onPress={() => updateYear(visibleYear + 10)} style={{ flex: 1, minHeight: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" }}>
                  <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "900" }}>+10 years</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {monthNames.map((month, index) => {
                const disabled = visibleYear === today.getFullYear() && index > today.getMonth();
                const active = visibleMonth === index;
                return (
                  <Pressable
                    key={month}
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => setVisibleMonth(index)}
                    style={{
                      minWidth: 50,
                      minHeight: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? C.pink : "rgba(255,255,255,0.10)",
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>{month}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ gap: 8 }}>
              <Text style={{ color: C.paper, fontSize: compact ? 15 : 17, fontWeight: "900", textAlign: "center" }}>
                {monthNames[visibleMonth]} {visibleYear}
              </Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {weekdays.map((day, index) => (
                  <Text key={`${day}-${index}`} style={{ flex: 1, color: "rgba(255,255,255,0.50)", fontSize: 11, fontWeight: "900", textAlign: "center" }}>
                    {day}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {calendarSlots.map((day, index) => {
                  const calendarDay = typeof day === "number" ? day : 0;
                  const active = calendarDay > 0 &&
                    selectedDate.getFullYear() === visibleYear &&
                    selectedDate.getMonth() === visibleMonth &&
                    selectedDate.getDate() === calendarDay;
                  const disabled = calendarDay > 0 && isFutureDay(calendarDay);
                  return (
                    <Pressable
                      key={`${day || "blank"}-${index}`}
                      accessibilityRole={calendarDay ? "button" : undefined}
                      disabled={!calendarDay || disabled}
                      onPress={() => calendarDay && selectDay(calendarDay)}
                      style={{
                        width: `${(100 / 7) - 1.1}%`,
                        height: compact ? 30 : 34,
                        borderRadius: compact ? 15 : 17,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active ? "#FFD234" : calendarDay ? "rgba(255,255,255,0.09)" : "transparent",
                        borderWidth: active ? 0 : calendarDay ? 1 : 0,
                        borderColor: "rgba(255,255,255,0.10)",
                        opacity: disabled ? 0.28 : 1,
                      }}
                    >
                      {calendarDay ? <Text style={{ color: active ? C.ink : C.paper, fontSize: compact ? 12 : 13, fontWeight: "900" }}>{calendarDay}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View
              style={{
                borderRadius: 20,
                padding: compact ? 10 : 12,
                backgroundColor: "rgba(255,255,255,0.09)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: "rgba(255,255,255,0.56)", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }}>SELECTED</Text>
                <Text style={{ color: C.paper, fontSize: 15, fontWeight: "900" }}>
                  {selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={confirm}
                style={{
                  minHeight: 40,
                  borderRadius: 20,
                  paddingHorizontal: 18,
                  backgroundColor: C.pink,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>Use this date</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Qualifier({
  onExit,
  onLogin,
}: {
  onExit: () => void;
  onLogin: () => void;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 690;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [draftBirthDate, setDraftBirthDate] = useState(new Date(1995, 0, 1));
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [dobStatus, setDobStatus] = useState<
    "unsaved" | "saved" | "restricted"
  >("unsaved");
  const [registered, setRegistered] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => (step > 0 ? setStep(step - 1) : onExit());
  const swipeBack = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 72) backRef.current();
      },
    }),
  ).current;
  const update = (patch: Partial<Answers>) =>
    setAnswers((current) => ({ ...current, ...patch }));
  const toggleInterest = (item: string) => {
    if (item === "Open to everyone")
      return update({ interests: ["Open to everyone"] });
    const current = answers.interests.filter(
      (entry) => entry !== "Open to everyone",
    );
    update({
      interests: current.includes(item) ?
        current.filter((entry) => entry !== item)
        : [...current, item],
    });
  };
  if (selectedProfile && verificationEmail && !registered)
    return (
      <EmailVerification
        email={verificationEmail}
        profile={selectedProfile}
        initialVerificationUrl={verificationUrl}
        onBack={() => setVerificationEmail("")}
      />
    );
  if (selectedProfile && !registered)
    return (
      <Registration
        profile={selectedProfile}
        identity={answers.identity}
        seeking={answers.seeking}
        dateOfBirth={answers.dateOfBirth}
        onBack={() => setSelectedProfile(null)}
        onComplete={(email, url) => {
          setVerificationEmail(email);
          setVerificationUrl(url || "");
        }}
        onSignIn={onLogin}
      />
    );
  if (selectedProfile && registered)
    return (
      <ProfileDetail
        profile={selectedProfile}
        onBack={() => setSelectedProfile(null)}
      />
    );
  if (connectMode)
    return (
      <SignedInHome
        people={profilesForSeeking(
          profilesForInterests(answers.interests),
          answers.seeking,
        )}
        onProfilePress={setSelectedProfile}
        onLogout={() => {
          setConnectMode(false);
          setRegistered(false);
          onExit();
        }}
      />
    );
  if (step === 4)
    return (
      <Results
        answers={answers}
        onBack={() => setStep(3)}
        onProfilePress={setSelectedProfile}
      />
    );
  const valid = [
    Boolean(answers.identity && answers.seeking),
    Boolean(answers.dateOfBirth),
    Boolean(answers.lifestyle),
    answers.interests.length > 0,
  ][step];
  const titles = [
    "Let's get you connected.",
    "Your age and preferences.",
    "How do you describe your personal lifestyle?",
    "Who would you like to discover?",
  ];
  const subtitles = [
    "Tell us who you are and who you're interested in.",
    "Save your date of birth, then adjust the age range.",
    "Start broad, then choose the community or lifestyle that feels most like you.",
    "Choose one or more, write your own, or stay open to everyone.",
  ];
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        {...swipeBack.panHandlers}
        scrollEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 18,
          paddingTop: compact ? 22 : 30,
          paddingBottom: compact ? 8 : 14,
          gap: compact ? 9 : 12,
        }}
      >
        <Logo size="compact" />
        <View style={{ flexDirection: "row", gap: 5 }}>
          {[0, 1, 2, 3, 4].map((item) => (
            <View
              key={item}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: item <= step ? C.pink : C.line,
              }}
            />
          ))}
        </View>
        <View style={{ gap: 3, alignItems: "center" }}>
          <Text
            style={{
              color: C.muted,
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 1.1,
              textAlign: "center",
            }}
          >
            YOUR MATCH · {step + 1} OF 5
          </Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={step === 2 ? 2 : 1}
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontWeight: "700",
              fontSize: compact ? 25 : 29,
              lineHeight: compact ? 27 : 32,
              textAlign: "center",
            }}
          >
            {titles[step]}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: C.muted,
              fontSize: compact ? 12 : 13,
              lineHeight: compact ? 16 : 18,
              textAlign: "center",
            }}
          >
            {subtitles[step]}
          </Text>
        </View>
        <View
          style={{ flex: 1, gap: compact ? 7 : 9, justifyContent: "center" }}
        >
          {step === 0 && (
            <View
              style={{
                gap: 10,
                borderRadius: 24,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: "rgba(169,79,53,0.20)",
                backgroundColor: "rgba(255,253,249,0.72)",
                padding: compact ? 14 : 18,
                boxShadow: "0 10px 28px rgba(54,42,31,0.08)",
              }}
            >
              <Text
                style={{
                  color: C.ink,
                  fontSize: 12,
                  fontWeight: "800",
                  textAlign: "center",
                }}
              >
                I AM A...
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {identityOptions.map((item) => (
                  <Choice
                    key={item}
                    columns={3}
                    compact
                    label={item}
                    selected={answers.identity === item}
                    onPress={() => update({ identity: item })}
                  />
                ))}
              </View>
              <Text
                style={{
                  color: C.ink,
                  fontSize: 12,
                  fontWeight: "800",
                  paddingTop: 3,
                  textAlign: "center",
                }}
              >
                I'M INTERESTED IN...
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {seekingOptions.map((item) => (
                  <Choice
                    key={item}
                    columns={3}
                    compact
                    label={item}
                    selected={answers.seeking === item}
                    onPress={() => update({ seeking: item })}
                  />
                ))}
              </View>
            </View>
          )}
          {step === 1 && (
            <>
              {process.env.EXPO_OS === "ios" ? (
                <View
                  style={{
                    backgroundColor: C.paper,
                    borderWidth: 1,
                    borderColor: C.line,
                    borderRadius: 16,
                    padding: 4,
                    alignItems: "center",
                  }}
                >
                  <DateTimePicker
                    value={draftBirthDate}
                    mode="date"
                    display="spinner"
                    minimumDate={new Date(1900, 0, 1)}
                    maximumDate={new Date()}
                    onChange={(_, date) => {
                      if (date) {
                        setDraftBirthDate(date);
                        setDobStatus("unsaved");
                        update({ dateOfBirth: "" });
                      }
                    }}
                    style={{ width: 285, height: compact ? 105 : 120 }}
                  />
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: "#0D1535",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.18)",
                    borderRadius: 24,
                    borderCurve: "continuous",
                    padding: compact ? 12 : 14,
                    gap: 10,
                    alignItems: "center",
                    boxShadow: "0 18px 42px rgba(13,21,53,0.28)",
                  }}
                >
                  <Text selectable style={{ color: "#FFD234", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 }}>
                    DATE OF BIRTH
                  </Text>
                  <Text selectable style={{ color: C.paper, fontSize: compact ? 19 : 22, fontWeight: "900" }}>
                    {draftBirthDate.toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                  <Text selectable style={{ color: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                    Open Calendar and choose your birthday.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose date of birth"
                    onPress={() => setDobPickerOpen(true)}
                    style={{
                      minHeight: 40,
                      borderRadius: 20,
                      backgroundColor: C.pink,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                      paddingHorizontal: 18,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: C.paper, fontSize: 12, fontWeight: "900" }}>
                      Open Calendar
                    </Text>
                  </Pressable>
                  <FuturisticBirthDatePicker
                    visible={dobPickerOpen}
                    value={draftBirthDate}
                    onClose={() => setDobPickerOpen(false)}
                    onChange={(date) => {
                      setDraftBirthDate(date);
                      setDobStatus("unsaved");
                      update({ dateOfBirth: "" });
                    }}
                  />
                </View>
              )}
              <Button
                compact
                label="Save date of birth"
                onPress={() => {
                  setDobPickerOpen(false);
                  const age = ageFromDate(draftBirthDate);
                  if (age < 18) {
                    setDobStatus("restricted");
                    update({ dateOfBirth: "" });
                  } else {
                    setDobStatus("saved");
                    update({
                      dateOfBirth: draftBirthDate.toISOString().slice(0, 10),
                      ...suggestedRange(age),
                    });
                  }
                }}
              />
              {dobStatus === "restricted" && (
                <View
                  accessibilityRole="alert"
                  style={{
                    backgroundColor: "#F8DFDC",
                    borderRadius: 13,
                    padding: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "#8A3028",
                      fontWeight: "800",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    App access is restricted to users aged 18 or older. No
                    under-18 access.
                  </Text>
                </View>
              )}
              {dobStatus === "saved" && (
                <>
                  <Text
                    style={{
                      color: C.sage,
                      fontSize: 15,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    Your age: {ageFromDate(draftBirthDate)}
                  </Text>
                  <View
                    style={{
                      backgroundColor: C.paper,
                      borderWidth: 1,
                      borderColor: C.line,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                  >
                    <AgeRangeSlider
                      minAge={answers.minAge}
                      maxAge={answers.maxAge}
                      onChange={(minAge, maxAge) => update({ minAge, maxAge })}
                    />
                  </View>
                </>
              )}
            </>
          )}
          {step === 2 && (
            <LifestylePicker
              value={answers.lifestyle}
              onSelect={(lifestyle) => update({ lifestyle })}
            />
          )}
          {step === 3 && (
            <LifestylePicker
              multiple
              values={answers.interests}
              onSelect={toggleInterest}
            />
          )}
        </View>
        <View style={{ gap: 2 }}>
          <Button
            compact
            label={step === 3 ? "Show people nearby" : "Continue"}
            disabled={!valid}
            onPress={() => setStep(step + 1)}
          />
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(step - 1)}
              style={{ alignItems: "center", paddingVertical: compact ? 5 : 7 }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: "800" }}>
                Back
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  const browserPath =
    typeof globalThis !== "undefined" && "location" in globalThis
      ? String(
          (globalThis as { location?: { pathname?: string } }).location
            ?.pathname || "",
        )
      : "";
  const [screen, setScreen] = useState<
    "landing" | "account-choice" | "qualifier" | "login" | "forgot-password" | "reset-password" | "verifying" | "home"
  >("landing");
  const [launching, setLaunching] = useState(true);
  const [verificationTicket, setVerificationTicket] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [passwordResetRequiresCurrentPassword, setPasswordResetRequiresCurrentPassword] =
    useState(false);
  const [sessionUser, setSessionUser] = useState<AuthenticatedUser | null>(null);
  const [startInProfileEditor, setStartInProfileEditor] = useState(false);
  useEffect(() => {
    setAuthExpiredHandler(() => {
      setSessionUser(null);
      setStartInProfileEditor(false);
      setVerificationTicket("");
      setVerificationError("");
      setPasswordResetToken("");
      setPasswordResetRequiresCurrentPassword(false);
      setScreen("landing");
    });
    return () => setAuthExpiredHandler(null);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setLaunching(false), 11_000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const handleVerificationUrl = (url: string | null) => {
      if (!url) return;
      try {
        const link = new URL(url);
        if (url.includes("reset-password")) {
          const token = link.searchParams.get("token") || "";
          setPasswordResetToken(token);
          setPasswordResetRequiresCurrentPassword(
            link.searchParams.get("requiresCurrentPassword") === "1",
          );
          setScreen("reset-password");
          return;
        }
        if (!url.includes("verify-email")) return;
        const status = link.searchParams.get("status");
        const ticket = link.searchParams.get("ticket") || "";
        setScreen("verifying");
        setVerificationError("");
        if (status === "verified" && ticket) {
          setVerificationTicket(ticket);
        } else {
          setVerificationError(
            "This confirmation link is invalid or has expired. Return to registration and request a new confirmation email.",
          );
        }
      } catch {
        setScreen("verifying");
        setVerificationError(
          "KindredCube could not read this confirmation link. Request a new confirmation email.",
        );
      }
    };
    Linking.getInitialURL()
      .then(handleVerificationUrl)
      .catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      handleVerificationUrl(url),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let active = true;
    Linking.getInitialURL()
      .then((url) => {
        if (!active) return;
        if (url && (url.includes("verify-email") || url.includes("reset-password"))) return;
        getCurrentUser()
          .then((user) => {
            if (!active) return;
            setSessionUser(user);
            setStartInProfileEditor(false);
            setScreen((current) =>
              current === "landing" || current === "account-choice" || current === "login"
                ? "home"
                : current,
            );
          })
          .catch(() => {
            // No saved session, expired credentials, or temporary network issue.
            // Keep the normal landing/login flow without forcing a logout screen.
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!verificationTicket) return;
    let active = true;
    completeEmailLogin(verificationTicket)
      .then((user) => {
        if (!active) return;
        setSessionUser(user);
        setStartInProfileEditor(true);
        setVerificationTicket("");
        setVerificationError("");
        setScreen("home");
      })
      .catch((caught) => {
        if (!active) return;
        setVerificationTicket("");
        setVerificationError(
          caught instanceof Error ?
            caught.message
            : "KindredCube could not complete your secure sign-in.",
        );
        setScreen("verifying");
      });
    return () => {
      active = false;
    };
  }, [verificationTicket]);
  if (browserPath === "/tectavis")
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.cream }}>
          <StatusBar style="dark" translucent={false} backgroundColor={C.cream} />
          <TectavisAdminPortal />
        </View>
      </SafeAreaProvider>
    );
  if (launching)
    return (
      <SafeAreaProvider>
        <WelcomeLoadingScreen
          title="Welcome to KindredCube"
          message="Shared values. Real connection."
        />
      </SafeAreaProvider>
    );
  let content;
  if (screen === "landing")
    content = <Landing onStart={() => setScreen("account-choice")} />;
  else if (screen === "account-choice")
    content = (
      <AccountChoice
        onBack={() => setScreen("landing")}
        onNew={() => setScreen("qualifier")}
        onLogin={() => setScreen("login")}
      />
    );
  else if (screen === "login")
    content = (
      <Login
        onBack={() => setScreen("account-choice")}
        onSignup={() => setScreen("qualifier")}
        onForgotPassword={() => setScreen("forgot-password")}
        onComplete={(user) => {
          setSessionUser(user);
          setStartInProfileEditor(false);
          setScreen("home");
        }}
      />
    );
  else if (screen === "forgot-password")
    content = <ForgotPassword onBack={() => setScreen("login")} />;
  else if (screen === "reset-password")
    content = passwordResetToken ? (
      <ResetPassword
        token={passwordResetToken}
        requiresCurrentPassword={passwordResetRequiresCurrentPassword}
        onCancel={() => {
          setPasswordResetToken("");
          setPasswordResetRequiresCurrentPassword(false);
          setScreen("login");
        }}
        onComplete={() => {
          setPasswordResetToken("");
          setPasswordResetRequiresCurrentPassword(false);
          setScreen("login");
        }}
      />
    ) : (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text accessibilityRole="alert" style={{ color: C.ink, textAlign: "center", fontSize: 18, fontWeight: "800" }}>This password reset link is incomplete. Request a new one.</Text>
        <Button label="Request a new link" onPress={() => setScreen("forgot-password")} />
      </View>
    );
  else if (screen === "verifying")
    content = (
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Logo size="compact" />
        <View
          style={{
            width: "100%",
            borderRadius: 26,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.paper,
            padding: 24,
            alignItems: "center",
            gap: 13,
          }}
        >
          <ShieldCheck width={48} height={48} color={C.sage} />
          <Text
            selectable
            style={{
              color: C.ink,
              fontFamily: BRAND_FONT,
              fontSize: 29,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            {verificationError ? "Confirmation link unavailable" : "Signing you in securely"}
          </Text>
          <Text
            accessibilityRole={verificationError ? "alert" : undefined}
            selectable
            style={{
              color: verificationError ? "#9C3225" : C.muted,
              fontSize: 14,
              lineHeight: 21,
              textAlign: "center",
            }}
          >
            {verificationError ||
              "Your email is confirmed. KindredCube is opening your profile setup now."}
          </Text>
          {verificationError ? (
            <Button
              label="Return to registration"
              onPress={() => {
                setVerificationError("");
                setScreen("qualifier");
              }}
            />
          ) : null}
        </View>
      </View>
    );
  else if (screen === "home")
    content = (
      <SignedInHome
        people={profilesForSeeking(profiles, sessionUser?.seeking || "Everyone")}
        onProfilePress={() => undefined}
        initialUser={sessionUser}
        startInProfileEditor={startInProfileEditor}
        onLogout={() => {
          logoutAccount().finally(() => {
            setSessionUser(null);
            setStartInProfileEditor(false);
            setScreen("landing");
          });
        }}
      />
    );
  else
    content = (
      <Qualifier
        onExit={() => setScreen("account-choice")}
        onLogin={() => setScreen("login")}
      />
    );
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: C.cream }}>
        <StatusBar style="dark" translucent={false} backgroundColor={C.cream} />
        {content}
      </View>
    </SafeAreaProvider>
  );
}
