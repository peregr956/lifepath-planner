# LifePath Planner Design System

This document defines the design system for LifePath Planner, establishing consistent visual language, components, and patterns for a professional, accessible, and user-friendly financial planning platform.

---

## 1. Design Principles

### 1.1 Core Principles

| Principle | Description | Application |
|-----------|-------------|-------------|
| **Clarity** | Financial data must be immediately understandable | Clear typography, logical hierarchy, unambiguous labels |
| **Trust** | Users trust us with sensitive financial information | Professional aesthetics, security indicators, reliable behavior |
| **Accessibility** | Everyone can use the platform | WCAG 2.1 AA compliance, keyboard navigation, screen reader support |
| **Efficiency** | Minimize time to insight | Progressive disclosure, smart defaults, streamlined workflows |
| **Consistency** | Same patterns everywhere | Reusable components, predictable interactions |

### 1.2 Design Goals

1. **Professional without being cold** — Approachable financial tool
2. **Data-dense without being overwhelming** — Progressive disclosure
3. **Powerful without being complex** — Guided workflows for new users
4. **Responsive without compromising functionality** — Full features on all devices

---

## 2. Visual Identity

### 2.1 Color Palette

#### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Primary** | `#2563EB` | Primary actions, links, key UI elements |
| **Primary Dark** | `#1D4ED8` | Hover states, emphasis |
| **Primary Light** | `#3B82F6` | Backgrounds, subtle emphasis |

#### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#059669` | Positive values, completed goals, surplus |
| **Warning** | `#D97706` | Alerts, approaching limits, attention needed |
| **Error** | `#DC2626` | Errors, deficits, negative values |
| **Info** | `#0891B2` | Informational messages, tips |

#### Financial Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Income** | `#059669` | Income amounts, positive cash flow |
| **Expense** | `#DC2626` | Expense amounts, negative cash flow |
| **Neutral** | `#6B7280` | Neutral financial data |
| **Debt** | `#9333EA` | Debt balances, liability data |
| **Savings** | `#0891B2` | Savings, investment data |

#### Neutral Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Gray 900** | `#111827` | Primary text |
| **Gray 700** | `#374151` | Secondary text |
| **Gray 500** | `#6B7280` | Tertiary text, placeholders |
| **Gray 300** | `#D1D5DB` | Borders, dividers |
| **Gray 100** | `#F3F4F6` | Backgrounds, hover states |
| **Gray 50** | `#F9FAFB` | Page backgrounds |
| **White** | `#FFFFFF` | Cards, primary backgrounds |

#### Dark Mode Palette

| Light Mode | Dark Mode | Usage |
|------------|-----------|-------|
| Gray 50 | Gray 900 | Page background |
| White | Gray 800 | Card background |
| Gray 900 | Gray 100 | Primary text |
| Gray 700 | Gray 300 | Secondary text |

### 2.2 Typography

#### Font Stack

```css
/* Primary font (UI and body) */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monospace (numbers, code) */
--font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
```

#### Type Scale

| Name | Size | Line Height | Weight | Usage |
|------|------|-------------|--------|-------|
| **Display** | 36px | 1.2 | 700 | Hero sections, major headings |
| **H1** | 30px | 1.3 | 600 | Page titles |
| **H2** | 24px | 1.35 | 600 | Section headers |
| **H3** | 20px | 1.4 | 600 | Card titles, subsections |
| **H4** | 16px | 1.5 | 600 | Component headers |
| **Body Large** | 18px | 1.6 | 400 | Lead paragraphs |
| **Body** | 16px | 1.6 | 400 | Default text |
| **Body Small** | 14px | 1.5 | 400 | Secondary text, captions |
| **Caption** | 12px | 1.4 | 400 | Labels, hints |

#### Financial Numbers

- Use tabular (monospace) numerals for financial data
- Right-align currency columns
- Use consistent decimal places (2 for currency)
- Include currency symbol prefix

```css
.financial-number {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  text-align: right;
}
```

### 2.3 Spacing

#### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0 | No spacing |
| `--space-1` | 4px | Tight spacing |
| `--space-2` | 8px | Related elements |
| `--space-3` | 12px | Default gap |
| `--space-4` | 16px | Component padding |
| `--space-5` | 20px | Section spacing |
| `--space-6` | 24px | Card padding |
| `--space-8` | 32px | Major sections |
| `--space-10` | 40px | Page sections |
| `--space-12` | 48px | Large gaps |
| `--space-16` | 64px | Hero sections |

### 2.4 Shadows

| Name | Value | Usage |
|------|-------|-------|
| **Subtle** | `0 1px 2px rgba(0,0,0,0.05)` | Buttons, inputs |
| **Default** | `0 1px 3px rgba(0,0,0,0.1)` | Cards, dropdowns |
| **Medium** | `0 4px 6px rgba(0,0,0,0.1)` | Elevated cards |
| **Large** | `0 10px 15px rgba(0,0,0,0.1)` | Modals, popovers |
| **XL** | `0 20px 25px rgba(0,0,0,0.15)` | Dialogs |

### 2.5 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements, tags |
| `--radius-md` | 6px | Inputs, buttons |
| `--radius-lg` | 8px | Cards, panels |
| `--radius-xl` | 12px | Large cards, modals |
| `--radius-2xl` | 16px | Feature cards |
| `--radius-full` | 9999px | Pills, avatars |

---

## 3. Components

### 3.1 Buttons

#### Button Variants

| Variant | Usage | Style |
|---------|-------|-------|
| **Primary** | Main actions | Solid blue background |
| **Secondary** | Secondary actions | Outlined, blue border |
| **Ghost** | Tertiary actions | No border, text only |
| **Danger** | Destructive actions | Red background |

#### Button Sizes

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| **Small** | 32px | 12px 16px | 14px |
| **Default** | 40px | 12px 20px | 16px |
| **Large** | 48px | 16px 24px | 18px |

#### Button States

- Default
- Hover (darken 10%)
- Active (darken 15%)
- Focus (visible focus ring)
- Disabled (50% opacity, no pointer)
- Loading (spinner, disabled)

### 3.2 Form Inputs

#### Text Input

```typescript
interface TextInputProps {
  label: string;
  value: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  prefix?: string;  // For currency
  suffix?: string;  // For units
}
```

#### Input Sizes

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| **Small** | 32px | 8px 12px | 14px |
| **Default** | 40px | 10px 14px | 16px |
| **Large** | 48px | 12px 16px | 18px |

#### Input States

- Default (gray border)
- Focus (blue border, focus ring)
- Error (red border, error message)
- Disabled (gray background)
- Read-only (no border, gray background)

### 3.3 Cards

#### Card Variants

| Variant | Usage | Style |
|---------|-------|-------|
| **Default** | Standard content | White bg, subtle shadow |
| **Elevated** | Important content | White bg, medium shadow |
| **Outlined** | Lists, tables | Border, no shadow |
| **Interactive** | Clickable cards | Hover effect |

#### Card Anatomy

```
┌─────────────────────────────────────┐
│ [Icon] Title           [Action]    │  ← Header (optional)
├─────────────────────────────────────┤
│                                     │
│            Content                  │  ← Body
│                                     │
├─────────────────────────────────────┤
│ [Secondary Action]  [Primary]       │  ← Footer (optional)
└─────────────────────────────────────┘
```

### 3.4 Data Display

#### Financial Value Display

```typescript
interface FinancialValueProps {
  value: number;
  currency?: string;
  showSign?: boolean;  // +/- prefix
  colorCode?: boolean; // Green/red based on value
  size?: 'small' | 'medium' | 'large';
}
```

#### Progress Indicators

| Type | Usage |
|------|-------|
| **Linear Progress** | Goal progress, loading |
| **Circular Progress** | Completion percentage |
| **Step Progress** | Multi-step workflows |

#### Charts

