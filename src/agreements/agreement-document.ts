import { escapeHtml } from "../notifications/templates/layout";
import { Application } from "../applications/models/application.model";

/**
 * Renders the agreement document snapshot that is hashed and presented for signature.
 */
export function renderAgreementDocument(
  app: Application,
  templateVersion: string,
  issuedAt: Date,
): string {
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(app.loanAmount));
  const address = [
    app.streetAddress,
    app.addressLine2,
    `${app.city}, ${app.state} - ${app.zip}`,
  ]
    .filter(Boolean)
    .join(", ");
  const draft = /draft/i.test(templateVersion);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loan Agreement - ${escapeHtml(app.id)}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #fffefa;
      --canvas: #f2f0eb;
      --ink: #202a35;
      --navy: #18344d;
      --muted: #5c6873;
      --rule: #d9dfe2;
      --wash: #f4f6f6;
      --draft: #a3232b;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 40px 20px;
      background: var(--canvas);
      color: var(--ink);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.65;
    }

    .document {
      width: min(100%, 760px);
      margin: 0 auto;
      padding: clamp(28px, 6vw, 64px) clamp(24px, 7vw, 72px);
      background: var(--paper);
      border: 1px solid #e5e3dd;
      box-shadow: 0 18px 48px rgb(31 42 53 / 8%);
    }

    .draft-notice {
      margin: 0 0 36px;
      padding: 13px 16px;
      border: 1px solid #e4b6b8;
      border-left: 4px solid var(--draft);
      background: #fff4f3;
      color: #81242a;
      font-family: Arial, sans-serif;
      font-size: 13px;
      line-height: 1.55;
    }

    .document-header {
      padding-bottom: 25px;
      border-bottom: 1px solid var(--rule);
    }

    h1 {
      margin: 0 0 20px;
      color: var(--navy);
      font-size: clamp(30px, 5vw, 40px);
      font-weight: 400;
      letter-spacing: -0.035em;
      line-height: 1.15;
    }

    .metadata {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px 24px;
      margin: 0;
      font-family: Arial, sans-serif;
    }

    .metadata div {
      min-width: 0;
    }

    dt,
    .section-label {
      color: var(--muted);
      font-family: Arial, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.09em;
      line-height: 1.4;
      text-transform: uppercase;
    }

    dt {
      margin-bottom: 4px;
    }

    dd {
      overflow-wrap: anywhere;
      margin: 0;
      color: var(--ink);
      font-size: 14px;
      line-height: 1.5;
    }

    section {
      padding: 25px 0;
      border-bottom: 1px solid var(--rule);
      break-inside: avoid;
    }

    h2 {
      margin: 0 0 13px;
      color: var(--navy);
      font-size: 21px;
      font-weight: 400;
      letter-spacing: -0.015em;
      line-height: 1.3;
    }

    section p {
      margin: 0;
    }

    .borrower-name {
      color: var(--navy);
      font-size: 18px;
    }

    .terms-placeholder {
      padding: 14px 17px;
      border-left: 3px solid #8799a5;
      background: var(--wash);
      color: #46535e;
      font-size: 15px;
    }

    .notice {
      padding: 16px 18px;
      border: 1px solid #d8e0e5;
      background: #f5f8fa;
      color: #2d4354;
    }

    .signature {
      padding-top: 26px;
      border-bottom: 0;
    }

    .signature-line {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 30px;
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid var(--rule);
      font-family: Arial, sans-serif;
      font-size: 14px;
    }

    @media (max-width: 560px) {
      body {
        padding: 0;
        background: var(--paper);
      }

      .document {
        border: 0;
        box-shadow: none;
      }

      .metadata {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media print {
      @page {
        margin: 18mm;
      }

      body {
        padding: 0;
        background: #fff;
        color: #111;
        font-size: 11pt;
      }

      .document {
        width: auto;
        max-width: none;
        margin: 0;
        padding: 0;
        border: 0;
        box-shadow: none;
      }

      .document-header,
      section {
        break-inside: avoid;
      }

      h1,
      h2 {
        color: #18344d;
      }

      .draft-notice,
      .terms-placeholder,
      .notice {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <main class="document">
  

    <header class="document-header">
      <h1>Loan Agreement</h1>
      <dl class="metadata">
        <div>
          <dt>Application ID</dt>
          <dd><strong>${escapeHtml(app.id)}</strong></dd>
        </div>
        <div>
          <dt>Template Version</dt>
          <dd>${escapeHtml(templateVersion)}</dd>
        </div>
        <div>
          <dt>Issued</dt>
          <dd>${escapeHtml(issuedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }))}</dd>
        </div>
      </dl>
    </header>

    <section aria-labelledby="borrower-heading">
      <h2 id="borrower-heading">Borrower Details</h2>
      <p>
        <strong class="borrower-name">${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</strong><br>
        ${escapeHtml(address)}<br>
        Email: ${escapeHtml(app.email)}
      </p>
    </section>

    <section aria-labelledby="loan-heading">
      <h2 id="loan-heading">Loan Details</h2>
      <p>
        Principal Amount Requested: <strong>${escapeHtml(amount)}</strong><br>
        Purpose: ${escapeHtml(app.loanPurpose === "other" ? (app.loanOtherPurpose ?? "Other") : app.loanPurpose.replace(/_/g, " "))}
      </p>
    </section>

    <section aria-labelledby="terms-heading">
      <h2 id="terms-heading">Terms & Disclosures</h2>
      <p class="terms-placeholder">
        [Interest rate, processing fees, repayment tenure, EMI schedule, foreclosure terms, and statutory disclosures to be inserted here by counsel.]
      </p>
    </section>

    <section aria-labelledby="notice-heading">
      <h2 id="notice-heading">Important Notice</h2>
      <p class="notice">Receiving your signed agreement is not a loan approval, and no funds have been disbursed.</p>
    </section>

    <section class="signature" aria-labelledby="consent-heading">
      <h2 id="consent-heading">Signatures & Consent</h2>
      <p>By signing electronically, the borrower consents to receive this agreement and related records electronically, and confirms the legal binding of this electronic signature.</p>
      <p class="signature-line">
        <span><strong>Borrower Signature:</strong> /sig1/</span>
        <span><strong>Date:</strong> /date1/</span>
      </p>
    </section>
  </main>
</body>
</html>`;
}
