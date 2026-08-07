import { HeaderTokens, runWidth } from './header-tokens';

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
export const FIT_EPSILON = 1;

export interface FitInput {
  /** Content width of `.wrapper` — what the row has to fit into. */
  readonly budget: number;
  /** Buttons that never leave the row. */
  readonly pinnedButtons: number;
  /** Whether one of those is the play button, which is its own width. */
  readonly hasPlayButton: boolean;
  /** Whether the pinned group renders, which costs the row one separator. */
  readonly hasPrimaryGroup: boolean;
  /** How many buttons each demotable slot holds, in `DEMOTION_ORDER`. */
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
 * of how many buttons are in it, plus two corrections: the play button is its
 * own width, and the pinned group is followed by the wider group separator.
 *
 * `main-header.component.spec` asserts this against a real rendering of the
 * shipped structure, which is what makes it safe to add the row up instead of
 * measuring it.
 */
const rowWidth = (buttons: number, i: FitInput): number => {
  const t = i.tokens;
  const play = i.hasPlayButton ? t.play - t.btn : 0;
  const separator = i.hasPrimaryGroup ? t.groupGap - t.gap : 0;
  return runWidth(buttons, t.btn, t.gap) + play + separator;
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

  // Nothing fits. Take the narrowest arrangement, and require a demotion to
  // genuinely buy width before preferring it — which is what stops the row
  // hiding its last single action to make room for an equally wide trigger.
  // On a phone that is the whole guard: the bottom nav owns add-task and the
  // panel buttons, so a default install has exactly one demotable, and trading
  // it for the trigger would hide the app's only sync indicator to gain
  // nothing.
  let best = 0;
  for (let n = 1; n <= i.slotButtons.length; n++) {
    if (cost(n) < cost(best) - FIT_EPSILON) {
      best = n;
    }
  }
  return { demoted: best, fits: false };
};
