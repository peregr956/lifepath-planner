# Account Integration Strategy

This document outlines the strategy for integrating financial account aggregation services (Plaid Link or similar) into LifePath Planner. Account integration is planned for Phase 17 of the roadmap.

---

## Executive Summary

Account integration enables LifePath Planner to connect to users' real financial accounts, providing:
- Automatic transaction import and categorization
- Real-time balance updates
- Spending analysis based on actual data
- Automated goal progress tracking

This is a critical differentiator from ChatGPT, which cannot access real financial data.

---

## 1. Business Objectives

### 1.1 Primary Goals

| Goal | Description | Success Metric |
|------|-------------|----------------|
| **Automate data entry** | Reduce manual budget input | 70% fewer manual entries |
| **Improve accuracy** | Real data vs estimates | Actual vs budget variance reporting |
| **Enable continuous tracking** | Ongoing financial monitoring | Daily balance updates |
| **Power advanced features** | Feed data to goals, projections | 30% of users connect accounts |

### 1.2 User Value Proposition

**Current State**: Users manually upload budget files or enter data
**Future State**: Users connect accounts once and get continuous insights

| Without Integration | With Integration |
|--------------------|------------------|
| Manual data entry | Automatic transaction import |
| Monthly snapshots | Real-time updates |
| Estimated spending | Actual spending |
| Manual goal tracking | Automatic progress updates |
| Reactive analysis | Proactive alerts |

---

## 2. Provider Evaluation

### 2.1 Account Aggregation Providers

| Provider | Pros | Cons | Cost Model |
|----------|------|------|------------|
| **Plaid** | Market leader, wide coverage, developer-friendly | Higher cost, some banks excluded | Per-connection pricing |
| **Yodlee** | Largest institution coverage | Complex integration, enterprise-focused | Enterprise contracts |
| **MX** | Strong bank relationships | Less developer-friendly | Custom pricing |
| **Finicity** | Owned by Mastercard, reliable | Smaller coverage | Per-connection pricing |
| **Akoya** | Bank-owned, secure | Limited coverage | Per-connection pricing |

### 2.2 Recommended Provider: Plaid

**Selection Rationale**:

1. **Developer Experience**: Well-documented API, SDKs for all platforms
2. **Coverage**: 12,000+ financial institutions in US/Canada
3. **Link UI**: Pre-built, compliant connection flow
4. **Reliability**: 99.9% uptime SLA
5. **Security**: SOC 2 Type II, ISO 27001 certified
6. **Community**: Large developer community, extensive examples

**Considerations**:
- Cost scales with user count
- Some credit unions may have limited support
- Plan for fallback/manual entry for unsupported institutions

### 2.3 Cost Estimation

| Tier | Monthly Active Users | Estimated Monthly Cost |
|------|---------------------|------------------------|
| Development | <100 | Free (Sandbox) |
| Launch | 100-1,000 | $500-2,000 |
| Growth | 1,000-10,000 | $2,000-10,000 |
| Scale | 10,000+ | Custom pricing |

*Note: Costs are estimates based on Plaid's public pricing. Actual costs depend on negotiation and usage patterns.*

---

## 3. Integration Architecture

