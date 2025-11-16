import os
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests
import streamlit as st


DEFAULT_HOST_PORTS: Tuple[Tuple[str, int], ...] = (
    ("localhost", 8000),
    ("127.0.0.1", 8000),
    ("localhost", 8080),
    ("127.0.0.1", 8080),
    ("host.docker.internal", 8000),
    ("host.docker.internal", 8080),
    ("api-gateway", 8000),
    ("api-gateway", 8080),
)
DEFAULT_API_BASE_CANDIDATES: Sequence[str] = tuple(
    f"http://{host}:{port}" for host, port in DEFAULT_HOST_PORTS
)
_ENV_API_BASE_KEYS = ("LIFEPATH_API_BASE_URL", "API_BASE_URL", "GATEWAY_BASE_URL")
_SECRET_API_BASE_KEYS = ("api_base_url", "API_BASE_URL", "gateway_base_url")
_ENV_CANDIDATE_KEYS = ("LIFEPATH_API_BASE_CANDIDATES", "API_BASE_CANDIDATES")
_SECRET_CANDIDATE_KEYS = ("api_base_candidates", "API_BASE_CANDIDATES")
API_REQUEST_TIMEOUT = 30.0


def _first_defined(values) -> Optional[str]:
    for value in values:
        if value:
            return str(value).strip()
    return None


def _normalize_base_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    base = str(value).strip().rstrip("/")
    if not base:
        return None
    if not base.startswith(("http://", "https://")):
        base = f"http://{base}"
    return base


def _coerce_candidate_values(raw_value: Any) -> List[str]:
    if raw_value is None:
        return []

    if isinstance(raw_value, (list, tuple, set)):
        raw_items = [str(item) for item in raw_value]
    else:
        raw_items = re.split(r"[,\\s]+", str(raw_value))

    candidates: List[str] = []
    for item in raw_items:
        normalized = _normalize_base_url(item)
        if normalized and normalized not in candidates:
            candidates.append(normalized)
    return candidates


def _resolve_api_bases() -> List[str]:
    env_base = _first_defined(os.environ.get(name) for name in _ENV_API_BASE_KEYS)

    secret_base: Optional[str] = None
    secrets_obj = getattr(st, "secrets", None)
    if secrets_obj is not None and hasattr(secrets_obj, "get"):
        secret_base = _first_defined(secrets_obj.get(key) for key in _SECRET_API_BASE_KEYS)

    manual_base = _normalize_base_url(_first_defined([secret_base, env_base]))

    env_candidate_value = _first_defined(os.environ.get(name) for name in _ENV_CANDIDATE_KEYS)
    secret_candidate_value = None
    if secrets_obj is not None and hasattr(secrets_obj, "get"):
        secret_candidate_value = _first_defined(secrets_obj.get(key) for key in _SECRET_CANDIDATE_KEYS)

    resolved_candidates: List[str] = []
    resolved_candidates.extend(_coerce_candidate_values(secret_candidate_value))
    resolved_candidates.extend(_coerce_candidate_values(env_candidate_value))

    bases: List[str] = []
    if manual_base:
        bases.append(manual_base)

    for candidate in [*resolved_candidates, *DEFAULT_API_BASE_CANDIDATES]:
        normalized = _normalize_base_url(candidate)
        if normalized and normalized not in bases:
            bases.append(normalized)
    return bases or [DEFAULT_API_BASE_CANDIDATES[0]]


API_BASE_CANDIDATES = list(_resolve_api_bases())
_ACTIVE_API_BASE = API_BASE_CANDIDATES[0]


def get_active_api_base() -> str:
    try:
        return st.session_state.get("api_base", _ACTIVE_API_BASE)
    except RuntimeError:
        return _ACTIVE_API_BASE


def get_api_base_candidates() -> List[str]:
    try:
        candidates = st.session_state.get("api_base_candidates")
    except RuntimeError:
        candidates = None

    if candidates:
        return list(candidates)
    return list(API_BASE_CANDIDATES)


def _set_active_api_base(base: str) -> None:
    global _ACTIVE_API_BASE
    _ACTIVE_API_BASE = base
    try:
        st.session_state["api_base"] = base
    except RuntimeError:
        pass


def _set_api_base_candidates(candidates: Sequence[str]) -> None:
    normalized_candidates: List[str] = []
    for candidate in candidates:
        normalized = _normalize_base_url(candidate)
        if normalized and normalized not in normalized_candidates:
            normalized_candidates.append(normalized)

    if not normalized_candidates:
        normalized_candidates = list(API_BASE_CANDIDATES)

    try:
        st.session_state["api_base_candidates"] = normalized_candidates
    except RuntimeError:
        pass


def _add_api_base_candidate(base: str) -> None:
    candidates = get_api_base_candidates()
    updated = [base] + [candidate for candidate in candidates if candidate != base]
    _set_api_base_candidates(updated)
    _set_active_api_base(base)


