# Accessibility Guidelines

This document outlines the accessibility requirements and guidelines for LifePath Planner, ensuring the platform is usable by everyone, including people with disabilities.

---

## 1. Accessibility Commitment

### 1.1 Target Standard

**WCAG 2.1 Level AA** — The Web Content Accessibility Guidelines (WCAG) 2.1 Level AA is our target compliance level.

### 1.2 Why Accessibility Matters

1. **Ethical Obligation** — Financial planning should be accessible to everyone
2. **Legal Compliance** — Required for many users and jurisdictions
3. **Better UX for All** — Accessibility improvements benefit all users
4. **Market Reach** — 15-20% of population has some form of disability

### 1.3 Disabilities to Consider

| Disability Type | Considerations |
|-----------------|----------------|
| **Visual** | Screen readers, magnification, color blindness |
| **Motor** | Keyboard navigation, voice control, limited dexterity |
| **Auditory** | Captions, visual alternatives to audio |
| **Cognitive** | Clear language, consistent navigation, focus management |

---

## 2. WCAG 2.1 AA Requirements

### 2.1 Perceivable

Users must be able to perceive the information being presented.

#### Text Alternatives (1.1)

| Requirement | Implementation |
|-------------|----------------|
| **Images** | All images have meaningful `alt` text |
| **Icons** | Decorative icons have `aria-hidden="true"`, functional icons have labels |
| **Charts** | Charts have text alternatives describing the data |
| **Complex images** | Long descriptions available via `aria-describedby` |

```tsx
// Good: Meaningful alt text
<img src="chart.png" alt="Monthly expenses chart showing $2,500 in housing, $800 in food, $400 in transportation" />

// Good: Decorative icon
<CheckIcon aria-hidden="true" className="text-green-500" />
<span>Complete</span>

// Good: Functional icon
<button aria-label="Delete budget">
  <TrashIcon aria-hidden="true" />
</button>
```

#### Color Contrast (1.4.3)

| Element | Minimum Ratio |
|---------|---------------|
| **Normal text** | 4.5:1 |
| **Large text** (18px+ or 14px+ bold) | 3:1 |
| **UI components** | 3:1 |

**Our Color Combinations**:

