import { BadRequestException } from "@nestjs/common";
import { beforeAll, describe, expect, it } from "vitest";
import { PasswordService } from "../src/auth/password.service";

describe("PasswordService", () => {
  let service: PasswordService;

  beforeAll(() => {
    process.env.PASSWORD_PEPPER = "test-password-pepper-with-at-least-32-characters";
    service = new PasswordService();
  });

  it("stores an Argon2id PHC hash and never the plaintext", async () => {
    const password = "a long unique passphrase for testing";
    const hash = await service.hash(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(password);
    await expect(service.verify(hash, password)).resolves.toBe(true);
    await expect(service.verify(hash, "a different long password")).resolves.toBe(false);
  }, 15_000);

  it("rejects short and account-derived passwords", () => {
    expect(() =>
      service.validatePolicy("short password", {
        email: "alex@example.com",
        username: "alexmorgan",
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.validatePolicy("Alexmorgan has a very long password!!", {
        email: "alex@example.com",
        username: "alexmorgan",
      }),
    ).toThrow(BadRequestException);
  });

  it("requires a capital letter and two special characters", () => {
    const context = { email: "alex@example.com", username: "alexmorgan" };

    expect(() => service.validatePolicy("lowercase!!", context)).toThrow(
      "Include at least one capital letter.",
    );
    expect(() => service.validatePolicy("Capital123!", context)).toThrow(
      "Include at least two special characters.",
    );
    expect(() => service.validatePolicy("SecurePass!!", context)).not.toThrow();
  });
});
