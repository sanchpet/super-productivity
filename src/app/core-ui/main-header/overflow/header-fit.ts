/**
 * The lengths the header's action row is laid out with, read back off the
 * stylesheet that draws it.
 *
 * `MainHeaderComponent` decides which actions fit by arithmetic over button
 * counts rather than by measuring the row. That is only honest if the numbers
 * it multiplies are the numbers the browser actually used, so they are read
 * from the custom properties on `main-header`'s host — declared once in
 * `main-header.component.scss` and consumed by the very rules that lay the row
 * out — instead of being copied into TypeScript. Every earlier attempt at this
 * fit mirrored pixel constants from four stylesheets, and each bug #9480 went
 * through was one of those constants disagreeing with its source.
 *
 * `main-header.component.spec` pins every field here against what a real
 * browser renders, so a stylesheet change that outgrows this reader fails a
 * test instead of silently mis-sizing the row.
 */
export interface HeaderTokens {
  /**
   * Width of one action button. Every action in the row is this wide,
   * `play-button`'s `mat-mini-fab` included — `main-header.component.spec`
   * pins that against a real rendering.
   */
  readonly btn: number;
  /** Space between two buttons inside the row. */
  readonly gap: number;
  /** Space between two action groups. */
  readonly groupGap: number;
  /** Space between two of the page title's own buttons. */
  readonly titleActionGap: number;
  /** The page title's action buttons' net inline margins, inset included. */
  readonly titleActionsMargin: number;
  /**
   * The page title's inline padding — how much of the row it still owes once
   * its text has shrunk away. A flex item never shrinks below its own padding,
   * whatever `min-width` says.
   */
  readonly titlePadding: number;
  /**
   * The most of the title's name the fit will hold room for. Paired with the
   * name's measured width in a `min()`, so it is a ceiling on the reserve rather
   * than a floor under the box: a name shorter than this reserves only itself.
   */
  readonly titleTextMin: number;
}

/**
 * Every token read here must be a plain length. An *unregistered* custom
 * property computes to its specified value with `var()` substituted but with
 * `calc()` left unevaluated, so `calc(-1 * var(--s))` arrives as that literal
 * string and parses to nothing. Doing the arithmetic on the CSS side of a token
 * therefore reads back as 0 with no error anywhere — declare the plain length
 * and do the arithmetic where the token is applied instead.
 */
/**
 * What `n` buttons cost the row: each one plus the gap that separates it from
 * whatever precedes it. A run of zero buttons costs nothing, not one gap.
 */
export const runWidth = (n: number, size: number, gap: number): number => {
  if (n <= 0) {
    return 0;
  }
  const buttons = n * size;
  const gaps = (n - 1) * gap;
  return buttons + gaps;
};

/**
 * An action that leaves the row when it stops fitting, first entry first.
 *
 * Pinned, and so absent from this list: the play button and the add-task
 * button. They are the header's two reasons to exist — start tracking, capture
 * a task — and the overflow trigger, which is the only route to everything
 * that did leave.
 *
 * The three at the end all carry state the user is meant to notice without
 * opening anything, so they go last and the trigger republishes what they were
 * showing: a conflict badge and an error/offline condition for sync
 * (`demotedSyncState`), a running counter or focus session as an accent
 * (`isDemotedCounterRunning`, `isDemotedFocusRunning`). Focus is last of all —
 * it only leaves a row that is already out of room.
 */
export type DemotableId =
  | 'pluginHeader'
  | 'userProfile'
  | 'sidePanelBtns'
  | 'panelButtons'
  | 'counters'
  | 'sync'
  | 'focus';

export const DEMOTION_ORDER: readonly DemotableId[] = [
  'pluginHeader',
  'userProfile',
  'sidePanelBtns',
  'panelButtons',
  'counters',
  'sync',
  'focus',
];

/** Sub-pixel slop, so a fractional layout width never reads as an overflow. */
const FIT_EPSILON = 1;

export interface FitInput {
  /** Content width of `.wrapper` — what the row has to fit into. */
  readonly budget: number;
  /**
   * Buttons that never leave the row: the play button and add-task. More than
   * zero also means the pinned group renders, which costs one separator.
   */
  readonly pinnedButtons: number;
  /**
   * How many buttons each demotable slot holds, in `DEMOTION_ORDER`. Every
   * entry is at least 1 — a slot with no buttons is not offered at all — which
   * is what makes demoting further always buy width.
   */
  readonly slotButtons: readonly number[];
  /** What the page title still owes once its text has shrunk to nothing. */
  readonly titleReserve: number;
  readonly tokens: HeaderTokens;
}

export interface Fit {
  /** How many leading slots are in the overflow panel. */
  readonly demoted: number;
  /** False when the row is over-wide even so — the scroll floor's cue. */
  readonly fits: boolean;
}

/**
 * What a row of `buttons` actions costs.
 *
 * Every action is one `--header-button-size` box and every adjacency is one
 * gap, whether the buttons sit in an action group, arrive as the children of a
 * `display: contents` component, or are the overflow trigger beside the
 * scroller — they are all links in one flex gap chain. So a row is a function
 * of how many buttons are in it, plus the one separator that follows the
 * pinned group.
 *
 * `main-header.component.spec` asserts this against a real rendering of the
 * shipped structure, which is what makes it safe to add the row up instead of
 * measuring it.
 */
const rowWidth = (buttons: number, i: FitInput): number => {
  const t = i.tokens;
  const separator = i.pinnedButtons > 0 ? t.groupGap - t.gap : 0;
  return runWidth(buttons, t.btn, t.gap) + separator;
};

/**
 * Decide how much of the row moves into the overflow panel.
 *
 * A pure function of counts and CSS tokens — deliberately, and this is the
 * whole design. Nothing it reads depends on what it returns, so it can be a
 * `computed()`: no animation frames, no settling passes, and above all no
 * re-rendering every collapsed action inline for a frame just to find out how
 * wide it is. That frame was the flicker (#9480), and the 120ms debounce that
 * used to hide it only made a resize land late.
 */
export const solveFit = (i: FitInput): Fit => {
  const cost = (demoted: number): number => {
    let buttons = i.pinnedButtons;
    for (let k = demoted; k < i.slotButtons.length; k++) {
      buttons += i.slotButtons[k];
    }
    // Demoting anything at all also introduces the trigger, so from the first
    // demotion on the row owes one more button than it can see.
    if (demoted > 0) {
      buttons += 1;
    }
    return rowWidth(buttons, i) + i.titleReserve;
  };

  for (let n = 0; n <= i.slotButtons.length; n++) {
    if (cost(n) <= i.budget + FIT_EPSILON) {
      return { demoted: n, fits: true };
    }
  }

  // Nothing fits, so the row will overflow whatever it does — but it should
  // still end up as narrow as it can. Every slot holds at least one button, so
  // past the first demotion each one strictly buys width and the narrowest
  // arrangement is always "everything gone"; the only real question is whether
  // that beats keeping the row as it is.
  //
  // It does not always. On a phone the bottom nav owns add-task and the panel
  // buttons, so a default install has exactly one demotable — and demoting it
  // removes one button while the trigger adds one back, hiding the app's only
  // sync indicator behind a tap to gain nothing.
  const all = i.slotButtons.length;
  const worthIt = cost(all) < cost(0) - FIT_EPSILON;
  return { demoted: worthIt ? all : 0, fits: false };
};
