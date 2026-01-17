'use client';

import { useReducer, useCallback, useMemo } from 'react';
import type {
  GoldleafInputs,
  BudgetBuilderStep,
  BudgetBuilderState,
  DebtAccount,
  AdditionalIncomeSource,
  BudgetCategory,
  BudgetSubcategory,
} from '@/types/planner';
import {
  createDefaultGoldleafInputs,
  createDebtAccount,
} from '@/types/planner';

// ============================================================================
// Action Types
// ============================================================================

type PlannerAction =
  | { type: 'SET_STEP'; step: BudgetBuilderStep }
  | { type: 'SET_ANNUAL_SALARY'; value: number }
  | { type: 'SET_401K_PERCENT'; value: number }
  | { type: 'SET_EMPLOYER_MATCH_PERCENT'; value: number }
  | { type: 'SET_ROTH_IRA_ANNUAL'; value: number }
  | { type: 'ADD_INCOME_SOURCE'; source: AdditionalIncomeSource }
  | { type: 'UPDATE_INCOME_SOURCE'; id: string; updates: Partial<AdditionalIncomeSource> }
  | { type: 'REMOVE_INCOME_SOURCE'; id: string }
  | { type: 'ADD_DEBT'; debt: DebtAccount }
  | { type: 'UPDATE_DEBT'; id: string; updates: Partial<DebtAccount> }
  | { type: 'REMOVE_DEBT'; id: string }
  | { type: 'UPDATE_SUBCATEGORY'; categoryId: string; subcategoryId: string; updates: Partial<BudgetSubcategory> }
  | { type: 'ADD_SUBCATEGORY'; categoryId: string; subcategory: BudgetSubcategory }
  | { type: 'REMOVE_SUBCATEGORY'; categoryId: string; subcategoryId: string }
  | { type: 'SET_INPUTS'; inputs: Partial<GoldleafInputs> }
  | { type: 'RESET' }
  | { type: 'COMPLETE' };

// ============================================================================
// Initial State
// ============================================================================

function createInitialState(): BudgetBuilderState {
  return {
    currentStep: 'income',
    inputs: createDefaultGoldleafInputs(),
    isComplete: false,
    errors: {},
  };
}

// ============================================================================
// Reducer
// ============================================================================

function plannerReducer(state: BudgetBuilderState, action: PlannerAction): BudgetBuilderState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };

    case 'SET_ANNUAL_SALARY':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          employmentIncome: {
            ...state.inputs.employmentIncome,
            annualSalary: action.value,
          },
        },
      };

    case 'SET_401K_PERCENT':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          employmentIncome: {
            ...state.inputs.employmentIncome,
            contribution401kPercent: action.value,
          },
        },
      };

    case 'SET_EMPLOYER_MATCH_PERCENT':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          employmentIncome: {
            ...state.inputs.employmentIncome,
            employerMatchPercent: action.value,
          },
        },
      };

    case 'SET_ROTH_IRA_ANNUAL':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          employmentIncome: {
            ...state.inputs.employmentIncome,
            annualRothIRA: action.value,
          },
        },
      };

    case 'ADD_INCOME_SOURCE':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          additionalIncome: [...state.inputs.additionalIncome, action.source],
        },
      };

    case 'UPDATE_INCOME_SOURCE':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          additionalIncome: state.inputs.additionalIncome.map((source) =>
            source.id === action.id ? { ...source, ...action.updates } : source
          ),
        },
      };

    case 'REMOVE_INCOME_SOURCE':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          additionalIncome: state.inputs.additionalIncome.filter(
            (source) => source.id !== action.id
          ),
        },
      };

    case 'ADD_DEBT':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          debts: [...state.inputs.debts, action.debt],
        },
      };

    case 'UPDATE_DEBT':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          debts: state.inputs.debts.map((debt) =>
            debt.id === action.id ? { ...debt, ...action.updates } : debt
          ),
        },
      };

    case 'REMOVE_DEBT':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          debts: state.inputs.debts.filter((debt) => debt.id !== action.id),
        },
      };

    case 'UPDATE_SUBCATEGORY':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          budgetCategories: state.inputs.budgetCategories.map((category) =>
            category.id === action.categoryId
              ? {
                  ...category,
                  subcategories: category.subcategories.map((sub) =>
                    sub.id === action.subcategoryId
                      ? { ...sub, ...action.updates }
                      : sub
                  ),
                }
              : category
          ),
        },
      };

    case 'ADD_SUBCATEGORY':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          budgetCategories: state.inputs.budgetCategories.map((category) =>
            category.id === action.categoryId
              ? {
                  ...category,
                  subcategories: [...category.subcategories, action.subcategory],
                }
              : category
          ),
        },
      };

    case 'REMOVE_SUBCATEGORY':
      return {
        ...state,
        inputs: {
          ...state.inputs,
          budgetCategories: state.inputs.budgetCategories.map((category) =>
            category.id === action.categoryId
              ? {
                  ...category,
                  subcategories: category.subcategories.filter(
                    (sub) => sub.id !== action.subcategoryId
                  ),
                }
              : category
          ),
        },
      };

    case 'SET_INPUTS':
      return {
        ...state,
        inputs: { ...state.inputs, ...action.inputs },
      };

    case 'RESET':
      return createInitialState();

    case 'COMPLETE':
      return { ...state, isComplete: true };

    default:
      return state;
  }
}

