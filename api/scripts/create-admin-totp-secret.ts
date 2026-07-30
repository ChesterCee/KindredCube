import { randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const email = process.argv[2] || "admin@example.com";
const issuer = process.argv[3] || "KindredCube";
const secret = toBase32(randomBytes(20));
const label = `${issuer}:${email}`;
const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log(`Authenticator setup URL=${otpauth}`);

function toBase32(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[Number.parseInt(chunk, 2)];
  }
  return output;
}
