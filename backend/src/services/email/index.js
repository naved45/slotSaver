/**
 * Email adapter. Returns an honest status:
 *   - 'sent'       only when the SMTP provider accepted the message
 *   - 'logged_dev' when no SMTP is configured (development preview, NOT delivered)
 *   - throws on provider failure, so the caller records 'failed'
 */
import nodemailer from 'nodemailer';
import { devOutbox } from './outbox.js';
import { logger } from '../../utils/logger.js';

let transport = null;

export function createEmailAdapter(config) {
  return {
    mode: config.smtp ? 'smtp' : 'dev_preview',
    async send({ to, subject, text, html }) {
      if (!config.smtp) {
        if (config.devOutboxEnabled) devOutbox.push({ to, subject, text, html, mode: 'dev_preview' });
        // Log that a preview was produced, never its body or links.
        logger.info('email_dev_preview', { to: maskEmail(to), subject });
        return { status: 'logged_dev', providerMessageId: null };
      }
      if (!transport) {
        transport = nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        });
      }
      const info = await transport.sendMail({ from: config.emailFrom, to, subject, text, html });
      return { status: 'sent', providerMessageId: info.messageId ?? null };
    },
  };
}

export function maskEmail(email) {
  const [user = '', domain = ''] = String(email).split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}
