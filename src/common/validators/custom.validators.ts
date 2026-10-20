import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

function make(name: string, validate: (value: unknown, args: ValidationArguments) => boolean, defaultMessage: string) {
  return (options?: ValidationOptions) => (object: object, propertyName: string) =>
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: { message: defaultMessage, ...options },
      validator: { validate },
    });
}

/** ABA routing number checksum (3-7-1 weighting). */
export function isValidRoutingNumber(v: string): boolean {
  if (!/^\d{9}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/** SSA rules: area not 000/666/9xx, group not 00, serial not 0000. */
export function isValidSsn(v: string): boolean {
  if (!/^\d{9}$/.test(v)) return false;
  const area = v.slice(0, 3);
  return area !== '000' && area !== '666' && area[0] !== '9' && v.slice(3, 5) !== '00' && v.slice(5) !== '0000';
}

export function ageOn(dob: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Builds a UTC date from y/m/d strings, or null if the date does not exist (e.g. Feb 30). */
export function dateFromParts(y: string, m: string, d: string): Date | null {
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d)
    ? date
    : null;
}

export const IsRoutingNumber = make('isRoutingNumber', (v) => typeof v === 'string' && isValidRoutingNumber(v), '$property must be a valid 9-digit ABA routing number');

export const IsSsn = make('isSsn', (v) => typeof v === 'string' && isValidSsn(v), '$property must be a valid 9-digit SSN');

/** Must equal the sibling property named in `constraints[0]`. */
export function MatchesProperty(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'matchesProperty',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: { message: `$property must match ${property}`, ...options },
      validator: {
        validate: (value: unknown, args: ValidationArguments) =>
          value === (args.object as Record<string, unknown>)[args.constraints[0] as string],
      },
    });
}

/** Applied to dobYear: validates dobYear/dobMonth/dobDay together — real date, 18 ≤ age ≤ 120. */
export const IsAdultDateOfBirth = make(
  'isAdultDateOfBirth',
  (_v, args) => {
    const o = args.object as { dobYear?: string; dobMonth?: string; dobDay?: string };
    const dob = dateFromParts(o.dobYear ?? '', o.dobMonth ?? '', o.dobDay ?? '');
    if (!dob) return false;
    const age = ageOn(dob);
    return age >= 18 && age <= 120;
  },
  'date of birth must be a valid date and the applicant must be at least 18',
);

/** YYYY-MM-DD, a real date, not before yesterday (UTC; tolerates applicant time zones) and within a year. */
export const IsUpcomingDate = make(
  'isUpcomingDate',
  (v) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-');
    const date = dateFromParts(y, m, d);
    if (!date) return false;
    const today = new Date();
    const startOfYesterday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1);
    return date.getTime() >= startOfYesterday && date.getTime() <= startOfYesterday + 367 * 86_400_000;
  },
  '$property must be today or a later date (YYYY-MM-DD)',
);
