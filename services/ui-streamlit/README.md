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
3. Default: `http://localhost:8000`

Set an environment variable if your API gateway is exposed on another host or port, e.g.:

```bash
export LIFEPATH_API_BASE_URL="http://localhost:8080"
```

## Running the app

```bash
streamlit run app.py
```

The UI displays the active gateway URL in the header so you can confirm it matches your running backend.
