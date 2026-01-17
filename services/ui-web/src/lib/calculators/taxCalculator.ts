/**
 * Tax Calculator
 * 
 * Deterministic tax calculations mirroring the Goldleaf Excel formulas.
 * Includes federal income tax, state tax (DC), and FICA calculations.
 */

import type { TaxInputs, EmploymentIncome, RentalProperty } from '@/types/planner';

// ============================================================================
// Tax Bracket Definitions (2026)
// ============================================================================

/**
 * 2026 Federal Tax Brackets for Single Filers
 * Each bracket: [threshold, rate]
 */
const FEDERAL_BRACKETS_SINGLE_2026: [number, number][] = [
  [11925, 0.10],
  [48475, 0.12],
  [103350, 0.22],
  [197300, 0.24],
  [250525, 0.32],
  [626350, 0.35],
  [Infinity, 0.37],
];

/**
 * 2026 Federal Tax Brackets for Married Filing Jointly
 */
const FEDERAL_BRACKETS_MFJ_2026: [number, number][] = [
  [23850, 0.10],
  [96950, 0.12],
  [206700, 0.22],
  [394600, 0.24],
  [501050, 0.32],
  [751600, 0.35],
  [Infinity, 0.37],
];

/**
 * 2026 DC Tax Brackets
 */
const DC_BRACKETS_2026: [number, number][] = [
  [10000, 0.04],
  [40000, 0.06],
  [60000, 0.065],
  [250000, 0.085],
  [500000, 0.0925],
  [1000000, 0.0975],
  [Infinity, 0.1075],
];

/**
 * Standard deductions by filing status (2026)
 */
const STANDARD_DEDUCTIONS_2026: Record<TaxInputs['filingStatus'], number> = {
  single: 16100,
  married_filing_jointly: 32200,
  married_filing_separately: 16100,
  head_of_household: 24150,
};

/**
 * Social Security wage cap (2026)
 */
const SS_WAGE_CAP_2026 = 176100;

/**
 * FICA rates
 */
const SOCIAL_SECURITY_RATE = 0.062; // 6.2%
const MEDICARE_RATE = 0.0145; // 1.45%
const ADDITIONAL_MEDICARE_THRESHOLD = 200000;
const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9%

// ============================================================================
// Tax Calculation Functions
// ============================================================================

/**
 * Get the appropriate federal brackets based on filing status
 */
function getFederalBrackets(
  filingStatus: TaxInputs['filingStatus']
): [number, number][] {
  switch (filingStatus) {
    case 'married_filing_jointly':
      return FEDERAL_BRACKETS_MFJ_2026;
    case 'single':
    case 'married_filing_separately':
    case 'head_of_household':
    default:
      return FEDERAL_BRACKETS_SINGLE_2026;
  }
}

/**
 * Calculate tax using progressive brackets
 */
function calculateProgressiveTax(
  taxableIncome: number,
  brackets: [number, number][]
): { totalTax: number; bracketBreakdown: { bracket: number; rate: number; tax: number }[] } {
  let remainingIncome = taxableIncome;
  let totalTax = 0;
  let previousThreshold = 0;
  const bracketBreakdown: { bracket: number; rate: number; tax: number }[] = [];

  for (const [threshold, rate] of brackets) {
    const bracketWidth = threshold - previousThreshold;
    const incomeInBracket = Math.min(remainingIncome, bracketWidth);
    
    if (incomeInBracket <= 0) break;
    
    const taxInBracket = incomeInBracket * rate;
    totalTax += taxInBracket;
    bracketBreakdown.push({ bracket: threshold, rate, tax: taxInBracket });
    
    remainingIncome -= incomeInBracket;
    previousThreshold = threshold;
  }

  return { totalTax, bracketBreakdown };
}

/**
 * Calculate pre-tax deductions (401k, HSA, etc.)
 */
export function calculatePreTaxDeductions(
  employment: EmploymentIncome,
  additionalPreTax: number = 0
): number {
  const annual401k = employment.annualSalary * employment.contribution401kPercent;
  const annualTSP = employment.annualSalary * employment.tspContributionPercent;
  // HSA contributions would be added here if tracked
  return annual401k + annualTSP + additionalPreTax;
}

