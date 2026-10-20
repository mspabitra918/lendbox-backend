/**
 * Option values exactly as produced by the frontend's `opts()` helper
 * (lendbox-frontend/src/lib/application.ts): label → lowercase, non-alnum → "_".
 */
export const LOAN_MIN = 500;
export const LOAN_MAX = 50000;

export const PURPOSES = [
  'debt_consolidation', 'credit_card_repayment', 'home_improvement', 'medical_expenses',
  'car_repair', 'wedding', 'education', 'other',
] as const;
export const HOUSING_STATUSES = ['own', 'rent', 'live_with_family', 'other'] as const;
export const EMPLOYMENT_STATUSES = ['full_time', 'part_time', 'self_employed', 'retired', 'unemployed'] as const;
export const EMPLOYED_STATUSES = ['full_time', 'part_time', 'self_employed'] as const;
export const PAY_FREQUENCIES = ['weekly', 'bi_weekly', 'semi_monthly', 'monthly'] as const;
export const INCOME_SOURCES = ['employment', 'self_employment', 'benefits', 'pension', 'other'] as const;
export const ACCOUNT_TYPES = ['checking', 'savings'] as const;
export const ACCOUNT_AGES = ['less_than_3_months', '3_12_months', '1_2_years', 'more_than_2_years'] as const;
export const BALANCE_BANDS = ['under_500', '_500_1_000', '_1_000_5_000', 'over_5_000'] as const;
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
] as const;
