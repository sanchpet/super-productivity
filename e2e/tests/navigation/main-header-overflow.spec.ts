import { expect, test } from '../../fixtures/test.fixture';
import type { Page } from '@playwright/test';

/**
 * The header picks its button set by measuring its own width (#9480), and the
 * right panel is what narrows it most. Every route into the demoted actions runs
 * through one button — `.header-overflow-btn` — so that button staying in view
 * is the whole model's load-bearing assumption. It is also the nav's LAST child,
 * which makes it the first thing to fall off the row's trailing edge: nothing in
 * the ancestor chain scrolls (`.main-content` is `overflow: hidden`), and when
 * the row does scroll the scrollbar is hidden and it rests at `scrollLeft: 0`.
 *
 * Asserted against the live layout rather than against the demotion bookkeeping,
 * because every regression here was the bookkeeping disagreeing with the layout.
 * `toPass` rather than a settle helper: the fit lands on an animation frame and,
 * widening, only REOFFER_DELAY_MS after the header stops moving, so the
 * assertion itself is the settle signal (`e2e/CLAUDE.md`: no `waitForTimeout`).
 */
const expectTriggerInView = async (page: Page): Promise<void> => {
  await expect(async () => {
    const fits = await page.evaluate(() => {
      const nav = document.querySelector('nav.action-nav-right') as HTMLElement | null;
      const trigger = nav?.querySelector('.header-overflow-btn') as HTMLElement | null;
      if (!nav || !trigger) {
        return { hasTrigger: false, inView: false, overflowPx: 0, navW: 0 };
      }
      const navRect = nav.getBoundingClientRect();
      const rect = trigger.getBoundingClientRect();
      return {
        hasTrigger: true,
        inView: rect.left >= navRect.left - 0.5 && rect.right <= navRect.right + 0.5,
        overflowPx: Math.round(nav.scrollWidth - nav.clientWidth),
        navW: nav.clientWidth,
      };
    });
    expect(fits.hasTrigger, 'the header should have demoted something').toBe(true);
    expect(
      fits.inView,
      `trigger outside the nav (nav ${fits.navW}px, row overflow ${fits.overflowPx}px)`,
    ).toBe(true);
  }).toPass({ timeout: 10000 });
};

const openNotesPanel = async (page: Page): Promise<void> => {
  await page.locator('.e2e-toggle-notes-btn').first().click();
  await expect(page.locator('right-panel.isOpen')).toBeVisible();
  await expect(page.locator('right-panel.isPanelAnimating')).toHaveCount(0);
};

test.describe('main header overflow with the right panel', () => {
  test('keeps the overflow trigger reachable while a side panel is open', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1100, height: 860 });
    await openNotesPanel(page);

    // The row must actually fit. A header that has demoted an action and still
    // overflows hangs its trigger over the clip edge, which is #9480 again.
    await expectTriggerInView(page);

    // And the trigger must reach what it demoted.
    await page.locator('.header-overflow-btn').click();
    await expect(page.locator('.header-overflow-panel.isVisible')).toBeVisible();
    await expect(
      page.locator('.header-overflow-panel desktop-panel-buttons'),
    ).toBeAttached();
  });

  // A demoted action behaves like a menu item: using it dismisses the panel,
  // instead of leaving it parked over the content until dismissed separately.
  test('closes the overflow panel once a demoted action is used', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1100, height: 860 });
    await openNotesPanel(page);

    await page.locator('.header-overflow-btn').click();
    const panel = page.locator('.header-overflow-panel');
    await expect(panel).toHaveClass(/isVisible/);

    await panel.locator('.e2e-toggle-schedule-day-panel').click();
    await expect(panel).not.toHaveClass(/isVisible/);
  });

  /**
   * The band the first fix missed. Below ~760px the panel has hit its own
   * minimum width and stops yielding, so every further pixel comes out of the
   * header — and the title's floor plus its non-shrinking action buttons claimed
   * all of it, leaving the action nav 8px wide with the trigger outside it.
   *
   * Stops at 720 on purpose. Under about 700 the panel keeps ~270px of a
   * shrinking content area (`_handleWindowResize` stops clamping once half the
   * content area falls under `MIN_WIDTH`), so the header box itself drops below
   * one button — 71px at a 601px window. No demotion or pinning can put a 40px
   * control inside a 71px header; that is a right-panel sizing bug, not this
   * row's, and asserting it here would only pin the wrong component.
   *
   * Swept rather than sampled: the thresholds that make this work are container
   * widths in two stylesheets, and a single sample would let one drift.
   */
  for (const width of [900, 800, 720]) {
    test(`keeps the overflow trigger reachable at ${width}px with a panel open`, async ({
      page,
      workViewPage,
    }) => {
      await workViewPage.waitForTaskList();
      await page.setViewportSize({ width: 1100, height: 860 });
      await openNotesPanel(page);

      await page.setViewportSize({ width, height: 860 });
      await expectTriggerInView(page);
    });
  }

  /**
   * The title's roomier floor is keyed to the header's width, but the header IS
   * the window once the side nav leaves the flow, so the phone floor has to
   * survive that. Regression guard: keying it to the container alone silently
   * doubled the floor on a 560px phone.
   */
  test('keeps the phone title floor when the header spans the whole window', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 560, height: 860 });
    await expect(page.locator('mobile-bottom-nav')).toBeVisible();

    const floor = await page.evaluate(() => {
      const title = document.querySelector('main-header .page-title') as HTMLElement;
      return parseFloat(getComputedStyle(title).minWidth);
    });
    expect(floor).toBeLessThanOrEqual(84);
  });
});
