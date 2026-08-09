import React, { useEffect, useMemo, useState } from "react";
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
  resendVerificationEmail,
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

function Landing({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  const { width, height } = useWindowDimensions();
  const [cardIndex, setCardIndex] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const compact = width < 760;
  const short = height < 720;
  const visualHeight = compact
    ? Math.max(190, Math.min(short ? 250 : 320, height * (short ? 0.34 : 0.38)))
    : Math.max(330, Math.min(590, height - 190));
  const cardHeight = visualHeight * 0.9;
  const cardWidth = Math.min(compact ? width * 0.7 : 390, cardHeight * 0.76);
  const heartSize = short ? 50 : 72;
  const headingSize = compact
    ? Math.max(30, Math.min(short ? 38 : 48, width * 0.12))
    : Math.max(48, Math.min(76, height * 0.085));
  const frontProfile = previewProfiles[cardIndex];
  const nextProfile = previewProfiles[(cardIndex + 1) % previewProfiles.length];
  const swipeRight = () => {
    if (swiping) return;
    setSwiping(true);
    window.setTimeout(() => {
      setCardIndex((current) => (current + 1) % previewProfiles.length);
      setSwiping(false);
    }, 560);
  };
  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(swipeRight, 3200);
    return () => window.clearInterval(timer);
  }, [swiping]);
  return (
    <ScrollView scrollEnabled={false} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: C.cream }} contentContainerStyle={{ height: "100vh" as any, paddingHorizontal: compact ? 16 : 42, paddingVertical: compact ? 12 : 18, gap: compact ? 10 : 18, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", maxWidth: 1320, width: "100%", alignSelf: "center" }}>
        <Logo compact={compact} />
        <Pressable onPress={onLogin} style={({ hovered, pressed }: any) => ({ minHeight: 46, paddingHorizontal: compact ? 16 : 21, borderRadius: 15, backgroundColor: hovered ? C.sky : C.paper, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? .98 : 1 }] })}><Text style={{ color: C.navy, fontWeight: "800" }}>Sign in</Text></Pressable>
      </View>
      <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 1320, alignSelf: "center", flexDirection: compact ? "column" : "row", alignItems: "center", justifyContent: "center", gap: compact ? 10 : 54 }}>
        <View style={{ width: compact ? "100%" : 520, height: visualHeight, position: "relative", flexShrink: 1, transform: [{ translateX: compact ? 14 : 42 }] }}>
          <View style={{ position: "absolute", top: visualHeight * .04, left: compact ? width * .04 : 18, width: cardWidth, height: cardHeight, borderRadius: short ? 24 : 34, overflow: "hidden", opacity: swiping ? 1 : .68, transform: [{ translateX: swiping ? 0 : -cardWidth * .58 }, { rotate: swiping ? "-4deg" : "-11deg" }, { scale: swiping ? 1.02 : .9 }], boxShadow: "0 26px 70px rgba(17,27,61,.25)", transitionProperty: "transform, opacity", transitionDuration: "560ms", transitionTimingFunction: "cubic-bezier(.2,.75,.2,1)" } as any}><Image source={nextProfile.photo} resizeMode="cover" style={{ width: "100%", height: "100%" }} /></View>
          <View style={{ position: "absolute", top: 0, left: compact ? width * .04 : 18, width: cardWidth, height: cardHeight * 1.03, borderRadius: short ? 24 : 34, overflow: "hidden", opacity: swiping ? 0 : 1, transform: [{ translateX: swiping ? cardWidth * 1.25 : 0 }, { rotate: swiping ? "13deg" : "-4deg" }, { scale: swiping ? .94 : 1 }], boxShadow: "0 30px 76px rgba(17,27,61,.28)", transitionProperty: "transform, opacity", transitionDuration: "560ms", transitionTimingFunction: "cubic-bezier(.25,.7,.2,1)" } as any}><Image source={frontProfile.photo} resizeMode="cover" style={{ width: "100%", height: "100%" }} /><View style={{ position: "absolute", left: short ? 10 : 18, right: short ? 10 : 18, bottom: short ? 10 : 18, borderRadius: short ? 14 : 20, padding: short ? 10 : 16, backgroundColor: "rgba(255,255,255,.86)", gap: short ? 2 : 5 } as any}><Text style={{ color: C.ink, fontSize: short ? 16 : 22, fontWeight: "900" }}>{frontProfile.name}, {frontProfile.age}</Text><Text numberOfLines={1} style={{ color: C.muted, fontSize: short ? 11 : 14 }}>{frontProfile.role} · {frontProfile.culture}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Like this profile and show the next person" onPress={swipeRight} style={({ pressed }: any) => ({ position: "absolute", zIndex: 20, left: (compact ? width * .04 : 18) + cardWidth - heartSize * .78, top: cardHeight * .77, width: heartSize, height: heartSize, borderRadius: heartSize / 2, backgroundColor: C.coral, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? .9 : 1 }], boxShadow: "0 18px 30px rgba(242,77,103,.3)" }) as any}><Heart size={short ? 22 : 31} color="white" fill="white" /></Pressable>
        </View>
        <View style={{ flex: compact ? 0 : 1, width: "100%", maxWidth: 620, gap: short ? 10 : 18 }}>
          <Text selectable style={{ color: C.ink, fontSize: headingSize, lineHeight: headingSize * .99, fontWeight: "900", letterSpacing: compact ? -1.7 : -3.5 }}>Meet the right person that feels like <Text style={{ color: C.blue }}>home.</Text></Text>
          <Text selectable style={{ color: C.muted, fontSize: compact ? (short ? 14 : 16) : 19, lineHeight: compact ? (short ? 20 : 24) : 28, maxWidth: 550 }}>KindredCube finds your Kindred—a person who shares your values and personality.</Text>
          <View style={{ flexDirection: compact ? "column" : "row", gap: short ? 7 : 12, alignItems: compact ? "stretch" : "center" }}><PrimaryButton label="Start connecting" onPress={onRegister} />{height >= 650 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}><ShieldCheck size={18} color="#317D60" /><Text style={{ color: C.muted, fontSize: compact ? 12 : 14, fontWeight: "700" }}>18+ · privacy-first · verified profiles</Text></View> : null}</View>
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
    try { const result = await likeMemberProfile(profile.id, "explore"); setNotice(result.matched ? `It’s a match with ${profile.name}!` : `${profile.name} has been added to your connections.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not send your connection."); }
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#F7F9FE" }}>
      {!mobile ? <View style={{ width: 248, padding: 22, backgroundColor: C.paper, borderRightWidth: 1, borderRightColor: C.line, gap: 28 }}><Logo compact /><View style={{ gap: 6 }}><NavItem label="Discover" icon={Compass} active /><NavItem label="Matches" icon={Heart} /><NavItem label="Messages" icon={MessageCircle} /><NavItem label="My profile" icon={UserRound} /></View><View style={{ marginTop: "auto", gap: 10 }}><View style={{ padding: 15, borderRadius: 18, backgroundColor: "#FFF4CD", gap: 6 }}><Sparkles size={20} color="#A46200" /><Text style={{ color: C.ink, fontWeight: "900" }}>Kindred insight</Text><Text style={{ color: C.muted, fontSize: 12, lineHeight: 17 }}>Complete one more interest to sharpen today’s recommendations.</Text></View><Pressable onPress={onLogout} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}><LogOut size={18} color={C.muted} /><Text style={{ color: C.muted, fontWeight: "800" }}>Sign out</Text></Pressable></View></View> : null}
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }} contentContainerStyle={{ padding: mobile ? 16 : 30, gap: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          {mobile ? <Logo compact /> : <View style={{ gap: 3 }}><Text selectable style={{ color: C.ink, fontSize: 28, fontWeight: "900", letterSpacing: -1 }}>Good evening, {user.firstName}</Text><Text selectable style={{ color: C.muted }}>People chosen for the way you connect.</Text></View>}
          <View style={{ flexDirection: "row", gap: 8 }}><Pressable accessibilityLabel="Search" style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }}><Search size={20} color={C.navy} /></Pressable><Pressable accessibilityLabel="Notifications" style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }}><Bell size={20} color={C.navy} /></Pressable></View>
        </View>
        {mobile ? <View style={{ gap: 3 }}><Text selectable style={{ color: C.ink, fontSize: 27, fontWeight: "900", letterSpacing: -1 }}>Hello, {user.firstName}</Text><Text selectable style={{ color: C.muted }}>Your kindred picks for today.</Text></View> : null}
        <View style={{ minHeight: 106, borderRadius: 24, padding: 20, backgroundColor: C.navy, flexDirection: mobile ? "column" : "row", alignItems: mobile ? "flex-start" : "center", justifyContent: "space-between", gap: 14, overflow: "hidden" }}>
          <View style={{ gap: 6, maxWidth: 560 }}><Text style={{ color: C.yellow, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }}>YOUR KINDRED SIGNAL</Text><Text selectable style={{ color: "white", fontSize: 20, fontWeight: "900" }}>Curiosity + grounded ambition</Text><Text selectable style={{ color: "rgba(255,255,255,.68)", lineHeight: 20 }}>Today’s recommendations prioritize meaningful conversation and shared pace.</Text></View>
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

export default function App() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const logout = () => logoutAccount().finally(() => setUser(null));
  return (
    <View style={{ flex: 1, minHeight: "100vh" } as any}>
      <StatusBar style="dark" />
      {user ? <Dashboard user={user} onLogout={logout} /> : <Landing onRegister={() => { setAuthMode("register"); setAuthOpen(true); }} onLogin={() => { setAuthMode("login"); setAuthOpen(true); }} />}
      {authOpen && !user ? <AuthPanel key={authMode} initialMode={authMode} onComplete={(next) => { setUser(next); setAuthOpen(false); }} onClose={() => setAuthOpen(false)} /> : null}
    </View>
  );
}
