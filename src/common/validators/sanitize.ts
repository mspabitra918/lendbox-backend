import { Transform } from 'class-transformer';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips control characters, collapses whitespace and trims. Non-strings pass through for validators to reject. */
export const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim() : value;

export const SanitizeText = () => Transform(({ value }) => sanitizeText(value));

/** Keeps digits only — the frontend sends formatted values such as "(555) 123-4567" and "123-45-6789". */
export const DigitsOnly = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value));

export const LowerCaseTrim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const UpperCaseTrim = () => Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value.toUpperCase()) : value));
