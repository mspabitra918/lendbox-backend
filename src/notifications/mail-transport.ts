import * as nodemailer from 'nodemailer';
import type { AppConfig } from '../config/configuration';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  send(mail: OutgoingMail): Promise<{ messageId: string }>;
}

/**
 * `smtp` sends via Nodemailer SMTP. `json` renders the message but sends nothing
 * (development/test only — refused in production by config validation).
 */
export function createMailTransport(config: AppConfig): MailTransport {
  const transporter: nodemailer.Transporter =
    config.mail.transport === 'json'
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host: config.mail.host,
          port: config.mail.port,
          secure: config.mail.secure,
          auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
          requireTLS: !config.mail.secure && config.isProduction,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        });
  return {
    async send(mail) {
      const info = await transporter.sendMail(mail);
      return { messageId: String(info.messageId ?? '') };
    },
  };
}

/** SMTP 5xx replies are permanent failures; everything else (timeouts, 4xx, network) is retried. */
export function isPermanentMailError(err: unknown): boolean {
  const code = (err as { responseCode?: number })?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}
