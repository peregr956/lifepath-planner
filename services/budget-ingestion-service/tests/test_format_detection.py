"""Tests for format_detection.py - ledger vs categorical budget detection heuristics."""

from datetime import date, timedelta

import pytest
from models.raw_budget import RawBudgetLine
from parsers.format_detection import HeaderSignals, detect_format


def make_line(
    row_index: int = 0,
    line_date: date | None = None,
    category: str = "Category",
    description: str | None = None,
    amount: float = 100.0,
) -> RawBudgetLine:
    """Create a RawBudgetLine instance for testing."""
    return RawBudgetLine(
        source_row_index=row_index,
        date=line_date,
        category_label=category,
        description=description,
        amount=amount,
    )


def make_lines_with_dates(
    count: int,
    start_date: date,
    day_gap: int = 1,
    amounts: list[float] | None = None,
) -> list[RawBudgetLine]:
    """Create multiple lines with sequential dates."""
    lines = []
    for i in range(count):
        line_date = start_date + timedelta(days=i * day_gap)
        amount = amounts[i] if amounts else 100.0
        lines.append(make_line(row_index=i, line_date=line_date, amount=amount))
    return lines


# =============================================================================
# Tests for detect_format - main detection function
# =============================================================================


class TestDetectFormat:
    """Tests for detect_format function."""

    def test_ledger_detected_with_debit_column(self):
        """Debit column signal should contribute to ledger detection."""
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=True, has_credit_column=False, has_balance_column=False)

        detected_format, hints = detect_format(lines, header_signals)

        assert detected_format == "ledger"
        assert hints["detection_score"] >= 2

    def test_ledger_detected_with_credit_column(self):
        """Credit column signal should contribute to ledger detection."""
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=False, has_credit_column=True, has_balance_column=False)

        detected_format, hints = detect_format(lines, header_signals)

        assert detected_format == "ledger"
        assert hints["detection_score"] >= 2

    def test_ledger_detected_with_balance_and_dense_dates(self):
        """Balance column + dense dates should detect ledger."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=1)
        header_signals = HeaderSignals(has_debit_column=False, has_credit_column=False, has_balance_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        assert detected_format == "ledger"
        # balance (1) + dense dates (1) = 2
        assert hints["detection_score"] >= 2

    def test_categorical_detected_with_no_signals(self):
        """No ledger signals should detect categorical format."""
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=False, has_credit_column=False, has_balance_column=False)

        detected_format, hints = detect_format(lines, header_signals)

        assert detected_format == "categorical"
        assert hints["detection_score"] < 2

    def test_empty_lines_returns_categorical(self):
        """Empty lines list should return categorical format."""
        lines: list[RawBudgetLine] = []
        header_signals = HeaderSignals()

        detected_format, hints = detect_format(lines, header_signals)

        assert detected_format == "categorical"
        assert hints["line_count"] == 0
        assert hints["detection_score"] == 0

    def test_hints_include_all_expected_fields(self):
        """Hints dictionary should include all expected fields."""
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        assert "has_debit_column" in hints
        assert "has_credit_column" in hints
        assert "has_balance_column" in hints
        assert "line_count" in hints
        assert "has_dense_dates" in hints
        assert "has_positive_and_negative" in hints
        assert "detection_score" in hints
        assert "detected_format" in hints

    def test_header_signals_reflected_in_hints(self):
        """Header signals should be accurately reflected in hints."""
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=True, has_credit_column=False, has_balance_column=True)

        _, hints = detect_format(lines, header_signals)

        assert hints["has_debit_column"] is True
        assert hints["has_credit_column"] is False
        assert hints["has_balance_column"] is True


# =============================================================================
# Tests for score-based detection thresholds
# =============================================================================


class TestScoreThresholds:
    """Tests for score threshold behavior."""

    def test_score_2_is_ledger(self):
        """Score of exactly 2 should be classified as ledger."""
        # Use debit column for +2 points
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_debit_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        assert hints["detection_score"] == 2
        assert detected_format == "ledger"

    def test_score_1_is_categorical(self):
        """Score of 1 should be classified as categorical."""
        # Use balance column for +1 point
        lines = [make_line(row_index=i) for i in range(5)]
        header_signals = HeaderSignals(has_balance_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        assert hints["detection_score"] == 1
        assert detected_format == "categorical"

    def test_40_plus_lines_adds_score(self):
        """40 or more lines should add +1 to score."""
        lines = [make_line(row_index=i) for i in range(40)]
        header_signals = HeaderSignals(has_balance_column=True)  # +1

        detected_format, hints = detect_format(lines, header_signals)

        # balance (1) + 40 lines (1) = 2
        assert hints["detection_score"] == 2
        assert detected_format == "ledger"

    def test_39_lines_does_not_add_score(self):
        """39 lines should not add score for line count."""
        lines = [make_line(row_index=i) for i in range(39)]
        header_signals = HeaderSignals(has_balance_column=True)  # +1

        detected_format, hints = detect_format(lines, header_signals)

        # Only balance (1)
        assert hints["detection_score"] == 1
        assert detected_format == "categorical"

    def test_positive_negative_with_20_lines_adds_score(self):
        """Positive and negative amounts with 20+ lines should add +1 to score."""
        amounts = [100.0] * 10 + [-50.0] * 10  # 20 lines with both positive and negative
        lines = [make_line(row_index=i, amount=amounts[i]) for i in range(20)]
        header_signals = HeaderSignals(has_balance_column=True)  # +1

        detected_format, hints = detect_format(lines, header_signals)

        # balance (1) + positive_and_negative with 20 lines (1) = 2
        assert hints["has_positive_and_negative"] is True
        assert hints["detection_score"] == 2
        assert detected_format == "ledger"

    def test_positive_negative_with_19_lines_no_score(self):
        """Positive and negative amounts with <20 lines should not add score."""
        amounts = [100.0] * 10 + [-50.0] * 9  # 19 lines
        lines = [make_line(row_index=i, amount=amounts[i]) for i in range(19)]
        header_signals = HeaderSignals(has_balance_column=True)  # +1

        detected_format, hints = detect_format(lines, header_signals)

        # Only balance (1) - positive_and_negative doesn't count without 20+ lines
        assert hints["has_positive_and_negative"] is True
        assert hints["detection_score"] == 1
        assert detected_format == "categorical"


# =============================================================================
# Tests for _has_positive_and_negative (tested via detect_format)
# =============================================================================


class TestHasPositiveAndNegative:
    """Tests for positive/negative amount detection."""

    def test_mixed_amounts_detected(self):
        """Should detect when both positive and negative amounts exist."""
        lines = [
            make_line(row_index=0, amount=100.0),
            make_line(row_index=1, amount=-50.0),
        ]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_positive_and_negative"] is True

    def test_all_positive_not_mixed(self):
        """Should not detect mixed when all amounts are positive."""
        lines = [
            make_line(row_index=0, amount=100.0),
            make_line(row_index=1, amount=50.0),
            make_line(row_index=2, amount=200.0),
        ]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_positive_and_negative"] is False

    def test_all_negative_not_mixed(self):
        """Should not detect mixed when all amounts are negative."""
        lines = [
            make_line(row_index=0, amount=-100.0),
            make_line(row_index=1, amount=-50.0),
            make_line(row_index=2, amount=-200.0),
        ]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_positive_and_negative"] is False

    def test_zero_amount_not_counted(self):
        """Zero amounts should not count as positive or negative."""
        lines = [
            make_line(row_index=0, amount=0.0),
            make_line(row_index=1, amount=100.0),
        ]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        # Only positive, zero doesn't count
        assert hints["has_positive_and_negative"] is False

    def test_empty_lines_no_mixed(self):
        """Empty lines should not have mixed amounts."""
        lines: list[RawBudgetLine] = []
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_positive_and_negative"] is False


# =============================================================================
# Tests for _has_dense_date_cadence (tested via detect_format)
# =============================================================================


class TestHasDenseDateCadence:
    """Tests for dense date cadence detection."""

    def test_daily_dates_detected_as_dense(self):
        """Daily transactions (1 day gap) should be detected as dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=1)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is True

    def test_weekly_dates_detected_as_dense(self):
        """Weekly transactions (7 day gap) should be detected as dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=7)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is True

    def test_sparse_dates_not_dense(self):
        """Monthly transactions (30 day gap) should not be detected as dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=30)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is False

    def test_fewer_than_6_dates_not_dense(self):
        """Fewer than 6 unique dates should not be detected as dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=5, start_date=start_date, day_gap=1)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is False

    def test_exactly_6_dates_can_be_dense(self):
        """Exactly 6 unique dates with small gaps should be dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=6, start_date=start_date, day_gap=2)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is True

    def test_no_dates_not_dense(self):
        """Lines without dates should not be detected as dense."""
        lines = [make_line(row_index=i, line_date=None) for i in range(10)]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is False

    def test_duplicate_dates_counted_once(self):
        """Duplicate dates should be counted as unique dates only once."""
        # Create 10 lines but only 4 unique dates
        same_date = date(2024, 1, 1)
        lines = [make_line(row_index=i, line_date=same_date) for i in range(10)]
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        # Only 1 unique date < 6, so not dense
        assert hints["has_dense_dates"] is False

    def test_mixed_none_and_valid_dates(self):
        """Lines with some None dates should only count valid dates."""
        start_date = date(2024, 1, 1)
        lines = []
        for i in range(10):
            line_date = start_date + timedelta(days=i) if i % 2 == 0 else None
            lines.append(make_line(row_index=i, line_date=line_date))
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        # 5 unique dates (0, 2, 4, 6, 8 days from start) < 6, so not dense
        assert hints["has_dense_dates"] is False

    def test_8_day_gap_not_dense(self):
        """8 day gap (just above 7) should not be detected as dense."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=8)
        header_signals = HeaderSignals()

        _, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is False


# =============================================================================
# Tests for mixed signal scenarios
# =============================================================================


class TestMixedSignals:
    """Tests for scenarios with multiple detection signals."""

    def test_all_signals_maximum_score(self):
        """All ledger signals present should produce maximum score."""
        # Create lines with dense dates, positive/negative amounts, 40+ lines
        start_date = date(2024, 1, 1)
        amounts = [100.0 if i % 2 == 0 else -50.0 for i in range(45)]
        lines = []
        for i in range(45):
            line_date = start_date + timedelta(days=i)
            lines.append(make_line(row_index=i, line_date=line_date, amount=amounts[i]))
        header_signals = HeaderSignals(has_debit_column=True, has_credit_column=True, has_balance_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        # debit+credit (2) + balance (1) + dense dates (1) + positive/negative with 20+ (1) + 40+ lines (1) = 6
        assert detected_format == "ledger"
        assert hints["detection_score"] == 6

    def test_ledger_threshold_boundary(self):
        """Score of exactly 2 should be ledger, 1 should be categorical."""
        lines = [make_line(row_index=i) for i in range(10)]

        # Score 1 - categorical
        header_signals_1 = HeaderSignals(has_balance_column=True)
        detected_format_1, hints_1 = detect_format(lines, header_signals_1)
        assert detected_format_1 == "categorical"
        assert hints_1["detection_score"] == 1

        # Score 2 - ledger
        header_signals_2 = HeaderSignals(has_debit_column=True)
        detected_format_2, hints_2 = detect_format(lines, header_signals_2)
        assert detected_format_2 == "ledger"
        assert hints_2["detection_score"] == 2

    def test_dense_dates_alone_categorical(self):
        """Dense dates alone (score 1) should be categorical."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=1)
        header_signals = HeaderSignals()

        detected_format, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is True
        assert hints["detection_score"] == 1
        assert detected_format == "categorical"

    def test_dense_dates_plus_balance_is_ledger(self):
        """Dense dates + balance column (score 2) should be ledger."""
        start_date = date(2024, 1, 1)
        lines = make_lines_with_dates(count=10, start_date=start_date, day_gap=1)
        header_signals = HeaderSignals(has_balance_column=True)

        detected_format, hints = detect_format(lines, header_signals)

        assert hints["has_dense_dates"] is True
        assert hints["detection_score"] == 2
        assert detected_format == "ledger"
