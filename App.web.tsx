import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  ArrowRight,
  Bell,
  Compass,
  Heart,
  LogOut,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  FileText,
  Users,
  Wallet,
  Settings,
} from "lucide-react-native";
import {
  ApiError,
  type AuthenticatedUser,
  type DiscoveryCandidate,
  getDiscoveryCandidates,
  likeMemberProfile,
  loginAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
  resendVerificationEmail,
  getAdminLegalContent,
  getLegalContentPage,
  getModerationQueue,
  requestAdminMfaChallenge,
  closeAdminSupportTicket,
  replyToSupportTicket,
  reviewModerationAppeal,
  saveAdminLegalContent,
  saveModerationAction,
  verifyAdminMfaCode,
  type AdminPurchase,
  type AdminPurchaseStat,
  type AdminUserStats,
  type LegalContentPage,
  type ModerationAppeal,
  type ModerationQueueItem,
  type SupportTicket,
} from "./src/auth-client";

const C = {
  navy: "#111B3D",
  blue: "#3457D5",
  sky: "#E9F1FF",
  coral: "#F24D67",
  yellow: "#FFD234",
  orange: "#FF9A2E",
  cream: "#FFF9ED",
  paper: "#FFFFFF",
  ink: "#17203B",
  muted: "#6D7488",
  line: "rgba(17, 27, 61, 0.1)",
};

const previewProfiles = [
  { id: "preview-1", name: "Claire", age: 29, role: "Creative producer", culture: "New York", photo: require("./assets/web/claire.png"), match: 94 },
  { id: "preview-2", name: "Aaliyah", age: 30, role: "Architect", culture: "Atlanta", photo: require("./assets/web/aaliyah.png"), match: 91 },
  { id: "preview-3", name: "Aiko", age: 27, role: "Ceramic artist", culture: "Tokyo", photo: require("./assets/web/aiko.png"), match: 89 },
  { id: "preview-4", name: "Camila", age: 28, role: "Marine biologist", culture: "Rio de Janeiro", photo: require("./assets/web/camila.png"), match: 87 },
  { id: "preview-5", name: "Nandi", age: 31, role: "Urban designer", culture: "Durban", photo: require("./assets/web/nandi.png"), match: 93 },
  { id: "preview-6", name: "Tariro", age: 28, role: "Founder", culture: "Harare", photo: require("./assets/web/tariro.png"), match: 90 },
  { id: "preview-7", name: "Sofía", age: 28, role: "Food writer", culture: "Mexico City", photo: require("./assets/web/sofia.png"), match: 88 },
  { id: "preview-8", name: "Maya", age: 29, role: "Travel photographer", culture: "Palawan", photo: require("./assets/web/maya.png"), match: 92 },
  { id: "preview-9", name: "Mei", age: 30, role: "Floral designer", culture: "Shanghai", photo: require("./assets/web/mei.png"), match: 86 },
  { id: "preview-10", name: "Olivia", age: 31, role: "Editorial director", culture: "London", photo: require("./assets/web/olivia.png"), match: 89 },
  { id: "preview-11", name: "Léa", age: 29, role: "Product designer", culture: "Lucerne", photo: require("./assets/web/lea.png"), match: 91 },
  { id: "preview-12", name: "Hannah", age: 30, role: "Sustainability lead", culture: "Berlin", photo: require("./assets/web/hannah.png"), match: 87 },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      accessibilityLabel="KindredCube"
      source={require("./assets/kindredcube-current-logo-transparent.png")}
      resizeMode="contain"
      style={{ width: compact ? 210 : 264, height: compact ? 58 : 74 }}
    />
  );
}

function setDocumentSeo(title: string, description: string) {
  if (typeof document === "undefined") return;
  document.title = title;
  let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = description;
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({
        minHeight: 52,
        paddingHorizontal: 22,
        borderRadius: 18,
        backgroundColor: disabled ? "#9AA2B8" : hovered ? "#223877" : C.navy,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        boxShadow: disabled ? "none" : "0 14px 28px rgba(17,27,61,.2)",
      })}
    >
      <Text style={{ color: "white", fontSize: 15, fontWeight: "800" }}>{label}</Text>
      <ArrowRight size={18} color="white" />
    </Pressable>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secure?: boolean; type?: "default" | "email-address" }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: C.ink, fontSize: 13, fontWeight: "800" }}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#9BA0AF"
        secureTextEntry={props.secure}
        keyboardType={props.type || "default"}
        autoCapitalize={props.type === "email-address" || props.label === "Username" ? "none" : "sentences"}
        autoCorrect={props.label !== "Username"}
        style={{ height: 50, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: "#FBFCFF", color: C.ink, paddingHorizontal: 16, fontSize: 15, outlineStyle: "none" } as any}
      />
    </View>
  );
}

function AuthPanel({ initialMode, onComplete, onClose }: { initialMode: "login" | "register"; onComplete: (user: AuthenticatedUser) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [registrationSent, setRegistrationSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        onComplete(await loginAccount(email.trim(), password));
      } else {
        const result = await registerAccount({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          identity: "Woman",
          seeking: "Everyone",
          dateOfBirth: "1995-01-01",
        });
        setRegistrationSent(true);
        setMessage(result.message || "Check your email to finish creating your account.");
      }
    } catch (error) {
      setMessage(error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await resendVerificationEmail(email.trim());
      setMessage(result.message || "A new verification email has been sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The verification email could not be resent.");
    } finally {
      setBusy(false);
    }
  };

  const usernameValid = /^[A-Za-z0-9_]{3,24}$/.test(username.trim());
  const disabled = busy || !email.trim() || password.length < 10 || (mode === "register" && (!firstName.trim() || !lastName.trim() || !usernameValid));
  return (
    <View style={{ position: "absolute", inset: 0, zIndex: 40, backgroundColor: "rgba(9,15,37,.58)", alignItems: "center", justifyContent: "center", padding: 18 } as any}>
      <Pressable accessibilityLabel="Close sign in" onPress={onClose} style={{ position: "absolute", inset: 0 } as any} />
      <View style={{ width: "100%", maxWidth: 460, maxHeight: "94%", backgroundColor: C.paper, borderRadius: 30, borderCurve: "continuous", padding: 28, gap: 20, boxShadow: "0 30px 80px rgba(5,10,30,.28)" } as any}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Logo compact />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.sky, alignItems: "center", justifyContent: "center" }}><X size={20} color={C.navy} /></Pressable>
        </View>
        <View style={{ gap: 6 }}>
          <Text selectable style={{ color: C.ink, fontSize: 29, lineHeight: 34, fontWeight: "900", letterSpacing: -1 }}>{mode === "login" ? "Welcome back" : "Find your kindred"}</Text>
          <Text selectable style={{ color: C.muted, lineHeight: 21 }}>{mode === "login" ? "Sign in to continue your conversations." : "Create your profile. Your people are closer than you think."}</Text>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          {mode === "register" ? <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="Amara" /></View><View style={{ flex: 1 }}><Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Lee" /></View></View> : null}
          {mode === "register" ? <Field label="Username" value={username} onChangeText={setUsername} placeholder="amara_lee" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" type="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 10 characters" secure />
          {message ? <Text accessibilityRole="alert" selectable style={{ color: message.toLowerCase().includes("check") ? "#216B4B" : "#A13A37", lineHeight: 20, fontWeight: "700" }}>{message}</Text> : null}
          {mode === "register" && registrationSent ? <Pressable accessibilityRole="button" disabled={busy} onPress={resendVerification} style={({ hovered }: any) => ({ alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 3, borderRadius: 6, backgroundColor: hovered ? C.sky : "transparent" })}><Text style={{ color: C.blue, fontWeight: "900" }}>Resend verification email</Text></Pressable> : null}
          <PrimaryButton label={busy ? "Please wait" : mode === "login" ? "Sign in securely" : "Create my account"} onPress={submit} disabled={disabled} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 5, paddingTop: 4 }}>
            <Text style={{ color: C.muted }}>{mode === "login" ? "Do not have an account yet?" : "Already have an account?"}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} style={({ hovered }: any) => ({ paddingVertical: 5, paddingHorizontal: 3, borderRadius: 6, backgroundColor: hovered ? C.sky : "transparent" })}>
              <Text style={{ color: C.blue, fontWeight: "900" }}>{mode === "login" ? "Register" : "Sign in"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  const { width, height } = useWindowDimensions();
  const [cardIndex, setCardIndex] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const compact = width < 760;
  const short = height < 720;
  const visualHeight = compact
    ? Math.max(short ? 205 : 245, Math.min(short ? 255 : 315, height * (short ? 0.32 : 0.35)))
    : Math.max(330, Math.min(590, height - 190));
  const cardHeight = visualHeight * (compact ? 0.94 : 0.9);
  const cardWidth = Math.min(compact ? width * 0.78 : 390, cardHeight * 0.76);
  const heartSize = short ? 50 : 72;
  const headingSize = compact
    ? Math.max(31, Math.min(short ? 38 : 46, width * 0.112))
    : Math.max(48, Math.min(76, height * 0.085));
  const frontProfile = previewProfiles[cardIndex];
  const nextProfile = previewProfiles[(cardIndex + 1) % previewProfiles.length];
  const swipeRight = () => {
    if (swiping) return;
    setSwiping(true);
    window.setTimeout(() => {
      setCardIndex((current) => (current + 1) % previewProfiles.length);
      setSwiping(false);
    }, 950);
  };
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(swipeRight, 9000);
    return () => window.clearInterval(timer);
  }, [swiping]);
  return (
    <ScrollView
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, minHeight: compact ? ("100dvh" as any) : undefined, height: compact ? ("100dvh" as any) : undefined, backgroundColor: C.cream }}
      contentContainerStyle={{
        minHeight: compact ? ("100dvh" as any) : height,
        height: compact ? ("100dvh" as any) : undefined,
        flexGrow: 1,
        paddingHorizontal: compact ? 16 : 42,
        paddingTop: compact ? 14 : 18,
        paddingBottom: compact ? 16 : 18,
        gap: compact ? 8 : 18,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", maxWidth: 1320, width: "100%", alignSelf: "center" }}>
        <Logo compact={compact} />
      </View>
      <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 1320, alignSelf: "center", flexDirection: compact ? "column" : "row", alignItems: "center", justifyContent: compact ? "flex-start" : "center", gap: compact ? (short ? 8 : 12) : 54 }}>
        <View style={{ width: compact ? "100%" : 520, height: visualHeight, position: "relative", flexShrink: 1, marginTop: compact ? (short ? 10 : 18) : 0, transform: [{ translateX: compact ? 8 : 42 }] }}>
          <View style={{ position: "absolute", top: visualHeight * .04, left: compact ? width * .04 : 18, width: cardWidth, height: cardHeight, borderRadius: short ? 24 : 34, overflow: "hidden", opacity: swiping ? 1 : .68, transform: [{ translateX: swiping ? 0 : -cardWidth * .58 }, { rotate: swiping ? "-4deg" : "-11deg" }, { scale: swiping ? 1.02 : .9 }], boxShadow: "0 26px 70px rgba(17,27,61,.25)", transitionProperty: "transform, opacity", transitionDuration: "950ms", transitionTimingFunction: "cubic-bezier(.2,.75,.2,1)" } as any}><Image source={nextProfile.photo} resizeMode="cover" style={{ width: "100%", height: "100%" }} /></View>
          <View style={{ position: "absolute", top: 0, left: compact ? width * .04 : 18, width: cardWidth, height: cardHeight * 1.03, borderRadius: short ? 24 : 34, overflow: "hidden", opacity: swiping ? 0 : 1, transform: [{ translateX: swiping ? cardWidth * 1.25 : 0 }, { rotate: swiping ? "13deg" : "-4deg" }, { scale: swiping ? .94 : 1 }], boxShadow: "0 30px 76px rgba(17,27,61,.28)", transitionProperty: "transform, opacity", transitionDuration: "950ms", transitionTimingFunction: "cubic-bezier(.25,.7,.2,1)" } as any}><Image source={frontProfile.photo} resizeMode="cover" style={{ width: "100%", height: "100%" }} /><View style={{ position: "absolute", left: short ? 8 : 18, right: short ? 8 : 18, bottom: short ? 8 : 18, borderRadius: short ? 12 : 20, padding: short ? 8 : 16, backgroundColor: "rgba(255,255,255,.86)", gap: short ? 1 : 5 } as any}><Text style={{ color: C.ink, fontSize: short ? 14 : 22, fontWeight: "900" }}>{frontProfile.name}, {frontProfile.age}</Text><Text numberOfLines={1} style={{ color: C.muted, fontSize: short ? 10 : 14 }}>{frontProfile.role} · {frontProfile.culture}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Like this profile and show the next person" onPress={swipeRight} style={({ pressed }: any) => ({ position: "absolute", zIndex: 20, left: (compact ? width * .04 : 18) + cardWidth - heartSize * .78, top: cardHeight * .77, width: heartSize, height: heartSize, borderRadius: heartSize / 2, backgroundColor: C.coral, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? .9 : 1 }], boxShadow: "0 18px 30px rgba(242,77,103,.3)" }) as any}><Heart size={short ? 22 : 31} color="white" fill="white" /></Pressable>
        </View>
        <View style={{ flex: compact ? 0 : 1, width: "100%", maxWidth: 620, gap: compact ? (short ? 6 : 9) : 18, transform: [{ translateY: compact ? (short ? -2 : 0) : 0 }] }}>
          <Text selectable style={{ color: C.ink, fontSize: headingSize, lineHeight: headingSize * .99, fontWeight: "900", letterSpacing: compact ? -1.7 : -3.5 }}>Meet the right person that feels like <Text style={{ color: C.blue }}>home.</Text></Text>
          <Text selectable style={{ color: C.muted, fontSize: compact ? (short ? 13 : 15) : 19, lineHeight: compact ? (short ? 18 : 22) : 28, maxWidth: 550 }}>KindredCube finds your Kindred—a person who shares your values and personality.</Text>
          <View style={{ alignSelf: compact ? "stretch" : "flex-start", marginTop: compact ? 0 : 2 }}><PrimaryButton label="What is KindredCube?" onPress={() => { window.location.href = "/about"; }} /></View>
        </View>
      </View>
    </ScrollView>
  );
}

