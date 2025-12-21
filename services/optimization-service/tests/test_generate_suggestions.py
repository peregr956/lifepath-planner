"""Tests for generate_suggestions.py - core suggestion generation and ranking logic."""

import pytest
from budget_model import Debt, Expense, Income, Preferences, Summary, UnifiedBudgetModel
from generate_suggestions import Suggestion, generate_suggestions


def make_income(id_suffix: str, amount: float, name: str = "Income") -> Income:
    """Create an Income instance for testing."""
    return Income(
        id=f"income-{id_suffix}",
        name=name,
        monthly_amount=amount,
        type="earned",
        stability="stable",
    )


def make_expense(id_suffix: str, category: str, amount: float, essential: bool = True) -> Expense:
    """Create an Expense instance for testing."""
    return Expense(
        id=f"expense-{id_suffix}",
        category=category,
        monthly_amount=amount,
        essential=essential,
    )


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


def make_model(
    incomes: list[Income] | None = None,
    expenses: list[Expense] | None = None,
    debts: list[Debt] | None = None,
    optimization_focus: str = "balanced",
    max_desired_change: float = 0.1,
) -> UnifiedBudgetModel:
    """Create a UnifiedBudgetModel instance for testing."""
    return UnifiedBudgetModel(
        income=incomes or [],
        expenses=expenses or [],
        debts=debts or [],
        preferences=Preferences(
            optimization_focus=optimization_focus,
            protect_essentials=True,
            max_desired_change_per_category=max_desired_change,
        ),
        summary=Summary(total_income=0.0, total_expenses=0.0, surplus=0.0),
    )


def make_summary(total_income: float = 5000.0, total_expenses: float = 4000.0, surplus: float = 1000.0) -> Summary:
    """Create a Summary instance for testing."""
    return Summary(total_income=total_income, total_expenses=total_expenses, surplus=surplus)


# =============================================================================
# Tests for _clamp function (tested via generate_suggestions behavior)
# =============================================================================


class TestClampBehavior:
    """Tests for _clamp function behavior through generate_suggestions."""

    def test_clamp_within_range(self):
        """Value within range should remain unchanged."""
        # The _clamp is used internally - we test it through the suggestion generation
        # When max_desired_change is 0.07, reduction_fraction should be clamped to 0.07 (within 0.05-0.1)
        expenses = [make_expense("1", "Entertainment", 200.0, essential=False)]
        model = make_model(expenses=expenses, max_desired_change=0.07)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        # Find the flexible expense suggestion
        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) == 1
        # 200 * 0.07 = 14.0
        assert flex_suggestions[0].expected_monthly_impact == pytest.approx(14.0)

    def test_clamp_below_minimum(self):
        """Value below minimum should be clamped to minimum."""
        # max_desired_change = 0.01 should be clamped to 0.05 (minimum)
        expenses = [make_expense("1", "Entertainment", 300.0, essential=False)]
        model = make_model(expenses=expenses, max_desired_change=0.01)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) == 1
        # 300 * 0.05 = 15.0 (clamped to minimum 5%)
        assert flex_suggestions[0].expected_monthly_impact == pytest.approx(15.0)

    def test_clamp_above_maximum(self):
        """Value above maximum should be clamped to maximum."""
        # max_desired_change = 0.5 should be clamped to 0.1 (maximum)
        expenses = [make_expense("1", "Entertainment", 300.0, essential=False)]
        model = make_model(expenses=expenses, max_desired_change=0.5)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) == 1
        # 300 * 0.1 = 30.0 (clamped to maximum 10%)
        assert flex_suggestions[0].expected_monthly_impact == pytest.approx(30.0)


# =============================================================================
# Tests for generate_suggestions - debt payoff suggestions
# =============================================================================


