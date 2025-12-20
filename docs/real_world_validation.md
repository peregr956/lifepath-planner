# Real-World Validation Guide

This guide helps you validate the LifePath Planner prototype with real OpenAI API calls and actual budget data.

## Prerequisites

1. **OpenAI API Key**: Ensure your `.env` file contains valid credentials:
   ```bash
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini  # or gpt-4o for better quality
   OPENAI_API_BASE=https://api.openai.com/v1
   ```

2. **Budget Test Files**: Prepare 2-3 real budget files (CSV or XLSX) that represent different scenarios:
   - Simple budget (income + basic expenses)
   - Budget with debt (credit cards, loans)
   - Complex budget (multiple income sources, many categories)

3. **Cost Monitoring**: Set up OpenAI usage alerts in your OpenAI dashboard to track spending during validation.

## Validation Approaches

### Option 1: Manual UI Testing (Recommended for First Validation)

**Best for**: Getting a feel for the full user experience and catching UI/UX issues.

1. **Start the stack with OpenAI enabled**:
   ```bash
   CLARIFICATION_PROVIDER=openai SUGGESTION_PROVIDER=openai npm run dev
   ```

2. **Open the UI**: Navigate to http://localhost:3000

3. **Test the full flow**:
   - Upload a budget file
   - Review the detected format and preview
   - Answer clarification questions
   - Review the summary and suggestions

4. **Validation Checklist**:
   - [ ] Budget file uploads successfully
   - [ ] Format detection is accurate
   - [ ] Clarification questions are relevant and contextual
   - [ ] Questions use appropriate UI components (number inputs, dropdowns, toggles)
   - [ ] Summary calculations are correct (income, expenses, surplus)
   - [ ] Suggestions are realistic and actionable
   - [ ] Suggestions align with user priorities (if specified)
   - [ ] No errors in browser console
   - [ ] No errors in service logs

### Option 2: Automated End-to-End Test Script

**Best for**: Systematic validation with multiple budget files and regression testing.

See `scripts/validate_real_world.sh` for an automated test script that:
- Runs the full pipeline with real OpenAI calls
- Tests multiple budget scenarios
- Validates response quality
- Tracks costs and errors
- Generates a validation report

### Option 3: API-Level Testing

**Best for**: Validating service contracts and integration points without UI overhead.

Use the API Gateway endpoints directly:

```bash
# 1. Upload budget
curl -X POST http://localhost:8000/upload-budget \
  -F "file=@sample_budget.csv"

# 2. Get clarification questions
curl "http://localhost:8000/clarification-questions?budget_id=<BUDGET_ID>"

# 3. Submit answers
curl -X POST http://localhost:8000/submit-answers \
  -H "Content-Type: application/json" \
  -d '{"budget_id": "<BUDGET_ID>", "answers": {...}}'

# 4. Get summary and suggestions
curl "http://localhost:8000/summary-and-suggestions?budget_id=<BUDGET_ID>"
```

## What to Validate

### 1. Budget Ingestion
- ✅ Correctly identifies categorical vs ledger format
- ✅ Extracts income and expenses accurately
- ✅ Handles negative amounts correctly
- ✅ Preserves category names and metadata

### 2. AI Clarification
- ✅ Questions are relevant to the budget context
- ✅ Questions ask for missing critical information (debt rates, essential flags, etc.)
- ✅ Question count is reasonable (4-7 questions as per PRD)
- ✅ UI components are appropriate for each question type
- ✅ Questions don't ask for information already present in the budget

### 3. Budget Summary
- ✅ Total income matches sum of income lines
- ✅ Total expenses matches sum of expense lines
- ✅ Surplus/deficit calculation is correct
- ✅ Category shares are accurate percentages
- ✅ Debt service ratio is calculated correctly (if applicable)

### 4. AI Suggestions
- ✅ Suggestions are realistic and actionable
- ✅ Suggestions respect essential category flags
- ✅ High-interest debt is prioritized (if applicable)
- ✅ Suggestions include expected impact and tradeoffs
- ✅ Suggestions align with user's optimization focus (if specified)
- ✅ Suggestions don't recommend impossible changes

