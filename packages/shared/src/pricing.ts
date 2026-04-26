export const PRICING = {
  founding: {
    name: "CreatorLens",
    monthlyCents: 2900, // $29/mo — single tier, all creators
    spots: 500,
    tokenBudgetMonthly: 500_000,
  },
  preorder: {
    name: "CreatorLens Pre-Order Deposit",
    oneTimeCents: 1000, // $10 deposit, credited toward first month
  },
  firstMonthAfterPreorderCents: 1900, // $29 - $10 credit
} as const;

export type PricingTier = keyof typeof PRICING;