| Type | Usage | Library |
|------|-------|---------|
| **Line Chart** | Trends over time | Recharts |
| **Bar Chart** | Category comparison | Recharts |
| **Pie/Donut Chart** | Composition breakdown | Recharts |
| **Area Chart** | Cumulative values | Recharts |

### 3.5 Navigation

#### Primary Navigation

- Fixed header with logo, main nav, user menu
- Mobile: hamburger menu with slide-out drawer
- Active state: bold text, underline indicator

#### Secondary Navigation

- Tab bar for section switching
- Sidebar for complex hierarchies

#### Breadcrumbs

- Show hierarchy for deep pages
- Link all except current page
- Truncate long paths on mobile

### 3.6 Feedback

#### Toast Notifications

| Type | Icon | Duration |
|------|------|----------|
| **Success** | Check | 3s |
| **Error** | X | 5s (or sticky) |
| **Warning** | Alert | 5s |
| **Info** | Info | 4s |

#### Loading States

| Type | Usage |
|------|-------|
| **Spinner** | Button loading, inline |
| **Skeleton** | Page/card loading |
| **Progress Bar** | Long operations |

#### Empty States

- Illustration + message + action
- Guide users to next step
- Don't leave blank screens

---

## 4. Patterns

### 4.1 Dashboard Layout

```
┌────────────────────────────────────────────────────────────┐
│  Logo    [Budget] [Goals] [Calculators]    [User Menu]     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Monthly Summary  │  │ Goal Progress    │               │
│  │ $X,XXX surplus   │  │ ▓▓▓▓▓▓░░░ 65%   │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                 Spending Breakdown                   │  │
│  │  [Bar Chart by Category]                             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                 Recent Activity                      │  │
│  │  [Transaction List]                                  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Calculator Layout

```
┌────────────────────────────────────────────────────────────┐
│  [Back] Retirement Calculator                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                    Inputs                             │ │
│  │  Current Age      [30    ]                           │ │
│  │  Retirement Age   [65    ]                           │ │
│  │  Current Savings  [$50,000]                          │ │
│  │  Monthly Contrib  [$500  ]                           │ │
│  │  Desired Income   [$60,000/yr]                       │ │
│  │                                                       │ │
│  │           [Calculate]                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │                    Results                            │ │
│  │                                                       │ │
│  │  ┌─────────────┐   ┌─────────────┐                   │ │
│  │  │ On Track    │   │ Projected   │                   │ │
│  │  │    ✓        │   │ $1.2M       │                   │ │
│  │  └─────────────┘   └─────────────┘                   │ │
│  │                                                       │ │
│  │  [Growth Chart Over Time]                             │ │
│  │                                                       │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 4.3 Onboarding Flow

1. **Welcome** — Value proposition, get started button
2. **Profile** — Basic info, financial framework preference
3. **Connect** — Upload budget or connect accounts
4. **Review** — Confirm data interpretation
5. **Goals** — Set initial goals (optional)
6. **Dashboard** — Main app with tour highlights

### 4.4 Error Handling

| Error Type | UI Treatment |
|------------|--------------|
| **Field validation** | Inline error below field |
| **Form validation** | Summary at top of form |
| **API error** | Toast notification |
| **Page error** | Full-page error state |
| **Critical error** | Modal with recovery options |

---

## 5. Responsive Design

### 5.1 Breakpoints

| Name | Width | Columns | Usage |
|------|-------|---------|-------|
| **Mobile** | <640px | 4 | Phones |
| **Tablet** | 640-1024px | 8 | Tablets, small laptops |
| **Desktop** | 1024-1280px | 12 | Laptops, monitors |
| **Wide** | >1280px | 12 | Large monitors |

### 5.2 Responsive Patterns

| Pattern | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| **Navigation** | Hamburger menu | Hamburger or tabs | Full nav bar |
| **Dashboard cards** | Stacked | 2 columns | 3-4 columns |
| **Tables** | Card list | Scrollable table | Full table |
| **Sidebars** | Drawer | Collapsed | Visible |
| **Forms** | Single column | Single column | Multi-column |

### 5.3 Touch Targets

