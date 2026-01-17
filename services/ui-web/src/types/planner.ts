/**
 * Goldleaf-style Financial Planner Types
 * 
 * These types mirror the structure of the Goldleaf Excel spreadsheet,
 * enabling a "build from scratch" budget entry flow that normalizes
 * to the same UnifiedBudgetModel used by the upload flow.
 */

// ============================================================================
// Personal Profile
// ============================================================================

/**
 * Personal profile information for retirement and long-term planning
 */
export interface PersonalProfile {
  dateOfBirth: Date | null;
  targetRetirementAge: number;
  lifeExpectancy: number;
  ssClaimingAge: number; // Social Security claiming age (62-70)
  spendingLevel: 'low' | 'medium' | 'high';
  withdrawalStrategy: 'constant' | 'smile' | 'variable';
}

/**
 * SMILE retirement spending phase multipliers
 * Based on Go-Go, Slow-Go, No-Go retirement phases
 */
export interface SmilePhaseMultipliers {
  goGo: number;   // Active travel, hobbies (ages 62-72)
  slowGo: number; // Moderate activity (ages 73-82)
  noGo: number;   // Healthcare focus (ages 83+)
}

/**
 * Default personal profile values
 */
export const DEFAULT_PERSONAL_PROFILE: PersonalProfile = {
  dateOfBirth: null,
  targetRetirementAge: 65,
  lifeExpectancy: 90,
  ssClaimingAge: 67,
  spendingLevel: 'medium',
  withdrawalStrategy: 'constant',
};

// ============================================================================
// Income & Employment
// ============================================================================

/**
 * Employment income and retirement contribution details
 */
export interface EmploymentIncome {
  annualSalary: number;
  contribution401kPercent: number;
  employerMatchPercent: number;
  tspContributionPercent: number;
  tspMatchPercent: number;
  annualRothIRA: number;
  monthlyBrokerage: number;
}

/**
 * Additional income sources beyond primary employment
 */
export interface AdditionalIncomeSource {
  id: string;
  name: string;
  monthlyAmount: number;
  type: 'rental' | 'side_gig' | 'passive' | 'other';
  isRecurring: boolean;
}

/**
 * Default employment income values
 */
export const DEFAULT_EMPLOYMENT_INCOME: EmploymentIncome = {
  annualSalary: 0,
  contribution401kPercent: 0.06, // 6%
  employerMatchPercent: 0.03,   // 3%
  tspContributionPercent: 0,
  tspMatchPercent: 0,
  annualRothIRA: 0,
  monthlyBrokerage: 0,
};

// ============================================================================
// Account Balances
// ============================================================================

/**
 * Current account balances across all account types
 */
export interface AccountBalances {
  checking: number;
  emergencyFund: number;
  retirement401k: number;
  rothIRA: number;
  tsp: number;
  brokerage: number;
  hsa: number;
  rentalPropertyReserves: number;
}

/**
 * Default account balances (all zero)
 */
export const DEFAULT_ACCOUNT_BALANCES: AccountBalances = {
  checking: 0,
  emergencyFund: 0,
  retirement401k: 0,
  rothIRA: 0,
  tsp: 0,
  brokerage: 0,
  hsa: 0,
  rentalPropertyReserves: 0,
};

// ============================================================================
// Debt Accounts
// ============================================================================

/**
 * Individual debt account details
 */
export interface DebtAccount {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // As decimal, e.g., 0.089 = 8.9%
  monthlyPayment: number;
  type: 'personal_loan' | 'student_loan' | 'credit_card' | 'auto_loan' | 'mortgage' | 'other';
}

/**
 * Create a new debt account with default values
 */
export function createDebtAccount(partial?: Partial<DebtAccount>): DebtAccount {
  return {
    id: crypto.randomUUID(),
    name: '',
    balance: 0,
    interestRate: 0,
    monthlyPayment: 0,
    type: 'other',
    ...partial,
  };
}

// ============================================================================
// Investment Assumptions
// ============================================================================

/**
 * Investment return and allocation assumptions for projections
 */
export interface InvestmentAssumptions {
  expectedStockReturn: number;      // e.g., 0.075 = 7.5%
  expectedBondReturn: number;       // e.g., 0.045 = 4.5%
  inflationRate: number;            // e.g., 0.025 = 2.5%
  annualWageGrowth: number;         // e.g., 0.03 = 3%
  currentStockAllocation: number;   // e.g., 0.98 = 98%
  retirementStockAllocation: number; // e.g., 0.40 = 40%
  safeWithdrawalRate: number;       // e.g., 0.04 = 4%
}

/**
 * Default investment assumptions (moderate/typical values)
 */
