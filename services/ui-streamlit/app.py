import streamlit as st
import requests
from typing import Optional, List, Dict, Any


API_BASE = "http://localhost:8080"


def init_session_state() -> None:
    defaults = {
        "step": 1,
        "budget_id": None,  # type: Optional[str]
        "questions": [],  # type: List[Dict[str, Any]]
        "needs_clarification": True,
        "questions_loaded_for": None,  # type: Optional[str]
        "partial_model": None,  # type: Optional[Dict[str, Any]]
        "summary": None,  # type: Optional[Dict[str, Any]]
        "summary_loaded_for": None,  # type: Optional[str]
        "category_shares": None,  # type: Optional[Dict[str, Any]]
        "suggestions": [],  # type: List[Dict[str, Any]]
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def render_step1() -> None:
    st.header("Step 1: Upload Budget")
    file = st.file_uploader(
        "Upload your budget (CSV or XLSX)",
        type=["csv", "xlsx"],
    )

    if file is not None:
        if st.button("Upload Budget"):
            files = {
                "file": (
                    file.name,
                    file.getvalue(),
                    file.type or "application/octet-stream",
                )
            }
            try:
                response = requests.post(f"{API_BASE}/upload-budget", files=files)
                response.raise_for_status()
            except requests.RequestException as exc:
                st.error(f"Upload failed: {exc}")
            else:
                data = response.json()
                budget_id = data.get("budget_id")
                detected_format = data.get("detected_format")
                summary_preview = data.get("summary_preview")

                if budget_id:
                    st.session_state["budget_id"] = budget_id
                    st.session_state["questions"] = []
                    st.session_state["partial_model"] = None
                    st.session_state["summary"] = None
                    st.session_state["summary_loaded_for"] = None
                    st.session_state["category_shares"] = None
                    st.session_state["suggestions"] = []
                    st.session_state["needs_clarification"] = True
                    st.session_state["questions_loaded_for"] = None
                    st.write(f"Detected format: {detected_format}")
                    st.write("Summary preview:")
                    st.write(summary_preview)
                else:
                    st.error("Upload response missing budget_id.")

    budget_id = st.session_state.get("budget_id")
    if budget_id:
        st.success(f"Budget uploaded: {budget_id}")

    if st.button(
        "Next: Clarify",
        disabled=budget_id is None,
    ):
        st.session_state["step"] = 2


def render_step2() -> None:
    st.header("Step 2: Answer Clarification Questions")

    budget_id = st.session_state.get("budget_id")
    if not budget_id:
        st.warning("No budget uploaded yet.")
        if st.button("Back to Step 1"):
            st.session_state["step"] = 1
        return

    if st.session_state.get("questions_loaded_for") != budget_id:
        try:
            response = requests.get(
                f"{API_BASE}/clarification-questions",
                params={"budget_id": budget_id},
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            st.error(f"Failed to load clarification questions: {exc}")
            return

        payload = response.json()
        st.session_state["questions"] = payload.get("questions", [])
        st.session_state["partial_model"] = payload.get("partial_model")
        st.session_state["needs_clarification"] = payload.get(
            "needs_clarification",
            True,
        )
        st.session_state["questions_loaded_for"] = budget_id

    questions: List[Dict[str, Any]] = st.session_state.get("questions", [])
    needs_clarification = st.session_state.get("needs_clarification", True)

    if not needs_clarification or not questions:
        st.info("No clarification needed.")
        if st.button("Skip to Summary"):
            st.session_state["step"] = 3
        return

    answers: Dict[str, Any] = {}
    with st.form("clarification_form"):
        for question in questions:
            prompt = question.get("prompt") or "Clarification Question"
            st.subheader(prompt)
            for component in question.get("components", []):
                field_id = component.get("field_id")
                if not field_id:
                    continue

                label = component.get("label") or component.get("prompt") or field_id
                comp_type = component.get("component")
                key = f"clarify_{field_id}"

                if comp_type == "number_input":
                    default_value = component.get("default", 0.0)
                    value = st.number_input(label, value=float(default_value), key=key)
                elif comp_type == "dropdown":
                    options = component.get("options") or []
                    if not options:
                        st.warning(f"No options available for {label}.")
                        continue
                    value = st.selectbox(label, options, key=key)
                elif comp_type == "toggle":
                    default_value = bool(component.get("default", False))
                    value = st.checkbox(label, value=default_value, key=key)
                elif comp_type == "slider":
                    min_value = component.get("min_value", 0)
                    max_value = component.get("max_value", 100)
                    default_value = component.get("default", min_value)
                    value = st.slider(
                        label,
                        min_value=min_value,
                        max_value=max_value,
                        value=default_value,
                        key=key,
                    )
                else:
                    value = st.text_input(label, key=key)

                answers[field_id] = value

        submitted = st.form_submit_button("Submit answers")

    if submitted:
        try:
            response = requests.post(
                f"{API_BASE}/submit-answers",
                json={
                    "budget_id": budget_id,
                    "answers": answers,
                },
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            st.error(f"Failed to submit answers: {exc}")
        else:
            st.session_state["step"] = 3


def render_step3() -> None:
    st.header("Step 3: Summary and Suggestions")

    budget_id = st.session_state.get("budget_id")
    if not budget_id:
        st.warning("No budget in session.")
        if st.button("Back to Step 1"):
            st.session_state["step"] = 1
        return

    if (
        st.session_state.get("summary") is None
        or st.session_state.get("summary_loaded_for") != budget_id
    ):
        try:
            response = requests.get(
                f"{API_BASE}/summary-and-suggestions",
                params={"budget_id": budget_id},
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            st.error(f"Failed to load summary: {exc}")
            return

        data = response.json()
        st.session_state["summary"] = data.get("summary")
        st.session_state["category_shares"] = data.get("category_shares", {})
        st.session_state["suggestions"] = data.get("suggestions", [])
        st.session_state["summary_loaded_for"] = budget_id

    summary = st.session_state.get("summary") or {}
    category_shares = st.session_state.get("category_shares") or {}
    suggestions = st.session_state.get("suggestions") or []

    if summary:
        st.subheader("Budget Summary")
        total_income = summary.get("total_income")
        total_expenses = summary.get("total_expenses")
        surplus = summary.get("surplus")

        metrics = []
        if total_income is not None:
            metrics.append(("Total Income", total_income))
        if total_expenses is not None:
            metrics.append(("Total Expenses", total_expenses))
        if surplus is not None:
            metrics.append(("Surplus", surplus))

        if metrics:
            cols = st.columns(len(metrics))
            for col, (label, value) in zip(cols, metrics):
                col.metric(label, f"${value:,.2f}")
        else:
            st.write(summary)

    if category_shares:
        st.subheader("Spending by Category")
        category_rows = [
            {
                "Category": category,
                "Share (%)": f"{share * 100:.1f}",
            }
            for category, share in category_shares.items()
        ]
        st.table(category_rows)

    if suggestions:
        st.subheader("Suggestions")
        for suggestion in suggestions:
            title = suggestion.get("title", "Suggestion")
            description = suggestion.get("description")
            impact = suggestion.get("expected_monthly_impact")
            rationale = suggestion.get("rationale")
            tradeoffs = suggestion.get("tradeoffs")

            st.markdown(f"**{title}**")
            if description:
                st.write(description)
            if impact is not None:
                st.write(f"Expected monthly impact: ${impact:,.2f}")
            if rationale:
                st.write(f"Rationale: {rationale}")
            if tradeoffs:
                st.write(f"Tradeoffs: {tradeoffs}")
            st.divider()

    if st.button("Start over"):
        for key, reset_value in {
            "budget_id": None,
            "questions": [],
            "partial_model": None,
            "summary": None,
            "summary_loaded_for": None,
            "category_shares": None,
            "suggestions": [],
            "needs_clarification": True,
            "questions_loaded_for": None,
        }.items():
            st.session_state[key] = reset_value
        st.session_state["step"] = 1


def main() -> None:
    init_session_state()
    st.title("LifePath Planner (MVP)")

    step = st.session_state.get("step", 1)
    if step == 1:
        render_step1()
    elif step == 2:
        render_step2()
    else:
        render_step3()


if __name__ == "__main__":
    main()
