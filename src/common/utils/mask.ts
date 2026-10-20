/** Masks an email for logs: jane.doe@example.com → j***@e***.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const [user, domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

export const lastFour = (digits: string) => digits.slice(-4);

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
