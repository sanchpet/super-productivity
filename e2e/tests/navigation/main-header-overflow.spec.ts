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
    await page.setViewportSize({ width: 1000, height: 860 });
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
    await page.setViewportSize({ width: 1000, height: 860 });
    await openNotesPanel(page);

    await page.locator('.header-overflow-btn').click();
    const panel = page.locator('.header-overflow-panel');
    await expect(panel).toHaveClass(/isVisible/);

    await panel.locator('.e2e-toggle-schedule-day-panel').click();
    await expect(panel).not.toHaveClass(/isVisible/);
  });

  // The exemption to that rule -- a control marked `data-keeps-overflow-open`
  // -- needs a demoted counter or profile button to exist, which the default
  // e2e profile has neither of. Covered as a unit test instead; see
  // main-header.component.spec.ts.

  /**
   * The band the first fix missed. Below ~760px the panel has hit its own
   * minimum width and stops yielding, so every further pixel comes out of the
   * header — and the title's floor plus its non-shrinking action buttons claimed
   * all of it, leaving the action nav 8px wide with the trigger outside it.
   *
   * Swept rather than sampled, because what makes this work is a pair of
   * container-width thresholds in two stylesheets and a single sample would let
   * one drift. One test rather than one per width: the setup is identical and
   * booting the fixture three times buys nothing.
   *
   * Stops at 800 on purpose. Below that the header's width stops being a
   * function of the window: the right panel only re-clamps itself inside a
   * throttled, double-rAF resize handler and gives up entirely once half the
   * content area falls under its own `MIN_WIDTH`, so under rapid resizes it
   * keeps ~320px of a shrinking row and the header lands anywhere from 190px to
   * 140px. At 140px no demotion or placement can seat a 40px control beside the
   * title's frame and its buttons. That is right-panel sizing, not this row —
   * asserting it here would pin the wrong component and flake doing it.
   */
  test('keeps the overflow trigger reachable as the window narrows', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1000, height: 860 });
    await openNotesPanel(page);

    for (const width of [900, 800]) {
      await page.setViewportSize({ width, height: 860 });
      await expectTriggerInView(page);
    }
  });

  /**
   * The title box is sized by its name, not by a floor, so the buttons that
   * follow it sit against the name rather than after a run of empty box. A
   * 160px floor used to pad every short title: "Today" measures ~75px, leaving
   * 77px of nothing before the project-menu button.
   */
  test('keeps the title buttons against the title, at any width', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();

    for (const width of [1400, 1100, 900]) {
      await page.setViewportSize({ width, height: 860 });
      await expect(async () => {
        const gap = await page.evaluate(() => {
          const header = document.querySelector('main-header') as HTMLElement;
          const text = header.querySelector('.page-title-text') as HTMLElement | null;
          const actions = header.querySelector(
            '.page-title-actions',
          ) as HTMLElement | null;
          if (!text || !actions) {
            return null;
          }
          return Math.round(
            actions.getBoundingClientRect().left - text.getBoundingClientRect().right,
          );
        });
        expect(gap, `no title actions rendered at ${width}px`).not.toBeNull();
        // A few px of designed spacing is fine; a floor's worth of dead box
        // is what this guards against.
        expect(gap!, `dead space before the title buttons at ${width}px`).toBeLessThan(
          16,
        );
      }).toPass({ timeout: 10000 });
    }
  });
});
