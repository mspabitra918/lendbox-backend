/**
 * Application workflow status. These are PROCESS states, not lending decisions
 * in themselves: `approved` records an admin's decision in this system, and
 * `funded` records that an admin has confirmed disbursement happened elsewhere.
 * Neither moves money or executes a contract.
 */
export enum ApplicationStatus {
  RECEIVED = "received",
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
  /** The system recording a new submission. */
  SUBMISSION = "submission",
}

type Rule = { to: ApplicationStatus; actors: TransitionActor[] };

const S = ApplicationStatus;
const A = TransitionActor;

/**
 * The single source of truth for allowed transitions. Anything not listed is
 * rejected. Notably:
 *  - received → approved | declined | withdrawn (cannot be funded directly);
 *  - approved → funded | declined | withdrawn;
 *  - declined / withdrawn / funded are terminal.
 * Loan agreements are tracked on their own record and never change this status.
 */
export const TRANSITIONS: Record<ApplicationStatus, Rule[]> = {
  [S.RECEIVED]: [
    { to: S.APPROVED, actors: [A.ADMIN] },
    { to: S.DECLINED, actors: [A.ADMIN] },
    { to: S.WITHDRAWN, actors: [A.ADMIN] },
  ],
  [S.APPROVED]: [
    { to: S.FUNDED, actors: [A.ADMIN] },
    { to: S.DECLINED, actors: [A.ADMIN] },
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
