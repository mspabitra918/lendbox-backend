export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface SupportInfo {
  supportEmail: string;
  supportPhone?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Minimal, table-based, inline-styled layout that renders in common mail clients. */
export function layout(title: string, bodyHtml: string, support: SupportInfo): string {
  const phone = support.supportPhone ? ` or ${escapeHtml(support.supportPhone)}` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0b1f4b;padding:20px 28px;color:#ffffff;font-size:22px;font-weight:bold;">Lendbox</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:20px;color:#0b1f4b;">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 28px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5;">
Questions? Contact us at <a href="mailto:${escapeHtml(support.supportEmail)}" style="color:#2563eb;">${escapeHtml(support.supportEmail)}</a>${phone}.<br>
This is an automated message. Please do not reply directly to this email. Lendbox will never ask for your password by email.
</td></tr>
</table></td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">${escapeHtml(label)}</a></p>`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
