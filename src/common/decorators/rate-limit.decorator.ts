import { SetMetadata } from '@nestjs/common';

export const STRICT_RATE_LIMIT = 'lendbox:strict-rate-limit';
export const LOGIN_RATE_LIMIT = 'lendbox:login-rate-limit';

/** Applies the stricter "strict" throttler (public lookups, signing). */
export const StrictRateLimit = () => SetMetadata(STRICT_RATE_LIMIT, true);
/** Applies the "login" throttler. */
export const LoginRateLimit = () => SetMetadata(LOGIN_RATE_LIMIT, true);
