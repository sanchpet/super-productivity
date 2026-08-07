import { computed, DestroyRef, inject, Injectable, signal, Signal } from '@angular/core';
import { DataInitStateService } from '../../../core/data-init/data-init-state.service';
import { GlobalConfigService } from '../../../features/config/global-config.service';
import { SimpleCounterService } from '../../../features/simple-counter/simple-counter.service';
import { UserProfileService } from '../../../features/user-profile/user-profile.service';
import { PluginBridgeService } from '../../../plugins/plugin-bridge.service';
import { LayoutService } from '../../layout/layout.service';
import { desktopPanelButtonCount } from '../desktop-panel-buttons/desktop-panel-buttons.component';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  DemotableId,
  DEMOTION_ORDER,
  Fit,
  HeaderTokens,
  runWidth,
  solveFit,
} from './header-fit';
import { readHeaderTokens } from './header-tokens';

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
 * Provided by `MainHeaderComponent`, which hands it the row to watch via
 * `observe()`.
 */
@Injectable()
export class HeaderOverflowService {
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

  // A percentage-sized side panel makes the header's width fractional, and a
  // ResizeObserver fires on height changes too, so compare with a pixel of slop
  // rather than exactly: sub-pixel jitter must not wake the fit.
  private readonly _width = signal(0, { equal: (a, b) => Math.abs(a - b) < 1 });

  // `readHeaderTokens` builds a fresh object per delivery, so without this every
  // resize frame would notify with values that had not moved. They only change
  // at a viewport breakpoint.
  private readonly _tokens = signal<HeaderTokens | null>(null, {
    equal: (a, b) =>
      !!a &&
      !!b &&
      (Object.keys(a) as (keyof HeaderTokens)[]).every((k) => a[k] === b[k]),
  });

  private readonly _titleActionCount = signal<Signal<number>>(signal(0));

  /**
   * How many buttons `page-title` renders beside the title — bound once, as a
   * signal rather than copied value.
   *
   * The count belongs next to the template that decides it, so the component
   * hands its `viewChild` over. Handing over the *signal* keeps it a plain edge
   * in the graph: copying the value through an effect would let the row render
   * once with the old reserve and re-fit a frame later, which is the one-frame
   * reflow this whole change exists to remove.
   */
  bindTitleActionCount(count: Signal<number>): void {
    this._titleActionCount.set(count);
  }

  /**
   * The vertical action strip teleports the actions into a fixed-width column,
   * which is not this row — so there is nothing to fit. Derived here rather
   * than pushed in by the component: it is the same two signals this service
   * already reads, and a predicate stated in two places is the drift this
   * refactor exists to remove.
   */
  private readonly _isVerticalActionBar = computed(
    () => !this._layout.isXs() && !!this._config.misc()?.isVerticalActionBar,
  );

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
  private readonly _slotButtons = computed<ReadonlyMap<DemotableId, number>>(
    () => {
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
        focus: af.isFocusModeEnabled ? 1 : 0,
      };
      return new Map(
        DEMOTION_ORDER.filter((id) => counts[id] > 0).map((id) => [id, counts[id]]),
      );
    },
    {
      // A running stopwatch re-emits the counter list every second, so without
      // value equality the whole graph below would churn once a second forever.
      equal: (a, b) => a.size === b.size && [...a].every(([id, n]) => b.get(id) === n),
    },
  );

  /** The demotable actions this configuration offers, in demotion order. */
  private readonly _slotIds = computed<readonly DemotableId[]>(() => [
    ...this._slotButtons().keys(),
  ]);

  private readonly _fit = computed<Fit>(
    () => {
      const tokens = this._tokens();
      const budget = this._width();
      if (!tokens || budget <= 0 || this._isVerticalActionBar()) {
        return NOTHING_DEMOTED;
      }
      const hasPlay =
        this._isDataLoaded() && this._config.appFeatures().isTimeTrackingEnabled;
      const hasAddTask = this.showAddTaskInline();
      return solveFit({
        budget,
        pinnedButtons: (hasPlay ? 1 : 0) + (hasAddTask ? 1 : 0),
        slotButtons: [...this._slotButtons().values()],
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
    const buttons = this._titleActionCount()();
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
  readonly isDemotedFocus = this._isDemoted('focus');

  readonly showPluginBtnsInline = this._isInline('pluginHeader');
  readonly showUserProfileInline = this._isInline('userProfile');
  readonly showSidePanelBtnsInline = this._isInline('sidePanelBtns');
  readonly showPanelBtnsInline = this._isInline('panelButtons');
  readonly showCountersInline = this._isInline('counters');
  readonly showSyncInline = this._isInline('sync');
  readonly showFocusInline = this._isInline('focus');

  /**
   * Start watching the row. The component hands the element over rather than
   * this service going looking for it: `.wrapper` belongs to the header's own
   * template, and a `querySelector` that quietly found nothing would leave the
   * width at 0 and the row never collapsing — #9480 again, silently.
   *
   * `contentRect` is the *content* box, so the wrapper's padding is already
   * subtracted, including the Electron window-controls reserve — a `calc()`
   * over `env(titlebar-area-width)` that is dropped the moment the right panel
   * opens. Tokens are re-read in the callback because it runs after layout, so
   * it is the one place guaranteed to see values a breakpoint just switched.
   */
  observe(wrapper: HTMLElement): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (width <= 0) {
        return;
      }
      this._tokens.set(readHeaderTokens(wrapper));
      this._width.set(width);
    });
    observer.observe(wrapper);
    this._destroyRef.onDestroy(() => observer.disconnect());
  }
}
