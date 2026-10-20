import { button, escapeHtml, formatDate, layout, RenderedEmail, SupportInfo } from './layout';

export interface TemplateParams {
  application_received: { firstName: string; reference: string; submittedAt: string };
  admin_new_application: { reference: string; applicantName: string; submittedAt: string; loanAmount: string; adminUrl: string };
  agreement_invitation: { firstName: string; reference: string; signingUrl: string; expiresAt: string };
  agreement_signed: { firstName: string; reference: string; signedAt: string };
}

export type TemplateName = keyof TemplateParams;

type Renderer<K extends TemplateName> = (p: TemplateParams[K], s: SupportInfo) => RenderedEmail;

const supportText = (s: SupportInfo) => `Questions? ${s.supportEmail}${s.supportPhone ? ` / ${s.supportPhone}` : ''}`;

const renderers: { [K in TemplateName]: Renderer<K> } = {
  application_received: (p, s) => {
    const when = formatDate(p.submittedAt);
    return {
      subject: `We received your Lendbox application (${p.reference})`,
      html: layout(
        'Application received',
        `<p>Hi ${escapeHtml(p.firstName)},</p>
<p>Thank you for applying with Lendbox. Your application has been received and is now in our review queue.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f1f5f9;border-radius:8px;padding:12px 16px;">
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Reference number</td><td style="font-weight:bold;font-family:monospace;">${escapeHtml(p.reference)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Submitted</td><td>${escapeHtml(when)}</td></tr>
</table>
<p>Keep your reference number handy — you'll need it, together with your email address, to check your application status.</p>
<p>Submitting an application is not an approval or a commitment to lend. We'll contact you by email about next steps.</p>`,
        s,
      ),
      text: `Hi ${p.firstName},\n\nThank you for applying with Lendbox. Your application has been received.\n\nReference number: ${p.reference}\nSubmitted: ${when}\n\nKeep your reference number to check your application status. Submitting an application is not an approval or a commitment to lend.\n\n${supportText(s)}`,
    };
  },

  admin_new_application: (p, s) => {
    const when = formatDate(p.submittedAt);
    return {
      subject: `New loan application ${p.reference}`,
      html: layout(
        'New loan application',
        `<p>A new application has been submitted.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Reference</td><td style="font-family:monospace;font-weight:bold;">${escapeHtml(p.reference)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Applicant</td><td>${escapeHtml(p.applicantName)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Requested</td><td>${escapeHtml(p.loanAmount)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#64748b;">Submitted</td><td>${escapeHtml(when)}</td></tr>
</table>
${button(p.adminUrl, 'Open in admin dashboard')}
<p style="font-size:13px;color:#64748b;">Sign-in required. Applicant financial details are available only in the dashboard.</p>`,
        s,
      ),
      text: `New loan application\n\nReference: ${p.reference}\nApplicant: ${p.applicantName}\nRequested: ${p.loanAmount}\nSubmitted: ${when}\n\nOpen (sign-in required): ${p.adminUrl}`,
    };
  },

  agreement_invitation: (p, s) => {
    const expires = formatDate(p.expiresAt);
    return {
      subject: `Action required: review and sign your Lendbox loan agreement (${p.reference})`,
      html: layout(
        'Your loan agreement is ready',
        `<p>Hi ${escapeHtml(p.firstName)},</p>
<p>Your loan agreement for application <strong style="font-family:monospace;">${escapeHtml(p.reference)}</strong> is ready for your review and signature.</p>
${button(p.signingUrl, 'Review and sign agreement')}
<p><strong>This secure link expires on ${escapeHtml(expires)}</strong> and can be used to sign only once. Do not forward this email.</p>
<p><strong>How to sign</strong></p>
<ol style="padding-left:20px;margin:0 0 16px;">
<li>Open the link above and read the entire agreement carefully.</li>
<li>Confirm your identity when prompted.</li>
<li>Type your full legal name and confirm that you agree to sign electronically.</li>
</ol>
<p>Opening the link does not sign the agreement. Signing the agreement does not by itself mean your loan has been approved or funded; we'll confirm any decision separately.</p>
<p style="font-size:13px;color:#64748b;">If the button doesn't work, copy this address into your browser:<br><span style="word-break:break-all;">${escapeHtml(p.signingUrl)}</span></p>`,
        s,
      ),
      text: `Hi ${p.firstName},\n\nYour loan agreement for application ${p.reference} is ready for review and signature.\n\nReview and sign: ${p.signingUrl}\n\nThis secure link expires on ${expires} and can be used only once. Do not forward this email.\n\nHow to sign:\n1. Open the link and read the entire agreement.\n2. Confirm your identity when prompted.\n3. Type your full legal name and confirm you agree to sign electronically.\n\nOpening the link does not sign the agreement. Signing does not by itself mean your loan is approved or funded.\n\n${supportText(s)}`,
    };
  },

  agreement_signed: (p, s) => {
    const when = formatDate(p.signedAt);
    return {
      subject: `We received your signed loan agreement (${p.reference})`,
      html: layout(
        'Signed agreement received',
        `<p>Hi ${escapeHtml(p.firstName)},</p>
<p>We've received your signed loan agreement for application <strong style="font-family:monospace;">${escapeHtml(p.reference)}</strong> on ${escapeHtml(when)}.</p>
<p>Your application will now continue through our review. <strong>Receiving your signed agreement is not a loan approval</strong>, and no funds have been disbursed. We'll email you once a decision has been made.</p>`,
        s,
      ),
      text: `Hi ${p.firstName},\n\nWe received your signed loan agreement for application ${p.reference} on ${when}.\n\nYour application will continue through review. Receiving your signed agreement is not a loan approval, and no funds have been disbursed. We'll email you once a decision has been made.\n\n${supportText(s)}`,
    };
  },
};

export function renderTemplate<K extends TemplateName>(name: K, params: TemplateParams[K], support: SupportInfo): RenderedEmail {
  const render = renderers[name] as Renderer<K> | undefined;
  if (!render) throw new Error(`Unknown email template: ${name}`);
  return render(params, support);
}
