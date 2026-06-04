import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Minimal direct SMTP mailer (sends to Mailhog in dev).
 *
 * INTERIM: per the implementation doc, real sending moves to the async worker +
 * the communication module's configurable templates (base+override) in a later
 * phase. This exists so the Phase-1 auth flows (welcome / password reset) produce
 * a real, inspectable email now. Swap the call sites to the queue later.
 */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class MailerService {
  private transporter: Transporter | null = null;

  private get transport(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const info = await this.transport.sendMail({ from: env.smtp.from, ...message });
      logger.info({ to: message.to, subject: message.subject, messageId: info.messageId }, 'email sent');
    } catch (err) {
      logger.error({ err, to: message.to, subject: message.subject }, 'email send failed');
      throw err;
    }
  }
}

export const mailer = new MailerService();
