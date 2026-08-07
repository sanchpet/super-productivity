import {
  afterNextRender,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injectable,
  signal,
  Signal,
} from '@angular/core';
import { DataInitStateService } from '../../../core/data-init/data-init-state.service';
import { GlobalConfigService } from '../../../features/config/global-config.service';
import { SimpleCounterService } from '../../../features/simple-counter/simple-counter.service';
import { UserProfileService } from '../../../features/user-profile/user-profile.service';
import { PluginBridgeService } from '../../../plugins/plugin-bridge.service';
import { LayoutService } from '../../layout/layout.service';
import { desktopPanelButtonCount } from '../desktop-panel-buttons/desktop-panel-buttons.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { DemotableId, DEMOTION_ORDER, Fit, solveFit } from './header-fit';
import { HeaderTokens, readHeaderTokens, runWidth } from './header-tokens';

const NOTHING_DEMOTED: Fit = { demoted: 0, fits: true };

/**
 * Which actions the header's action row can still show, and which have moved
 * into the overflow panel.
 *
 * The header used to pick its button set from the *window* width, but it is
 * laid out inside `.main-content`, which the in-flow side nav and the right
 * panel both narrow. A landscape phone rendered the full desktop set into a row
 * ~260px narrower than the window and the surplus buttons fell off an edge
 * nothing in the ancestor chain can scroll (#9480).
 *
 * So it fits the row to the row's own width — but by *arithmetic*, never by
 * measuring. Exactly one thing here reads the DOM: a ResizeObserver on
 * `.wrapper` recording how much room there is. Everything else is app state
 * (how many buttons each action contributes) and CSS custom properties (how
 * wide a button is), and none of it changes when the answer changes. That is
 * what lets the answer be a `computed()`, and it is the difference between this
 * and what it replaced: measuring a collapsed action meant rendering it inline
 * for a frame first, which is what made the row flicker whenever the side panel
 * opened or a divider was dragged.
 *
 * Provided by `MainHeaderComponent`, so its `ElementRef` is the header's host.
 */
@Injectable()
export class HeaderOverflowService {
  private readonly _host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly _plugins = inject(PluginBridgeService);
  private readonly _config = inject(GlobalConfigService);
  private readonly _layout = inject(LayoutService);
  private readonly _counters = inject(SimpleCounterService);
  private readonly _profiles = inject(UserProfileService);
  private readonly _dataInit = inject(DataInitStateService);
  private readonly _destroyRef = inject(DestroyRef);

  private readonly _isDataLoaded = toSignal(this._dataInit.isAllDataLoadedInitially$, {
    initialValue: false,
  });

  private readonly _enabledCounters = toSignal(this._counters.enabledSimpleCounters$, {
    initialValue: [],
  });

  private readonly _width = signal(0);
  private readonly _tokens = signal<HeaderTokens | null>(null);

  /**
   * How many buttons `page-title` renders beside the title. Pushed in by the
   * component from its `viewChild`, because the count belongs next to the
   * template that decides it.
   */
  readonly titleActionCount = signal(0);

  /**
   * Set while the actions are teleported into the vertical action strip. That
   * is a fixed-width column, not this row, so there is nothing to fit.
   */
  readonly isDisabled = signal(false);

  /**
   * Add-task, the panel buttons and the plugin side-panel buttons are absent on
   * mobile rather than demoted: the bottom nav owns them there, via its FAB and
   * its panels menu. That is a placement rule, not a question of width.
   */
  private readonly _ownedByBottomNav = this._layout.isShowMobileBottomNav;

  readonly showAddTaskInline = computed(() => !this._ownedByBottomNav());

  /**
   * How many buttons each demotable action contributes, in demotion order. A
   * count of zero means the action is not configured at all, and it is dropped
   * rather than demoted — an action that does not exist must not consume the
   * row's one chance to collapse something.
   */
  private readonly _slotButtons = computed<ReadonlyMap<DemotableId, number>>(() => {
    if (!this._isDataLoaded()) {
      return new Map();
    }
    const af = this._config.appFeatures();
    const mobile = this._ownedByBottomNav();
    const counts: Record<DemotableId, number> = {
      pluginHeader:
        this._plugins.headerButtons().length +
        this._plugins.workContextHeaderButtons().length,
      userProfile: af.isEnableUserProfiles && this._profiles.isInitialized() ? 1 : 0,
      sidePanelBtns: mobile ? 0 : this._plugins.sidePanelButtons().length,
      panelButtons: mobile ? 0 : desktopPanelButtonCount(af),
      counters: this._enabledCounters().filter((c) => !c.isHideButton).length,
      sync: af.isSyncIconEnabled ? 1 : 0,
    };
    return new Map(
      DEMOTION_ORDER.filter((id) => counts[id] > 0).map((id) => [id, counts[id]]),
    );
  });

