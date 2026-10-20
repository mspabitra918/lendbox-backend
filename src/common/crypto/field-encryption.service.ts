import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * AES-256-GCM field-level encryption for PII at rest (SSN, licence, bank numbers).
 * Format: v1:<base64(iv[12] | authTag[16] | ciphertext)>. The version prefix
 * leaves room for key rotation.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.crypto.fieldEncryptionKey, 'base64');
    if (this.key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, data] = payload.split(':', 2);
    if (version !== VERSION || !data) throw new Error('Unsupported ciphertext format');
    const buf = Buffer.from(data, 'base64');
    const decipher = createDecipheriv(ALGO, this.key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }
}
