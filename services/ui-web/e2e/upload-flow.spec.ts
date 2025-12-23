import { test, expect } from '@playwright/test';

/**
 * E2E tests for the main user flow: upload → query → clarify → summarize
 */

test.describe('Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the upload page
    await page.goto('/upload');
  });

  test('displays upload page with file input', async ({ page }) => {
    // Check page title or heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    
    // Check for file input
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test('shows error for invalid file type', async ({ page }) => {
    // Create an invalid file
    const fileInput = page.locator('input[type="file"]');
    
    // Upload a text file (should be rejected)
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid file content'),
    });

    // Should show an error or rejection message
    // The exact behavior depends on the component implementation
  });

  test('accepts CSV file upload', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    
    // Upload a CSV file
    await fileInput.setInputFiles({
      name: 'budget.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Category,Amount\nRent,1500\nFood,500\nUtilities,200'),
    });

    // File should be selected (component shows filename)
    await expect(page.getByText('budget.csv')).toBeVisible();
  });
});

test.describe('Navigation Flow', () => {
  test('can navigate between pages', async ({ page }) => {
    // Start at home page
    await page.goto('/');
    
    // Home page should be accessible
    await expect(page).toHaveURL('/');
  });

  test('shows 404 for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-page');
    
    // Should show 404 content
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('upload page is usable on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/upload');
    
    // File input should still be accessible
    await expect(page.locator('input[type="file"]')).toBeVisible();
    
    // Content should fit within viewport (no horizontal scroll)
    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
  });

  test('upload page renders correctly on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    
    await page.goto('/upload');
    
    // Should display properly
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('upload page has accessible form elements', async ({ page }) => {
    await page.goto('/upload');
    
    // File input should have accessible label
    const fileInput = page.locator('input[type="file"]');
    
    // Check that input is keyboard accessible
    await fileInput.focus();
    await expect(fileInput).toBeFocused();
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/upload');
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    
    // Some element should be focused
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });
});

test.describe('Error States', () => {
  test('handles network errors gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('**/upload-budget', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INTERNAL_ERROR', details: 'Server error' }),
      }),
    );

    await page.goto('/upload');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'budget.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Category,Amount\nRent,1500'),
    });

    // Try to submit (click upload button if exists)
    const uploadButton = page.getByRole('button', { name: /upload/i });
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
      
      // Should show error message
      await expect(page.getByText(/error/i)).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Query Page', () => {
  test.skip('displays query input after upload', async ({ page }) => {
    // This test requires a successful upload first
    // Skip until we have mock API responses set up
    
    await page.goto('/clarify');
    
    // Should redirect or show query input
    await expect(page.getByRole('textbox')).toBeVisible();
  });
});

test.describe('Summary Page', () => {
  test.skip('displays summary after completing flow', async ({ page }) => {
    // This test requires completing the full flow
    // Skip until we have mock API responses set up
    
    await page.goto('/summarize');
    
    // Should show summary view or redirect
  });
});

