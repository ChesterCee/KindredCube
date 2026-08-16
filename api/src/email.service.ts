import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

@Injectable()
export class EmailService {
  private readonly resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

  private verificationSender() {
    return process.env.RESEND_FROM;
  }

  private noReplySender() {
    return process.env.RESEND_NO_REPLY_FROM || "KindredCube <no-reply@kindredcube.com>";
  }

  private supportSender() {
    return process.env.RESEND_SUPPORT_FROM || "KindredCube Support <support@kindredcube.com>";
  }

  async sendVerification(email: string, firstName: string, token: string) {
    const apiUrl = process.env.PUBLIC_API_URL;
    const from = this.verificationSender();
    if (!apiUrl) throw new Error("PUBLIC_API_URL is required");
    const verificationUrl = `${apiUrl.replace(/\/$/, "")}/v1/auth/verify-email?token=${encodeURIComponent(token)}`;
    if (!this.resend || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("RESEND_API_KEY and RESEND_FROM are required in production");
      }
      return { sent: false, developmentVerificationUrl: verificationUrl };
    }
    const result = await this.resend.emails.send({
      from,
      to: email,
      subject: "Confirm your KindredCube email",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#221f1b">
        <h1>Welcome to KindredCube, ${escapeHtml(firstName)}</h1>
        <p>Confirm your email address to activate your account.</p>
        <p><a href="${verificationUrl}" style="display:inline-block;padding:14px 22px;border-radius:24px;background:#221f1b;color:#fff;text-decoration:none;font-weight:700">Confirm my email</a></p>
        <p>This private, one-time link expires in 30 minutes. If you did not create this account, you can ignore this email.</p>
      </div>`,
    });
    const deliveryError = getResendError(result);
    if (deliveryError) {
      if (process.env.NODE_ENV === "production") throw new Error(deliveryError);
      return { sent: false, developmentVerificationUrl: verificationUrl, deliveryError };
    }
    return { sent: true as const };
  }

  async sendPasswordReset(email: string, firstName: string, token: string) {
    const apiUrl = process.env.PUBLIC_API_URL;
    const from = this.noReplySender();
    if (!apiUrl) throw new Error("PUBLIC_API_URL is required");
    const resetUrl = `${apiUrl.replace(/\/$/, "")}/v1/auth/reset-password?token=${encodeURIComponent(token)}`;
    if (!this.resend || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("RESEND_API_KEY and RESEND_NO_REPLY_FROM are required in production");
      }
      return { sent: false, developmentResetUrl: resetUrl };
    }
    const result = await this.resend.emails.send({
      from,
      to: email,
      subject: "Reset your KindredCube password",
      text: `Hi ${firstName}, use this private KindredCube password reset link within 30 minutes: ${resetUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#221f1b">
        <h1>Reset your password, ${escapeHtml(firstName)}</h1>
        <p>Use the secure button below to choose a new KindredCube password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:14px 22px;border-radius:24px;background:#221f1b;color:#fff;text-decoration:none;font-weight:700">Choose a new password</a></p>
        <p>This private, one-time link expires in 30 minutes. If you did not request it, you can safely ignore this email.</p>
      </div>`,
    });
    const deliveryError = getResendError(result);
    if (deliveryError) {
      if (process.env.NODE_ENV === "production") throw new Error(deliveryError);
      return { sent: false, developmentResetUrl: resetUrl, deliveryError };
    }
    return { sent: true as const };
  }

  async sendAdminMfaCode(email: string, code: string) {
    const from = this.noReplySender();
    if (!this.resend || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("RESEND_API_KEY and RESEND_FROM are required in production");
      }
      return { sent: false, developmentCode: code };
    }
    const result = await this.resend.emails.send({
      from,
      to: email,
      subject: "Your KindredCube admin verification code",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#221f1b">
        <h1>KindredCube admin verification</h1>
        <p>Use this code to open the moderation dashboard:</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:6px">${escapeHtml(code)}</p>
        <p>This code expires in 10 minutes. If you did not request it, change your password and review active sessions.</p>
      </div>`,
    });
    const deliveryError = getResendError(result);
    if (deliveryError) {
      if (process.env.NODE_ENV === "production") throw new Error(deliveryError);
      return { sent: false, developmentCode: code, deliveryError };
    }
    return { sent: true as const };
  }

  async sendSupportTicketReply(input: {
    to: string;
    ticketNumber: string;
    replyToken?: string | null;
    message: string;
  }) {
    const from = this.supportSender();
    const ticketNumber = input.ticketNumber.trim();
    const replyToken = input.replyToken?.trim();
    const replyToAddress = replyToken
      ? `support+${ticketNumber.toLowerCase()}.${replyToken}@kindredcube.com`
      : "support@kindredcube.com";
    const subject = `Re: KindredCube Support ${ticketNumber}`;
    const text = [
      input.message.trim(),
      "",
      `Ticket: ${ticketNumber}`,
      "Reply to this email to add a message to the same support ticket.",
    ].join("\n");

    if (!this.resend || !from) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("RESEND_API_KEY and RESEND_SUPPORT_FROM are required in production");
      }
      return { sent: false, developmentSubject: subject, developmentText: text };
    }

    const result = await this.resend.emails.send({
      from,
      to: input.to,
      replyTo: replyToAddress,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#221f1b">
        <p>${escapeHtml(input.message.trim()).replace(/\n/g, "<br>")}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#666;font-size:13px">Ticket: <strong>${escapeHtml(ticketNumber)}</strong></p>
        <p style="color:#666;font-size:13px">Reply to this email to add a message to the same support ticket.</p>
      </div>`,
    });
    const deliveryError = getResendError(result);
    if (deliveryError) {
      if (process.env.NODE_ENV === "production") throw new Error(deliveryError);
      return { sent: false, developmentSubject: subject, developmentText: text, deliveryError };
    }
    return { sent: true as const };
  }
}

function getResendError(result: unknown) {
  if (!result || typeof result !== "object" || !("error" in result)) return "";
  const error = (result as { error?: unknown }).error;
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Resend rejected the email delivery request.";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}
