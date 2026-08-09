const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

function isUsableIpv4(address) {
  if (!address || address.internal || address.family !== "IPv4") return false;
  const ip = address.address;
  return Boolean(ip) &&
    ip !== "127.0.0.1" &&
    !ip.startsWith("169.254.") &&
    !ip.startsWith("0.");
}

function scoreCandidate(candidate) {
  const name = candidate.name.toLowerCase();
  const ip = candidate.ip;
  let score = 0;
  if (name.includes("wi-fi") || name.includes("wifi") || name.includes("wireless")) score += 50;
  if (name.includes("ethernet")) score += 35;
  if (name.includes("hotspot")) score += 25;
  if (ip.startsWith("192.168.")) score += 30;
  if (ip.startsWith("10.")) score += 20;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) score += 10;
  if (name.includes("wsl") || name.includes("docker") || name.includes("virtual") || name.includes("vmware") || name.includes("hyper-v") || name.includes("vEthernet".toLowerCase())) score -= 100;
  return score;
}

function currentLanIp() {
  if (process.env.KINDREDCUBE_LAN_IP) return process.env.KINDREDCUBE_LAN_IP.trim();
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (isUsableIpv4(address)) candidates.push({ name, ip: address.address });
    }
  }
  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  return candidates[0]?.ip;
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function upsertEnvValue(content, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const next = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  return `${next}${line}\n`;
}

function writeEnv(filePath, updates) {
  let content = readEnv(filePath);
  for (const [key, value] of Object.entries(updates)) {
    content = upsertEnvValue(content, key, value);
  }
  fs.writeFileSync(filePath, content, "utf8");
}

const ip = currentLanIp();
if (!ip) {
  console.error("Could not find a usable LAN IP address. Connect to Wi-Fi/hotspot, or set KINDREDCUBE_LAN_IP manually.");
  process.exit(1);
}

const apiUrl = `http://${ip}:3001`;
const expoDeepLink = `exp://${ip}:8081/--/verify-email`;
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  `http://${ip}:3000`,
  `http://${ip}:8081`,
].join(",");

writeEnv(path.join(rootDir, ".env"), {
  EXPO_PUBLIC_API_URL: apiUrl,
});

writeEnv(path.join(rootDir, "api", ".env"), {
  PUBLIC_API_URL: apiUrl,
  APP_DEEP_LINK: expoDeepLink,
  ALLOWED_ORIGINS: allowedOrigins,
});

console.log(`KindredCube local network is set to ${ip}`);
console.log(`Mobile app API: ${apiUrl}`);
