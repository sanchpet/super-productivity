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
 * because both regressions here were the bookkeeping disagreeing with the layout
 * by a handful of pixels.
 */
const expectTriggerInView = async (page: Page): Promise<void> => {
  const fits = await page.evaluate(() => {
    const nav = document.querySelector('nav.action-nav-right') as HTMLElement | null;
    const trigger = nav?.querySelector('.header-overflow-btn') as HTMLElement | null;
    if (!nav || !trigger) {
      return { hasTrigger: false, inView: false, overflowPx: 0 };
    }
    const navRect = nav.getBoundingClientRect();
    const rect = trigger.getBoundingClientRect();
    return {
      hasTrigger: true,
      inView: rect.left >= navRect.left - 0.5 && rect.right <= navRect.right + 0.5,
      overflowPx: Math.round(nav.scrollWidth - nav.clientWidth),
    };
  });
  expect(fits.hasTrigger, 'the header should have demoted something').toBe(true);
  expect(fits.inView, `trigger outside the nav (row overflow ${fits.overflowPx}px)`).toBe(
    true,
  );
};

/**
 * The fit runs on an animation frame and, in the widening direction, only once
 * the header has held still for REOFFER_DELAY_MS. So the state worth asserting
 * is the settled one, not the first frame that has a trigger in it — a panel
 * still sliding open is momentarily wider than it ends up, and the under-demoted
 * row this test exists for only appears once it stops.
 */
const waitForHeaderSettled = async (page: Page): Promise<void> => {
  await expect(page.locator('right-panel.isPanelAnimating')).toHaveCount(0);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const el = document.querySelector('main-header') as HTMLElement | null;
        const width = el?.getBoundingClientRect().width;
        setTimeout(
          () => resolve(!!width && el?.getBoundingClientRect().width === width),
          250,
        );
      }),
  );
};

test.describe('main header overflow with the right panel', () => {
  test('keeps the overflow trigger reachable while a side panel is open', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1100, height: 860 });

    await page.locator('.e2e-toggle-notes-btn').first().click();
    await expect(page.locator('right-panel.isOpen')).toBeVisible();
    await waitForHeaderSettled(page);

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

  test('keeps the overflow trigger reachable once the row can only scroll', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.locator('.e2e-toggle-notes-btn').first().click();
    await expect(page.locator('right-panel.isOpen')).toBeVisible();

    // Narrow enough that even the pinned actions do not fit, so the row falls
    // back to scrolling. The trigger is its last child and the scrollbar is
    // hidden, so unless it is pinned it rests entirely outside the scrollport.
    await page.setViewportSize({ width: 800, height: 860 });
    await expect(page.locator('.action-nav-right--scrolls')).toBeAttached();
    await waitForHeaderSettled(page);

    await expectTriggerInView(page);
  });
});
