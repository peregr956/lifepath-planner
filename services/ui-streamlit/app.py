import streamlit as st
import requests
from typing import Optional, List, Dict, Any


API_BASE = "http://localhost:8080"


def init_session_state() -> None:
    defaults = {
        "step": 1,
        "budget_id": None,  # type: Optional[str]
        "questions": [],  # type: List[Dict[str, Any]]
        "partial_model": None,  # type: Optional[Dict[str, Any]]
        "summary": None,  # type: Optional[Dict[str, Any]]
        "category_shares": None,  # type: Optional[Dict[str, Any]]
        "suggestions": [],  # type: List[Dict[str, Any]]
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def render_step1() -> None:
    st.header("Step 1: Upload Budget")


def render_step2() -> None:
    st.header("Step 2: Clarify Budget")


def render_step3() -> None:
    st.header("Step 3: Review Plan")


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