### 3.1 Service Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              Client (Next.js)                               │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │  Plaid Link                    │  Account Management UI                ││
│  │  (Embedded Component)          │  (Connected accounts, settings)       ││
│  └────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway (Port 8000)                           │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │  /accounts/*                                                            ││
│  │  - POST /accounts/link/token     → Create Link token                   ││
│  │  - POST /accounts/link/exchange  → Exchange public token               ││
│  │  - GET  /accounts                → List connected accounts             ││
│  │  - DELETE /accounts/:id          → Disconnect account                  ││
│  └────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Account Service (Port 8006)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │ Link Manager     │  │ Transaction Sync │  │ Balance Sync     │         │
│  │ - Token creation │  │ - Fetch txns     │  │ - Fetch balances │         │
│  │ - Token exchange │  │ - Categorize     │  │ - Update cache   │         │
│  │ - Webhook handler│  │ - Deduplicate    │  │ - Trigger alerts │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                               │
│  │ Plaid Client     │  │ Data Encryption  │                               │
│  │ - API calls      │  │ - At-rest encrypt│                               │
│  │ - Error handling │  │ - Token storage  │                               │
│  └──────────────────┘  └──────────────────┘                               │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              Plaid API                                      │
│  - /link/token/create                                                       │
│  - /item/public_token/exchange                                              │
│  - /transactions/sync                                                       │
│  - /accounts/balance/get                                                    │
│  - Webhooks (TRANSACTIONS, ITEM, etc.)                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Service Structure

```
services/account-service/
├── README.md
├── pyproject.toml
├── src/
│   ├── __init__.py
│   ├── main.py                        # FastAPI application (Port 8006)
│   ├── integrations/
│   │   ├── __init__.py
│   │   ├── plaid_client.py            # Plaid API client wrapper
│   │   └── plaid_webhooks.py          # Webhook handlers
│   ├── services/
│   │   ├── __init__.py
│   │   ├── link_service.py            # Link token management
│   │   ├── transaction_service.py     # Transaction sync & processing
│   │   ├── balance_service.py         # Balance updates
│   │   └── categorization_service.py  # Transaction categorization
│   ├── models/
│   │   ├── __init__.py
│   │   ├── account.py                 # Account data models
│   │   ├── transaction.py             # Transaction data models
│   │   └── institution.py             # Institution metadata
│   └── utils/
│       ├── __init__.py
│       ├── encryption.py              # Token encryption utilities
│       └── rate_limiter.py            # API rate limiting
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── test_plaid_client.py
    ├── test_transaction_service.py
    └── fixtures/
        └── mock_plaid_responses.json
```

---

## 4. Data Models

### 4.1 Connected Account

```python
@dataclass
class ConnectedAccount:
    """A user's connected financial account."""
    
    id: str                          # UUID
    user_id: str                     # FK to User
    
    # Plaid identifiers (encrypted)
    plaid_item_id: str               # Encrypted Item ID
    plaid_access_token: str          # Encrypted access token
    
    # Account metadata
    institution_id: str              # Institution identifier
    institution_name: str            # Display name (e.g., "Chase")
    institution_logo: Optional[str]  # Logo URL
    
    # Account details
    account_id: str                  # Plaid account ID
    account_name: str                # Account name
    account_type: AccountType        # checking, savings, credit, etc.
    account_subtype: Optional[str]   # More specific type
    account_mask: str                # Last 4 digits (e.g., "1234")
    
    # Sync status
    last_sync_at: datetime
    sync_status: SyncStatus          # active, error, disconnected
    error_code: Optional[str]        # If sync_status == error
    
    # Settings
    include_in_budget: bool          # Include in budget analysis
    auto_categorize: bool            # Auto-categorize transactions
    
    created_at: datetime
    updated_at: datetime

class AccountType(Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT = "credit"
    LOAN = "loan"
    INVESTMENT = "investment"
    BROKERAGE = "brokerage"
    OTHER = "other"

class SyncStatus(Enum):
    ACTIVE = "active"
    ERROR = "error"
    PENDING = "pending"
    DISCONNECTED = "disconnected"
```

### 4.2 Transaction

```python
@dataclass
class Transaction:
    """A financial transaction from a connected account."""
    
    id: str                          # UUID
    user_id: str                     # FK to User
    account_id: str                  # FK to ConnectedAccount
    
    # Plaid transaction data
    plaid_transaction_id: str        # Plaid's transaction ID
    
    # Transaction details
    date: date                       # Transaction date
    amount: float                    # Amount (positive = debit, negative = credit)
    name: str                        # Merchant/description
    merchant_name: Optional[str]     # Cleaned merchant name
    
    # Categorization
    plaid_category: List[str]        # Plaid's category hierarchy
    plaid_category_id: str           # Plaid category ID
    user_category: Optional[str]     # User override category
    final_category: str              # Resolved category
    
    # Additional data
    pending: bool                    # Is transaction pending?
    account_owner: Optional[str]     # Account owner name
    
    # Location (if available)
    location_city: Optional[str]
    location_state: Optional[str]
    
    # Processing metadata
    imported_at: datetime
    processed_at: Optional[datetime]
    
    created_at: datetime
    updated_at: datetime
```

### 4.3 Account Balance

```python
@dataclass
class AccountBalance:
    """Current balance for a connected account."""
    
    id: str
    account_id: str                  # FK to ConnectedAccount
    
    # Balances
    available: Optional[float]       # Available balance
    current: float                   # Current balance
    limit: Optional[float]           # Credit limit (for credit accounts)
    
    # Metadata
    currency: str                    # ISO currency code
    last_updated: datetime
    
    created_at: datetime
```

---

## 5. Connection Flow

### 5.1 User Connection Journey

```
1. User clicks "Connect Account"
                │
                ▼
2. Frontend requests Link token from API
   POST /accounts/link/token
                │
                ▼
3. API creates Plaid Link token
   Plaid API: /link/token/create
                │
                ▼
4. Frontend opens Plaid Link with token
   (User selects institution, authenticates)
                │
                ▼
5. Plaid returns public_token to frontend
                │
                ▼
6. Frontend sends public_token to API
   POST /accounts/link/exchange
                │
                ▼
7. API exchanges public_token for access_token
   Plaid API: /item/public_token/exchange
                │
                ▼
8. API stores encrypted access_token
   Creates ConnectedAccount record
                │
                ▼
9. API triggers initial sync
   Fetches accounts, balances, transactions
                │
                ▼
10. User sees connected account in UI
```

### 5.2 API Endpoints

#### Create Link Token

```
POST /accounts/link/token
Authorization: Bearer <jwt>

Request:
{
  "products": ["transactions"],     # Plaid products to enable
  "redirect_uri": "..."             # For OAuth flows (optional)
}

Response:
{
  "link_token": "link-sandbox-...",
  "expiration": "2024-01-15T12:00:00Z"
}
```

#### Exchange Public Token

```
POST /accounts/link/exchange
Authorization: Bearer <jwt>

Request:
{
  "public_token": "public-sandbox-...",
  "metadata": {
    "institution": {
      "institution_id": "ins_1",
      "name": "Chase"
    },
    "accounts": [
      {
        "id": "...",
        "name": "Checking",
        "mask": "1234",
        "type": "depository",
        "subtype": "checking"
      }
    ]
  }
}

Response:
{
  "accounts": [
    {
      "id": "acc_...",
      "institution_name": "Chase",
      "account_name": "Checking",
      "account_mask": "1234",
      "account_type": "checking",
      "sync_status": "pending"
    }
  ]
}
```

#### List Connected Accounts

```
GET /accounts
Authorization: Bearer <jwt>

Response:
{
  "accounts": [
    {
      "id": "acc_...",
      "institution_name": "Chase",
      "institution_logo": "https://...",
      "account_name": "Checking",
      "account_mask": "1234",
      "account_type": "checking",
      "balance": {
        "current": 5432.10,
        "available": 5432.10
      },
      "last_sync_at": "2024-01-15T10:00:00Z",
      "sync_status": "active"
    }
  ]
}
```

#### Disconnect Account

```
DELETE /accounts/:id
Authorization: Bearer <jwt>

Response:
{
  "success": true
}
```

---

## 6. Transaction Sync

### 6.1 Sync Strategy

**Initial Sync**:
- Fetch last 2 years of transactions (Plaid default)
- Process in batches of 500
- Categorize using Plaid categories + custom rules

**Ongoing Sync**:
- Use Plaid's Transactions Sync API (cursor-based)
- Webhook-triggered updates
- Fallback to polling every 6 hours

### 6.2 Webhook Handling

```python
# Webhook types to handle
PLAID_WEBHOOKS = {
    # Transaction updates
    "TRANSACTIONS": {
        "SYNC_UPDATES_AVAILABLE": handle_sync_updates,
        "DEFAULT_UPDATE": handle_default_update,
        "HISTORICAL_UPDATE": handle_historical_update,
    },
    
    # Item status
    "ITEM": {
        "ERROR": handle_item_error,
        "PENDING_EXPIRATION": handle_pending_expiration,
        "USER_PERMISSION_REVOKED": handle_permission_revoked,
    },
    
    # Auth updates
    "AUTH": {
        "VERIFICATION_EXPIRED": handle_auth_expired,
    },
}
```

### 6.3 Transaction Categorization

**Category Mapping**:
```python
PLAID_TO_LIFEPATH_CATEGORIES = {
    # Income
    "INCOME_DIVIDENDS": "Income:Investment",
    "INCOME_INTEREST_EARNED": "Income:Interest",
    "INCOME_WAGES": "Income:Salary",
    "INCOME_OTHER_INCOME": "Income:Other",
    
    # Housing
    "RENT_AND_UTILITIES_RENT": "Housing:Rent",
    "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY": "Housing:Utilities",
    "RENT_AND_UTILITIES_WATER": "Housing:Utilities",
    
    # Transportation
    "TRANSPORTATION_GAS": "Transportation:Gas",
    "TRANSPORTATION_PARKING": "Transportation:Parking",
    "TRANSPORTATION_PUBLIC_TRANSIT": "Transportation:Transit",
    
    # Food
    "FOOD_AND_DRINK_GROCERIES": "Food:Groceries",
    "FOOD_AND_DRINK_RESTAURANTS": "Food:Dining",
    "FOOD_AND_DRINK_COFFEE": "Food:Dining",
    
    # ... additional mappings
}
```

**User Overrides**:
- Users can recategorize transactions
- System learns from overrides for future transactions
- Overrides stored per merchant pattern

---

## 7. Security & Compliance

### 7.1 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Token encryption** | AES-256 encryption for access tokens |
| **Data at rest** | Database encryption |
| **Data in transit** | TLS 1.3 for all communications |
| **Access logging** | Audit log all account data access |
| **Token rotation** | Rotate encryption keys annually |
| **Secure deletion** | Crypto-shred on account disconnect |

### 7.2 Compliance

| Standard | Requirement | Status |
|----------|-------------|--------|
| **SOC 2** | Security controls | Required before launch |
| **GDPR** | Data portability, deletion | Built into design |
| **CCPA** | Privacy rights | Built into design |
| **GLBA** | Financial data protection | Addressed via Plaid |

### 7.3 Data Retention

| Data Type | Retention Period | Deletion Process |
|-----------|------------------|------------------|
| Access tokens | Until disconnected | Immediate crypto-shred |
| Transactions | 7 years (configurable) | User-controlled deletion |
| Balances | 90 days history | Rolling window |
| Sync logs | 30 days | Automatic purge |

### 7.4 User Controls

Users must be able to:
- View all connected accounts
- Disconnect any account at any time
- Delete all imported transactions
- Export their data (GDPR compliance)
- Control which accounts are included in analysis

---

## 8. Error Handling

### 8.1 Common Errors

| Error | Cause | User Action | System Action |
|-------|-------|-------------|---------------|
| `ITEM_LOGIN_REQUIRED` | Credentials expired | Prompt to re-authenticate | Mark account pending |
| `INVALID_ACCESS_TOKEN` | Token revoked | Prompt to reconnect | Disconnect account |
| `RATE_LIMIT_EXCEEDED` | Too many API calls | None (transparent) | Backoff and retry |
| `INSTITUTION_DOWN` | Bank API unavailable | Show status message | Retry with backoff |
| `NO_ACCOUNTS` | No eligible accounts | Show explanation | Log and alert |

### 8.2 Error Recovery

```python
class PlaidErrorHandler:
    """Handle Plaid API errors with appropriate recovery."""
    
    RETRYABLE_ERRORS = {
        "INTERNAL_SERVER_ERROR",
        "RATE_LIMIT_EXCEEDED",
        "INSTITUTION_DOWN",
    }
    
    REAUTH_REQUIRED_ERRORS = {
        "ITEM_LOGIN_REQUIRED",
        "PENDING_EXPIRATION",
    }
    
    FATAL_ERRORS = {
        "INVALID_ACCESS_TOKEN",
        "INVALID_CREDENTIALS",
        "USER_PERMISSION_REVOKED",
    }
    
    async def handle_error(self, error: PlaidError, account: ConnectedAccount):
        if error.code in self.RETRYABLE_ERRORS:
            await self.schedule_retry(account, backoff=True)
        elif error.code in self.REAUTH_REQUIRED_ERRORS:
            await self.mark_reauth_required(account)
            await self.notify_user(account, "reauth_required")
        elif error.code in self.FATAL_ERRORS:
            await self.disconnect_account(account)
            await self.notify_user(account, "disconnected")
```

---

## 9. Integration with LifePath Features

### 9.1 Budget Analysis

**Current**: User uploads budget file
**Enhanced**: Combine uploaded budget with actual transactions

```python
async def get_enhanced_budget(user_id: str, month: date) -> EnhancedBudget:
    """Combine manual budget with actual spending."""
    
    # Get user's manual budget
    manual_budget = await get_budget(user_id, month)
    
    # Get actual transactions for the month
    transactions = await get_transactions(user_id, month)
    
    # Compare planned vs actual by category
    comparison = compare_budget_to_actual(manual_budget, transactions)
    
    return EnhancedBudget(
        planned=manual_budget,
        actual=aggregate_by_category(transactions),
        variance=comparison.variance,
        insights=generate_insights(comparison),
    )
```

### 9.2 Goal Tracking

**Automatic Progress Updates**:

```python
async def update_goals_from_accounts(user_id: str):
    """Update goal progress based on account balances."""
    
    goals = await get_user_goals(user_id)
    accounts = await get_connected_accounts(user_id)
    
    for goal in goals:
        if goal.tracking_account_id:
            account = find_account(accounts, goal.tracking_account_id)
            if account:
                await update_goal_progress(
                    goal_id=goal.id,
                    current_value=account.balance.current,
                    source="account_sync",
                )
```

### 9.3 Spending Insights

**Pattern Detection**:

```python
async def detect_spending_patterns(user_id: str) -> List[SpendingInsight]:
    """Analyze transaction patterns."""
    
    transactions = await get_transactions(user_id, days=90)
    
    insights = []
    
    # Subscription detection
    subscriptions = detect_recurring_charges(transactions)
    if subscriptions:
        insights.append(SpendingInsight(
            type="subscriptions",
            title=f"Found {len(subscriptions)} recurring charges",
            details=subscriptions,
            monthly_impact=sum(s.amount for s in subscriptions),
        ))
    
    # Unusual spending
    anomalies = detect_spending_anomalies(transactions)
    for anomaly in anomalies:
        insights.append(SpendingInsight(
            type="anomaly",
            title=f"Unusual spending in {anomaly.category}",
            details=anomaly,
        ))
    
    # Category trends
    trends = analyze_category_trends(transactions)
    for trend in trends:
        if trend.change_percent > 20:
            insights.append(SpendingInsight(
                type="trend",
                title=f"{trend.category} spending up {trend.change_percent}%",
                details=trend,
            ))
    
    return insights
```

---

## 10. UI Components

### 10.1 Account Connection

```typescript
// Connect account button
interface ConnectAccountButtonProps {
  onSuccess: (accounts: ConnectedAccount[]) => void;
  onError: (error: PlaidError) => void;
}

// Account list component
interface AccountListProps {
  accounts: ConnectedAccount[];
  onDisconnect: (accountId: string) => void;
  onRefresh: (accountId: string) => void;
}

// Account settings
interface AccountSettingsProps {
  account: ConnectedAccount;
  onUpdate: (settings: AccountSettings) => void;
}
```

### 10.2 Transaction Views

```typescript
// Transaction list
interface TransactionListProps {
  transactions: Transaction[];
  onCategoryChange: (txnId: string, category: string) => void;
  filters: TransactionFilters;
}

// Spending summary
interface SpendingSummaryProps {
  transactions: Transaction[];
  period: DateRange;
  budget?: BudgetModel;
}

// Category comparison (planned vs actual)
interface CategoryComparisonProps {
  planned: CategoryBudget[];
  actual: CategoryActual[];
}
```

---

## 11. Testing Strategy

### 11.1 Sandbox Testing

Plaid provides a Sandbox environment with:
- Test credentials (user_good, pass_good)
- Simulated transactions
- Error simulation
- Webhook testing

**Test Accounts**:
```python
SANDBOX_CREDENTIALS = {
    "success": {"username": "user_good", "password": "pass_good"},
    "mfa": {"username": "user_mfa", "password": "pass_mfa"},
    "error": {"username": "user_error", "password": "pass_error"},
}
```

### 11.2 Test Cases

| Category | Test Case | Expected Outcome |
|----------|-----------|------------------|
| **Connection** | Successful link | Account created, sync started |
| **Connection** | MFA flow | MFA prompted and handled |
| **Connection** | Error flow | Error displayed, no account created |
| **Sync** | Initial sync | Transactions imported |
| **Sync** | Incremental sync | New transactions added |
| **Sync** | Webhook triggered | Sync executed on webhook |
| **Error** | Token expired | Reauth prompt shown |
| **Error** | Institution down | Graceful degradation |
| **Security** | Token storage | Token encrypted at rest |
| **Privacy** | Account deletion | All data removed |

---

## 12. Rollout Plan

### 12.1 Phases

| Phase | Scope | Timeline |
|-------|-------|----------|
| **Phase A** | Internal testing | Week 51 |
| **Phase B** | Beta users (opt-in) | Week 52-53 |
| **Phase C** | Gradual rollout (10% → 50% → 100%) | Week 54-56 |
| **Phase D** | Full availability | Week 57+ |

### 12.2 Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Connection success rate | >90% | Connections / attempts |
| Sync reliability | >99% | Successful syncs / total syncs |
| Error rate | <2% | Errors / API calls |
| User satisfaction | >4.0/5 | Post-connection survey |

### 12.3 Rollback Plan

If critical issues arise:
1. Disable new connections (feature flag)
2. Continue syncing existing connections
3. Notify affected users
4. Deploy fix
5. Re-enable new connections

---

## 13. Future Enhancements

### 13.1 Additional Products

| Plaid Product | Use Case | Priority |
|---------------|----------|----------|
| **Investments** | Portfolio tracking, net worth | High |
| **Liabilities** | Detailed debt info (rates, terms) | High |
| **Identity** | Simplified onboarding | Medium |
| **Assets** | Income/asset verification | Low |

### 13.2 Additional Providers

Consider adding support for:
- Yodlee (for institutions Plaid doesn't cover)
- Direct bank integrations (for major banks)
- Manual account tracking (for unsupported institutions)

### 13.3 Advanced Features

- **Bill detection**: Identify upcoming bills
- **Income tracking**: Paycheck detection and tracking
- **Net worth tracking**: Aggregate all accounts for net worth
- **Investment analysis**: Portfolio performance, allocation
- **Recurring detection**: Subscriptions, memberships

---

## Related Documentation

- `docs/roadmap.md` — Phase 17 details
- `docs/security.md` — Security requirements
- `docs/differentiation_analysis.md` — Account integration as differentiator
- `docs/architecture/persistence_layer.md` — Data model details



