import { expect, test } from '../../fixtures/test.fixture';
import type { Page } from '@playwright/test';

/**
 * Dragging the right-panel divider walks the header through dozens of widths.
 *
 * The header used to answer "what fits?" by measuring, and a collapsed action
 * has no width to measure — so the only way it could ever come back was to
 * render every collapsed action inline again and look. That happened on every
 * widening, which meant a drag tore down and rebuilt the whole action row over
 * and over, `simple-counter-button` and its countdown subscription included,
 * and the row visibly flickered while it did.
 *
 * The fit is arithmetic over button counts now, so a width that changes nothing
 * about which actions fit must change nothing about the DOM. That is what this
 * counts. It is deliberately a mutation count and not a screenshot: the churn
 * is the defect, and a still frame cannot see it.
 */
const countRowMutations = async (
  page: Page,
  act: () => Promise<void>,
): Promise<number> => {
  await expect(page.locator('.action-nav-scroll')).toHaveCount(1);

  await page.evaluate(() => {
    // The scroller and the action groups inside it — every level an action can
    // be added to or removed from. Watching only the scroller would miss the
    // focus button and the counters, which live one level down inside
    // `.counters-action-group`, and their subscriptions are exactly the churn
    // this is here to catch. Not `subtree`, though: below these, Material's
    // ripple nodes appear and vanish under the cursor a drag drags across, and
    // counting those would measure the mouse rather than the row.
    const boxes = document.querySelectorAll(
      '.action-nav-scroll, .action-nav-scroll .header-action-group',
    );
    const w = window as unknown as {
      __rowMutations: number;
      __rowObserver: MutationObserver;
    };
    w.__rowMutations = 0;
    w.__rowObserver = new MutationObserver((records) => {
      w.__rowMutations += records.length;
    });
    boxes.forEach((box) => w.__rowObserver.observe(box, { childList: true }));
  });

  await act();

  return page.evaluate(() => {
    const w = window as unknown as {
      __rowMutations: number;
      __rowObserver: MutationObserver;
    };
    w.__rowObserver.disconnect();
    return w.__rowMutations;
  });
};

const openNotesPanel = async (page: Page): Promise<void> => {
  await page.locator('.e2e-toggle-notes-btn').first().click();
  await expect(page.locator('right-panel.isOpen')).toBeVisible();
  await expect(page.locator('right-panel.isPanelAnimating')).toHaveCount(0);
};

/** Drag the right panel's divider by `dx`, in the small steps a hand makes. */
const dragDivider = async (page: Page, dx: number): Promise<void> => {
  const handle = page.locator('right-panel .resize-handle');
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('right panel resize handle not found');
  }
  const y = box.y + Math.round(box.height / 2);
  const from = box.x + Math.round(box.width / 2);

  await page.mouse.move(from, y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const travelled = (dx * i) / steps;
    await page.mouse.move(from + travelled, y);
  }
  await page.mouse.up();
  await expect(page.locator('right-panel.resizing')).toHaveCount(0);
};

test.describe('main header while the layout is resized', () => {
  test('does not rebuild the action row while the divider is dragged', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1100, height: 860 });
    await openNotesPanel(page);

    // Out and back to the same place, so the row ends where it started and any
    // mutation counted is churn rather than a real change of what fits.
    const mutations = await countRowMutations(page, async () => {
      await dragDivider(page, -120);
      await dragDivider(page, 120);
    });

    // Measured at 2: one threshold crossed on the way out, one on the way
    // back, which is the row doing exactly the work it should. The margin is
    // for a drag that happens to cross a second one. Re-offering on every
    // widening frame ran to dozens.
    expect(
      mutations,
      `the action row was rebuilt ${mutations} times during one divider drag`,
    ).toBeLessThanOrEqual(4);
  });

  test('does not rebuild the action row when the side panel is toggled', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.setViewportSize({ width: 1600, height: 860 });

    // Wide enough that everything still fits with the panel open, so opening it
    // is a width change that changes no answer.
    const mutations = await countRowMutations(page, async () => {
      await openNotesPanel(page);
    });

    await expect(page.locator('nav.action-nav-right .header-overflow-btn')).toHaveCount(
      0,
    );
    expect(
      mutations,
      `the action row was rebuilt ${mutations} times just opening a panel`,
    ).toBe(0);
  });
});
