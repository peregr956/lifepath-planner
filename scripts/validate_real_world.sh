#!/usr/bin/env bash

# Real-world validation script for LifePath Planner
# Tests the full pipeline with real OpenAI API calls

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8000}"
BUDGET_FILES=("${@:-sample_budget.csv}")
VALIDATION_REPORT="${VALIDATION_REPORT:-validation_report_$(date +%Y%m%d_%H%M%S).json}"

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check if .env exists and has OpenAI credentials
    if [[ ! -f "$ROOT_DIR/.env" ]]; then
        echo -e "${RED}Error: .env file not found. Create it from .env.example${NC}"
        exit 1
    fi
    
    source "$ROOT_DIR/.env"
    
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        echo -e "${RED}Error: OPENAI_API_KEY not set in .env${NC}"
        exit 1
    fi
    
    if [[ -z "${OPENAI_MODEL:-}" ]]; then
        echo -e "${YELLOW}Warning: OPENAI_MODEL not set, defaulting to gpt-4o-mini${NC}"
        export OPENAI_MODEL="gpt-4o-mini"
    fi
    
    # Check if services are running
    if ! curl -s "$GATEWAY_URL/health" > /dev/null; then
        echo -e "${RED}Error: API Gateway not responding at $GATEWAY_URL${NC}"
        echo -e "${YELLOW}Start services with: CLARIFICATION_PROVIDER=openai SUGGESTION_PROVIDER=openai npm run dev${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Prerequisites check passed${NC}"
}

# Upload a budget file
upload_budget() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    echo -e "${BLUE}Uploading budget: $file_name${NC}"
    
    local response=$(curl -s -X POST "$GATEWAY_URL/upload-budget" \
        -F "file=@$file_path" \
        -w "\n%{http_code}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" != "200" ]]; then
        echo -e "${RED}✗ Upload failed (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    local budget_id=$(echo "$body" | jq -r '.budget_id // empty')
    
    if [[ -z "$budget_id" ]]; then
        echo -e "${RED}✗ No budget_id in response${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    echo -e "${GREEN}✓ Upload successful (budget_id: $budget_id)${NC}"
    echo "$budget_id"
}

# Get clarification questions
get_clarification_questions() {
    local budget_id="$1"
    
    echo -e "${BLUE}Fetching clarification questions...${NC}"
    
    local response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/clarification-questions?budget_id=$budget_id")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" != "200" ]]; then
        echo -e "${RED}✗ Failed to get questions (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    local needs_clarification=$(echo "$body" | jq -r '.needs_clarification // false')
    local question_count=$(echo "$body" | jq -r '.questions | length // 0')
    
    echo -e "${GREEN}✓ Questions retrieved (needs_clarification: $needs_clarification, count: $question_count)${NC}"
    
    if [[ "$needs_clarification" == "true" && "$question_count" -gt 0 ]]; then
        echo -e "${BLUE}Questions:${NC}"
        echo "$body" | jq -r '.questions[] | "  - \(.question_id): \(.prompt)"'
    fi
    
    echo "$body"
}

# Submit answers (auto-generates reasonable defaults)
submit_answers() {
    local budget_id="$1"
    local questions_json="$2"
    
    echo -e "${BLUE}Submitting answers...${NC}"
    
    # Extract field IDs from questions and generate default answers
    local answers=$(echo "$questions_json" | jq -c '{
        answers: [
            .questions[]?.components[]? | 
            select(.field_id) | 
            {
                key: .field_id,
                value: (
                    if .field_id | startswith("essential_") then true
                    elif .field_id == "optimization_focus" then "balanced"
                    elif .field_id == "primary_income_type" then "net"
                    elif .field_id == "primary_income_stability" then "stable"
                    elif .component == "number_input" then (.min // 0) + ((.max // 100) - (.min // 0)) / 2
                    elif .component == "dropdown" then (.options[0].value // "yes")
                    elif .component == "toggle" then true
                    else null
                    end
                )
            }
        ] | from_entries
    }')
    
    local answers_obj=$(echo "$answers" | jq -c '.answers')
    
    local response=$(curl -s -X POST "$GATEWAY_URL/submit-answers" \
        -H "Content-Type: application/json" \
        -d "{\"budget_id\": \"$budget_id\", \"answers\": $answers_obj}" \
        -w "\n%{http_code}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" != "200" ]]; then
        echo -e "${RED}✗ Failed to submit answers (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    local ready=$(echo "$body" | jq -r '.ready_for_summary // false')
    echo -e "${GREEN}✓ Answers submitted (ready_for_summary: $ready)${NC}"
    echo "$body"
}

# Get summary and suggestions
get_summary_and_suggestions() {
    local budget_id="$1"
    
    echo -e "${BLUE}Fetching summary and suggestions...${NC}"
    
    local response=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/summary-and-suggestions?budget_id=$budget_id")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" != "200" ]]; then
        echo -e "${RED}✗ Failed to get summary (HTTP $http_code)${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    
    local total_income=$(echo "$body" | jq -r '.summary.total_income // 0')
    local total_expenses=$(echo "$body" | jq -r '.summary.total_expenses // 0')
    local surplus=$(echo "$body" | jq -r '.summary.surplus // 0')
    local suggestion_count=$(echo "$body" | jq -r '.suggestions | length // 0')
    
    echo -e "${GREEN}✓ Summary retrieved${NC}"
    echo -e "  Income: \$${total_income}"
    echo -e "  Expenses: \$${total_expenses}"
    echo -e "  Surplus: \$${surplus}"
    echo -e "  Suggestions: $suggestion_count"
    
    if [[ "$suggestion_count" -gt 0 ]]; then
        echo -e "${BLUE}Suggestions:${NC}"
        echo "$body" | jq -r '.suggestions[] | "  - \(.title): \(.description)"'
    fi
    
    echo "$body"
}

