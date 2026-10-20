import { Injectable } from '@nestjs/common';
import { CreateAgreementInput, CreatedAgreement, ESignatureProvider } from './esign-provider.interface';

/**
 * Built-in signing: the document snapshot is stored in loan_agreements and the
 * applicant signs through POST /agreements/sign after proving possession of the
 * emailed single-use token AND identity (full name, SSN last 4, date of birth).
 *
 * LEGAL NOTE: this captures intent, consent to electronic records, attribution
 * and an integrity hash, which are the elements ESIGN/UETA look for, but it is
 * not a certified e-signature service. Have counsel review before relying on it,
 * or use a provider such as DocuSign.
 */
@Injectable()
export class InternalSigningProvider implements ESignatureProvider {
  readonly name = 'internal';
  readonly signingMode = 'internal' as const;

  async createAgreement(input: CreateAgreementInput): Promise<CreatedAgreement> {
    return {
      providerReference: input.agreementId,
      documentReference: `internal://loan-agreements/${input.agreementId}`,
    };
  }
}
