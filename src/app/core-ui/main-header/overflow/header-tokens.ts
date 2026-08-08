import { HeaderTokens } from './header-fit';

const px = (style: CSSStyleDeclaration, name: string): number =>
  parseFloat(style.getPropertyValue(name)) || 0;

/**
 * @param host the `main-header` host element, which carries every token.
 */
export const readHeaderTokens = (host: HTMLElement): HeaderTokens => {
  const s = getComputedStyle(host);
  return {
    btn: px(s, '--header-button-size'),
    gap: px(s, '--header-nav-button-gap'),
    groupGap: px(s, '--header-action-group-gap'),
    titleActionGap: px(s, '--header-title-action-gap'),
    titleActionsMargin:
      px(s, '--header-title-actions-gutter') - px(s, '--header-title-actions-inset'),
    titlePadding:
      px(s, '--header-title-padding-inline-start') +
      px(s, '--header-title-padding-inline-end'),
    titleTextMin: px(s, '--header-title-text-min'),
  };
};
