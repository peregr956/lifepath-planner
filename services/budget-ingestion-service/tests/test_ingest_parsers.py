from io import BytesIO

import pytest
from openpyxl import Workbook

from models.raw_budget import DraftBudgetModel, RawBudgetLine
from parsers.csv_parser import parse_csv_to_draft_model
from parsers.xlsx_parser import parse_xlsx_to_draft_model


def _build_xlsx_bytes(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.delete_rows(1, sheet.max_row)

    for row in rows:
        sheet.append(row)

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_parse_csv_to_draft_model_basic_rows():
    csv_content = "category,amount\nHousing,1200\nFood,250.50\n"

    model = parse_csv_to_draft_model(csv_content.encode("utf-8"))

    assert isinstance(model, DraftBudgetModel)
    assert model.detected_format == "categorical"
    assert len(model.lines) == 2
    assert all(isinstance(line, RawBudgetLine) for line in model.lines)
    assert [line.category_label for line in model.lines] == ["Housing", "Food"]
    assert model.lines[0].amount == pytest.approx(1200.0)
    assert model.lines[1].amount == pytest.approx(250.50)


def test_parse_xlsx_to_draft_model_basic_rows():
    file_bytes = _build_xlsx_bytes(
        [
            ("category", "amount", "description"),
            ("Housing", 1200, "Mortgage"),
            ("Food", 250.5, "Groceries"),
        ]
    )

    model = parse_xlsx_to_draft_model(file_bytes)

    assert isinstance(model, DraftBudgetModel)
    assert model.detected_format == "categorical"
    assert len(model.lines) == 2
    assert all(isinstance(line, RawBudgetLine) for line in model.lines)
    assert [line.category_label for line in model.lines] == ["Housing", "Food"]
    assert model.lines[0].amount == pytest.approx(1200.0)
    assert model.lines[1].amount == pytest.approx(250.5)
    assert model.lines[0].description == "Mortgage"
    assert model.lines[1].description == "Groceries"


def test_parse_csv_handles_missing_headers_gracefully():
    csv_content = "name,total_cost\nWidgets,500\n"

    model = parse_csv_to_draft_model(csv_content.encode("utf-8"))

    assert isinstance(model, DraftBudgetModel)
    assert model.detected_format == "categorical"
    assert model.lines == []
    assert model.notes is not None
    assert "Category column not detected" in model.notes
    assert "Amount column not detected" in model.notes