/**
 * Calculate Social Security tax
 */
export function calculateSocialSecurityTax(
  wages: number,
  ssWageCap: number = SS_WAGE_CAP_2026
): number {
  const taxableWages = Math.min(wages, ssWageCap);
  return taxableWages * SOCIAL_SECURITY_RATE;
}

/**
 * Calculate Medicare tax (including additional Medicare for high earners)
 */
export function calculateMedicareTax(wages: number): number {
  const baseMedicare = wages * MEDICARE_RATE;
  const additionalMedicare = wages > ADDITIONAL_MEDICARE_THRESHOLD
    ? (wages - ADDITIONAL_MEDICARE_THRESHOLD) * ADDITIONAL_MEDICARE_RATE
    : 0;
  return baseMedicare + additionalMedicare;
}

/**
 * Calculate total FICA (Social Security + Medicare)
 */
export function calculateFICA(
  wages: number,
  ssWageCap: number = SS_WAGE_CAP_2026
): { socialSecurity: number; medicare: number; total: number } {
  const socialSecurity = calculateSocialSecurityTax(wages, ssWageCap);
  const medicare = calculateMedicareTax(wages);
  return {
    socialSecurity,
    medicare,
    total: socialSecurity + medicare,
  };
}

/**
 * Calculate federal income tax
 */
export function calculateFederalIncomeTax(
  grossIncome: number,
  preTaxDeductions: number,
  taxInputs: TaxInputs,
  rentalLossDeduction: number = 0
): { tax: number; taxableIncome: number; marginalRate: number } {
  const standardDeduction = taxInputs.standardDeduction || 
    STANDARD_DEDUCTIONS_2026[taxInputs.filingStatus];
  
  // AGI = Gross Income - Pre-tax deductions
  const agi = grossIncome - preTaxDeductions;
  
  // Taxable Income = AGI - Deductions - Rental Loss
  const deduction = standardDeduction + taxInputs.w4AdditionalDeduction;
  const taxableIncome = Math.max(0, agi - deduction - rentalLossDeduction);
  
  const brackets = getFederalBrackets(taxInputs.filingStatus);
  const { totalTax, bracketBreakdown } = calculateProgressiveTax(taxableIncome, brackets);
  
  // Apply tax credits
  const taxAfterCredits = Math.max(0, totalTax - taxInputs.taxCredits);
  
  // Determine marginal rate
  const marginalRate = bracketBreakdown.length > 0
    ? bracketBreakdown[bracketBreakdown.length - 1].rate
    : 0;
  
  return {
    tax: taxAfterCredits,
    taxableIncome,
    marginalRate,
  };
}

/**
 * Calculate DC income tax
 */
export function calculateDCIncomeTax(
  grossIncome: number,
  preTaxDeductions: number,
  standardDeduction: number = STANDARD_DEDUCTIONS_2026.single
): number {
  const taxableIncome = Math.max(0, grossIncome - preTaxDeductions - standardDeduction);
  const { totalTax } = calculateProgressiveTax(taxableIncome, DC_BRACKETS_2026);
  return totalTax;
}

/**
 * Calculate rental property Schedule E loss deduction
 * Passive loss allowance is up to $25k if AGI < $100k, phases out completely at $150k
 */
export function calculateRentalLossDeduction(
  rentalLoss: number,
  agi: number
): number {
  if (rentalLoss >= 0) return 0; // No loss, no deduction
  
  const maxAllowance = 25000;
  
  if (agi <= 100000) {
    return Math.min(Math.abs(rentalLoss), maxAllowance);
  } else if (agi >= 150000) {
    return 0; // Fully phased out
  } else {
    // Phase-out: reduce by $1 for every $2 over $100k
    const phaseOutAmount = (agi - 100000) / 2;
    const allowance = Math.max(0, maxAllowance - phaseOutAmount);
    return Math.min(Math.abs(rentalLoss), allowance);
  }
}

/**
 * Calculate depreciation for rental property
 * Residential property is depreciated over 27.5 years
 */
