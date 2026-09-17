import { createEmailer } from '@profullstack/emailer';
import { config } from '@r4ck/config';

let emailer = null;
const mailer = () => {
  if (!emailer)
    emailer = createEmailer({ resendApiKey: config.mail.resendKey, defaultFrom: config.mail.from });
  return emailer;
};

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export async function sendLoginLink({ email, url }) {
  if (!config.mail.enabled) throw new Error('RESEND_API_KEY is not set');
  const r = await mailer().send({
    from: config.mail.from,
    to: email,
    subject: `Sign in to ${config.siteName}`,
    text: `Open this link to sign in to ${config.siteName}:\n\n${url}\n\nIt works once and expires in 20 minutes. If you did not ask for it, ignore this message.`,
    html: `<p>Open this link to sign in to <strong>${esc(config.siteName)}</strong>:</p><p><a href="${esc(url)}">${esc(url)}</a></p><p>It works once and expires in 20 minutes. If you did not ask for it, ignore this message.</p>`,
  });
  if (!r.sent) throw new Error(`mail not sent: ${r.error ?? 'unknown'}`);
  return true;
}
