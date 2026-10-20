import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { APPLICATION_ID_PATTERN } from '../crypto/tokens';

/** Validates an :id route param as an application id (case-insensitive) and normalises it to upper case. */
@Injectable()
export class ApplicationIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!APPLICATION_ID_PATTERN.test(id)) {
      throw new BadRequestException({ code: 'INVALID_APPLICATION_ID', message: 'Application id must be 6 letters or digits, e.g. 56T65T.' });
    }
    return id;
  }
}
