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
  /** Width of one action button. Every action in the row is this wide. */
  readonly btn: number;
  /** Width of the play button, the row's one `mat-mini-fab`. */
  readonly play: number;
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
}

/**
 * Every token read here must be a plain length. An *unregistered* custom
 * property computes to its specified value with `var()` substituted but with
 * `calc()` left unevaluated, so `calc(-1 * var(--s))` arrives as that literal
 * string and parses to nothing. Doing the arithmetic on the CSS side of a token
 * therefore reads back as 0 with no error anywhere — declare the plain length
 * and do the arithmetic where the token is applied instead.
 */
const px = (style: CSSStyleDeclaration, name: string): number =>
  parseFloat(style.getPropertyValue(name)) || 0;

/**
 * @param host the `main-header` host element, which carries every token.
 */
export const readHeaderTokens = (host: HTMLElement): HeaderTokens => {
  const s = getComputedStyle(host);
  return {
    btn: px(s, '--header-button-size'),
    play: px(s, '--header-play-size'),
    gap: px(s, '--header-nav-button-gap'),
    groupGap: px(s, '--header-action-group-gap'),
    titleActionGap: px(s, '--header-title-action-gap'),
    titleActionsMargin:
      px(s, '--header-title-actions-gutter') - px(s, '--header-title-actions-inset'),
    titlePadding:
      px(s, '--header-title-padding-inline-start') +
      px(s, '--header-title-padding-inline-end'),
  };
};

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
