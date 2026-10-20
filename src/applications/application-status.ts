/**
 * Application workflow status. These are PROCESS states, not lending decisions
 * in themselves: `approved` records an admin's decision in this system, and
 * `funded` records that an admin has confirmed disbursement happened elsewhere.
 * Neither moves money or executes a contract.
 */
export enum ApplicationStatus {
  RECEIVED = "received",
  PENDING_LOAN_AGREEMENT = "pending_loan_agreement",
  LOAN_AGREEMENT_SIGNED = "loan_agreement_signed",
  APPROVED = "approved",
  DECLINED = "declined",
  WITHDRAWN = "withdrawn",
  FUNDED = "funded",
}

export const APPLICATION_STATUSES = Object.values(ApplicationStatus);

/** Who is allowed to cause a transition. */
export enum TransitionActor {
  /** An authenticated admin via the status endpoint. */
  ADMIN = "admin",
  /** The agreements module after successfully initiating an agreement. */
  AGREEMENT_INITIATION = "agreement_initiation",
  /** The agreements module after a verified signature. */
  SIGNATURE_VERIFICATION = "signature_verification",
  /** The system recording a new submission. */
  SUBMISSION = "submission",
}

type Rule = { to: ApplicationStatus; actors: TransitionActor[] };

const S = ApplicationStatus;
const A = TransitionActor;

/**
 * The single source of truth for allowed transitions. Anything not listed is
 * rejected. Notably:
 *  - pending_loan_agreement can only be entered by initiating an agreement;
 *  - loan_agreement_signed can only be entered via verified signature;
 *  - signing never approves; approval requires an admin;
 *  - declined / withdrawn / funded are terminal.
 */
export const TRANSITIONS: Record<ApplicationStatus, Rule[]> = {
  [S.RECEIVED]: [
    { to: S.PENDING_LOAN_AGREEMENT, actors: [A.AGREEMENT_INITIATION] },
    { to: S.DECLINED, actors: [A.ADMIN] },
    { to: S.WITHDRAWN, actors: [A.ADMIN] },
  ],
  [S.PENDING_LOAN_AGREEMENT]: [
    { to: S.LOAN_AGREEMENT_SIGNED, actors: [A.SIGNATURE_VERIFICATION] },
    { to: S.DECLINED, actors: [A.ADMIN] },
    { to: S.WITHDRAWN, actors: [A.ADMIN] },
  ],
  [S.LOAN_AGREEMENT_SIGNED]: [
    { to: S.APPROVED, actors: [A.ADMIN] },
    { to: S.DECLINED, actors: [A.ADMIN] },
    { to: S.WITHDRAWN, actors: [A.ADMIN] },
  ],
  [S.APPROVED]: [
    { to: S.FUNDED, actors: [A.ADMIN] },
    { to: S.WITHDRAWN, actors: [A.ADMIN] },
  ],
  [S.DECLINED]: [],
  [S.WITHDRAWN]: [],
  [S.FUNDED]: [],
};

/** Statuses an admin may set directly through PATCH /status. */
export const ADMIN_SETTABLE_STATUSES = [
  S.APPROVED,
  S.DECLINED,
  S.WITHDRAWN,
  S.FUNDED,
] as const;
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

/** Statuses for which the reason field is mandatory. */
export const REASON_REQUIRED: ApplicationStatus[] = [S.DECLINED, S.WITHDRAWN];

export function isTransitionAllowed(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: TransitionActor,
) {
  return TRANSITIONS[from].some((r) => r.to === to && r.actors.includes(actor));
}

export function allowedNextStatuses(
  from: ApplicationStatus,
  actor?: TransitionActor,
): ApplicationStatus[] {
  return TRANSITIONS[from]
    .filter((r) => !actor || r.actors.includes(actor))
    .map((r) => r.to);
}
