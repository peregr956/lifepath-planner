# Quick Start: Real-World Validation

## 1. Prepare Your Environment

```bash
# Ensure .env has OpenAI credentials
cat .env | grep OPENAI
# Should show:
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_API_BASE=https://api.openai.com/v1
```

## 2. Start Services with OpenAI

```bash
CLARIFICATION_PROVIDER=openai SUGGESTION_PROVIDER=openai npm run dev
```

Wait for all services to start (you'll see 5 services running).

## 3. Run Validation

**Option A: Automated Python Script** (Recommended)
```bash
python scripts/validate_real_world.py sample_budget.csv
```

**Option B: Manual UI Testing**
1. Open http://localhost:3000
2. Upload a budget file
3. Answer questions
4. Review suggestions

**Option C: Bash Script**
```bash
./scripts/validate_real_world.sh sample_budget.csv
```

## 4. Check Results

- ✅ All steps complete without errors
- ✅ Questions are relevant to your budget
- ✅ Suggestions are realistic and actionable
- ✅ Summary calculations are correct

## 5. Review Full Guide

For detailed validation checklists, troubleshooting, and monitoring:
```bash
cat docs/real_world_validation.md
```

## Troubleshooting

**Services won't start?**
- Check ports 8000-8003 and 3000 are free
- Verify Python dependencies: `pip install -r requirements-dev.txt`

**OpenAI errors?**
- Verify API key is valid and has credits
- Check rate limits in OpenAI dashboard
- Try `gpt-4o-mini` instead of `gpt-4o` to reduce costs

**Validation script fails?**
- Ensure services are running: `curl http://localhost:8000/health`
- Check service logs for errors
- Verify budget file format (CSV or XLSX)