function NavItem({ label, active, icon: Icon }: { label: string; active?: boolean; icon: any }) {
  return <Pressable style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 15, backgroundColor: active ? C.navy : hovered ? C.sky : "transparent" })}><Icon size={20} color={active ? "white" : C.muted} /><Text style={{ color: active ? "white" : C.ink, fontWeight: "800" }}>{label}</Text></Pressable>;
}

function ProfileCard({ profile, onLike, compact }: { profile: any; onLike: () => void; compact: boolean }) {
  return (
    <View style={{ width: compact ? "100%" : 320, height: compact ? 480 : 430, borderRadius: 28, borderCurve: "continuous", overflow: "hidden", backgroundColor: C.paper, boxShadow: "0 18px 45px rgba(17,27,61,.14)" } as any}>
      <Image source={profile.photoUri ? { uri: profile.photoUri } : profile.photo} resizeMode="cover" style={{ width: "100%", flex: 1 }} />
      <View style={{ position: "absolute", inset: 0, justifyContent: "flex-end", padding: 18, backgroundColor: "linear-gradient(transparent, rgba(8,12,30,.82))" } as any}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1, gap: 5 }}><Text style={{ color: "white", fontSize: 24, fontWeight: "900" }}>{profile.name}, {profile.age}</Text><Text style={{ color: "rgba(255,255,255,.82)", fontWeight: "600" }}>{profile.role} · {profile.culture}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Like ${profile.name}`} onPress={onLike} style={({ pressed }: any) => ({ width: 52, height: 52, borderRadius: 26, backgroundColor: C.coral, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? .9 : 1 }] })}><Heart size={23} color="white" fill="white" /></Pressable>
        </View>
      </View>
    </View>
  );
}

function Dashboard({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => void }) {
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const [profiles, setProfiles] = useState<any[]>(previewProfiles);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const columns = width >= 1240 ? 3 : width >= 850 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : columns === 2 ? "48.7%" : "31.8%";

  useEffect(() => {
    getDiscoveryCandidates().then(({ candidates }) => {
      if (candidates.length) setProfiles(candidates);
    }).catch(() => setNotice("Previewing recommendations while the local API is offline.")).finally(() => setLoading(false));
  }, []);

  const like = async (profile: any) => {
    if (String(profile.id).startsWith("preview")) { setNotice(`You connected with ${profile.name}. Sign in to the live API to send it.`); return; }
    try { const result = await likeMemberProfile(profile.id, "explore"); setNotice(result.matched ? `It?s a match with ${profile.name}!` : `${profile.name} has been added to your connections.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not send your connection."); }
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#F7F9FE" }}>
      {!mobile ? <View style={{ width: 248, padding: 22, backgroundColor: C.paper, borderRightWidth: 1, borderRightColor: C.line, gap: 28 }}><Logo compact /><View style={{ gap: 6 }}><NavItem label="Discover" icon={Compass} active /><NavItem label="Matches" icon={Heart} /><NavItem label="Messages" icon={MessageCircle} /><NavItem label="My profile" icon={UserRound} /></View><View style={{ marginTop: "auto", gap: 10 }}><View style={{ padding: 15, borderRadius: 18, backgroundColor: "#FFF4CD", gap: 6 }}><Sparkles size={20} color="#A46200" /><Text style={{ color: C.ink, fontWeight: "900" }}>Kindred insight</Text><Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Complete one more interest to sharpen today's recommendations.</Text></View><Pressable onPress={onLogout} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}><LogOut size={18} color={C.muted} /><Text style={{ color: C.muted, fontWeight: "800" }}>Sign out</Text></Pressable></View></View> : null}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: mobile ? 16 : 30, gap: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          {mobile ? <Logo compact /> : <View style={{ gap: 3 }}><Text selectable style={{ color: C.ink, fontSize: 28, fontWeight: "900", letterSpacing: -1 }}>Good evening, {user.firstName}</Text><Text selectable style={{ color: C.muted }}>People chosen for the way you connect.</Text></View>}
          <View style={{ flexDirection: "row", gap: 8 }}><Pressable accessibilityLabel="Search" style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }}><Search size={20} color={C.navy} /></Pressable><Pressable accessibilityLabel="Notifications" style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }}><Bell size={20} color={C.navy} /></Pressable></View>
        </View>
        {mobile ? <View style={{ gap: 3 }}><Text selectable style={{ color: C.ink, fontSize: 27, fontWeight: "900", letterSpacing: -1 }}>Hello, {user.firstName}</Text><Text selectable style={{ color: C.muted }}>Your kindred picks for today.</Text></View> : null}
        <View style={{ minHeight: 106, borderRadius: 24, padding: 20, backgroundColor: C.navy, flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", justifyContent: "space-between", gap: 14, overflow: "hidden" }}>
          <View style={{ gap: 6, maxWidth: 560 }}><Text style={{ color: C.yellow, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>YOUR KINDRED SIGNAL</Text><Text selectable style={{ color: "white", fontSize: 20, fontWeight: "900" }}>Curiosity + grounded ambition</Text><Text selectable style={{ color: "rgba(255,255,255,.68)", lineHeight: 20 }}>Today's recommendations prioritize meaningful conversation and shared pace.</Text></View>
          <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, backgroundColor: "rgba(255,255,255,.1)", flexDirection: "row", alignItems: "center", gap: 7 }}><ShieldCheck size={17} color="#9FE2BF" /><Text style={{ color: "white", fontWeight: "800" }}>Verified-first</Text></View>
        </View>
        {notice ? <Pressable onPress={() => setNotice("")} style={{ padding: 14, borderRadius: 16, backgroundColor: C.sky, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}><Text accessibilityRole="alert" selectable style={{ flex: 1, color: C.navy, fontWeight: "700" }}>{notice}</Text><X size={17} color={C.navy} /></Pressable> : null}
        {loading ? <ActivityIndicator color={C.blue} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: mobile ? 16 : 18 }}>
          {profiles.map((profile) => <View key={profile.id} style={{ width: cardWidth as any }}><ProfileCard profile={profile} compact={columns === 1} onLike={() => like(profile)} /></View>)}
        </View>
        {mobile ? <View style={{ position: "sticky", bottom: 10, flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: 10, borderRadius: 22, backgroundColor: "rgba(255,255,255,.94)", borderWidth: 1, borderColor: C.line, boxShadow: "0 14px 32px rgba(17,27,61,.16)" } as any}><Compass size={22} color={C.blue} /><Heart size={22} color={C.muted} /><MessageCircle size={22} color={C.muted} /><Pressable onPress={onLogout}><LogOut size={21} color={C.muted} /></Pressable></View> : null}
      </ScrollView>
    </View>
  );
}