# Validate a single budget file
validate_budget() {
    local file_path="$1"
    local file_name=$(basename "$file_path")
    
    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Validating: $file_name${NC}"
    echo -e "${YELLOW}========================================${NC}\n"
    
    local start_time=$(date +%s)
    local errors=0
    
    # Step 1: Upload
    local budget_id
    if ! budget_id=$(upload_budget "$file_path"); then
        ((errors++))
        return 1
    fi
    
    # Step 2: Get questions
    local questions_json
    if ! questions_json=$(get_clarification_questions "$budget_id"); then
        ((errors++))
        return 1
    fi
    
    # Step 3: Submit answers
    local answers_json
    if ! answers_json=$(submit_answers "$budget_id" "$questions_json"); then
        ((errors++))
        return 1
    fi
    
    # Step 4: Get summary
    local summary_json
    if ! summary_json=$(get_summary_and_suggestions "$budget_id"); then
        ((errors++))
        return 1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo -e "\n${GREEN}✓ Validation complete for $file_name (${duration}s)${NC}\n"
    
    # Return results as JSON
    jq -n \
        --arg file "$file_name" \
        --arg budget_id "$budget_id" \
        --argjson questions "$questions_json" \
        --argjson answers "$answers_json" \
        --argjson summary "$summary_json" \
        --arg duration "$duration" \
        --arg errors "$errors" \
        '{
            file: $file,
            budget_id: $budget_id,
            duration_seconds: ($duration | tonumber),
            errors: ($errors | tonumber),
            questions: $questions,
            answers: $answers,
            summary: $summary
        }'
}

# Main validation loop
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}LifePath Planner Real-World Validation${NC}"
    echo -e "${BLUE}========================================${NC}\n"
    
    check_prerequisites
    
    echo -e "\n${BLUE}Starting validation with ${#BUDGET_FILES[@]} budget file(s)...${NC}\n"
    
    local results=()
    local total_errors=0
    local total_duration=0
    
    for file in "${BUDGET_FILES[@]}"; do
        if [[ ! -f "$file" ]]; then
            echo -e "${RED}✗ File not found: $file${NC}"
            continue
        fi
        
        local result
        if result=$(validate_budget "$file"); then
            results+=("$result")
            local errors=$(echo "$result" | jq -r '.errors')
            local duration=$(echo "$result" | jq -r '.duration_seconds')
            total_errors=$((total_errors + errors))
            total_duration=$((total_duration + duration))
        else
            ((total_errors++))
        fi
    done
    
    # Generate report
    local report=$(jq -n \
        --argjson results "$(printf '%s\n' "${results[@]}" | jq -s '.')" \
        --arg total_errors "$total_errors" \
        --arg total_duration "$total_duration" \
        --arg model "${OPENAI_MODEL:-unknown}" \
        --arg gateway "$GATEWAY_URL" \
        '{
            timestamp: now | strftime("%Y-%m-%d %H:%M:%S"),
            model: $model,
            gateway_url: $gateway,
            total_files: ($results | length),
            total_errors: ($total_errors | tonumber),
            total_duration_seconds: ($total_duration | tonumber),
            results: $results
        }')
    
    echo "$report" > "$VALIDATION_REPORT"
    
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Validation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo -e "Files tested: ${#results[@]}"
    echo -e "Total errors: $total_errors"
    echo -e "Total duration: ${total_duration}s"
    echo -e "Report saved: $VALIDATION_REPORT"
    echo -e "${BLUE}========================================${NC}\n"
    
    if [[ $total_errors -eq 0 ]]; then
        echo -e "${GREEN}✓ All validations passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some validations failed${NC}"
        exit 1
    fi
}

main "$@"


