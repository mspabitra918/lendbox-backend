import {
  allowedNextStatuses,
  ApplicationStatus,
  TransitionActor,
} from "./application-status";
import { ApplicationStatusHistory } from "./models/application-status-history.model";
import { Application } from "./models/application.model";

const num = (v: string | number | null) => (v == null ? null : Number(v));
const fmtPhone = (d: string | null) =>
  d && d.length === 10
    ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    : d;

/**
 * Explicit allow-list mappers. API responses are built only from these, so
 * ciphertext columns, fingerprints and idempotency keys can never leak.
 */
export function toAdminSummary(a: Application) {
  return {
    id: a.id,
    uuid: a.uuid,
    reference: a.reference,
    status: a.status,
    applicant: {
      firstName: a.firstName,
      lastName: a.lastName,
      fullName: `${a.firstName} ${a.lastName}`,
      email: a.email,
    },
    loan: { amount: num(a.loanAmount), purpose: a.loanPurpose },
    submittedAt: a.submittedAt,
    statusChangedAt: a.statusChangedAt,
    updatedAt: a.updatedAt,
  };
}

export function toAdminDetail(a: Application) {
  const [dobYear, dobMonth, dobDay] = a.dateOfBirth.split("-");
  return {
    ...toAdminSummary(a),
    allowedAdminTransitions: allowedNextStatuses(
      a.status,
      TransitionActor.ADMIN,
    ),
    canSendAgreement: [
      ApplicationStatus.RECEIVED,
      ApplicationStatus.PENDING_LOAN_AGREEMENT,
    ].includes(a.status),
    loan: {
      amount: num(a.loanAmount),
      purpose: a.loanPurpose,
      otherPurpose: a.loanOtherPurpose ?? "",
    },
    personal: {
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: fmtPhone(a.phone),
      dobMonth,
      dobDay,
      dobYear,
      ssnLast4: a.ssnLast4,
      dlState: a.dlState,
      streetAddress: a.streetAddress,
      addressLine2: a.addressLine2 ?? "",
      city: a.city,
      state: a.state,
      zip: a.zip,
      yearsAtAddress: num(a.yearsAtAddress),
      housingStatus: a.housingStatus,
      monthlyHousingCost: num(a.monthlyHousingCost),
    },
    employment: {
      employmentStatus: a.employmentStatus,
      employerName: a.employerName ?? "",
      jobTitle: a.jobTitle ?? "",
      employmentLengthMo: a.employmentLengthMo ?? 0,
      employerPhone: fmtPhone(a.employerPhone) ?? "",
      payFrequency: a.payFrequency,
      nextPayDate: a.nextPayDate,
      netMonthlyIncome: a.netMonthlyIncome,
      incomeSource: a.incomeSource,
    },
    banking: {
      bankName: a.bankName,
      accountType: a.accountType,
      accountLast4: a.accountLast4,
      accountAge: a.accountAge,
      currentBalanceBand: a.currentBalanceBand,
      directDeposit: a.directDeposit,
    },
    consent: {
      esign: a.consentEsign,
      privacy: a.consentPrivacy,
      creditPull: a.consentCreditPull,
      tcpa: a.consentTcpa,
      consentedAt: a.submittedAt,
    },
    createdAt: a.createdAt,
  };
}

export function toHistoryEntry(h: ApplicationStatusHistory) {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType,
    admin: h.admin
      ? { id: h.admin.id, name: h.admin.name, email: h.admin.email }
      : h.adminId
        ? { id: h.adminId }
        : null,
    reason: h.reason,
    metadata: h.metadata,
    createdAt: h.createdAt,
  };
}

/** What the applicant may see via the public status lookup. */
// export function toPublicStatus(
//   a: Application,
//   history: ApplicationStatusHistory[],
// ) {
//   return {
//     applicationId: a.id,
//     status: a.status,
//     submittedAt: a.submittedAt,
//     history: history.map((h) => ({ status: h.toStatus, at: h.createdAt })),
//     applicant: { firstName: a.firstName },
//     loan: { amount: num(a.loanAmount), purpose: a.loanPurpose },
//   };
// }

export function toPublicStatus(
  a: Application,
  history: ApplicationStatusHistory[],
) {
  return {
    id: a.id,

    history: history.map((h) => ({
      status: h.toStatus,
      at: h.createdAt.toISOString(),
    })),

    bankName: a.bankName,
    accountLast4: a.accountLast4,

    submittedAt: a.submittedAt.toISOString(),
    status: a.status,

    applicant: {
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone,
    },

    loan: {
      amount: Number(a.loanAmount),
      purpose: a.loanPurpose,
      otherPurpose: a.loanOtherPurpose ?? "",
    },
  };
}