// ============================================================================
// Hook
// ============================================================================

const STEPS_ORDER: BudgetBuilderStep[] = ['income', 'expenses', 'debts', 'savings', 'review'];

export function usePlannerState() {
  const [state, dispatch] = useReducer(plannerReducer, null, createInitialState);

  // Navigation helpers
  const currentStepIndex = STEPS_ORDER.indexOf(state.currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS_ORDER.length - 1;

  const goToStep = useCallback((step: BudgetBuilderStep) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);

  const goNext = useCallback(() => {
    if (!isLastStep) {
      dispatch({ type: 'SET_STEP', step: STEPS_ORDER[currentStepIndex + 1] });
    }
  }, [currentStepIndex, isLastStep]);

  const goBack = useCallback(() => {
    if (!isFirstStep) {
      dispatch({ type: 'SET_STEP', step: STEPS_ORDER[currentStepIndex - 1] });
    }
  }, [currentStepIndex, isFirstStep]);

  // Income actions
  const setAnnualSalary = useCallback((value: number) => {
    dispatch({ type: 'SET_ANNUAL_SALARY', value });
  }, []);

  const set401kPercent = useCallback((value: number) => {
    dispatch({ type: 'SET_401K_PERCENT', value });
  }, []);

  const setEmployerMatchPercent = useCallback((value: number) => {
    dispatch({ type: 'SET_EMPLOYER_MATCH_PERCENT', value });
  }, []);

  const setRothIRAAnnual = useCallback((value: number) => {
    dispatch({ type: 'SET_ROTH_IRA_ANNUAL', value });
  }, []);

  const addIncomeSource = useCallback((source: AdditionalIncomeSource) => {
    dispatch({ type: 'ADD_INCOME_SOURCE', source });
  }, []);

  const updateIncomeSource = useCallback((id: string, updates: Partial<AdditionalIncomeSource>) => {
    dispatch({ type: 'UPDATE_INCOME_SOURCE', id, updates });
  }, []);

  const removeIncomeSource = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_INCOME_SOURCE', id });
  }, []);

  // Debt actions
  const addDebt = useCallback((debt?: Partial<DebtAccount>) => {
    dispatch({ type: 'ADD_DEBT', debt: createDebtAccount(debt) });
  }, []);

  const updateDebt = useCallback((id: string, updates: Partial<DebtAccount>) => {
    dispatch({ type: 'UPDATE_DEBT', id, updates });
  }, []);

  const removeDebt = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_DEBT', id });
  }, []);

  // Expense actions
  const updateSubcategory = useCallback(
    (categoryId: string, subcategoryId: string, updates: Partial<BudgetSubcategory>) => {
      dispatch({ type: 'UPDATE_SUBCATEGORY', categoryId, subcategoryId, updates });
    },
    []
  );

  const addSubcategory = useCallback((categoryId: string, subcategory: BudgetSubcategory) => {
    dispatch({ type: 'ADD_SUBCATEGORY', categoryId, subcategory });
  }, []);

  const removeSubcategory = useCallback((categoryId: string, subcategoryId: string) => {
    dispatch({ type: 'REMOVE_SUBCATEGORY', categoryId, subcategoryId });
  }, []);

  // General actions
  const setInputs = useCallback((inputs: Partial<GoldleafInputs>) => {
    dispatch({ type: 'SET_INPUTS', inputs });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const complete = useCallback(() => {
    dispatch({ type: 'COMPLETE' });
  }, []);

  // Computed values
  const progress = useMemo(() => {
    return ((currentStepIndex + 1) / STEPS_ORDER.length) * 100;
  }, [currentStepIndex]);

  return {
    // State
    state,
    inputs: state.inputs,
    currentStep: state.currentStep,
    isComplete: state.isComplete,
    errors: state.errors,
    
    // Navigation
    currentStepIndex,
    totalSteps: STEPS_ORDER.length,
    isFirstStep,
    isLastStep,
    progress,
    goToStep,
    goNext,
    goBack,
    
    // Income actions
    setAnnualSalary,
    set401kPercent,
    setEmployerMatchPercent,
    setRothIRAAnnual,
    addIncomeSource,
    updateIncomeSource,
    removeIncomeSource,
    
    // Debt actions
    addDebt,
    updateDebt,
    removeDebt,
    
    // Expense actions
    updateSubcategory,
    addSubcategory,
    removeSubcategory,
    
    // General
    setInputs,
    reset,
    complete,
  };
}

export type PlannerStateReturn = ReturnType<typeof usePlannerState>;
