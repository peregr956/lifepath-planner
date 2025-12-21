"""Tests for heuristics.py - financial rules for debt priority and flexible expenses."""

import pytest
from budget_model import Debt, Expense, Preferences, Summary, UnifiedBudgetModel
from heuristics import classify_debt_priority, compute_total_flexible_spend, find_flexible_expenses


def make_debt(
    id_suffix: str,
    name: str = "Test Debt",
    balance: float = 1000.0,
    interest_rate: float = 5.0,
    min_payment: float = 50.0,
    priority: str = "medium",
) -> Debt:
    """Create a Debt instance for testing."""
    return Debt(
        id=f"debt-{id_suffix}",
        name=name,
        balance=balance,
        interest_rate=interest_rate,
        min_payment=min_payment,
        priority=priority,
        approximate=False,
    )


def make_expense(id_suffix: str, category: str, amount: float, essential: bool = True) -> Expense:
    """Create an Expense instance for testing."""
    return Expense(
        id=f"expense-{id_suffix}",
        category=category,
        monthly_amount=amount,
        essential=essential,
    )


def make_model(expenses: list[Expense] | None = None) -> UnifiedBudgetModel:
    """Create a UnifiedBudgetModel instance for testing."""
    return UnifiedBudgetModel(
        income=[],
        expenses=expenses or [],
        debts=[],
        preferences=Preferences(
            optimization_focus="balanced",
            protect_essentials=True,
            max_desired_change_per_category=0.1,
        ),
        summary=Summary(total_income=0.0, total_expenses=0.0, surplus=0.0),
    )


# =============================================================================
# Tests for classify_debt_priority
# =============================================================================


class TestClassifyDebtPriority:
    """Tests for classify_debt_priority function."""

    def test_high_interest_rate_returns_high_priority(self):
        """Debt with interest rate >8% should be classified as high priority when declared is 2 levels away."""
        # Rate-based is high (10%), declared is low - difference is 2, so rate-based wins
        debt = make_debt("1", interest_rate=10.0, priority="low")
        assert classify_debt_priority(debt) == "high"

    def test_medium_interest_rate_returns_medium_priority(self):
        """Debt with interest rate between 5% and 8% should be medium priority."""
        debt = make_debt("1", interest_rate=6.5, priority="low")
        # Rate-based is medium, declared is low - difference is 1, so declared is respected
        assert classify_debt_priority(debt) == "low"

    def test_low_interest_rate_returns_low_priority(self):
        """Debt with interest rate <5% should be classified as low priority."""
        debt = make_debt("1", interest_rate=3.0, priority="high")
        # Rate-based is low, declared is high - difference is 2, so rate-based wins
        assert classify_debt_priority(debt) == "low"

    def test_boundary_rate_8_exactly_returns_medium(self):
        """Debt with exactly 8% interest rate should be medium priority."""
        debt = make_debt("1", interest_rate=8.0, priority="medium")
        assert classify_debt_priority(debt) == "medium"

    def test_boundary_rate_5_exactly_returns_medium(self):
        """Debt with exactly 5% interest rate should be medium priority."""
        debt = make_debt("1", interest_rate=5.0, priority="medium")
        assert classify_debt_priority(debt) == "medium"

    def test_boundary_rate_just_above_8_returns_high(self):
        """Debt with interest rate just above 8% should be high priority when declared is 2 levels away."""
        # Rate-based is high (8.01%), declared is low - difference is 2, so rate-based wins
        debt = make_debt("1", interest_rate=8.01, priority="low")
        assert classify_debt_priority(debt) == "high"

    def test_boundary_rate_just_below_5_returns_low(self):
        """Debt with interest rate just below 5% should be low priority."""
        debt = make_debt("1", interest_rate=4.99, priority="medium")
        # Rate-based is low, declared is medium - difference is 1, so declared is respected
        assert classify_debt_priority(debt) == "medium"

    def test_declared_priority_respected_when_close_to_rate_based(self):
        """Declared priority should be used when within 1 level of rate-based priority."""
        # Rate-based is medium (6%), declared is high - difference is 1, so declared wins
        debt = make_debt("1", interest_rate=6.0, priority="high")
        assert classify_debt_priority(debt) == "high"

    def test_rate_based_overrides_when_two_levels_apart(self):
        """Rate-based priority should override when declared is 2 levels away."""
        # Rate-based is high (15%), declared is low - difference is 2, so rate-based wins
        debt = make_debt("1", interest_rate=15.0, priority="low")
        assert classify_debt_priority(debt) == "high"

    def test_none_interest_rate_returns_medium(self):
        """Debt with None interest rate should default to medium priority."""
        debt = make_debt("1", interest_rate=5.0, priority="medium")
        # Manually set interest_rate to None to simulate missing data
        object.__setattr__(debt, "interest_rate", None)
        assert classify_debt_priority(debt) == "medium"

    def test_missing_interest_rate_attribute_returns_medium(self):
        """Debt without interest_rate attribute should default to medium priority."""
        debt = make_debt("1", interest_rate=5.0, priority="medium")
        # Remove interest_rate attribute
        delattr(debt, "interest_rate")
        assert classify_debt_priority(debt) == "medium"

    def test_missing_priority_attribute_uses_rate_based(self):
        """Debt without priority attribute should use rate-based priority."""
        debt = make_debt("1", interest_rate=10.0, priority="medium")
        delattr(debt, "priority")
        assert classify_debt_priority(debt) == "high"

    def test_invalid_priority_string_uses_rate_based(self):
        """Debt with invalid priority string should fall back to rate-based priority."""
        debt = make_debt("1", interest_rate=10.0, priority="medium")
        object.__setattr__(debt, "priority", "invalid")
        assert classify_debt_priority(debt) == "high"

    def test_uppercase_priority_is_normalized(self):
        """Declared priority should be case-insensitive."""
        debt = make_debt("1", interest_rate=6.0, priority="medium")
        object.__setattr__(debt, "priority", "HIGH")
        assert classify_debt_priority(debt) == "high"

    def test_mixed_case_priority_is_normalized(self):
        """Mixed case priority should be normalized to lowercase."""
        debt = make_debt("1", interest_rate=6.0, priority="medium")
        object.__setattr__(debt, "priority", "MeDiUm")
        assert classify_debt_priority(debt) == "medium"