- Minimum touch target: 44x44px
- Spacing between targets: 8px minimum
- Important actions: full-width on mobile

---

## 6. Motion & Animation

### 6.1 Timing

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| **Instant** | 0ms | — | Immediate feedback |
| **Fast** | 100ms | ease-out | Micro-interactions |
| **Normal** | 200ms | ease-in-out | Transitions |
| **Slow** | 300ms | ease-in-out | Page transitions |
| **Deliberate** | 500ms | ease-in-out | Emphasis animations |

### 6.2 Animation Principles

1. **Purposeful** — Animation should communicate, not decorate
2. **Fast** — Users shouldn't wait for animations
3. **Natural** — Follow physical metaphors
4. **Accessible** — Respect reduced motion preferences

### 6.3 Common Animations

| Animation | Duration | Usage |
|-----------|----------|-------|
| **Fade In** | 200ms | Content appearing |
| **Slide In** | 300ms | Modals, drawers |
| **Scale** | 200ms | Hover effects |
| **Skeleton pulse** | 1.5s | Loading states |
| **Progress fill** | 500ms | Chart animations |

### 6.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Implementation

### 7.1 File Structure

```
services/ui-web/src/
├── styles/
│   ├── globals.css           # Global styles, CSS variables
│   ├── tokens.css            # Design tokens
│   └── utilities.css         # Utility classes
├── components/
│   ├── design-system/
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Card/
│   │   ├── Typography/
│   │   ├── Layout/
│   │   └── index.ts          # Barrel export
│   ├── charts/
│   │   ├── LineChart/
│   │   ├── BarChart/
│   │   ├── PieChart/
│   │   └── index.ts
│   └── financial/
│       ├── CurrencyDisplay/
│       ├── ProgressBar/
│       ├── GoalCard/
│       └── index.ts
└── hooks/
    ├── useTheme.ts           # Theme switching
    └── useMediaQuery.ts      # Responsive hooks
```

### 7.2 CSS Variables

```css
:root {
  /* Colors */
  --color-primary: #2563EB;
  --color-primary-dark: #1D4ED8;
  --color-success: #059669;
  --color-warning: #D97706;
  --color-error: #DC2626;
  
  /* Typography */
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-4: 16px;
  /* ... */
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  
  /* Radius */
  --radius-md: 6px;
  --radius-lg: 8px;
}

[data-theme="dark"] {
  --color-bg: #111827;
  --color-surface: #1F2937;
  --color-text: #F9FAFB;
}
```

### 7.3 Component API Example

```typescript
// Button component
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-dark',
        secondary: 'border border-primary text-primary hover:bg-primary/10',
        ghost: 'text-primary hover:bg-primary/10',
        danger: 'bg-error text-white hover:bg-error-dark',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function Button({ variant, size, children, loading, ...props }: ButtonProps) {
  return (
    <button className={buttonVariants({ variant, size })} {...props}>
      {loading ? <Spinner /> : children}
    </button>
  );
}
```

---

## 8. Quality Checklist

### 8.1 Component Checklist

- [ ] Follows design tokens (colors, spacing, typography)
- [ ] Has all necessary states (default, hover, focus, disabled, error)
- [ ] Keyboard accessible (focusable, keyboard interactions)
- [ ] Screen reader accessible (labels, roles, announcements)
- [ ] Responsive across all breakpoints
- [ ] Supports dark mode
- [ ] Has loading state (if async)
- [ ] Has error state (if fallible)
- [ ] Documented with examples

### 8.2 Page Checklist

- [ ] Has clear heading hierarchy
- [ ] Has skip link to main content
- [ ] Has focus management for modals/drawers
- [ ] Has loading skeleton
- [ ] Has error boundary
- [ ] Has empty state
- [ ] Mobile responsive
- [ ] Performance optimized (lazy loading, code splitting)

---

## Related Documentation

- `docs/accessibility.md` — Accessibility requirements and guidelines
- `docs/roadmap.md` — Phase 16 UI/UX overhaul details
- `services/ui-web/README.md` — Development setup


