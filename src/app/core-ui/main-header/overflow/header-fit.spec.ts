import { DEMOTION_ORDER, FitInput, HeaderTokens, solveFit } from './header-fit';

// The shipped values, so the numbers below read like the real row. The specs
// never assert against these directly — `main-header.component.spec` is what
// pins them to the stylesheet.
const TOKENS: HeaderTokens = {
  btn: 40,
  gap: 4,
  groupGap: 16,
  titleActionGap: 2,
  titleActionsMargin: 8,
  titlePadding: 8,
};

const input = (over: Partial<FitInput> = {}): FitInput => ({
  budget: 1000,
  pinnedButtons: 2,
  slotButtons: [1, 1, 1, 1, 1, 1],
  titleReserve: 0,
  tokens: TOKENS,
  ...over,
});

/** What a row of n buttons costs under TOKENS, primary group included. */
const row = (buttons: number): number => {
  const perButton = TOKENS.btn + TOKENS.gap;
  const withTrailingGap = buttons * perButton;
  const separator = TOKENS.groupGap - TOKENS.gap;
  return withTrailingGap - TOKENS.gap + separator;
};

describe('solveFit', () => {
  it('demotes nothing when the whole row fits', () => {
    expect(solveFit(input({ budget: 1000 }))).toEqual({ demoted: 0, fits: true });
  });

  it('charges the trigger only once something has been demoted', () => {
    // 8 buttons fit exactly; one pixel less and the row must give something up
    // — and demoting one slot replaces its button with the trigger, so it has
    // to give up two to gain anything.
    const fits = row(8);
    expect(solveFit(input({ budget: fits })).demoted).toBe(0);
    expect(solveFit(input({ budget: fits - 2 })).demoted).toBe(2);
  });

  it('takes the smallest number of demotions that fits, not merely enough', () => {
    // Room for 5 buttons: 2 pinned + 2 slots + the trigger, i.e. 4 demoted.
    const fit = solveFit(input({ budget: row(5) }));
    expect(fit).toEqual({ demoted: 4, fits: true });
  });

  it('keeps a lone action rather than trading it for an equally wide trigger', () => {
    // A phone: the bottom nav owns add-task and the panel buttons, so sync is
    // the only demotable left and demoting it frees exactly nothing.
    const fit = solveFit(
      input({
        budget: 10,
        pinnedButtons: 1,
        slotButtons: [1],
      }),
    );
    expect(fit).toEqual({ demoted: 0, fits: false });
  });

  it('demotes everything and still reports the row as over-wide', () => {
    const fit = solveFit(input({ budget: 10, slotButtons: [2, 2, 2] }));
    expect(fit).toEqual({ demoted: 3, fits: false });
  });

  it('handles a row with nothing demotable at all', () => {
    expect(solveFit(input({ budget: 1000, slotButtons: [] }))).toEqual({
      demoted: 0,
      fits: true,
    });
    expect(solveFit(input({ budget: 10, slotButtons: [] }))).toEqual({
      demoted: 0,
      fits: false,
    });
  });

  it('never demotes more slots than there are', () => {
    const fit = solveFit(input({ budget: 0, slotButtons: [1, 1] }));
    expect(fit.demoted).toBeLessThanOrEqual(2);
  });

  it('owes the title its reserve before any action gets room', () => {
    const budget = row(8);
    expect(solveFit(input({ budget })).demoted).toBe(0);
    expect(solveFit(input({ budget, titleReserve: 100 })).demoted).toBeGreaterThan(0);
  });

  it('counts a slot holding several buttons as all of them', () => {
    const budget = row(6);
    // Five single-button slots plus one holding four: demoting the fat one
    // first frees far more than demoting a thin one.
    const fat = solveFit(input({ budget, slotButtons: [4, 1, 1, 1, 1, 1] }));
    const thin = solveFit(input({ budget, slotButtons: [1, 1, 1, 1, 1, 4] }));
    expect(fat.demoted).toBeLessThan(thin.demoted);
  });

  // The property that says "no flicker" in a form a machine can check. The old
  // model could not be tested for it at all: its answer depended on which
  // actions happened to be rendered when it looked, so the same width could
  // settle differently depending on how it got there.
  it('never collapses more as the row gets wider', () => {
    const widths = Array.from({ length: 1200 }, (_, px) => px);
    const answers = widths.map((budget) => solveFit(input({ budget })).demoted);

    answers.forEach((demoted, i) => {
      if (i > 0) {
        expect(demoted)
          .withContext(`at ${widths[i]}px, up from ${widths[i - 1]}px`)
          .toBeLessThanOrEqual(answers[i - 1]);
      }
    });
    // ...and it does actually move across that sweep, so the check above is
    // not passing on a constant.
    expect(answers[0]).toBeGreaterThan(answers[answers.length - 1]);
  });

  it('depends on nothing but its input', () => {
    const twice = [solveFit(input({ budget: 300 })), solveFit(input({ budget: 300 }))];
    expect(twice[0]).toEqual(twice[1]);
  });

  it('names every demotable action exactly once', () => {
    expect(new Set(DEMOTION_ORDER).size).toBe(DEMOTION_ORDER.length);
  });

  it('gives up the focus button last of all', () => {
    // It carries a live countdown, so it only leaves a row that has already
    // given up everything else — and the trigger has to say so when it does
    // (see isDemotedFocusRunning).
    expect(DEMOTION_ORDER[DEMOTION_ORDER.length - 1]).toBe('focus');
  });
});
