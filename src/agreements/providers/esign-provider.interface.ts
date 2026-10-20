import type { IncomingHttpHeaders } from 'http';

export const ESIGN_PROVIDERS = Symbol('ESIGN_PROVIDERS');

export interface AgreementSigner {
  name: string;
  email: string;
  /** Stable id tying the signer to our application (DocuSign clientUserId). */
  clientUserId: string;
}

export interface CreateAgreementInput {
  agreementId: string;
  applicationReference: string;
  documentHtml: string;
  signer: AgreementSigner;
}

export interface CreatedAgreement {
  providerReference: string;
  documentReference: string;
}

export type ProviderEventType = 'completed' | 'declined' | 'voided' | 'other';

export interface ProviderWebhookEvent {
  /** Stable id used for idempotency — identical for redeliveries of the same event. */
  eventId: string;
  eventType: string;
  type: ProviderEventType;
  providerReference: string;
  occurredAt?: string;
}

/**
 * E-signature provider. `internal` signing happens in this API (token + identity
 * check); `redirect` providers host the signing ceremony and report completion
 * by authenticated webhook.
 */
export interface ESignatureProvider {
  readonly name: string;
  readonly signingMode: 'internal' | 'redirect';
  createAgreement(input: CreateAgreementInput): Promise<CreatedAgreement>;
  /** redirect providers: URL of the hosted signing ceremony for this signer. */
  createSigningUrl?(providerReference: string, signer: AgreementSigner): Promise<string>;
  /** Verifies the webhook signature against the exact raw request body. */
  verifyWebhook?(rawBody: Buffer, headers: IncomingHttpHeaders): boolean;
  parseWebhook?(body: unknown): ProviderWebhookEvent | null;
  /** Defence in depth: re-query the provider to confirm completion before trusting an event. */
  confirmCompleted?(providerReference: string): Promise<boolean>;
  voidAgreement?(providerReference: string, reason: string): Promise<void>;
}