export const DEFAULT_INVESTMENT_ASSUMPTIONS: InvestmentAssumptions = {
  expectedStockReturn: 0.07,
  expectedBondReturn: 0.04,
  inflationRate: 0.025,
  annualWageGrowth: 0.03,
  currentStockAllocation: 0.90,
  retirementStockAllocation: 0.40,
  safeWithdrawalRate: 0.04,
};

// ============================================================================
// Tax Inputs
// ============================================================================

/**
 * Tax-related inputs for tax calculation
 */
export interface TaxInputs {
  filingStatus: 'single' | 'married_filing_jointly' | 'married_filing_separately' | 'head_of_household';
  standardDeduction: number;
  ssWageCap: number;
  taxCredits: number;
  w4AdditionalDeduction: number;
  stateOfResidence: string;
}

/**
 * Default tax inputs for 2026 single filer
 */
export const DEFAULT_TAX_INPUTS: TaxInputs = {
  filingStatus: 'single',
  standardDeduction: 16100,
  ssWageCap: 176100,
  taxCredits: 0,
  w4AdditionalDeduction: 0,
  stateOfResidence: 'DC',
};

// ============================================================================
// Rental Property
// ============================================================================

/**
 * Rental property details for real estate investors
 */
export interface RentalProperty {
  id: string;
  purchasePrice: number;
  landValue: number;
  mortgageBalance: number;
  monthlyGrossRent: number;
  monthlyPIPayment: number;
  propertyManagementPercent: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyRepairsReserve: number;
  monthlyUtilitiesOwner: number;
  vacancyReservePercent: number;
  mortgageInterestRate: number;
  loanTermYears: number;
}

/**
 * Create a new rental property with default values
 */
export function createRentalProperty(partial?: Partial<RentalProperty>): RentalProperty {
  return {
    id: crypto.randomUUID(),
    purchasePrice: 0,
    landValue: 0,
    mortgageBalance: 0,
    monthlyGrossRent: 0,
    monthlyPIPayment: 0,
    propertyManagementPercent: 0.08,
    monthlyPropertyTax: 0,
    monthlyInsurance: 0,
    monthlyRepairsReserve: 0,
    monthlyUtilitiesOwner: 0,
    vacancyReservePercent: 0.05,
    mortgageInterestRate: 0.07,
    loanTermYears: 30,
    ...partial,
  };
}

// ============================================================================
// Reserves & Goals
// ============================================================================

/**
 * Financial reserves and goal targets
 */
export interface ReservesAndGoals {
  insuranceDeductible: number;
  majorRepairReserve: number;
  brokerageTargetMonthly: number;
  rothIRAMaxAnnual: number;
  projectionYears: number;
  emergencyFundMonthsTarget: number;
}

/**
 * Default reserves and goals
 */
export const DEFAULT_RESERVES_AND_GOALS: ReservesAndGoals = {
  insuranceDeductible: 5000,
  majorRepairReserve: 10000,
  brokerageTargetMonthly: 500,
  rothIRAMaxAnnual: 7500,
  projectionYears: 10,
  emergencyFundMonthsTarget: 6,
};

// ============================================================================
// Budget Category Structure
// ============================================================================

/**
 * A budget subcategory with monthly tracking
 */
export interface BudgetSubcategory {
  id: string;
  name: string;
  monthlyAmount: number;
  isEssential: boolean;
  notes?: string;
}

/**
 * A budget category containing subcategories
 */
export interface BudgetCategory {
  id: string;
  name: string;
  subcategories: BudgetSubcategory[];
}

/**
 * Standard budget categories matching Goldleaf structure
 */
export const STANDARD_CATEGORIES: { name: string; subcategories: string[]; essential: boolean }[] = [
  { name: 'Housing', subcategories: ['Rent', 'Mortgage', 'Utilities'], essential: true },
  { name: 'Food', subcategories: ['Groceries', 'Dining Out'], essential: true },
  { name: 'Transportation', subcategories: ['Metro Pass', 'Gas', 'Car Payment', 'Car Insurance'], essential: true },
  { name: 'Insurance', subcategories: ['Renters/Home', 'Life Insurance', 'Health Insurance'], essential: true },
  { name: 'Healthcare', subcategories: ['Copays', 'Medications', 'Dental', 'Vision'], essential: true },
  { name: 'Debt Payments', subcategories: ['Student Loans', 'Personal Loans', 'Credit Cards'], essential: true },
  { name: 'Savings', subcategories: ['Emergency Fund', 'Brokerage', 'Other Savings'], essential: false },
  { name: 'Retirement', subcategories: ['401(k)', 'Roth IRA', 'TSP'], essential: false },
  { name: 'Subscriptions', subcategories: ['Streaming', 'Software', 'Memberships'], essential: false },
  { name: 'Discretionary', subcategories: ['Entertainment', 'Gifts', 'Travel', 'Hobbies'], essential: false },
];

