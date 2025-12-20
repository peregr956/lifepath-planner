#!/usr/bin/env python3
"""
Real-world validation script for LifePath Planner.

Tests the full pipeline with real OpenAI API calls and generates a validation report.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

# Add project root to path
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
DEFAULT_TIMEOUT = 30.0


class ValidationError(Exception):
    """Raised when validation fails."""

    pass


class LifePathValidator:
    """Validates the LifePath Planner pipeline end-to-end."""

    def __init__(self, gateway_url: str = GATEWAY_URL, timeout: float = DEFAULT_TIMEOUT):
        self.gateway_url = gateway_url
        self.client = httpx.Client(timeout=timeout, follow_redirects=True)
        self.results: List[Dict[str, Any]] = []

    def check_health(self) -> None:
        """Verify the API gateway is running."""
        try:
            response = self.client.get(f"{self.gateway_url}/health")
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "ok":
                raise ValidationError(f"Gateway health check failed: {data}")
            print("✓ API Gateway is healthy")
        except httpx.RequestError as e:
            raise ValidationError(f"Cannot connect to gateway at {self.gateway_url}: {e}")

    def upload_budget(self, file_path: Path) -> str:
        """Upload a budget file and return the budget_id."""
        print(f"  Uploading {file_path.name}...")
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, "text/csv" if file_path.suffix == ".csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = self.client.post(f"{self.gateway_url}/upload-budget", files=files)

        response.raise_for_status()
        data = response.json()
        budget_id = data.get("budget_id")
        if not budget_id:
            raise ValidationError("No budget_id in upload response")

        detected_format = data.get("detected_format", "unknown")
        print(f"    ✓ Uploaded (budget_id: {budget_id}, format: {detected_format})")
        return budget_id

    def get_clarification_questions(self, budget_id: str) -> Dict[str, Any]:
        """Get clarification questions for a budget."""
        print("  Fetching clarification questions...")
        response = self.client.get(f"{self.gateway_url}/clarification-questions", params={"budget_id": budget_id})
        response.raise_for_status()
        data = response.json()

        needs_clarification = data.get("needs_clarification", False)
        question_count = len(data.get("questions", []))
        print(f"    ✓ Retrieved questions (needs_clarification: {needs_clarification}, count: {question_count})")

        if question_count > 0:
            print("    Questions:")
            for q in data.get("questions", []):
                question_id = q.get("question_id", "unknown")
                prompt = q.get("prompt", "")[:60] + "..." if len(q.get("prompt", "")) > 60 else q.get("prompt", "")
                print(f"      - {question_id}: {prompt}")

        return data

    def submit_answers(self, budget_id: str, questions: Dict[str, Any]) -> Dict[str, Any]:
        """Submit answers to clarification questions."""
        print("  Submitting answers...")

        # Generate default answers based on question components
        answers: Dict[str, Any] = {}
        for question in questions.get("questions", []):
            for component in question.get("components", []):
                field_id = component.get("field_id")
                if not field_id:
                    continue

                component_type = component.get("component", "")

                # Generate sensible defaults
                if field_id.startswith("essential_"):
                    answers[field_id] = True
                elif field_id == "optimization_focus":
                    answers[field_id] = "balanced"
                elif field_id == "primary_income_type":
                    answers[field_id] = "net"
                elif field_id == "primary_income_stability":
                    answers[field_id] = "stable"
                elif component_type == "number_input":
                    min_val = component.get("min", 0)
                    max_val = component.get("max", 100)
                    answers[field_id] = (min_val + max_val) / 2
                elif component_type == "dropdown":
                    options = component.get("options", [])
                    if options:
                        answers[field_id] = options[0].get("value", "yes")
                elif component_type == "toggle":
                    answers[field_id] = True

        response = self.client.post(
            f"{self.gateway_url}/submit-answers",
            json={"budget_id": budget_id, "answers": answers},
        )
        response.raise_for_status()
        data = response.json()

        ready = data.get("ready_for_summary", False)
        print(f"    ✓ Answers submitted (ready_for_summary: {ready})")
        return data

    def get_summary_and_suggestions(self, budget_id: str) -> Dict[str, Any]:
        """Get budget summary and optimization suggestions."""
        print("  Fetching summary and suggestions...")
        response = self.client.get(f"{self.gateway_url}/summary-and-suggestions", params={"budget_id": budget_id})
        response.raise_for_status()
        data = response.json()

        summary = data.get("summary", {})
        total_income = summary.get("total_income", 0)
        total_expenses = summary.get("total_expenses", 0)
        surplus = summary.get("surplus", 0)
        suggestion_count = len(data.get("suggestions", []))

        print(f"    ✓ Summary retrieved")
        print(f"      Income: ${total_income:,.2f}")
        print(f"      Expenses: ${total_expenses:,.2f}")
        print(f"      Surplus: ${surplus:,.2f}")
        print(f"      Suggestions: {suggestion_count}")

        if suggestion_count > 0:
            print("    Suggestions:")
            for s in data.get("suggestions", [])[:3]:  # Show first 3
                title = s.get("title", "Untitled")
                description = s.get("description", "")[:60] + "..." if len(s.get("description", "")) > 60 else s.get("description", "")
                print(f"      - {title}: {description}")

        return data

    def validate_budget(self, file_path: Path) -> Dict[str, Any]:
        """Validate a single budget file through the full pipeline."""
        print(f"\n{'='*60}")
        print(f"Validating: {file_path.name}")
        print(f"{'='*60}\n")

        start_time = time.time()
        errors = []

        try:
            # Step 1: Upload
            budget_id = self.upload_budget(file_path)

            # Step 2: Get questions
            questions = self.get_clarification_questions(budget_id)

            # Step 3: Submit answers
            answers = self.submit_answers(budget_id, questions)

            # Step 4: Get summary
            summary = self.get_summary_and_suggestions(budget_id)

            duration = time.time() - start_time

            print(f"\n✓ Validation complete ({duration:.1f}s)\n")

            return {
                "file": file_path.name,
                "budget_id": budget_id,
                "duration_seconds": round(duration, 2),
                "errors": [],
                "success": True,
                "questions": questions,
                "answers": answers,
                "summary": summary,
            }

        except Exception as e:
            duration = time.time() - start_time
            error_msg = str(e)
            print(f"\n✗ Validation failed: {error_msg}\n")
            return {
                "file": file_path.name,
                "duration_seconds": round(duration, 2),
                "errors": [error_msg],
                "success": False,
            }

    def validate_all(self, file_paths: List[Path], output_file: Optional[Path] = None) -> Dict[str, Any]:
        """Validate multiple budget files and generate a report."""
        print("=" * 60)
        print("LifePath Planner Real-World Validation")
        print("=" * 60)
        print()

        self.check_health()
        print()

        print(f"Starting validation with {len(file_paths)} budget file(s)...\n")

        for file_path in file_paths:
            if not file_path.exists():
                print(f"✗ File not found: {file_path}")
                continue
            result = self.validate_budget(file_path)
            self.results.append(result)

        # Generate summary report
        total_files = len(self.results)
        successful = sum(1 for r in self.results if r.get("success", False))
        total_errors = sum(len(r.get("errors", [])) for r in self.results)
        total_duration = sum(r.get("duration_seconds", 0) for r in self.results)

        report = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "model": os.getenv("OPENAI_MODEL", "unknown"),
            "gateway_url": self.gateway_url,
            "total_files": total_files,
            "successful": successful,
            "failed": total_files - successful,
            "total_errors": total_errors,
            "total_duration_seconds": round(total_duration, 2),
            "results": self.results,
        }

        if output_file:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, "w") as f:
                json.dump(report, f, indent=2)
            print(f"Report saved to: {output_file}")

        print("\n" + "=" * 60)
        print("Validation Summary")
        print("=" * 60)
        print(f"Files tested: {total_files}")
        print(f"Successful: {successful}")
        print(f"Failed: {total_files - successful}")
        print(f"Total errors: {total_errors}")
        print(f"Total duration: {total_duration:.1f}s")
        print("=" * 60)

        return report


def main():
    parser = argparse.ArgumentParser(description="Validate LifePath Planner with real OpenAI calls")
    parser.add_argument("files", nargs="+", type=Path, help="Budget files to validate (CSV or XLSX)")
    parser.add_argument("--gateway", default=GATEWAY_URL, help=f"API Gateway URL (default: {GATEWAY_URL})")
    parser.add_argument("--output", type=Path, help="Output file for validation report (JSON)")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT, help=f"Request timeout in seconds (default: {DEFAULT_TIMEOUT})")

    args = parser.parse_args()

    if not args.output:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        args.output = Path(f"validation_report_{timestamp}.json")

    validator = LifePathValidator(gateway_url=args.gateway, timeout=args.timeout)
    report = validator.validate_all(args.files, output_file=args.output)

    # Exit with error code if any validations failed
    if report["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

