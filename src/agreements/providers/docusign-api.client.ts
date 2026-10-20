import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';
import type { AgreementSigner } from './esign-provider.interface';

/**
 * Thin DocuSign eSignature REST v2.1 client (JWT grant).
 *
 * NOT VERIFIED against a live DocuSign account in this repository. Requires an
 * integration key with an RSA keypair, a user that has granted consent for the
 * `signature impersonation` scopes, the account id, and a Connect configuration
 * with HMAC enabled. Test in the DocuSign developer sandbox before production.
 */
@Injectable()
export class DocusignApiClient {
  private readonly logger = new Logger(DocusignApiClient.name);
  private token?: { value: string; expiresAt: number };

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private get ds() {
    return this.config.esign.docusign;
  }

  get isConfigured(): boolean {
    const d = this.ds;
    return Boolean(d.accountId && d.integrationKey && d.userId && d.privateKeyBase64);
  }

  private async accessToken(): Promise<string> {
    if (!this.isConfigured) throw new ServiceUnavailableException('DocuSign is not configured.');
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: this.ds.integrationKey, sub: this.ds.userId, aud: this.ds.oauthBase, iat: now, exp: now + 3600, scope: 'signature impersonation' },
      Buffer.from(this.ds.privateKeyBase64, 'base64').toString('utf8'),
      { algorithm: 'RS256' },
    );
    const res = await fetch(`https://${this.ds.oauthBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    if (!res.ok) {
      this.logger.error(`DocuSign token request failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException('E-signature provider authentication failed.');
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.ds.basePath}/v2.1/accounts/${encodeURIComponent(this.ds.accountId)}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      this.logger.error(`DocuSign ${method} ${path.split('?')[0]} failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException('E-signature provider request failed.');
    }
    return (await res.json()) as T;
  }

  async createEnvelope(subject: string, documentHtml: string, signer: AgreementSigner): Promise<string> {
    const result = await this.call<{ envelopeId: string }>('POST', '/envelopes', {
      emailSubject: subject.slice(0, 100),
      status: 'sent',
      documents: [{ documentId: '1', name: 'Loan Agreement', fileExtension: 'html', documentBase64: Buffer.from(documentHtml).toString('base64') }],
      recipients: {
        signers: [{
          recipientId: '1', routingOrder: '1', email: signer.email, name: signer.name, clientUserId: signer.clientUserId,
          tabs: {
            signHereTabs: [{ anchorString: '/sig1/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }],
            dateSignedTabs: [{ anchorString: '/date1/', anchorUnits: 'pixels' }],
          },
        }],
      },
    });
    return result.envelopeId;
  }

  async createRecipientView(envelopeId: string, signer: AgreementSigner, returnUrl: string): Promise<string> {
    const result = await this.call<{ url: string }>('POST', `/envelopes/${encodeURIComponent(envelopeId)}/views/recipient`, {
      returnUrl, authenticationMethod: 'email', email: signer.email, userName: signer.name, clientUserId: signer.clientUserId,
    });
    return result.url;
  }

  async getEnvelopeStatus(envelopeId: string): Promise<string> {
    const result = await this.call<{ status: string }>('GET', `/envelopes/${encodeURIComponent(envelopeId)}`);
    return result.status;
  }

  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    await this.call('PUT', `/envelopes/${encodeURIComponent(envelopeId)}`, { status: 'voided', voidedReason: reason.slice(0, 200) });
  }
}