# =============================================================================
# Tests for find_flexible_expenses
# =============================================================================


class TestFindFlexibleExpenses:
    """Tests for find_flexible_expenses function."""

    def test_finds_non_essential_expenses(self):
        """Should return only non-essential expenses."""
        expenses = [
            make_expense("1", "Housing", 2000.0, essential=True),
            make_expense("2", "Entertainment", 200.0, essential=False),
            make_expense("3", "Dining", 300.0, essential=False),
            make_expense("4", "Groceries", 500.0, essential=True),
        ]
        model = make_model(expenses)

        flexible = find_flexible_expenses(model)

        assert len(flexible) == 2
        assert all(not exp.essential for exp in flexible)
        categories = [exp.category for exp in flexible]
        assert "Entertainment" in categories
        assert "Dining" in categories

    def test_empty_expenses_returns_empty_list(self):
        """Should return empty list when model has no expenses."""
        model = make_model([])

        flexible = find_flexible_expenses(model)

        assert flexible == []

    def test_all_essential_returns_empty_list(self):
        """Should return empty list when all expenses are essential."""
        expenses = [
            make_expense("1", "Housing", 2000.0, essential=True),
            make_expense("2", "Groceries", 500.0, essential=True),
            make_expense("3", "Utilities", 150.0, essential=True),
        ]
        model = make_model(expenses)

        flexible = find_flexible_expenses(model)

        assert flexible == []

    def test_all_non_essential_returns_all(self):
        """Should return all expenses when none are essential."""
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 300.0, essential=False),
            make_expense("3", "Hobbies", 100.0, essential=False),
        ]
        model = make_model(expenses)

        flexible = find_flexible_expenses(model)

        assert len(flexible) == 3
        assert all(not exp.essential for exp in flexible)

    def test_preserves_expense_order(self):
        """Should preserve the order of expenses from the model."""
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Housing", 2000.0, essential=True),
            make_expense("3", "Dining", 300.0, essential=False),
        ]
        model = make_model(expenses)

        flexible = find_flexible_expenses(model)

        assert len(flexible) == 2
        assert flexible[0].category == "Entertainment"
        assert flexible[1].category == "Dining"


# =============================================================================
# Tests for compute_total_flexible_spend
# =============================================================================


class TestComputeTotalFlexibleSpend:
    """Tests for compute_total_flexible_spend function."""

    def test_sums_non_essential_expenses(self):
        """Should sum monthly amounts for all non-essential expenses."""
        expenses = [
            make_expense("1", "Housing", 2000.0, essential=True),
            make_expense("2", "Entertainment", 200.0, essential=False),
            make_expense("3", "Dining", 300.0, essential=False),
            make_expense("4", "Groceries", 500.0, essential=True),
        ]
        model = make_model(expenses)

        total = compute_total_flexible_spend(model)

        assert total == pytest.approx(500.0)  # 200 + 300

    def test_empty_expenses_returns_zero(self):
        """Should return 0 when model has no expenses."""
        model = make_model([])

        total = compute_total_flexible_spend(model)

        assert total == pytest.approx(0.0)

    def test_all_essential_returns_zero(self):
        """Should return 0 when all expenses are essential."""
        expenses = [
            make_expense("1", "Housing", 2000.0, essential=True),
            make_expense("2", "Groceries", 500.0, essential=True),
        ]
        model = make_model(expenses)

        total = compute_total_flexible_spend(model)

        assert total == pytest.approx(0.0)

    def test_all_non_essential_returns_total(self):
        """Should return sum of all expenses when none are essential."""
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 300.0, essential=False),
            make_expense("3", "Hobbies", 100.0, essential=False),
        ]
        model = make_model(expenses)

        total = compute_total_flexible_spend(model)

        assert total == pytest.approx(600.0)  # 200 + 300 + 100

    def test_returns_float_type(self):
        """Should always return a float value."""
        expenses = [
            make_expense("1", "Entertainment", 200, essential=False),  # int amount
        ]
        model = make_model(expenses)

        total = compute_total_flexible_spend(model)

        assert isinstance(total, float)
        assert total == pytest.approx(200.0)

    def test_handles_decimal_amounts(self):
        """Should correctly sum expenses with decimal amounts."""
        expenses = [
            make_expense("1", "Entertainment", 199.99, essential=False),
            make_expense("2", "Dining", 300.01, essential=False),
        ]
        model = make_model(expenses)

        total = compute_total_flexible_spend(model)

        assert total == pytest.approx(500.0)