| Foreground | Background | Ratio | Pass? |
|------------|------------|-------|-------|
| Gray 900 (#111827) | White (#FFFFFF) | 17.1:1 | ✅ |
| Primary (#2563EB) | White (#FFFFFF) | 4.7:1 | ✅ |
| Error (#DC2626) | White (#FFFFFF) | 4.5:1 | ✅ |
| Success (#059669) | White (#FFFFFF) | 4.5:1 | ✅ |

#### Color Not Sole Indicator (1.4.1)

Don't use color alone to convey information.

```tsx
// Bad: Color only
<span className="text-red-500">-$500</span>

// Good: Color + icon + text
<span className="text-red-500 flex items-center gap-1">
  <ArrowDownIcon aria-hidden="true" />
  <span>-$500 (deficit)</span>
</span>
```

#### Resize Text (1.4.4)

- Text can be resized up to 200% without loss of content
- Use relative units (`rem`, `em`) instead of `px` for text
- Test at 200% zoom

#### Reflow (1.4.10)

- No horizontal scrolling at 320px viewport width
- Content reflows for mobile without requiring zoom

### 2.2 Operable

Users must be able to operate the interface.

#### Keyboard Accessible (2.1)

| Requirement | Implementation |
|-------------|----------------|
| **All functionality via keyboard** | No mouse-only interactions |
| **No keyboard traps** | Focus can always move away |
| **Visible focus indicator** | Clear focus ring on all interactive elements |
| **Logical tab order** | Focus moves in reading order |
| **Keyboard shortcuts** | Don't conflict with screen reader shortcuts |

**Focus Indicator Style**:

```css
/* Focus ring style */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Remove default outline and use focus-visible */
:focus:not(:focus-visible) {
  outline: none;
}
```

**Interactive Elements Must Be Focusable**:

```tsx
// Good: Button (inherently focusable)
<button onClick={handleClick}>Save</button>

// Good: Div with role and tabindex
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Save
</div>

// Bad: Div without keyboard support
<div onClick={handleClick}>Save</div>
```

#### Touch Target Size (2.5.5)

- Minimum target size: 44x44 CSS pixels
- Spacing between targets: 8px minimum

```tsx
// Good: Large enough touch target
<button className="min-h-[44px] min-w-[44px] p-3">
  <PlusIcon className="h-5 w-5" />
</button>
```

#### Skip Links (2.4.1)

Provide skip links to bypass repetitive content.

```tsx
// At the top of the page
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-white focus:text-primary"
>
  Skip to main content
</a>

// Main content landmark
<main id="main-content" tabIndex={-1}>
  {/* Page content */}
</main>
```

#### Focus Management (2.4.3)

- Modals trap focus within them
- Focus moves to modal when opened
- Focus returns to trigger when closed
- New pages focus on main heading

```tsx
// Modal focus trap example
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      // Save previous focus
      const previousFocus = document.activeElement;
      
      // Focus first focusable element in modal
      modalRef.current?.focus();
      
      return () => {
        // Return focus when closed
        (previousFocus as HTMLElement)?.focus();
      };
    }
  }, [isOpen]);
  
  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
```

### 2.3 Understandable

Users must be able to understand the information and operation.

#### Language (3.1)

```html
<!-- Set document language -->
<html lang="en">

<!-- Mark language changes -->
<p>The total is <span lang="es">mil dólares</span>.</p>
```

#### Consistent Navigation (3.2.3)

- Navigation in same order on every page
- Same terminology throughout
- Consistent component behavior

#### Input Labels (3.3)

All form inputs must have visible labels.

```tsx
// Good: Visible label
<label htmlFor="income" className="block text-sm font-medium">
  Monthly Income
</label>
<input
  id="income"
  type="text"
  aria-describedby="income-hint income-error"
/>
<p id="income-hint" className="text-sm text-gray-500">
  Enter your gross monthly income
</p>
<p id="income-error" className="text-sm text-red-500" role="alert">
  Please enter a valid amount
</p>

// Good: Placeholder with label (label can be visually hidden)
<label htmlFor="search" className="sr-only">Search transactions</label>
<input id="search" type="search" placeholder="Search transactions" />
```

#### Error Identification (3.3.1)

- Errors clearly identified in text (not just color)
- Error messages describe the error
- Suggestions for fixing provided

```tsx
// Good: Clear error with suggestion
<input
  id="rate"
  type="text"
  aria-invalid="true"
  aria-describedby="rate-error"
/>
<p id="rate-error" className="text-red-500 flex items-center gap-2" role="alert">
  <ExclamationIcon aria-hidden="true" />
  Interest rate must be between 0% and 30%. Please enter a valid percentage.
</p>
```

### 2.4 Robust

Content must be robust enough to work with assistive technologies.

#### Valid HTML (4.1.1)

- Valid HTML syntax
- Unique IDs
- Proper nesting of elements

#### Name, Role, Value (4.1.2)

All UI components must have accessible names and roles.

```tsx
// Good: Clear roles and labels
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/budget">Budget</a></li>
    <li><a href="/goals">Goals</a></li>
  </ul>
</nav>

// Good: Custom component with proper semantics
<div
  role="slider"
  aria-label="Monthly savings target"
  aria-valuemin={0}
  aria-valuemax={10000}
  aria-valuenow={2500}
  aria-valuetext="$2,500"
  tabIndex={0}
>
  {/* Slider UI */}
</div>
```

---

## 3. Component-Specific Guidelines

### 3.1 Forms

| Element | Requirements |
|---------|--------------|
| **Labels** | Visible, associated with input via `for`/`id` |
| **Required fields** | Marked with `aria-required="true"` and visual indicator |
| **Error messages** | Associated via `aria-describedby`, use `role="alert"` |
| **Field groups** | Use `<fieldset>` and `<legend>` |
| **Autocomplete** | Use appropriate `autocomplete` attributes |

```tsx
<form aria-label="Budget entry form">
  <fieldset>
    <legend>Income Sources</legend>
    
    <div className="form-group">
      <label htmlFor="salary">
        Salary
        <span aria-hidden="true">*</span>
        <span className="sr-only">(required)</span>
      </label>
      <input
        id="salary"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-required="true"
        aria-invalid={hasError}
        aria-describedby="salary-error"
      />
      {hasError && (
        <p id="salary-error" role="alert" className="error">
          Please enter your salary amount
        </p>
      )}
    </div>
  </fieldset>
  
  <button type="submit">Save Budget</button>
</form>
```

### 3.2 Tables

| Requirement | Implementation |
|-------------|----------------|
| **Caption** | Use `<caption>` to describe table |
| **Headers** | Use `<th>` with `scope` attribute |
| **Complex tables** | Use `headers` and `id` for complex relationships |
| **Responsive** | Card layout on mobile or horizontally scrollable with `role="region"` |

```tsx
<table>
  <caption>Monthly expenses by category</caption>
  <thead>
    <tr>
      <th scope="col">Category</th>
      <th scope="col">Budgeted</th>
      <th scope="col">Actual</th>
      <th scope="col">Variance</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Housing</th>
      <td>$1,500</td>
      <td>$1,500</td>
      <td>$0</td>
    </tr>
  </tbody>
</table>
```

### 3.3 Charts and Data Visualizations

Charts are inherently visual. Provide text alternatives.

```tsx
// Chart with text alternative
<figure>
  <figcaption id="spending-chart-desc">
    Monthly spending breakdown: Housing 45%, Food 20%, Transportation 15%, 
    Entertainment 10%, Other 10%
  </figcaption>
  <div
    role="img"
    aria-labelledby="spending-chart-desc"
  >
    <PieChart data={data} />
  </div>
</figure>

// Or provide a data table alternative
<div>
  <PieChart data={data} aria-hidden="true" />
  <details>
    <summary>View data table</summary>
    <table>
      {/* Accessible table with same data */}
    </table>
  </details>
</div>
```

### 3.4 Modals and Dialogs

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>
  <h2 id="modal-title">Confirm Delete</h2>
  <p id="modal-description">
    Are you sure you want to delete this budget? This action cannot be undone.
  </p>
  <div>
    <button onClick={onCancel}>Cancel</button>
    <button onClick={onConfirm}>Delete</button>
  </div>
</div>
```

### 3.5 Progress Indicators

```tsx
// Determinate progress bar
<div
  role="progressbar"
  aria-label="Goal progress"
  aria-valuenow={65}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuetext="65% complete, $6,500 of $10,000 saved"
>
  <div className="progress-fill" style={{ width: '65%' }} />
</div>

// Loading spinner
<div role="status" aria-label="Loading budget data">
  <Spinner aria-hidden="true" />
  <span className="sr-only">Loading...</span>
</div>
```

### 3.6 Notifications and Alerts

```tsx
// Toast notification
<div role="status" aria-live="polite">
  Budget saved successfully
</div>

// Error alert (more urgent)
<div role="alert" aria-live="assertive">
  Failed to save budget. Please try again.
</div>

// Region that updates
<div aria-live="polite" aria-atomic="true">
  Showing {filteredCount} of {totalCount} transactions
</div>
```

---

## 4. Testing

### 4.1 Automated Testing

| Tool | Purpose | Integration |
|------|---------|-------------|
| **axe-core** | Accessibility violations | Jest, Playwright |
| **eslint-plugin-jsx-a11y** | JSX accessibility linting | ESLint |
| **Lighthouse** | Accessibility audit | CI/CD |

```typescript
// Jest with axe-core
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('Button component has no accessibility violations', async () => {
  const { container } = render(<Button>Click me</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

```typescript
// Playwright with axe
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Dashboard page is accessible', async ({ page }) => {
  await page.goto('/dashboard');
  
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

### 4.2 Manual Testing

#### Keyboard Testing Checklist

- [ ] Can tab through all interactive elements
- [ ] Tab order follows visual order
- [ ] Focus indicator visible on all elements
- [ ] Can activate buttons/links with Enter
- [ ] Can toggle checkboxes with Space
- [ ] Can navigate dropdowns with arrows
- [ ] Can escape out of modals
- [ ] No keyboard traps

#### Screen Reader Testing

| Screen Reader | Browser | Priority |
|--------------|---------|----------|
| **NVDA** | Firefox, Chrome | High |
| **VoiceOver** | Safari | High |
| **JAWS** | Chrome | Medium |
| **TalkBack** | Chrome (Android) | Medium |

**Screen Reader Checklist**:

- [ ] Page title announced correctly
- [ ] Headings structure makes sense
- [ ] Links/buttons announce their purpose
- [ ] Form labels read correctly
- [ ] Error messages announced
- [ ] Dynamic content updates announced
- [ ] Images have meaningful alt text
- [ ] Charts have text alternatives

### 4.3 User Testing

- Include users with disabilities in usability testing
- Test with actual assistive technology users
- Collect feedback on pain points

---

## 5. Common Patterns

### 5.1 Accessible Currency Input

```tsx
function CurrencyInput({ label, value, onChange, error }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  
  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2">
          $
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="pl-8"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
```

### 5.2 Accessible Tabs

```tsx
function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div>
      <div role="tablist" aria-label="Budget sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

### 5.3 Accessible Accordion

```tsx
function Accordion({ items }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  
  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>
          <h3>
            <button
              aria-expanded={expanded === item.id}
              aria-controls={`content-${item.id}`}
              onClick={() => setExpanded(
                expanded === item.id ? null : item.id
              )}
            >
              {item.title}
              <ChevronIcon
                aria-hidden="true"
                className={expanded === item.id ? 'rotate-180' : ''}
              />
            </button>
          </h3>
          <div
            id={`content-${item.id}`}
            hidden={expanded !== item.id}
          >
            {item.content}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 5.4 Screen Reader Only Text

```css
/* Visually hidden but available to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Make visible when focused (for skip links) */
.sr-only.focus:focus {
  position: static;
  width: auto;
  height: auto;
  padding: 1rem;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

---

## 6. Accessibility Checklist

### 6.1 Development Checklist

**Before Committing Code**:

- [ ] All images have alt text
- [ ] All form inputs have labels
- [ ] Color contrast meets 4.5:1 for text
- [ ] Interactive elements are keyboard accessible
- [ ] Focus order is logical
- [ ] No `tabindex` > 0 used
- [ ] ARIA attributes used correctly
- [ ] axe-core tests pass

### 6.2 PR Review Checklist

- [ ] Can complete all tasks with keyboard only
- [ ] Screen reader announces content correctly
- [ ] Dynamic content updates are announced
- [ ] Error messages are clear and helpful
- [ ] Loading states are communicated
- [ ] Focus management is correct for modals

### 6.3 Release Checklist

- [ ] Lighthouse accessibility score ≥ 90
- [ ] axe automated scan passes
- [ ] Manual keyboard testing complete
- [ ] Screen reader testing complete
- [ ] Zoom to 200% works correctly
- [ ] Mobile touch targets are 44x44px

---

## 7. Resources

### 7.1 Learning Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Accessibility Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [WebAIM](https://webaim.org/)
- [A11y Project](https://www.a11yproject.com/)

### 7.2 Testing Tools

- [axe DevTools](https://www.deque.com/axe/) - Browser extension
- [WAVE](https://wave.webaim.org/) - Web accessibility evaluator
- [Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [NVDA](https://www.nvaccess.org/) - Free screen reader for Windows

### 7.3 Related Documentation

- `docs/design-system.md` — Visual design guidelines
- `docs/roadmap.md` — Phase 16 accessibility work
- `services/ui-web/README.md` — Development setup

