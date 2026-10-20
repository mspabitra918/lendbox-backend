import { escapeHtml } from '../notifications/templates/layout';
import { Application } from '../applications/models/application.model';

/**
 * Renders the agreement document snapshot that is hashed and presented for signature.
 *
 * ⚠ DRAFT TEMPLATE. It contains no APR, finance charge, payment schedule or
 * other Truth in Lending Act / state disclosures. Counsel must supply the final
 * agreement text; until AGREEMENT_TEMPLATE_VERSION is set to a non-draft value,
 * sending agreements is blocked in production.
 */
export function renderAgreementDocument(app: Application, templateVersion: string, issuedAt: Date): string {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(app.loanAmount));
  const address = [app.streetAddress, app.addressLine2, `${app.city}, ${app.state} ${app.zip}`].filter(Boolean).join(', ');
  const draft = /draft/i.test(templateVersion);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Loan Agreement ${escapeHtml(app.reference)}</title></head>
<body style="font-family:Georgia,serif;max-width:760px;margin:auto;line-height:1.6;color:#111;">
${draft ? '<p style="border:2px solid #b91c1c;color:#b91c1c;padding:8px;font-family:Arial;"><strong>DRAFT TEMPLATE — NOT FOR USE WITH REAL BORROWERS.</strong> Final terms and required disclosures must be supplied by counsel.</p>' : ''}
<h1>Loan Agreement</h1>
<p>Application reference: <strong>${escapeHtml(app.reference)}</strong><br>Template version: ${escapeHtml(templateVersion)}<br>Issued: ${escapeHtml(issuedAt.toISOString())}</p>
<h2>Borrower</h2>
<p>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}<br>${escapeHtml(address)}<br>${escapeHtml(app.email)}</p>
<h2>Requested loan</h2>
<p>Principal amount requested: <strong>${escapeHtml(amount)}</strong><br>Purpose: ${escapeHtml(app.loanPurpose === 'other' ? app.loanOtherPurpose ?? 'Other' : app.loanPurpose.replace(/_/g, ' '))}</p>
<h2>Terms and disclosures</h2>
<p>[Annual percentage rate, finance charge, amount financed, total of payments, payment schedule, late fees, prepayment terms and all federal and state disclosures to be inserted here.]</p>
<h2>No approval or funding by signature</h2>
<p>Signing this agreement does not by itself constitute approval of the loan or an obligation of the lender to disburse funds. The lender will notify the borrower of its decision separately.</p>
<h2>Consent to electronic records and signatures</h2>
<p>By signing electronically, the borrower consents to receive this agreement and related records electronically, agrees that an electronic signature has the same effect as a handwritten signature, and confirms the ability to access and retain this document.</p>
<p>Borrower signature: /sig1/ &nbsp;&nbsp; Date: /date1/</p>
</body></html>`;
}