def render_backend_selector() -> None:
    st.sidebar.header("Backend connection")

    candidates = get_api_base_candidates()
    active_base = get_active_api_base()

    if active_base not in candidates:
        _add_api_base_candidate(active_base)
        candidates = get_api_base_candidates()

    try:
        selected_index = candidates.index(active_base)
    except ValueError:
        selected_index = 0

    selected_base = st.sidebar.selectbox(
        "Known gateways",
        candidates,
        index=selected_index,
        key="api_base_known_selector",
        help="Choose which backend/API gateway this UI should call.",
    )

    if selected_base != active_base:
        _set_active_api_base(selected_base)

    custom_url = st.sidebar.text_input(
        "Add custom gateway URL",
        key="api_base_custom_input",
        placeholder="http://host.docker.internal:8000",
    )
    if st.sidebar.button("Use custom gateway", key="api_base_custom_button"):
        normalized = _normalize_base_url(custom_url)
        if not normalized:
            st.sidebar.error("Enter a valid http:// or https:// URL.")
        else:
            _add_api_base_candidate(normalized)
            st.sidebar.success(f"Active backend updated to {normalized}")


def _backend_request(method: str, path: str, **kwargs) -> requests.Response:
    normalized_path = path if path.startswith("/") else f"/{path}"
    request_kwargs = dict(kwargs)
    timeout = request_kwargs.pop("timeout", API_REQUEST_TIMEOUT)
    last_exc: Optional[requests.RequestException] = None

    for base in get_api_base_candidates():
        url = f"{base}{normalized_path}"
        try:
            response = requests.request(method, url, timeout=timeout, **request_kwargs)
        except requests.RequestException as exc:
            last_exc = exc
            continue
        _set_active_api_base(base)
        return response

    candidates = ", ".join(get_api_base_candidates())
    raise last_exc or requests.ConnectionError(f"Unable to reach backend via {candidates}")


def show_backend_unreachable_error() -> None:
    attempted = ", ".join(get_api_base_candidates())
    st.error(
        f"Unable to reach the backend service at {get_active_api_base()}. "
        f"Tried: {attempted}. Ensure the API gateway is running and reachable from this Streamlit app, "
        "or set LIFEPATH_API_BASE_URL / API_BASE_URL to the correct host."
    )


def show_backend_error(response: requests.Response) -> None:
    try:
        payload = response.json()
    except ValueError:
        payload = None

    error_message = payload.get("error") if isinstance(payload, dict) else None
    if error_message:
        st.error(error_message)
    else:
        st.error(f"Backend error ({response.status_code}): {response.text}")


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
        "api_base": _ACTIVE_API_BASE,
        "api_base_candidates": list(API_BASE_CANDIDATES),
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def render_step1() -> None:
    st.header("Step 1: Upload Budget")
    budget_id = st.session_state.get("budget_id")
    if budget_id:
        st.success(f"Budget uploaded: {budget_id}")

    if st.button(
        "Next: Clarify",
        disabled=budget_id is None,
    ):
        st.session_state["step"] = 2
        return

    file = st.file_uploader(
        "Upload your budget (CSV or XLSX)",
        type=["csv", "xlsx"],
    )

    if file is not None and st.button("Upload Budget"):
        files = {
            "file": (
                file.name,
                file.getvalue(),
                file.type or "application/octet-stream",
            )
        }
        try:
            response = _backend_request("post", "/upload-budget", files=files)
        except requests.RequestException:
            show_backend_unreachable_error()
            return

        if response.status_code >= 400:
            show_backend_error(response)
            return

        try:
            data = response.json()
        except ValueError:
            st.error("Unexpected response from backend.")
            return

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
            response = _backend_request(
                "get",
                "/clarification-questions",
                params={"budget_id": budget_id},
            )
        except requests.RequestException:
            show_backend_unreachable_error()
            return

        if response.status_code >= 400:
            show_backend_error(response)
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
            response = _backend_request(
                "post",
                "/submit-answers",
                json={
                    "budget_id": budget_id,
                    "answers": answers,
                },
            )
        except requests.RequestException:
            show_backend_unreachable_error()
            return

        if response.status_code >= 400:
            show_backend_error(response)
            return

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
            response = _backend_request(
                "get",
                "/summary-and-suggestions",
                params={"budget_id": budget_id},
            )
        except requests.RequestException:
            show_backend_unreachable_error()
            return

        if response.status_code >= 400:
            show_backend_error(response)
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
    render_backend_selector()
    st.title("LifePath Planner (MVP)")

    step = st.session_state.get("step", 1)
    st.caption(f"Step {step} of 3 · API base: {get_active_api_base()}")

    if step == 1:
        render_step1()
    elif step == 2:
        render_step2()
    else:
        render_step3()


if __name__ == "__main__":
    main()