export function calculateAnnualDepreciation(
  property: RentalProperty
): number {
  const depreciableBasis = property.purchasePrice - property.landValue;
  return depreciableBasis / 27.5;
}

/**
 * Calculate Schedule E taxable income for rental property
 */
export function calculateScheduleEIncome(
  property: RentalProperty
): number {
  // Gross rental income
  const annualRent = property.monthlyGrossRent * 12;
  
  // Operating expenses (deductible)
  const operatingExpenses = (
    (property.monthlyGrossRent * property.propertyManagementPercent) +
    property.monthlyPropertyTax +
    property.monthlyInsurance +
    property.monthlyRepairsReserve +
    property.monthlyUtilitiesOwner
  ) * 12;
  
  // Mortgage interest (estimated - in reality would come from 1098)
  const annualInterest = property.mortgageBalance * property.mortgageInterestRate;
  
  // Depreciation
  const depreciation = calculateAnnualDepreciation(property);
  
  // Schedule E income (typically negative = loss)
  return annualRent - operatingExpenses - annualInterest - depreciation;
}

// ============================================================================
// Complete Tax Analysis
// ============================================================================

export interface TaxAnalysis {
  // Income
  grossIncome: number;
  preTaxDeductions: number;
  agi: number;
  
  // Federal
  federalTaxableIncome: number;
  federalTax: number;
  marginalFederalRate: number;
  
  // State (DC)
  stateTax: number;
  
  // FICA
  socialSecurityTax: number;
  medicareTax: number;
  totalFICA: number;
  
  // Rental (if applicable)
  rentalScheduleEIncome: number;
  rentalLossDeduction: number;
  
  // Totals
  totalAnnualTax: number;
  effectiveTaxRate: number;
  monthlyTakeHome: number;
}

/**
 * Perform complete tax analysis
 */
export function analyzeTaxes(
  employment: EmploymentIncome,
  taxInputs: TaxInputs,
  rentalProperties: RentalProperty[] = [],
  additionalPreTaxDeductions: number = 0
): TaxAnalysis {
  const grossIncome = employment.annualSalary;
  
  // Pre-tax deductions
  const preTaxDeductions = calculatePreTaxDeductions(employment, additionalPreTaxDeductions);
  const agi = grossIncome - preTaxDeductions;
  
  // Rental property income/loss
  const rentalScheduleEIncome = rentalProperties.reduce(
    (sum, prop) => sum + calculateScheduleEIncome(prop),
    0
  );
  const rentalLossDeduction = rentalScheduleEIncome < 0
    ? calculateRentalLossDeduction(rentalScheduleEIncome, agi)
    : 0;
  
  // Federal tax
  const federal = calculateFederalIncomeTax(
    grossIncome,
    preTaxDeductions,
    taxInputs,
    rentalLossDeduction
  );
  
  // State tax (DC)
  const stateTax = taxInputs.stateOfResidence === 'DC'
    ? calculateDCIncomeTax(grossIncome, preTaxDeductions, taxInputs.standardDeduction)
    : 0; // Would add other states here
  
  // FICA (on wages, not reduced by pre-tax deductions for SS/Medicare purposes)
  const fica = calculateFICA(grossIncome, taxInputs.ssWageCap);
  
  // Total tax
  const totalAnnualTax = federal.tax + stateTax + fica.total;
  const effectiveTaxRate = grossIncome > 0 ? totalAnnualTax / grossIncome : 0;
  
  // Monthly take-home
  const annualTakeHome = grossIncome - totalAnnualTax - preTaxDeductions;
  const monthlyTakeHome = annualTakeHome / 12;
  
  return {
    grossIncome,
    preTaxDeductions,
    agi,
    federalTaxableIncome: federal.taxableIncome,
    federalTax: federal.tax,
    marginalFederalRate: federal.marginalRate,
    stateTax,
    socialSecurityTax: fica.socialSecurity,
    medicareTax: fica.medicare,
    totalFICA: fica.total,
    rentalScheduleEIncome,
    rentalLossDeduction,
    totalAnnualTax,
    effectiveTaxRate,
    monthlyTakeHome,
  };
}