type AdminSection = "legal" | "users" | "purchases" | "support" | "settings";

function AdminPortal() {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const [adminUser, setAdminUser] = useState<AuthenticatedUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [challengeReady, setChallengeReady] = useState(false);
  const [section, setSection] = useState<AdminSection>("legal");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [purchaseStats, setPurchaseStats] = useState<AdminPurchaseStat[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [queue, setQueue] = useState<ModerationQueueItem[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [legalPages, setLegalPages] = useState<LegalContentPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [legalTitle, setLegalTitle] = useState("");
  const [legalSummary, setLegalSummary] = useState("");
  const [legalBody, setLegalBody] = useState("");
  const [legalImageText, setLegalImageText] = useState("");
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStage, setTicketStage] = useState<"new" | "review" | "closed">("new");
  const [ticketCloseReasons, setTicketCloseReasons] = useState<Record<string, string>>({});
  const adminOwnerEmail = "chester.chirenje@tectavis.com";

  const clearAdminState = useCallback(() => {
    setAdminUser(null);
    setEmail("");
    setPassword("");
    setMfaToken("");
    setChallengeReady(false);
    setCode("");
    setStats(null);
    setPurchaseStats([]);
    setPurchases([]);
    setQueue([]);
    setAppeals([]);
    setTickets([]);
    setLegalPages([]);
    setSelectedSlug("");
    setLegalTitle("");
    setLegalSummary("");
    setLegalBody("");
    setLegalImageText("");
    setTicketReplies({});
    setTicketCloseReasons({});
  }, []);

  const secureAdminLogout = useCallback((message = "Your secure admin session expired. Please sign in again.") => {
    clearAdminState();
    setNotice(message);
    logoutAccount().catch(() => undefined);
  }, [clearAdminState]);

  const isExpiredAdminSession = useCallback((error: unknown) => {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
    return status === 401 || status === 403 ||
      message.includes("two-factor") ||
      message.includes("2fa") ||
      message.includes("mfa") ||
      message.includes("verification is required") ||
      message.includes("admin verification") ||
      message.includes("session expired") ||
      message.includes("jwt expired") ||
      message.includes("unauthorized") ||
      message.includes("forbidden");
  }, []);

  const handleAdminError = useCallback((error: unknown, fallback: string) => {
    if (isExpiredAdminSession(error)) {
      secureAdminLogout();
      return;
    }
    setNotice(error instanceof Error ? error.message : fallback);
  }, [isExpiredAdminSession, secureAdminLogout]);

  const refresh = useCallback(async () => {
    if (!mfaToken) return;
    setBusy(true);
    setNotice("");
    try {
      const [moderation, legal] = await Promise.all([
        getModerationQueue(mfaToken),
        getAdminLegalContent(mfaToken),
      ]);
      const pages = Array.isArray(legal.pages) ? legal.pages : [];
      setStats(moderation.stats || null);
      setPurchaseStats(Array.isArray(moderation.purchaseStats) ? moderation.purchaseStats : []);
      setPurchases(Array.isArray(moderation.purchases) ? moderation.purchases : []);
      setQueue(Array.isArray(moderation.queue) ? moderation.queue : []);
      setAppeals(Array.isArray(moderation.appeals) ? moderation.appeals : []);
      setTickets(Array.isArray(moderation.supportTickets) ? moderation.supportTickets : []);
      setLegalPages(pages);
      setSelectedSlug((current) => current || pages[0]?.slug || "");
    } catch (error) {
      handleAdminError(error, "The admin dashboard could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }, [handleAdminError, mfaToken]);

  useEffect(() => {
    refresh();
    if (!mfaToken) return;
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [mfaToken, refresh]);

  const selectedLegal = legalPages.find((page) => page.slug === selectedSlug);
  useEffect(() => {
    if (!selectedLegal) return;
    setLegalTitle(selectedLegal.title);
    setLegalSummary(selectedLegal.summary);
    setLegalBody(selectedLegal.body);
    setLegalImageText((selectedLegal.imageUrls || []).join("\n"));
  }, [selectedLegal?.slug]);

  const signIn = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const user = await loginAccount(email.trim().toLowerCase(), password);
      if (user.email.toLowerCase() !== adminOwnerEmail) {
        await logoutAccount();
        throw new Error("This account is not authorized for the Tectavis portal.");
      }
      setAdminUser(user);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Secure admin sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const startMfa = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await requestAdminMfaChallenge();
      setChallengeReady(true);
      setNotice(`Enter the current 6-digit authenticator code for ${result.account}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Authenticator verification could not start.");
    } finally { setBusy(false); }
  };

  const verifyMfa = async () => {
    setBusy(true);
    setNotice("");
    try {
      const result = await verifyAdminMfaCode(code.trim());
      setMfaToken(result.adminMfaToken);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Admin verification failed.");
    } finally { setBusy(false); }
  };

  const moderate = async (profileId: string, action: "suspend" | "reinstate" | "ban" | "close_reports") => {
    try {
      await saveModerationAction(profileId, action, undefined, mfaToken);
      await refresh();
    } catch (error) { handleAdminError(error, "The moderation action failed."); }
  };

  const review = async (appealId: string, status: "accepted" | "rejected") => {
    try {
      await reviewModerationAppeal(appealId, status, undefined, mfaToken);
      await refresh();
    } catch (error) { handleAdminError(error, "The appeal could not be updated."); }
  };

  const saveLegal = async () => {
    if (!selectedLegal || !legalTitle.trim()) return;
    setBusy(true);
    try {
      const imageUrls = legalImageText.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
      const result = await saveAdminLegalContent(selectedLegal.slug, { title: legalTitle.trim(), summary: legalSummary.trim(), body: legalBody.trim(), imageUrls }, mfaToken);
      setLegalPages((current) => current.map((page) => page.slug === result.page.slug ? result.page : page));
      setNotice("Legal page saved. The website will show this content on its public legal page.");
    } catch (error) { handleAdminError(error, "The legal page could not be saved."); }
    finally { setBusy(false); }
  };

  const sendTicketReply = async (ticket: SupportTicket) => {
    const message = (ticketReplies[ticket.id] || "").trim();
    if (!message || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await replyToSupportTicket(ticket.id, message, mfaToken);
      setTickets((current) => current.map((item) => item.id === ticket.id ? result.ticket : item));
      setTicketReplies((current) => ({ ...current, [ticket.id]: "" }));
      setNotice(`Reply sent from support@kindredcube.com for ${ticket.ticketNumber}.`);
    } catch (error) {
      handleAdminError(error, "The support reply could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const sendAdminPasswordReset = async () => {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const targetEmail = email.trim().toLowerCase() || adminOwnerEmail;
      await requestPasswordReset(targetEmail);
      setNotice("If this admin account exists, a secure password reset link has been sent to the admin email.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The password reset link could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const closeTicketFromAdmin = async (ticket: SupportTicket) => {
    const reason = (ticketCloseReasons[ticket.id] || "").trim();
    if (!reason || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await closeAdminSupportTicket(ticket.id, reason, mfaToken);
      setTickets((current) => current.map((item) => item.id === ticket.id ? result.ticket : item));
      setTicketCloseReasons((current) => ({ ...current, [ticket.id]: "" }));
      setTicketStage("closed");
      setNotice(`${ticket.ticketNumber} closed and the user was notified from support@kindredcube.com.`);
    } catch (error) {
      handleAdminError(error, "The support ticket could not be closed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => logoutAccount().finally(() => {
    clearAdminState();
  });

  const purchaseColors = { premium: C.yellow, kindred_pass: "#6A39B8", wallet: "#111111" } as const;
  const purchaseLabels = { premium: "Premium", kindred_pass: "KindredPass", wallet: "Wallet" } as const;
  const purchaseTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (13 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), premium: 0, kindred_pass: 0, wallet: 0 };
    });
    const indexByDay = new Map(days.map((day, index) => [day.key, index]));
    purchases.forEach((purchase) => {
      if (!purchase?.created_at || !(purchase.purchase_type in purchaseLabels)) return;
      const parsedDate = new Date(purchase.created_at);
      if (Number.isNaN(parsedDate.getTime())) return;
      const key = parsedDate.toISOString().slice(0, 10);
      const index = indexByDay.get(key);
      if (index === undefined) return;
      days[index][purchase.purchase_type] += 1;
    });
    return days;
  }, [purchaseLabels, purchases]);
  const maxPurchaseTrendValue = Math.max(1, ...purchaseTrend.flatMap((day) => [day.premium, day.kindred_pass, day.wallet]));
  const recentPurchaseTotal = (type: "premium" | "kindred_pass" | "wallet") => purchases.filter((purchase) => purchase.purchase_type === type).length;

  if (!adminUser) return (
    <View style={{ flex: 1, minHeight: "100vh", backgroundColor: "#F7F9FE", alignItems: "center", justifyContent: "center", padding: 20 } as any}>
      <View style={{ width: "100%", maxWidth: 460, borderRadius: 30, backgroundColor: C.paper, padding: compact ? 22 : 34, gap: 16, borderWidth: 1, borderColor: C.line, boxShadow: "0 28px 70px rgba(17,27,61,.18)" } as any}>
        <View style={{ alignSelf: "flex-start", marginLeft: -4 }}><Logo compact /></View>
        <Text style={{ color: C.ink, fontSize: 30, fontWeight: "900" }}>Sign in</Text>
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="Email" type="email-address" />
        <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secure />
        {notice ? <Text accessibilityRole="alert" style={{ color: "#A13A37", fontWeight: "700" }}>{notice}</Text> : null}
        <PrimaryButton label={busy ? "Checking access" : "Sign in"} onPress={signIn} disabled={busy || !email.trim() || !password} />
        <Pressable accessibilityRole="button" onPress={sendAdminPasswordReset} disabled={busy} style={{ alignSelf: "center", paddingVertical: 4, paddingHorizontal: 8 }}>
          <Text style={{ color: C.blue, fontSize: 13, fontWeight: "900" }}>
            Forgot password? Send reset link
          </Text>
        </Pressable>
        <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }}>This is a restricted page. Unauthorized access or attempted access is prohibited and may be prosecuted.</Text>
      </View>
    </View>
  );

  if (!mfaToken) return (
    <View style={{ flex: 1, minHeight: "100vh", backgroundColor: "#F7F9FE", alignItems: "center", justifyContent: "center", padding: 20 } as any}>
      <View style={{ width: "100%", maxWidth: 520, borderRadius: 28, backgroundColor: C.paper, padding: 28, gap: 16, borderWidth: 1, borderColor: C.line }}>
        <ShieldCheck size={34} color={C.blue} />
        <Text style={{ color: C.ink, fontSize: 26, fontWeight: "900" }}>Two-factor verification</Text>
        <Text style={{ color: C.muted, lineHeight: 21 }}>A fresh Google Authenticator, Authy, or 1Password code is required before private admin data is loaded.</Text>
        <PrimaryButton label={challengeReady ? "Authenticator ready" : "Use authenticator app"} onPress={startMfa} disabled={busy} />
        {challengeReady ? <><Field label="6-digit code" value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /><PrimaryButton label={busy ? "Verifying" : "Verify admin access"} onPress={verifyMfa} disabled={busy || code.length !== 6} /></> : null}
        {notice ? <Text accessibilityRole="alert" style={{ color: notice.startsWith("Enter") ? C.muted : "#A13A37", fontWeight: "700" }}>{notice}</Text> : null}
        <Pressable accessibilityRole="button" onPress={logout}><Text style={{ color: C.coral, fontWeight: "800" }}>Sign out</Text></Pressable>
      </View>
    </View>
  );

  const menu = [
    ["legal", "Legal Content", FileText], ["users", "Users", Users], ["purchases", "Purchases", Wallet],
    ["support", "Support", ShieldCheck], ["settings", "Settings", Settings],
  ] as const;
  const ActionButton = ({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) => <Pressable accessibilityRole="button" onPress={onPress} style={({ hovered, pressed }: any) => ({ minHeight: 38, borderRadius: 12, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", backgroundColor: danger ? (pressed ? "#821F2A" : "#B73140") : (hovered ? "#243B7B" : C.navy) })}><Text style={{ color: "white", fontSize: 12, fontWeight: "900" }}>{label}</Text></Pressable>;
  const ticketMatchesSearch = (ticket: SupportTicket) => {
    const text = [
      ticket.ticketNumber,
      ticket.username,
      ticket.email,
      ticket.reason,
      ticket.message,
      ticket.closeReason,
      ...(ticket.messages || []).map((message) => `${message.senderEmail || ""} ${message.body}`),
    ].filter(Boolean).join(" ").toLowerCase();
    return !ticketSearch.trim() || text.includes(ticketSearch.trim().toLowerCase());
  };
  const ticketStageFor = (ticket: SupportTicket): "new" | "review" | "closed" => {
    if (ticket.status === "closed" || ticket.status === "resolved") return "closed";
    return ticket.status === "in_review" || (ticket.messages || []).some((message) => message.senderType === "admin") ? "review" : "new";
  };
  const visibleTickets = tickets.filter((ticket) => ticketStageFor(ticket) === ticketStage && ticketMatchesSearch(ticket));
  const ticketCounts = {
    new: tickets.filter((ticket) => ticketStageFor(ticket) === "new" && ticketMatchesSearch(ticket)).length,
    review: tickets.filter((ticket) => ticketStageFor(ticket) === "review" && ticketMatchesSearch(ticket)).length,
    closed: tickets.filter((ticket) => ticketStageFor(ticket) === "closed" && ticketMatchesSearch(ticket)).length,
  };
  const ticketStageLabels = [
    ["new", "New tickets", ticketCounts.new],
    ["review", "In review", ticketCounts.review],
    ["closed", "Closed", ticketCounts.closed],
  ] as const;
  const userGraphRows = [
    { label: "Total users", value: stats?.total_users || 0, color: C.blue },
    { label: "Active", value: stats?.active_users || 0, color: "#216B4B" },
    { label: "Pending", value: stats?.pending_users || 0, color: C.yellow },
    { label: "Suspended", value: stats?.suspended_users || 0, color: C.orange },
    { label: "Deleted", value: stats?.deleted_users || 0, color: "#B73140" },
  ];
  const maxUserGraphValue = Math.max(1, ...userGraphRows.map((row) => row.value));
  return (
    <View style={{ flex: 1, minHeight: "100vh", flexDirection: compact ? "column" : "row", backgroundColor: "#F4F6FB" } as any}>
      <View style={{ width: compact ? "100%" : 248, backgroundColor: C.navy, padding: compact ? 12 : 18, gap: 14 }}>
        <Text style={{ color: "white", fontSize: 20, fontWeight: "900", paddingHorizontal: 8 }}>KindredCube</Text>
        <ScrollView horizontal={compact} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, flexDirection: compact ? "row" : "column" }}>
          {menu.map(([key, label, Icon]) => <Pressable key={key} accessibilityRole="button" onPress={() => setSection(key)} style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: section === key ? C.blue : "transparent" }}><Icon size={18} color="white" /><Text style={{ color: "white", fontWeight: "800" }}>{label}</Text></Pressable>)}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ width: "100%", maxWidth: 1200, alignSelf: "center", padding: compact ? 16 : 28, gap: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}><View><Text style={{ color: C.ink, fontSize: 27, fontWeight: "900" }}>Admin activities</Text><Text style={{ color: C.muted }}>Live backend data · refreshes every 15 seconds</Text></View><ActionButton label={busy ? "Refreshing" : "Refresh"} onPress={refresh} /></View>
        {notice ? <Pressable onPress={() => setNotice("")} style={{ padding: 13, borderRadius: 14, backgroundColor: notice.includes("saved") ? "#E7F7EE" : "#FFF0F1" }}><Text accessibilityRole="alert" style={{ color: notice.includes("saved") ? "#216B4B" : "#A13A37", fontWeight: "700" }}>{notice}</Text></Pressable> : null}
        {section === "legal" ? (
          <View style={{ borderRadius: 24, backgroundColor: C.paper, padding: compact ? 16 : 22, gap: 14, borderWidth: 1, borderColor: C.line }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Legal Content</Text>
              <Text style={{ color: C.muted, lineHeight: 20 }}>Edit Privacy, Terms, and Community Guidelines. Saved changes are served to the public website pages.</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {legalPages.map((page) => (
                <Pressable key={page.slug} onPress={() => setSelectedSlug(page.slug)} style={{ paddingHorizontal: 13, minHeight: 40, justifyContent: "center", borderRadius: 14, backgroundColor: selectedSlug === page.slug ? C.navy : C.sky }}>
                  <Text style={{ color: selectedSlug === page.slug ? "white" : C.ink, fontWeight: "800" }}>{page.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedLegal ? (
              <View style={{ gap: 12 }}>
                <Field label="Page title" value={legalTitle} onChangeText={setLegalTitle} placeholder="Legal page title" />
                <Field label="Short summary" value={legalSummary} onChangeText={setLegalSummary} placeholder="Short summary for the top of the page" />
                <View style={{ gap: 7 }}>
                  <Text style={{ color: C.ink, fontSize: 13, fontWeight: "800" }}>Page content</Text>
                  <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>Use normal paragraphs. Start a line with ## for a section heading. Images below will appear after the text in the order listed.</Text>
                  <TextInput multiline value={legalBody} onChangeText={setLegalBody} style={{ minHeight: 260, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 15, color: C.ink, textAlignVertical: "top", outlineStyle: "none" } as any} />
                </View>
                <View style={{ gap: 7 }}>
                  <Text style={{ color: C.ink, fontSize: 13, fontWeight: "800" }}>Images</Text>
                  <Text style={{ color: C.muted, fontSize: 12, lineHeight: 18 }}>Add image URLs, one per line. Move a URL up or down in this box to position that image.</Text>
                  <TextInput multiline value={legalImageText} onChangeText={setLegalImageText} placeholder="https://..." style={{ minHeight: 110, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 15, color: C.ink, textAlignVertical: "top", outlineStyle: "none" } as any} />
                </View>
                <PrimaryButton label={busy ? "Saving" : "Save Legal page"} onPress={saveLegal} disabled={busy || !legalTitle.trim()} />
              </View>
            ) : null}
          </View>
        ) : null}
        {section === "users" ? <View style={{ gap: 16 }}>
          <View style={{ backgroundColor: C.paper, borderRadius: 24, padding: compact ? 16 : 22, gap: 18, borderWidth: 1, borderColor: C.line, boxShadow: "0 18px 45px rgba(17,27,61,.08)" } as any}>
            <View>
              <Text style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>User activity graph</Text>
              <Text style={{ color: C.muted, lineHeight: 20 }}>Total, active, pending, suspended, and deleted accounts at a glance.</Text>
            </View>
            <View style={{ height: compact ? 260 : 320, flexDirection: "row", alignItems: "flex-end", gap: compact ? 10 : 18, paddingTop: 18, borderBottomWidth: 1, borderBottomColor: C.line }}>
              {userGraphRows.map((row) => (
                <View key={row.label} style={{ flex: 1, alignItems: "center", gap: 9 }}>
                  <View style={{ width: "100%", minHeight: 4, height: `${Math.max(4, (row.value / maxUserGraphValue) * 100)}%`, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: row.color, boxShadow: `0 12px 28px ${row.color}40` } as any} />
                  <Text style={{ color: C.ink, fontSize: compact ? 20 : 26, fontWeight: "900" }}>{row.value}</Text>
                  <Text style={{ color: C.muted, fontSize: compact ? 10 : 12, fontWeight: "900", textAlign: "center" }}>{row.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <Text style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}>Reported and blocked profiles</Text>
          {queue.length ? queue.map((item) => <View key={item.profile_id} style={{ backgroundColor: C.paper, borderRadius: 20, padding: 16, gap: 8, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.ink, fontSize: 17, fontWeight: "900" }}>{item.username || item.profile_id}</Text><Text style={{ color: C.muted }}>Status: {item.account_status || "unknown"} · Reports: {item.report_count} · Blocks: {item.block_count}</Text><Text style={{ color: "#A13A37", fontWeight: "700" }}>Latest report: {item.latest_report_reason || "None"}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><ActionButton label="Suspend" onPress={() => moderate(item.profile_id, "suspend")} /><ActionButton label="Reinstate" onPress={() => moderate(item.profile_id, "reinstate")} /><ActionButton danger label="Ban forever" onPress={() => moderate(item.profile_id, "ban")} /><ActionButton label="Close reports" onPress={() => moderate(item.profile_id, "close_reports")} /></View></View>) : <Text style={{ color: C.muted }}>No active moderation items.</Text>}
        </View> : null}
        {section === "purchases" ? <View style={{ gap: 14 }}>
          <View style={{ backgroundColor: C.paper, borderRadius: 24, padding: compact ? 16 : 22, gap: 14, borderWidth: 1, borderColor: C.line, boxShadow: "0 18px 45px rgba(17,27,61,.08)" } as any}>
            <View>
              <Text style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>Purchases trend</Text>
              <Text style={{ color: C.muted, lineHeight: 20 }}>Premium, KindredPass, and Wallet purchases over the last 14 days.</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {(["premium", "kindred_pass", "wallet"] as const).map((type) => (
                <View key={type} style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: C.sky }}>
                  <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: purchaseColors[type] }} />
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{purchaseLabels[type]} · {recentPurchaseTotal(type)}</Text>
                </View>
              ))}
            </View>
            <View style={{ height: 250, borderRadius: 20, backgroundColor: "#F8FAFF", borderWidth: 1, borderColor: C.line, overflow: "hidden", padding: 16, justifyContent: "flex-end" }}>
              <View style={{ position: "absolute", left: 16, right: 16, top: 20, bottom: 40, justifyContent: "space-between" }}>
                {[0, 1, 2, 3].map((line) => (
                  <View key={line} style={{ height: 1, backgroundColor: "rgba(17,27,61,.08)" }} />
                ))}
              </View>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", gap: compact ? 5 : 9, paddingBottom: 22 }}>
                {purchaseTrend.map((day, index) => (
                  <View key={day.key} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                    {(["premium", "kindred_pass", "wallet"] as const).map((type) => (
                      <View
                        key={type}
                        title={`${purchaseLabels[type]}: ${day[type]}`}
                        style={{
                          width: compact ? 7 : 10,
                          height: Math.max(6, (day[type] / maxPurchaseTrendValue) * 142),
                          borderRadius: 999,
                          backgroundColor: purchaseColors[type],
                          opacity: day[type] ? 0.95 : 0.18,
                          boxShadow: day[type] ? `0 8px 18px ${purchaseColors[type]}55` : "none",
                        } as any}
                      />
                    ))}
                    <Text style={{ position: "absolute", bottom: -21, color: "rgba(23,32,59,.52)", fontSize: 9, fontWeight: "800" }}>
                      {index % 2 === 0 || !compact ? day.label : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            {purchaseStats.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{purchaseStats.map((stat) => <View key={`${stat.purchase_type}-${stat.status}`} style={{ borderRadius: 14, padding: 12, backgroundColor: "#FFF9ED", borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.ink, fontWeight: "900" }}>{purchaseLabels[stat.purchase_type]} · {stat.status}</Text><Text style={{ color: C.muted, fontSize: 12 }}>{stat.count} purchases · ${(stat.amount_cents / 100).toFixed(2)}</Text></View>)}</View> : null}
          </View>
          <Text style={{ color: C.ink, fontSize: 21, fontWeight: "900" }}>Recent purchases</Text>
          {purchases.length ? purchases.map((purchase) => <View key={purchase.id} style={{ backgroundColor: C.paper, borderRadius: 17, padding: 14, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.ink, fontWeight: "900" }}>{purchase.username} · {purchase.purchase_type}</Text><Text style={{ color: C.muted }}>{purchase.status} · ${(purchase.amount_cents / 100).toFixed(2)} {purchase.currency.toUpperCase()} · {new Date(purchase.created_at).toLocaleString()}</Text></View>) : <Text style={{ color: C.muted }}>No purchases yet.</Text>}
        </View> : null}
        {section === "support" ? (
          <View style={{ gap: 14 }}>
            <View style={{ backgroundColor: C.paper, borderRadius: 24, padding: compact ? 16 : 22, gap: 14, borderWidth: 1, borderColor: C.line }}>
              <View style={{ flexDirection: compact ? "column" : "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: C.ink, fontSize: 24, fontWeight: "900" }}>Support tickets</Text>
                  <Text style={{ color: C.muted, lineHeight: 20 }}>New tickets, in-review conversations, and closed tickets live here.</Text>
                </View>
                <TextInput value={ticketSearch} onChangeText={setTicketSearch} placeholder="Search ticket number, user, reason, or message" style={{ minHeight: 42, width: compact ? "100%" : 360, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, color: C.ink, outlineStyle: "none" } as any} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {ticketStageLabels.map(([key, label, count]) => (
                  <Pressable key={key} accessibilityRole="button" onPress={() => setTicketStage(key)} style={{ minHeight: 42, borderRadius: 999, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: ticketStage === key ? C.navy : C.sky }}>
                    <Text style={{ color: ticketStage === key ? "white" : C.ink, fontWeight: "900" }}>{label}</Text>
                    <Text style={{ color: ticketStage === key ? C.yellow : C.blue, fontWeight: "900" }}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {visibleTickets.map((ticket) => {
              const messages = ticket.messages?.length ? ticket.messages : [{ id: `${ticket.id}-initial`, senderType: "user", body: ticket.message, createdAt: ticket.createdAt } as any];
              const latestMessage = messages[messages.length - 1];
              const isClosed = ticketStageFor(ticket) === "closed";
              return (
                <View key={ticket.id} style={{ backgroundColor: C.paper, borderRadius: 22, padding: compact ? 14 : 18, gap: 12, borderWidth: 1, borderColor: isClosed ? "rgba(33,107,75,.25)" : C.line }}>
                  <View style={{ flexDirection: compact ? "column" : "row", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ gap: 4, flex: 1 }}>
                      <Text style={{ color: C.ink, fontSize: 18, fontWeight: "900" }}>{ticket.ticketNumber} · {ticket.username || ticket.email || "User"}</Text>
                      <Text style={{ color: C.blue, fontWeight: "800" }}>{ticket.reason}</Text>
                      <Text style={{ color: C.muted, lineHeight: 19 }} numberOfLines={2}>{latestMessage?.body || ticket.message}</Text>
                    </View>
                    <View style={{ alignSelf: compact ? "flex-start" : "center", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: isClosed ? "#E7F7EE" : ticketStageFor(ticket) === "review" ? "#FFF7DF" : C.sky }}>
                      <Text style={{ color: isClosed ? "#216B4B" : ticketStageFor(ticket) === "review" ? "#8A5A00" : C.blue, fontSize: 12, fontWeight: "900" }}>{isClosed ? "Closed" : ticketStageFor(ticket) === "review" ? "In review" : "New"}</Text>
                    </View>
                  </View>
                  <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled>
                    {messages.map((message) => (
                      <View key={message.id} style={{ alignSelf: message.senderType === "admin" ? "flex-end" : "flex-start", maxWidth: "88%", borderRadius: 16, padding: 12, backgroundColor: message.senderType === "admin" ? C.sky : "#F8F4EC", borderWidth: 1, borderColor: message.senderType === "admin" ? "rgba(52,87,213,.2)" : C.line, gap: 4 }}>
                        <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>{message.senderType === "admin" ? "Support" : message.senderType === "email" ? `Email reply${message.senderEmail ? ` · ${message.senderEmail}` : ""}` : "User"}</Text>
                        <Text style={{ color: C.muted, lineHeight: 20 }}>{message.body}</Text>
                        <Text style={{ color: C.muted, fontSize: 10, fontWeight: "700" }}>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  {ticket.closeReason ? <Text style={{ color: "#216B4B", fontWeight: "900", lineHeight: 20 }}>Closed: {ticket.closeReason}{ticket.closedAt ? ` · ${new Date(ticket.closedAt).toLocaleString()}` : ""}</Text> : null}
                  {!isClosed ? (
                    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
                      <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Reply from support@kindredcube.com</Text>
                      <TextInput multiline value={ticketReplies[ticket.id] || ""} onChangeText={(value) => setTicketReplies((current) => ({ ...current, [ticket.id]: value }))} placeholder="Write a support reply. If the user replies by email, it returns to this ticket." style={{ minHeight: 82, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top", outlineStyle: "none" } as any} />
                      <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Close ticket reason</Text>
                      <TextInput multiline value={ticketCloseReasons[ticket.id] || ""} onChangeText={(value) => setTicketCloseReasons((current) => ({ ...current, [ticket.id]: value }))} placeholder="Example: Customer confirmed the issue is resolved." style={{ minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top", outlineStyle: "none" } as any} />
                      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                        <ActionButton label={busy ? "Sending" : "Send reply"} onPress={() => sendTicketReply(ticket)} />
                        <ActionButton danger label={busy ? "Closing" : "Close ticket"} onPress={() => closeTicketFromAdmin(ticket)} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {!visibleTickets.length ? <View style={{ backgroundColor: C.paper, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.muted }}>No tickets in this section.</Text></View> : null}
            {appeals.length ? <View style={{ gap: 10 }}><Text style={{ color: C.ink, fontSize: 20, fontWeight: "900" }}>Appeals</Text>{appeals.map((appeal) => <View key={appeal.id} style={{ backgroundColor: "#FFF7DF", borderRadius: 20, padding: 16, gap: 9 }}><Text style={{ color: C.ink, fontWeight: "900" }}>{appeal.public_username || appeal.email}</Text><Text style={{ color: C.muted }}>{appeal.details}</Text><View style={{ flexDirection: "row", gap: 8 }}><ActionButton label="Accept appeal" onPress={() => review(appeal.id, "accepted")} /><ActionButton danger label="Reject" onPress={() => review(appeal.id, "rejected")} /></View></View>)}</View> : null}
          </View>
        ) : null}
        {false && section === "support" ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Support and appeals</Text>
            {appeals.map((appeal) => (
              <View key={appeal.id} style={{ backgroundColor: "#FFF7DF", borderRadius: 20, padding: 16, gap: 9 }}>
                <Text style={{ color: C.ink, fontWeight: "900" }}>{appeal.public_username || appeal.email}</Text>
                <Text style={{ color: C.muted }}>{appeal.details}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ActionButton label="Accept appeal" onPress={() => review(appeal.id, "accepted")} />
                  <ActionButton danger label="Reject" onPress={() => review(appeal.id, "rejected")} />
                </View>
              </View>
            ))}
            {tickets.map((ticket) => (
              <View key={ticket.id} style={{ backgroundColor: C.paper, borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.ink, fontWeight: "900" }}>{ticket.ticketNumber} - {ticket.username || ticket.email || "User"}</Text>
                <Text style={{ color: C.blue, fontWeight: "800" }}>{ticket.status} - {ticket.reason}</Text>
                <View style={{ gap: 8 }}>
                  {(ticket.messages?.length ? ticket.messages : [{ id: `${ticket.id}-initial`, senderType: "user", body: ticket.message, createdAt: ticket.createdAt } as any]).map((message) => (
                    <View
                      key={message.id}
                      style={{
                        alignSelf: message.senderType === "admin" ? "flex-end" : "flex-start",
                        maxWidth: "86%",
                        borderRadius: 16,
                        padding: 12,
                        backgroundColor: message.senderType === "admin" ? C.sky : "#F8F4EC",
                        borderWidth: 1,
                        borderColor: message.senderType === "admin" ? "rgba(52,87,213,.2)" : C.line,
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>
                        {message.senderType === "admin" ? "Support" : message.senderType === "email" ? `Email reply${message.senderEmail ? ` · ${message.senderEmail}` : ""}` : "User"}
                      </Text>
                      <Text style={{ color: C.muted, lineHeight: 20 }}>{message.body}</Text>
                      <Text style={{ color: C.muted, fontSize: 10, fontWeight: "700" }}>
                        {message.createdAt ? new Date(message.createdAt).toLocaleString() : ""}
                      </Text>
                    </View>
                  ))}
                </View>
                {ticket.closeReason ? (
                  <Text style={{ color: "#216B4B", fontWeight: "900", lineHeight: 20 }}>
                    Closed: {ticket.closeReason}{ticket.closedAt ? ` - ${new Date(ticket.closedAt).toLocaleString()}` : ""}
                  </Text>
                ) : null}
                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                  <Text style={{ color: C.ink, fontSize: 12, fontWeight: "900" }}>Reply from support@kindredcube.com</Text>
                  <TextInput
                    multiline
                    value={ticketReplies[ticket.id] || ""}
                    onChangeText={(value) => setTicketReplies((current) => ({ ...current, [ticket.id]: value }))}
                    placeholder="Write a support reply. If the user replies by email, it will return to this ticket."
                    style={{ minHeight: 86, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, color: C.ink, textAlignVertical: "top", outlineStyle: "none" } as any}
                  />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <ActionButton label={busy ? "Sending" : "Send reply"} onPress={() => sendTicketReply(ticket)} />
                  </View>
                </View>
              </View>
            ))}
            {!appeals.length && !tickets.length ? <Text style={{ color: C.muted }}>No support requests or open appeals.</Text> : null}
          </View>
        ) : null}
        {section === "settings" ? <View style={{ backgroundColor: C.paper, borderRadius: 22, padding: 20, gap: 12, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.ink, fontSize: 22, fontWeight: "900" }}>Settings</Text><Text style={{ color: C.muted, lineHeight: 21 }}>Admin access is owner-only and protected by account authentication plus an authenticator code.</Text><ActionButton danger label="Sign out of admin" onPress={logout} /></View> : null}
      </ScrollView>
    </View>
  );
}

function DownloadChooser({ onClose }: { onClose: () => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const option = (platform: "Android" | "Apple", icon: any, onPress: () => void, subtitle: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Download KindredCube for ${platform}`}
      onPress={onPress}
      style={({ hovered, pressed }: any) => ({
        flex: 1,
        minWidth: compact ? "100%" : 190,
        minHeight: compact ? 128 : 190,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: hovered ? "rgba(52,87,213,.35)" : C.line,
        backgroundColor: hovered ? C.sky : C.paper,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 18,
        transform: [{ scale: pressed ? .98 : 1 }],
      })}
    >
      <Image source={icon} accessibilityLabel={`${platform} icon`} resizeMode="contain" style={{ width: compact ? 54 : 70, height: compact ? 54 : 70 }} />
      <Text style={{ color: C.ink, fontSize: compact ? 18 : 21, fontWeight: "900" }}>{platform}</Text>
      <Text style={{ color: C.muted, textAlign: "center", fontSize: 12 }}>{subtitle}</Text>
    </Pressable>
  );
  return (
    <View style={{ position: "absolute", inset: 0, zIndex: 60, backgroundColor: "rgba(9,15,37,.62)", alignItems: "center", justifyContent: "center", padding: 16 } as any}>
      <Pressable accessibilityLabel="Close downloads" onPress={onClose} style={{ position: "absolute", inset: 0 } as any} />
      <View style={{ width: "100%", maxWidth: 600, maxHeight: "92vh", borderRadius: 30, backgroundColor: C.paper, padding: compact ? 20 : 30, gap: compact ? 14 : 20, boxShadow: "0 32px 90px rgba(5,10,30,.34)" } as any}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Logo compact /><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.sky, alignItems: "center", justifyContent: "center" }}><X size={20} color={C.navy} /></Pressable></View>
        <View style={{ gap: 6 }}><Text style={{ color: C.ink, fontSize: compact ? 24 : 31, fontWeight: "900" }}>Continue on mobile</Text><Text style={{ color: C.muted, fontSize: 15, lineHeight: 22 }}>The KindredCube application is currently available for download on mobile devices only.</Text></View>
        <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
          {option("Android", require("./assets/android.svg"), () => { window.location.href = "/downloads/kindredcube.apk"; }, "Download the Android app")}
          {option("Apple", require("./assets/apple.svg"), () => { window.open("https://apps.apple.com/app/idYOUR_APP_ID", "_blank", "noopener,noreferrer"); }, "Open the Apple App Store")}
        </View>
      </View>
    </View>
  );
}

function MainWebApp() {
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  return (
    <View style={{ flex: 1, minHeight: "100vh" } as any}>
      <StatusBar style="dark" />
      <Landing onStart={() => setDownloadsOpen(true)} />
      {downloadsOpen ? <DownloadChooser onClose={() => setDownloadsOpen(false)} /> : null}
    </View>
  );
}

const legalPages = {
  "/about": {
    title: "About KindredCube",
    updated: "Online dating built around deeper compatibility",
    intro: "KindredCube is an online dating platform created for adults who want more than endless swiping. It is designed to help people connect through shared values, personality, culture, relationship intention, and safer real-world discovery.",
    sections: [
      ["Redefining the Rules of Dating Platforms", "The dating market is crowded with apps that often reward quick reactions and surface-level attraction. KindredCube is being built differently: our matching experience focuses on values, personality, relationship goals, culture, lifestyle, and genuine compatibility."],
      ["Compatibility Beyond Hobbies", "Shared hobbies can start a conversation, but meaningful relationships usually need something deeper. KindredCube considers high-impact compatibility signals such as relationship intention, family goals, religion, ethics, communication style, lifestyle, ambition, and core values."],
      ["Culture-Aware and Interracial Dating", "KindredCube supports interracial dating, same-culture matching, ethnic and cultural preferences, and cross-cultural relationships. The platform is designed for people seeking meaningful connections across backgrounds, including Black singles, white singles, Latino singles, Asian dating, Japanese dating, African dating, and culture-aware discovery."],
      ["Personality and Deeper Identity", "KindredCube is also designed for personality-aware matching, including people who search for INFJ compatibility, Sigma males, Sigma females, purpose-driven partners, and deeper relationship alignment rather than only photos or proximity."],
      ["Safety and Real-World Connection", "Verification, Ready to Meet, reporting, blocking, post-meet feedback, and moderation tools help KindredCube support a more accountable dating community."],
      ["Our Purpose", "KindredCube exists to help adults discover a true Kindred: someone who is not merely nearby, but meaningfully compatible."],
    ],
  },
  "/privacy": {
    title: "KindredCube Privacy Policy",
    updated: "Last updated: August 15, 2026",
    intro: "KindredCube is a dating and social discovery platform developed by Tectavis, Inc. This Privacy Policy explains how we collect, use, share, protect, and retain information when you use KindredCube.",
    sections: [
      ["Information We Collect", "We collect account information, profile information, photos, bio, interests, occupation, education, languages, lifestyle details, relationship preferences, verification status, messages, support tickets, safety reports, device information, usage data, location information, and payment-related records such as subscription status and transaction IDs."],
      ["Identity and Selfie Verification", "Stripe Identity may process government ID verification. KindredCube does not store government identification documents submitted to Stripe. Selfie verification may use Amazon Rekognition or similar technology to compare images, reduce duplicate accounts, detect abuse, and protect the community."],
      ["Location Information", "With permission, we may use location to support nearby matching, Ready to Meet, Global Connect, fraud prevention, and safety features. Ready to Meet is designed not to publicly display exact location."],
      ["How We Use Information", "We use information to create accounts, authenticate users, match people, improve recommendations, verify identity, prevent fraud, deliver messages, process payments, provide support, moderate content, send notifications, and comply with legal obligations."],
      ["Sharing Information", "We may share information with cloud hosting providers, payment processors, identity verification providers, fraud-prevention providers, email providers, push notification providers, map providers, analytics providers, customer support tools, and legal or compliance providers."],
      ["Data Retention and Rights", "We retain information while needed to provide KindredCube, protect users, prevent fraud, resolve disputes, and comply with law. Users may update their profile, delete photos, request account deletion, request support, and exercise applicable privacy rights."],
      ["Security", "We use HTTPS, authentication, password hashing, access controls, monitoring, encryption practices, and regular security improvements to protect user information."],
      ["Contact", "For privacy questions or requests, contact support@kindredcube.com."],
    ],
  },
  "/terms": {
    title: "KindredCube Terms of Service",
    updated: "Last updated: August 15, 2026",
    intro: "These Terms govern your use of KindredCube, a social discovery and relationship platform owned and operated by Tectavis, Inc. By creating an account or using the app, you agree to these Terms, our Privacy Policy, and our Community Guidelines.",
    sections: [
      ["Eligibility", "KindredCube is for adults only. You must be at least 18 years old, legally able to use the service, and not previously banned unless we expressly authorize a new account."],
      ["Our Mission", "KindredCube is designed to help adults build genuine, respectful, and meaningful relationships through compatibility matching, authenticity tools, and safety-first social features."],
      ["Your Account", "Each individual may maintain only one personal account unless we expressly authorize otherwise. You must provide accurate information, keep your account secure, and must not impersonate others or create duplicate accounts to avoid moderation, bans, verification rules, safety restrictions, or payment obligations."],
      ["Profile Accuracy", "You must not misrepresent your age, identity, relationship status, profession, qualifications, or achievements, and you must not use misleading, altered, AI-generated, or deceptive profile photos intended to mislead users."],
      ["User Content", "You are responsible for photos, bio text, prompts, messages, voice notes, images, videos, reports, support tickets, and other content you submit. You must not upload illegal, misleading, abusive, hateful, exploitative, non-consensual, infringing, fraudulent, or unsafe content."],
      ["Verification", "Verification helps improve trust, but a badge does not guarantee a user's intentions, character, conduct, compatibility, or safety. Stripe may process government ID information under Stripe's own terms, and KindredCube does not store government ID documents submitted to Stripe. Selfie verification may use Amazon Rekognition or another trusted provider to reduce duplicate accounts and protect the community."],
      ["Matching and Visibility", "KindredCube may use profile information, preferences, location, interests, compatibility answers, verification status, activity, and safety signals to recommend profiles and organize visibility. Recommendations are not guarantees and may change over time."],
      ["Ready to Meet", "Ready to Meet lets users temporarily indicate that they are available to meet. KindredCube may limit access or visibility based on distance, verification status, subscription status, Wallet access, safety status, or other app rules. Users remain responsible for their own meeting decisions and in-person conduct."],
      ["Messaging and Meetings", "Chats may open when users match, when both users like each other, or when a paid or permitted feature allows access. Meeting proposals may be accepted or declined, and post-meet checks may be requested after scheduled meeting windows."],
      ["Payments", "KindredCube may offer Wallet, Super Likes, photo comments, Ready to Meet access, Liked You reveals, KindredPass, and Premium. Wallet top-ups and one-time purchases are generally non-refundable except where required by law. KindredPass is a one-time short-term pass. Premium is a recurring monthly subscription until canceled."],
      ["Safety and Moderation", "Users may report or block profiles and contact support. We may remove content, restrict features, reduce visibility, request verification, suspend accounts, ban users, preserve safety records, or take other action to protect users and enforce these Terms."],
      ["Limitation", "KindredCube provides a platform for adults to discover, communicate, and arrange connections. Users are responsible for their own choices, communication, meetings, travel, safety, and conduct."],
      ["Contact", "For support, contact support@kindredcube.com."],
    ],
  },
  "/community-guidelines": {
    title: "KindredCube Community Guidelines",
    updated: "Last updated: August 15, 2026",
    intro: "KindredCube exists to help adults build genuine, respectful, and meaningful relationships. These guidelines apply to profiles, photos, prompts, messages, photo comments, voice notes, Ready to Meet, Global Connect, verification, reports, support tickets, and in-person meetups.",
    sections: [
      ["Our Community Commitment", "Our community is built on respect, authenticity, safety, and accountability. Every user is responsible for helping create an environment where people can connect without fear of harassment, deception, exploitation, or abuse."],
      ["Be Authentic", "Use truthful profile information, your real age, your own identity, and photos that accurately represent you. Do not impersonate another person, use someone else's photos, use deceptive AI-generated images, misrepresent relationship status, or create duplicate accounts to bypass reports, blocks, bans, verification, safety restrictions, or payment rules."],
      ["Respect Other Users", "Treat every member with dignity and respect. No insults, humiliation, threats, intimidation, self-harm encouragement, hate speech, bullying, harassment, stalking, coercion, manipulation, or persistent unwanted contact. If someone says no, stops replying, blocks you, declines a meeting, or expresses discomfort, respect that immediately."],
      ["Zero Tolerance for Exploitation", "Child exploitation, grooming, human trafficking, sexual exploitation, prostitution, solicitation, blackmail, extortion, non-consensual intimate images, physical threats, terrorist content, and promotion of violent crime are strictly prohibited and may be reported to authorities where required by law."],
      ["No Fraud or Scams", "KindredCube is for genuine relationships, not financial exploitation. Do not ask for money, cryptocurrency, gift cards, bank details, passwords, verification codes, private documents, investments, or fake emergency assistance. Romance scams, phishing, malware, pyramid schemes, deceptive links, and payment manipulation are prohibited."],
      ["Sexual Content and Consent", "Do not send unsolicited explicit content, pornography, sexual images, sexual harassment, or messages that pressure another user into sexual activity. Consensual adult romantic conversation is permitted only when respectful and compliant with app rules."],
      ["Profiles, Photos, Prompts, and Media", "Profile photos should clearly and accurately represent you. Prompts, bio text, photo comments, videos, voice notes, and other media must be truthful, respectful, lawful, and safe. KindredCube may remove content that violates these Guidelines."],
      ["Messaging Rules", "Messaging should help people build genuine connections. Do not spam users, send repeated unwanted messages, threaten users, manipulate users emotionally, pressure someone to meet, or attempt to circumvent blocks."],
      ["Ready to Meet", "Ready to Meet is for voluntary, respectful, public in-person meetings. Do not misrepresent availability, stalk users, attempt to discover exact location, pressure someone into meeting, or use the feature for unsafe or deceptive purposes."],
      ["Global Connect", "Do not use Global Connect to evade restrictions, misrepresent relocation intentions, mislead users about immigration opportunities, conduct recruitment scams, or exploit cultural or language differences for fraud."],
      ["Verification and Duplicate Account Prevention", "Users participating in Stripe ID verification, selfie verification, or other checks must submit their own information honestly. Do not manipulate verification photos, use another person's identity, submit fraudulent documents, use AI-generated identity images, or bypass duplicate-account detection."],
      ["Post-Meet Safety Feedback", "Post-meet feedback must be honest. Do not submit false reports, coordinate false reports, retaliate through the feedback system, or attempt to manipulate another person's safety standing."],
      ["Reporting, Blocking, and Support", "Users may report, block, or contact support. Reports and support tickets must be truthful and should not be used to harass staff, threaten users, submit knowingly false claims, or abuse the support process."],
      ["Paid Features Do Not Override Safety Rules", "Wallet, KindredPass, Premium, Ready to Meet access, Liked You reveals, Super Likes, and photo comments do not give users permission to violate these Guidelines. Paid access may be restricted, suspended, or revoked where needed to protect users."],
      ["Enforcement", "KindredCube may remove content, issue warnings, require additional verification, restrict features, reduce visibility, suspend accounts, permanently terminate accounts, preserve evidence, or cooperate with lawful investigations."],
      ["Appeals", "If you believe your account or content was restricted in error, you may submit an appeal through KindredCube Support. Appeals are reviewed individually but do not guarantee restoration."],
      ["Contact Support", "If you need help or want to report a concern, contact support through the app or email support@kindredcube.com."],
    ],
  },
};

type RenderedLegalBlock =
  | { type: "heading"; text: string }
  | { type: "subheading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; text: string };

function legalBodyToBlocks(body: string): RenderedLegalBlock[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("### ")) return { type: "subheading", text: line.replace(/^###\s+/, "") } as const;
      if (line.startsWith("## ")) return { type: "heading", text: line.replace(/^##\s+/, "") } as const;
      if (/^\d+\.\s+\S/.test(line)) return { type: "heading", text: line } as const;
      if (/^[-*]\s+/.test(line)) return { type: "bullet", text: line.replace(/^[-*]\s+/, "") } as const;
      return { type: "paragraph", text: line } as const;
    });
}

function fallbackLegalToBlocks(page: (typeof legalPages)[keyof typeof legalPages]): RenderedLegalBlock[] {
  return [
    { type: "paragraph", text: page.intro },
    ...page.sections.flatMap(([heading, body]) => [
      { type: "heading", text: heading } as const,
      { type: "paragraph", text: body } as const,
    ]),
  ];
}

function WebsiteHeader({ compact, right }: { compact: boolean; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", maxWidth: 1320, width: "100%", alignSelf: "center" }}>
      <Pressable accessibilityRole="link" onPress={() => { window.location.href = "/"; }}>
        <Logo compact={compact} />
      </Pressable>
      {right}
    </View>
  );
}

function AboutPage() {
  const { width } = useWindowDimensions();
  const compact = width < 820;

  useEffect(() => {
    setDocumentSeo(
      "About KindredCube - Redefining Online Dating Through Compatibility",
      "About KindredCube: an online dating platform redefining dating through values-based compatibility, personality, culture-aware discovery, interracial dating, and safer real-world connection."
    );
  }, []);

  const Section = ({ eyebrow, title, body, image, reverse = false }: { eyebrow: string; title: string; body: string[]; image?: any; reverse?: boolean }) => (
    <View style={{ flexDirection: compact ? "column" : reverse ? "row-reverse" : "row", alignItems: "center", gap: compact ? 24 : 58, marginVertical: compact ? 28 : 52 }}>
      {image ? (
        <Image source={image} resizeMode="cover" style={{ width: compact ? "100%" : "46%", height: compact ? 300 : 420, borderRadius: 34, boxShadow: "0 28px 78px rgba(17,27,61,.18)" } as any} />
      ) : null}
      <View style={{ flex: 1, gap: 12 }}>
        <Text style={{ color: "#B04B33", fontSize: 13, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" }}>{eyebrow}</Text>
        <Text selectable style={{ color: C.navy, fontSize: compact ? 35 : 54, lineHeight: compact ? 39 : 58, fontWeight: "900", letterSpacing: -2 }}>{title}</Text>
        {body.map((line) => (
          <Text key={line} selectable style={{ color: "rgba(23,30,65,.74)", fontSize: compact ? 16 : 18, lineHeight: compact ? 25 : 30 }}>{line}</Text>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, height: "100vh", minHeight: "100vh", backgroundColor: C.cream, overflow: "hidden" } as any}>
      <View style={{ paddingHorizontal: compact ? 18 : 42, paddingTop: compact ? 7 : 18, paddingBottom: compact ? 10 : 14, backgroundColor: "rgba(255,249,237,.96)", boxShadow: "0 14px 34px rgba(17,27,61,.10)", zIndex: 10 } as any}>
        <WebsiteHeader compact={compact} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: compact ? 18 : 42, paddingTop: compact ? 18 : 30, paddingBottom: 70 }}>
        <View style={{ maxWidth: 1240, width: "100%", alignSelf: "center" }}>
          <Section
            eyebrow="About KindredCube"
            title="Online dating built around deep compatibility."
            body={[
              "KindredCube is redefining dating by helping adults connect through shared values, personality, culture, relationship intention, and safer real-world discovery.",
              "The dating market is flooded with apps that often reward fast swipes and shallow algorithms. KindredCube is being built for people who want a real Kindred: someone who fits more than a photo.",
            ]}
            image={require("./assets/about/about-hero-connection.png")}
            reverse
          />
          <Section
            eyebrow="A different kind of dating platform"
            title="Redefining the rules of dating platforms"
            body={[
              "KindredCube is designed around the life people actually want to build. Our approach gives weight to relationship goals, culture, lifestyle, shared values, faith or spirituality, communication style, and real-world readiness.",
              "It is not just about who is nearby. It is about who may genuinely understand your rhythm, your background, and the way you move through the world.",
            ]}
            image={require("./assets/about/about-lifestyle-collage.png")}
          />
          <Section
            eyebrow="Compatibility beyond hobbies"
            title="Matching by what actually matters"
            body={[
              "Shared interests can start a conversation, but lasting connection usually needs something deeper. KindredCube looks at high-impact compatibility signals like values, religion, children and family goals, lifestyle habits, relationship intention, ethics, ambition, and personality.",
              "That means people can discover compatibility that feels more intentional than a simple nearby match.",
            ]}
            image={require("./assets/about/about-compatibility-phone.png")}
            reverse
          />
          <Section
            eyebrow="Safety and real-world trust"
            title="Built for meaningful connection with accountability"
            body={[
              "KindredCube includes verification, reporting, blocking, Ready to Meet availability, post-meet safety feedback, and moderation tools.",
              "These features are designed to support a community where people can connect with more confidence and accountability.",
            ]}
            image={require("./assets/about/about-safe-meeting.png")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function LegalPage({ slug, page }: { slug?: LegalContentPage["slug"]; page: (typeof legalPages)[keyof typeof legalPages] }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [serverPage, setServerPage] = useState<LegalContentPage | null>(null);
  const [loadingLegal, setLoadingLegal] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingLegal(true);
    if (!slug) {
      setServerPage(null);
      setLoadingLegal(false);
      return () => { cancelled = true; };
    }
    getLegalContentPage(slug)
      .then((result) => {
        if (!cancelled) setServerPage(result.page);
      })
      .catch(() => {
        if (!cancelled) setServerPage(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingLegal(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const displayTitle = serverPage?.title || page.title;
  const displayUpdated = serverPage?.updatedAt
    ? `Last updated: ${new Date(serverPage.updatedAt).toLocaleDateString()}`
    : page.updated;
  const displaySummary = serverPage?.summary || "";
  const blocks = serverPage?.body ? legalBodyToBlocks(serverPage.body) : fallbackLegalToBlocks(page);
  const images = serverPage?.imageUrls || [];

  useEffect(() => {
    setDocumentSeo(`${displayTitle} | KindredCube`, displaySummary || page.intro);
  }, [displayTitle, displaySummary, page.intro]);

  return (
    <View style={{ flex: 1, height: "100vh", minHeight: "100vh", backgroundColor: C.cream, overflow: "hidden" } as any}>
      <View style={{ paddingHorizontal: compact ? 18 : 42, paddingTop: compact ? 7 : 18, paddingBottom: compact ? 10 : 14, backgroundColor: "rgba(255,249,237,.96)", boxShadow: "0 14px 34px rgba(17,27,61,.10)", zIndex: 10 } as any}>
        <WebsiteHeader compact={compact} />
      </View>
      <View style={{ flex: 1, minHeight: 0, paddingHorizontal: compact ? 12 : 42, paddingTop: compact ? 12 : 18, paddingBottom: compact ? 14 : 24, overflow: "hidden" } as any}>
        <View style={{ maxWidth: 980, width: "100%", height: "100%", alignSelf: "center", overflow: "hidden" } as any}>
          <View style={{ flex: 1, minHeight: 0, backgroundColor: C.paper, borderRadius: compact ? 22 : 30, borderWidth: 1, borderColor: C.line, boxShadow: "0 20px 60px rgba(17,27,61,.09)", overflow: "hidden" } as any}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: compact ? 20 : 34, gap: 18, paddingBottom: compact ? 34 : 52 }}>
              <View style={{ gap: 8 }}>
                <Text selectable style={{ color: C.ink, fontSize: compact ? 34 : 48, lineHeight: compact ? 40 : 54, fontWeight: "900", letterSpacing: -1.5 }}>
                  {displayTitle}
                </Text>
                <Text selectable style={{ color: C.muted, fontSize: 13, fontWeight: "800" }}>{displayUpdated}</Text>
                {displaySummary ? <Text selectable style={{ color: C.ink, fontSize: 16, lineHeight: 25 }}>{displaySummary}</Text> : null}
                {loadingLegal ? <Text selectable style={{ color: C.muted, fontSize: 13 }}>Loading the latest saved page...</Text> : null}
              </View>
              {blocks.map((block, index) => {
                if (block.type === "heading") {
                  return <Text key={`${block.type}-${index}`} selectable style={{ color: C.ink, fontSize: compact ? 24 : 28, lineHeight: compact ? 30 : 34, fontWeight: "900", marginTop: index ? 12 : 0 }}>{block.text}</Text>;
                }
                if (block.type === "subheading") {
                  return <Text key={`${block.type}-${index}`} selectable style={{ color: C.ink, fontSize: 19, lineHeight: 26, fontWeight: "900" }}>{block.text}</Text>;
                }
                if (block.type === "bullet") {
                  return <Text key={`${block.type}-${index}`} selectable style={{ color: C.muted, fontSize: 15, lineHeight: 24 }}>{"\u2022 "}{block.text}</Text>;
                }
                return <Text key={`${block.type}-${index}`} selectable style={{ color: C.muted, fontSize: 15, lineHeight: 24 }}>{block.text}</Text>;
              })}
              {images.map((url) => (
                <Image key={url} source={{ uri: url }} resizeMode="cover" style={{ width: "100%", height: compact ? 220 : 360, borderRadius: 22, backgroundColor: C.sky }} />
              ))}
              <Pressable accessibilityRole="link" onPress={() => { window.location.href = "/"; }} style={{ alignSelf: "flex-start", minHeight: 42, borderRadius: 21, backgroundColor: C.navy, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontWeight: "900" }}>Back to home</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const browserPath = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") || "/" : "/";
  if (browserPath === "/tectavis") return <AdminPortal />;
  if (browserPath === "/privacy-policy") return <LegalPage slug="privacy" page={legalPages["/privacy"]} />;
  if (browserPath === "/about") return <AboutPage />;
  if (browserPath in legalPages) {
    const slug = browserPath.replace(/^\//, "") as LegalContentPage["slug"];
    return <LegalPage slug={slug} page={legalPages[browserPath as keyof typeof legalPages]} />;
  }
  return <MainWebApp />;
}

