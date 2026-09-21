import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * The archive's outgoing mail, and the only place that talks to a mail server.
 *
 * Sent from the Center's own Gmail account (decision of 21.09.2026): no domain
 * is connected yet, and a mail service that needs one would have waited on it.
 * Gmail takes an App Password over SMTP and allows about five hundred messages
 * a day, which is far beyond what the archive sends.
 *
 * ── it never throws ─────────────────────────────────────────────────────────
 *
 * A message is a courtesy on top of something that has already happened — a
 * submission saved, a record published. A mail server that is down must not
 * turn either of those into an error the contributor or the Moderator sees, so
 * every failure is logged and reported as `false`, and the caller carries on.
 *
 * ── off until it is configured ──────────────────────────────────────────────
 *
 * Without both variables nothing is sent and nothing fails. That is the state
 * of every environment until the App Password is created, and it is why local
 * development and the tests never reach Gmail.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | null = null;

export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function transporter(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER!.trim(),
        // Google shows the App Password in four groups of four; the spaces are
        // not part of it.
        pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ''),
      },
    });
  }
  return transport;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) return false;

  try {
    await transporter().sendMail({
      from: { name: 'IJHC Heritage Archive', address: process.env.GMAIL_USER!.trim() },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (error) {
    // The address is not logged: the log is read by more people than the
    // review screens are.
    console.error('[mail] not sent:', mail.subject, (error as Error)?.message ?? error);
    return false;
  }
}