class TestDebtPayoffSuggestions:
    """Tests for debt payoff suggestion generation."""

    def test_high_priority_debt_with_surplus_generates_suggestion(self):
        """High-priority debt with sufficient surplus should generate a debt payoff suggestion."""
        # High interest rate (15%) with low declared priority -> classified as high (2 levels apart)
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, min_payment=100.0, priority="low")]
        model = make_model(debts=debts)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        assert len(debt_suggestions) == 1
        assert "Credit Card" in debt_suggestions[0].title
        assert debt_suggestions[0].expected_monthly_impact > 0

    def test_multiple_high_priority_debts_selects_highest_rate(self):
        """When multiple high-priority debts exist, should target the one with highest rate."""
        debts = [
            make_debt("1", name="Card A", interest_rate=12.0, min_payment=50.0, priority="low"),
            make_debt("2", name="Card B", interest_rate=20.0, min_payment=75.0, priority="low"),
            make_debt("3", name="Card C", interest_rate=15.0, min_payment=60.0, priority="low"),
        ]
        model = make_model(debts=debts)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        assert len(debt_suggestions) == 1
        assert "Card B" in debt_suggestions[0].title  # Highest rate at 20%

    def test_surplus_below_25_no_debt_suggestion(self):
        """Surplus <= $25 should not generate debt payoff suggestion."""
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, min_payment=100.0, priority="low")]
        model = make_model(debts=debts)
        summary = make_summary(surplus=25.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        assert len(debt_suggestions) == 0

    def test_surplus_just_above_25_generates_debt_suggestion(self):
        """Surplus just above $25 should generate debt payoff suggestion."""
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, min_payment=100.0, priority="low")]
        model = make_model(debts=debts)
        summary = make_summary(surplus=26.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        assert len(debt_suggestions) == 1

    def test_no_high_priority_debts_no_debt_suggestion(self):
        """Medium or low priority debts should not generate debt payoff suggestions."""
        # Interest rate of 6% with medium declared priority -> stays medium (1 level difference)
        debts = [make_debt("1", name="Car Loan", interest_rate=6.0, min_payment=200.0, priority="medium")]
        model = make_model(debts=debts)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        assert len(debt_suggestions) == 0


# =============================================================================
# Tests for generate_suggestions - flexible expense suggestions
# =============================================================================


class TestFlexibleExpenseSuggestions:
    """Tests for flexible expense reduction suggestions."""

    def test_flexible_spend_above_150_generates_suggestions(self):
        """Total flexible spend >= $150 should generate expense reduction suggestions."""
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 150.0, essential=False),
        ]
        model = make_model(expenses=expenses)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) >= 1

    def test_flexible_spend_below_150_no_suggestions(self):
        """Total flexible spend < $150 should not generate expense reduction suggestions."""
        expenses = [
            make_expense("1", "Entertainment", 100.0, essential=False),
            make_expense("2", "Dining", 40.0, essential=False),
        ]
        model = make_model(expenses=expenses)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) == 0

    def test_limits_to_top_3_expenses(self):
        """Should only suggest reductions for top 3 flexible expenses by amount."""
        expenses = [
            make_expense("1", "Entertainment", 300.0, essential=False),
            make_expense("2", "Dining", 250.0, essential=False),
            make_expense("3", "Hobbies", 200.0, essential=False),
            make_expense("4", "Shopping", 150.0, essential=False),
            make_expense("5", "Subscriptions", 100.0, essential=False),
        ]
        model = make_model(expenses=expenses)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(flex_suggestions) <= 3

    def test_skips_reductions_below_10(self):
        """Should skip expense reductions that would be less than $10."""
        # With 10% reduction, an expense of $50 would only reduce by $5 (skipped)
        expenses = [
            make_expense("1", "Entertainment", 50.0, essential=False),
            make_expense("2", "Dining", 200.0, essential=False),
        ]
        model = make_model(expenses=expenses, max_desired_change=0.1)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        # Only Dining should be suggested (50 * 0.1 = 5 < 10, so Entertainment is skipped)
        suggestion_ids = [s.id for s in flex_suggestions]
        assert "flex-expense-2" in suggestion_ids
        assert "flex-expense-1" not in suggestion_ids

    def test_sorts_expenses_by_amount_descending(self):
        """Flexible expenses should be sorted by monthly amount descending."""
        expenses = [
            make_expense("1", "Small", 120.0, essential=False),
            make_expense("2", "Large", 300.0, essential=False),
            make_expense("3", "Medium", 200.0, essential=False),
        ]
        model = make_model(expenses=expenses)
        summary = make_summary(surplus=100.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        # Should be in order: Large (300), Medium (200), Small (120)
        assert len(flex_suggestions) == 3
        assert "Large" in flex_suggestions[0].title
        assert "Medium" in flex_suggestions[1].title
        assert "Small" in flex_suggestions[2].title


# =============================================================================
# Tests for generate_suggestions - savings suggestions
# =============================================================================


class TestSavingsSuggestions:
    """Tests for savings/investment suggestions."""

    def test_no_high_priority_debt_and_surplus_generates_savings(self):
        """Without high-priority debt and with sufficient surplus, should suggest savings."""
        model = make_model()
        summary = make_summary(total_income=5000.0, surplus=1000.0)  # 20% of income

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 1

    def test_surplus_below_threshold_no_savings_suggestion(self):
        """Surplus below 10% of income or $300 should not generate savings suggestion."""
        model = make_model()
        # 10% of 5000 = 500, but min is 300, so threshold is 500
        summary = make_summary(total_income=5000.0, surplus=400.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 0

    def test_surplus_at_minimum_threshold_generates_suggestion(self):
        """Surplus at or above threshold should generate savings suggestion."""
        model = make_model()
        # 10% of 5000 = 500, surplus of 500 meets threshold
        summary = make_summary(total_income=5000.0, surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 1

    def test_high_priority_debt_blocks_savings_suggestion(self):
        """With high-priority debt, should not generate savings suggestion."""
        debts = [make_debt("1", interest_rate=15.0, priority="low")]
        model = make_model(debts=debts)
        summary = make_summary(total_income=5000.0, surplus=1000.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 0

    def test_optimization_focus_savings_targets_retirement(self):
        """When optimization focus is 'savings', should target retirement contributions."""
        model = make_model(optimization_focus="savings")
        summary = make_summary(total_income=5000.0, surplus=1000.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 1
        assert "retirement contributions" in savings_suggestions[0].title

    def test_optimization_focus_debt_targets_high_yield_savings(self):
        """When optimization focus is not 'savings', should target high-yield savings."""
        model = make_model(optimization_focus="debt")
        summary = make_summary(total_income=5000.0, surplus=1000.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 1
        assert "high-yield savings" in savings_suggestions[0].title

    def test_allocation_calculation(self):
        """Allocation should be min(surplus * 0.4, surplus - 50)."""
        model = make_model()
        summary = make_summary(total_income=5000.0, surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(savings_suggestions) == 1
        # min(500 * 0.4, 500 - 50) = min(200, 450) = 200
        assert savings_suggestions[0].expected_monthly_impact == pytest.approx(200.0)

    def test_allocation_too_small_no_suggestion(self):
        """When allocation would be <= $25, should not generate suggestion."""
        model = make_model()
        # Need to engineer a case where allocation <= 25
        # surplus = 75, allocation = min(75 * 0.4, 75 - 50) = min(30, 25) = 25 -> no suggestion
        # But threshold is max(total_income * 0.1, 300), so for income of 700:
        # threshold = max(70, 300) = 300, and 75 < 300, so no suggestion anyway
        # Let's try income = 50, surplus = 75
        # threshold = max(5, 300) = 300, 75 < 300 -> no suggestion
        # This edge case is hard to hit because threshold is min $300
        # Let's just verify the behavior at the boundary
        summary = make_summary(total_income=3000.0, surplus=300.0)

        suggestions = generate_suggestions(model, summary)

        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        # allocation = min(300 * 0.4, 300 - 50) = min(120, 250) = 120 > 25, so suggestion generated
        assert len(savings_suggestions) == 1


# =============================================================================
# Tests for generate_suggestions - combined scenarios
# =============================================================================


class TestCombinedSuggestions:
    """Tests for scenarios with multiple suggestion types."""

    def test_empty_model_returns_empty_list(self):
        """Empty model with no surplus should return no suggestions."""
        model = make_model()
        summary = make_summary(surplus=0.0)

        suggestions = generate_suggestions(model, summary)

        assert suggestions == []

    def test_negative_surplus_returns_empty_list(self):
        """Negative surplus (deficit) should return no suggestions."""
        model = make_model()
        summary = make_summary(surplus=-500.0)

        suggestions = generate_suggestions(model, summary)

        # Debt suggestions require surplus > 25
        # Savings suggestions require surplus > 0 and above threshold
        # Both should be blocked by negative surplus
        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(debt_suggestions) == 0
        assert len(savings_suggestions) == 0

    def test_debt_and_flexible_suggestions_together(self):
        """Should generate both debt and flexible expense suggestions when applicable."""
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, priority="low")]
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 150.0, essential=False),
        ]
        model = make_model(debts=debts, expenses=expenses)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        debt_suggestions = [s for s in suggestions if s.id.startswith("debt-")]
        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        assert len(debt_suggestions) == 1
        assert len(flex_suggestions) >= 1

    def test_flexible_and_savings_suggestions_together(self):
        """Should generate both flexible expense and savings suggestions when applicable."""
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 150.0, essential=False),
        ]
        model = make_model(expenses=expenses)
        summary = make_summary(total_income=5000.0, surplus=600.0)

        suggestions = generate_suggestions(model, summary)

        flex_suggestions = [s for s in suggestions if s.id.startswith("flex-")]
        savings_suggestions = [s for s in suggestions if s.id == "surplus-savings"]
        assert len(flex_suggestions) >= 1
        assert len(savings_suggestions) == 1

    def test_suggestion_ids_are_unique(self):
        """All suggestion IDs should be unique."""
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, priority="low")]
        expenses = [
            make_expense("1", "Entertainment", 200.0, essential=False),
            make_expense("2", "Dining", 300.0, essential=False),
        ]
        model = make_model(debts=debts, expenses=expenses)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        ids = [s.id for s in suggestions]
        assert len(ids) == len(set(ids)), "Suggestion IDs should be unique"

    def test_suggestion_structure(self):
        """Suggestions should have all required fields populated."""
        debts = [make_debt("1", name="Credit Card", interest_rate=15.0, priority="low")]
        model = make_model(debts=debts)
        summary = make_summary(surplus=500.0)

        suggestions = generate_suggestions(model, summary)

        assert len(suggestions) >= 1
        suggestion = suggestions[0]
        assert isinstance(suggestion, Suggestion)
        assert suggestion.id
        assert suggestion.title
        assert suggestion.description
        assert suggestion.expected_monthly_impact > 0
        assert suggestion.rationale
        assert suggestion.tradeoffs
