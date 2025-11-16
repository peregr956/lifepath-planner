# Streamlit UI

This service provides the lightweight Streamlit front-end for the LifePath Planner demo. It talks to the API Gateway over HTTP and walks through the upload → clarification → summary flow.

## Prerequisites

- Python 3.12+
- Backend services running locally (at minimum the API Gateway)

Install dependencies:

```bash
pip install -r requirements.txt
```

## Configuring the API gateway URL

The Streamlit app now auto-detects the API base URL in this priority order:

1. `st.secrets["api_base_url"]` (or `API_BASE_URL` / `gateway_base_url` keys)
2. Environment variables: `LIFEPATH_API_BASE_URL`, `API_BASE_URL`, `GATEWAY_BASE_URL`
3. Additional candidate lists from `st.secrets["api_base_candidates"]` or `LIFEPATH_API_BASE_CANDIDATES` (comma/space-separated)
4. Built-in fallbacks: `http://localhost|127.0.0.1|host.docker.internal|api-gateway` on ports `8000` and `8080`

This means the UI will automatically try container-friendly hosts (like `host.docker.internal:8000` or `api-gateway:8000`) if the local loopback URLs fail.

You can still pin a single host via environment variable:

```bash
export LIFEPATH_API_BASE_URL="http://localhost:8080"
```

or provide an ordered list of fallbacks:

```bash
export LIFEPATH_API_BASE_CANDIDATES="https://gateway.example.com, http://host.docker.internal:8000"
```

At runtime, use the **Backend connection** controls in the Streamlit sidebar to pick any discovered gateway or add a custom URL without restarting the app.

## Running the app

```bash
streamlit run app.py
```

The UI displays the active gateway URL in the header so you can confirm it matches your running backend.
