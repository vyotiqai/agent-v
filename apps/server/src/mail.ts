import nodemailer from "nodemailer";
import type { Config } from "./config.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** A button: its label and the link it opens. */
  action?: { label: string; url: string };
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Mail actually reaches people (not just the server log). */
  readonly delivers: boolean;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** A plain, accessible HTML version of the message. */
export function renderHtml(message: MailMessage) {
  const paragraphs = message.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = message.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(message.action.url)}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;display:inline-block">${escapeHtml(message.action.label)}</a></p><p style="margin:0 0 16px;color:#71717a;font-size:13px">Or open this link: ${escapeHtml(message.action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:520px;margin:0 auto;padding:24px;line-height:1.5">${paragraphs}${button}</body></html>`;
}

const plainText = (message: MailMessage) =>
  message.action
    ? `${message.text}\n\n${message.action.label}: ${message.action.url}`
    : message.text;

/** SMTP when configured; otherwise messages go to the server log so development still works. */
export function createMailer(config: Config): Mailer {
  const { smtpUrl, from } = config.email;
  if (!smtpUrl)
    return {
      delivers: false,
      async send(message) {
        console.info(
          `[mail] (not sent: SMTP_URL is not set) to ${message.to}: ${message.subject}\n${plainText(message)}`,
        );
      },
    };
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    delivers: true,
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: plainText(message),
        html: renderHtml(message),
      });
    },
  };
}