### 5. Error Handling
- ✅ Graceful fallback to deterministic providers if OpenAI fails
- ✅ Clear error messages for invalid inputs
- ✅ Rate limiting works correctly
- ✅ Timeout handling prevents hanging requests

### 6. Cost & Performance
- ✅ API calls complete within reasonable time (< 10s per call)
- ✅ Token usage is within expected ranges
- ✅ No unexpected rate limit errors
- ✅ Cost per session is reasonable (< $0.10 per full flow)

## Monitoring During Validation

### Enable Telemetry

```bash
ENABLE_TELEMETRY=true \
OTEL_CONSOLE_EXPORT=true \
CLARIFICATION_PROVIDER=openai \
SUGGESTION_PROVIDER=openai \
npm run dev
```

### Check Service Logs

Watch for:
- `openai_clarification_request` / `openai_clarification_response` events
- `openai_suggestion_request` / `openai_suggestion_response` events
- `openai_*_error` events (should be rare)
- `openai_fallback_to_deterministic` events (indicates API issues)

### Monitor OpenAI Dashboard

- Check usage and costs in real-time
- Verify rate limits aren't being hit
- Review token usage per request
- Set up billing alerts if needed

## Common Issues & Solutions

### Issue: OpenAI API errors
**Symptoms**: `openai_*_error` events in logs, fallback to deterministic
**Solutions**:
- Verify API key is valid and has credits
- Check rate limits in OpenAI dashboard
- Ensure model name is correct (e.g., `gpt-4o-mini` not `gpt-4-mini`)
- Verify network connectivity

### Issue: Questions are generic or irrelevant
**Symptoms**: Questions don't match the budget context
**Solutions**:
- Check that the budget model is being passed correctly to OpenAI
- Review prompt templates in `services/clarification-service/src/providers/openai_clarification.py`
- Try a more capable model (e.g., `gpt-4o` instead of `gpt-4o-mini`)

### Issue: Suggestions are unrealistic
**Symptoms**: Suggestions recommend impossible changes or ignore constraints
**Solutions**:
- Verify essential flags are being set correctly
- Check that the summary includes all necessary context
- Review prompt in `services/optimization-service/src/providers/openai_suggestions.py`
- Consider adjusting temperature (lower = more deterministic)

### Issue: High costs
**Symptoms**: Unexpected charges in OpenAI dashboard
**Solutions**:
- Use `gpt-4o-mini` instead of `gpt-4o` for testing
- Reduce `CLARIFICATION_PROVIDER_MAX_TOKENS` and `SUGGESTION_PROVIDER_MAX_TOKENS`
- Enable rate limiting: `GATEWAY_RATE_LIMIT_PER_MIN=10`
- Cache responses for repeated tests

## Validation Report Template

After completing validation, document your findings:

```markdown
# Validation Report - [Date]

## Test Environment
- OpenAI Model: gpt-4o-mini
- Budget Files Tested: 3
- Total Sessions: 5
- Total Cost: $X.XX

## Results Summary
- ✅ Budget Ingestion: Pass
- ✅ AI Clarification: Pass (with minor issues)
- ✅ Budget Summary: Pass
- ⚠️ AI Suggestions: Partial (see issues below)
- ✅ Error Handling: Pass

## Issues Found
1. [Description of issue]
   - Impact: [High/Medium/Low]
   - Steps to reproduce: [Steps]
   - Suggested fix: [Fix]

## Recommendations
- [Recommendation 1]
- [Recommendation 2]
```

## Next Steps After Validation

1. **Fix Critical Issues**: Address any blockers before wider testing
2. **Optimize Costs**: Tune token limits and model selection based on quality vs cost tradeoffs
3. **Improve Prompts**: Refine OpenAI prompts based on observed issues
4. **Add Monitoring**: Set up alerts for production deployment
5. **User Testing**: Once validated, conduct user acceptance testing with real users

