import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import * as argon2 from "argon2";

const BLOCKED_PASSWORDS = new Set([
  "passwordpassword",
  "password123456",
  "123456789012345",
  "qwertyuiopasdfgh",
  "letmeinletmein",
  "kindredcubepassword",
]);

@Injectable()
export class PasswordService {
  private readonly pepper: string;
  private readonly dummyHashPromise: Promise<string>;

  constructor() {
    this.pepper = process.env.PASSWORD_PEPPER || "";
    if (this.pepper.length < 32) throw new Error("PASSWORD_PEPPER must be at least 32 characters");
    this.dummyHashPromise = this.hash("kindredcube-dummy-credential-never-used");
  }

  validatePolicy(password: string, context: { email: string; username: string }) {
    if (password.length < 10 || password.length > 128) {
      throw new BadRequestException("Use a password between 10 and 128 characters.");
    }
    const normalized = password.normalize("NFC");
    if (!/\p{Lu}/u.test(normalized)) {
      throw new BadRequestException("Include at least one capital letter.");
    }
    const specialCharacterCount = normalized.match(/[^\p{L}\p{N}\s]/gu)?.length ?? 0;
    if (specialCharacterCount < 2) {
      throw new BadRequestException("Include at least two special characters.");
    }
    const lowered = normalized.toLocaleLowerCase("en-US");
    const emailName = context.email.split("@")[0]?.toLocaleLowerCase("en-US") || "";
    if (
      BLOCKED_PASSWORDS.has(lowered) ||
      lowered.includes("kindredcube") ||
      lowered.includes(context.username.toLocaleLowerCase("en-US")) ||
      (emailName.length >= 3 && lowered.includes(emailName))
    ) {
      throw new BadRequestException("Choose a less predictable password that is not based on your account details.");
    }
  }

  async hash(password: string) {
    const protectedPassword = this.pepperPassword(password);
    return argon2.hash(protectedPassword, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
  }

  async verify(hash: string, password: string) {
    return argon2.verify(hash, this.pepperPassword(password));
  }

  getDummyHash() {
    return this.dummyHashPromise;
  }

  private pepperPassword(password: string) {
    return createHmac("sha256", this.pepper)
      .update(Buffer.from(password.normalize("NFC"), "utf8"))
      .digest("base64");
  }
}