/**
 * Create initial budget categories from standard template
 */
export function createStandardCategories(): BudgetCategory[] {
  return STANDARD_CATEGORIES.map(cat => ({
    id: crypto.randomUUID(),
    name: cat.name,
    subcategories: cat.subcategories.map(subName => ({
      id: crypto.randomUUID(),
      name: subName,
      monthlyAmount: 0,
      isEssential: cat.essential,
    })),
  }));
}

// ============================================================================
// Complete Goldleaf Inputs (Master Input Sheet)
// ============================================================================

/**
 * Complete set of inputs mirroring the Goldleaf "Inputs" sheet
 * This is the single source of truth for all calculations
 */
export interface GoldleafInputs {
  personalProfile: PersonalProfile;
  smileMultipliers: SmilePhaseMultipliers;
  employmentIncome: EmploymentIncome;
  additionalIncome: AdditionalIncomeSource[];
  accountBalances: AccountBalances;
  debts: DebtAccount[];
  investmentAssumptions: InvestmentAssumptions;
  taxInputs: TaxInputs;
  rentalProperties: RentalProperty[];
  reservesAndGoals: ReservesAndGoals;
  budgetCategories: BudgetCategory[];
}

/**
 * Create default Goldleaf inputs
 */
export function createDefaultGoldleafInputs(): GoldleafInputs {
  return {
    personalProfile: { ...DEFAULT_PERSONAL_PROFILE },
    smileMultipliers: { goGo: 1.2, slowGo: 1.0, noGo: 1.2 },
    employmentIncome: { ...DEFAULT_EMPLOYMENT_INCOME },
    additionalIncome: [],
    accountBalances: { ...DEFAULT_ACCOUNT_BALANCES },
    debts: [],
    investmentAssumptions: { ...DEFAULT_INVESTMENT_ASSUMPTIONS },
    taxInputs: { ...DEFAULT_TAX_INPUTS },
    rentalProperties: [],
    reservesAndGoals: { ...DEFAULT_RESERVES_AND_GOALS },
    budgetCategories: createStandardCategories(),
  };
}

// ============================================================================
// Financial Health Score
// ============================================================================

/**
 * Component of the Financial Health Score
 */
export interface ScoreComponent {
  name: string;
  points: number;
  maxPoints: number;
  status: string;
  details: string;
}

/**
 * Complete Financial Health Score breakdown
 */
export interface FinancialHealthScore {
  totalScore: number;
  maxScore: number;
  grade: 'Excellent' | 'Good' | 'Building' | 'Needs Work' | 'Critical';
  security: ScoreComponent;  // 35 pts max
  debt: ScoreComponent;      // 25 pts max
  wealth: ScoreComponent;    // 25 pts max
  flexibility: ScoreComponent; // 15 pts max
}

// ============================================================================
// Financial Analysis Output (for AI consumption)
// ============================================================================

/**
 * Deterministic outputs from all calculators
 * This is what gets passed to the AI layer
 */
export interface FinancialAnalysis {
  // Budget Calculator outputs
  monthlyGrossIncome: number;
  monthlyNetIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  savingsRate: number;
  categoryShares: Record<string, number>;
  
  // Tax Calculator outputs
  annualFederalTax: number;
  annualStateTax: number;
  annualFICA: number;
  effectiveTaxRate: number;
  marginalTaxRate: number;
  
  // Debt Calculator outputs
  totalDebt: number;
  totalMonthlyDebtPayments: number;
  debtToIncomeRatio: number;
  monthlyInterestCost: number;
  monthsToDebtFree: number | null; // null if payments don't cover interest
  interestSavedWithAvalanche: number;
  
  // Retirement Calculator outputs
  currentRetirementBalance: number;
  annualContributions: number;
  projectedRetirementBalance: number;
  retirementReadinessStatus: 'on_track' | 'behind' | 'ahead';
  yearsToRetirement: number;
  sustainableAnnualWithdrawal: number;
  
  // Net Worth outputs
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidNetWorth: number;
  
  // Financial Health Score
  healthScore: FinancialHealthScore;
  
  // Rental Property (if applicable)
  rentalCashFlow?: number;
  rentalNOI?: number;
  rentalScheduleELoss?: number;
}

/**
 * Budget builder wizard step definition
 */
export type BudgetBuilderStep = 
  | 'income'
  | 'expenses'
  | 'debts'
  | 'savings'
  | 'review';

/**
 * State for the budget builder wizard
 */
export interface BudgetBuilderState {
  currentStep: BudgetBuilderStep;
  inputs: GoldleafInputs;
  isComplete: boolean;
  errors: Record<string, string>;
}
