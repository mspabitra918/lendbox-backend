import { Inject, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';
import { safeEqual } from '../../common/crypto/tokens';
import { DocusignApiClient } from './docusign-api.client';
import {
  AgreementSigner, CreateAgreementInput, CreatedAgreement, ESignatureProvider, ProviderEventType, ProviderWebhookEvent,
} from './esign-provider.interface';

const EVENT_TYPES: Record<string, ProviderEventType> = {
  'envelope-completed': 'completed',
  'recipient-completed': 'other',
  'envelope-declined': 'declined',
  'recipient-declined': 'declined',
  'envelope-voided': 'voided',
};

/**
 * DocuSign eSignature with embedded signing and Connect (JSON, SIM) webhooks.
 * Webhook authenticity: Connect HMAC — base64(HMAC-SHA256(secret, rawBody)) in
 * X-DocuSign-Signature-1..N (several headers when keys are being rotated).
 */
@Injectable()
export class DocusignProvider implements ESignatureProvider {
  readonly name = 'docusign';
  readonly signingMode = 'redirect' as const;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly api: DocusignApiClient,
  ) {}

  async createAgreement(input: CreateAgreementInput): Promise<CreatedAgreement> {
    const envelopeId = await this.api.createEnvelope(
      `Loan agreement for application ${input.applicationReference}`,
      input.documentHtml,
      input.signer,
    );
    return { providerReference: envelopeId, documentReference: `docusign://envelopes/${envelopeId}` };
  }

  createSigningUrl(providerReference: string, signer: AgreementSigner): Promise<string> {
    const returnUrl = this.config.esign.docusign.returnUrl || `${this.config.frontend.publicUrl}/borrower/status`;
    return this.api.createRecipientView(providerReference, signer, returnUrl);
  }

  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): boolean {
    const secret = this.config.esign.docusign.webhookSecret;
    if (!secret || !rawBody?.length) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const provided = Object.entries(headers)
      .filter(([k]) => /^x-docusign-signature-\d+$/i.test(k))
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v ?? '']));
    return provided.some((sig) => safeEqual(sig, expected));
  }

  parseWebhook(body: unknown): ProviderWebhookEvent | null {
    const b = body as { event?: unknown; generatedDateTime?: unknown; data?: { envelopeId?: unknown } };
    const event = typeof b?.event === 'string' ? b.event : null;
    const envelopeId = typeof b?.data?.envelopeId === 'string' ? b.data.envelopeId : null;
    if (!event || !envelopeId || !/^[0-9a-f-]{36}$/i.test(envelopeId)) return null;
    return {
      // One meaningful event of each kind per envelope ⇒ envelope+event is a stable dedupe key across redeliveries.
      eventId: `${envelopeId}:${event}`,
      eventType: event.slice(0, 100),
      type: EVENT_TYPES[event] ?? 'other',
      providerReference: envelopeId,
      occurredAt: typeof b.generatedDateTime === 'string' ? b.generatedDateTime : undefined,
    };
  }

  async confirmCompleted(providerReference: string): Promise<boolean> {
    return (await this.api.getEnvelopeStatus(providerReference)) === 'completed';
  }

  voidAgreement(providerReference: string, reason: string): Promise<void> {
    return this.api.voidEnvelope(providerReference, reason);
  }
}