  /** The demotable actions this configuration offers, in demotion order. */
  private readonly _slotIds = computed<readonly DemotableId[]>(() => [
    ...this._slotButtons().keys(),
  ]);

  private readonly _fit = computed<Fit>(
    () => {
      const tokens = this._tokens();
      const budget = this._width();
      if (!tokens || budget <= 0 || this.isDisabled()) {
        return NOTHING_DEMOTED;
      }
      const slots = this._slotButtons();
      const hasPlay =
        this._isDataLoaded() && this._config.appFeatures().isTimeTrackingEnabled;
      const hasAddTask = this.showAddTaskInline();
      // Focus is pinned alongside them, but sits in its own group, so it is a
      // button the row owes without being a reason the pinned group exists.
      const hasFocus =
        this._isDataLoaded() && this._config.appFeatures().isFocusModeEnabled;
      return solveFit({
        budget,
        pinnedButtons: (hasPlay ? 1 : 0) + (hasAddTask ? 1 : 0) + (hasFocus ? 1 : 0),
        hasPlayButton: hasPlay,
        hasPrimaryGroup: hasPlay || hasAddTask,
        slotButtons: [...slots.values()],
        titleReserve: this._titleReserve(tokens),
        tokens,
      });
    },
    { equal: (a, b) => a.demoted === b.demoted && a.fits === b.fits },
  );

  /**
   * What the title keeps whatever else has to go. Its text shrinks to nothing
   * (`flex-shrink: 999`, `min-width: 0`), but a flex item never shrinks past
   * its own padding, and its buttons are `flex: 0 0 auto` and never shrink at
   * all.
   */
  private _titleReserve(t: HeaderTokens): number {
    if (!this._isDataLoaded()) {
      return 0;
    }
    const buttons = this.titleActionCount();
    const actions =
      buttons > 0 ? runWidth(buttons, t.btn, t.titleActionGap) + t.titleActionsMargin : 0;
    return t.titlePadding + actions;
  }

  readonly demoted = computed<ReadonlySet<DemotableId>>(
    () => new Set(this._slotIds().slice(0, this._fit().demoted)),
  );

  readonly hasOverflow = computed(() => this.demoted().size > 0);

  /**
   * The row is over-wide even with everything demoted — so the pinned actions
   * alone do not fit. Nothing above can rescue that, and `.main-content` is
   * `overflow: hidden`, so the row becomes a scroll container rather than
   * running off an edge that cannot be scrolled back (#9480).
   */
  readonly needsScrollFloor = computed(() => !this._fit().fits);

  private _isDemoted(id: DemotableId): Signal<boolean> {
    return computed(() => this.demoted().has(id));
  }

  private _isInline(id: DemotableId): Signal<boolean> {
    return computed(() => this._slotButtons().has(id) && !this.demoted().has(id));
  }

  readonly isDemotedPluginBtns = this._isDemoted('pluginHeader');
  readonly isDemotedUserProfile = this._isDemoted('userProfile');
  readonly isDemotedSidePanelBtns = this._isDemoted('sidePanelBtns');
  readonly isDemotedPanelBtns = this._isDemoted('panelButtons');
  readonly isDemotedCounters = this._isDemoted('counters');
  readonly isDemotedSync = this._isDemoted('sync');

  readonly showPluginBtnsInline = this._isInline('pluginHeader');
  readonly showUserProfileInline = this._isInline('userProfile');
  readonly showSidePanelBtnsInline = this._isInline('sidePanelBtns');
  readonly showPanelBtnsInline = this._isInline('panelButtons');
  readonly showCountersInline = this._isInline('counters');
  readonly showSyncInline = this._isInline('sync');

  constructor() {
    afterNextRender(() => this._observe());
  }

  /**
   * The row's one DOM read. `contentRect` is the *content* box, so the wrapper's
   * padding is already subtracted — including the Electron window-controls
   * reserve, which is a `calc()` over `env(titlebar-area-width)` and is dropped
   * the moment the right panel opens. Tokens are re-read here too: the callback
   * runs after layout, so it is the one place guaranteed to see the values a
   * breakpoint has just switched.
   */
  private _observe(): void {
    const wrapper = this._host.querySelector?.('.wrapper');
    if (typeof ResizeObserver === 'undefined' || !(wrapper instanceof Element)) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width <= 0) {
        return;
      }
      this._tokens.set(readHeaderTokens(this._host));
      this._width.set(width);
    });
    observer.observe(wrapper);
    this._destroyRef.onDestroy(() => observer.disconnect());
  }
}
