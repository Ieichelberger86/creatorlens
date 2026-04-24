export const PRICING = {
  founding: {
    name: "CreatorLens Founding Member",
    monthlyCents: 2900, // $29/mo locked forever
    spots: 500,
    tokenBudgetMonthly: 500_000,
  },
  standard: {
    name: "CreatorLens Standard",
    monthlyCents: 4900, // $49/mo — set higher later; placeholder
    tokenBudgetMonthly: 500_000,
  },
  preorder: {
    name: "CreatorLens Pre-Order Deposit",
    oneTimeCents: 1000, // $10 deposit, credited toward first month
  },
  firstMonthAfterPreorderCents: 1900, // $29 - $10 credit
} as const;

export type PricingTier = keyof typeof PRICING;
