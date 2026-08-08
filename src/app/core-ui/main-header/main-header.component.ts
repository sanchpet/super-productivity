import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { ProjectService } from '../../features/project/project.service';
import { LayoutService } from '../layout/layout.service';
import { TaskService } from '../../features/tasks/task.service';
import { T } from '../../t.const';
import { fadeAnimation } from '../../ui/animations/fade.ani';
import { filter, map, startWith, switchMap } from 'rxjs/operators';
import { of, Subscription } from 'rxjs';
import { WorkContextService } from '../../features/work-context/work-context.service';
import { expandFadeHorizontalAnimation } from '../../ui/animations/expand.ani';
import { SimpleCounterService } from '../../features/simple-counter/simple-counter.service';
import { SimpleCounter } from '../../features/simple-counter/simple-counter.model';
import { SyncWrapperService } from '../../imex/sync/sync-wrapper.service';
import { SnackService } from '../../core/snack/snack.service';
import { NavigationEnd, Router } from '@angular/router';
import { GlobalConfigService } from '../../features/config/global-config.service';
import { KeyboardConfig, keyboardConfigOrEmpty } from '@sp/keyboard-config';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatBadge } from '@angular/material/badge';
import { MatTooltip } from '@angular/material/tooltip';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SimpleCounterButtonComponent } from '../../features/simple-counter/simple-counter-button/simple-counter-button.component';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { LongPressDirective } from '../../ui/longpress/longpress.directive';
import { isOnline$ } from '../../util/is-online';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { SyncStatus } from '../../op-log/sync-exports';
import { PluginHeaderBtnsComponent } from '../../plugins/ui/plugin-header-btns.component';
import { PluginWorkContextHeaderBtnsComponent } from '../../plugins/ui/plugin-work-context-header-btns.component';
import { PluginSidePanelBtnsComponent } from '../../plugins/ui/plugin-side-panel-btns.component';
import { PageTitleComponent } from './page-title/page-title.component';
import { PlayButtonComponent } from './play-button/play-button.component';
import { DesktopPanelButtonsComponent } from './desktop-panel-buttons/desktop-panel-buttons.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { UserProfileButtonComponent } from '../../features/user-profile/user-profile-button/user-profile-button.component';
import { FocusButtonComponent } from './focus-button/focus-button.component';
import { EmlDropDirective } from '../../core/drop-paste-input/eml-drop.directive';
import { ConflictJournalService } from '../../op-log/sync/conflict-journal.service';
import { HeaderOverflowService } from './overflow/header-overflow.service';
import { FocusModeService } from '../../features/focus-mode/focus-mode.service';

@Component({
  selector: 'main-header',
  templateUrl: './main-header.component.html',
  styleUrls: ['./main-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [fadeAnimation, expandFadeHorizontalAnimation],
  providers: [HeaderOverflowService],
  imports: [
    NgTemplateOutlet,
    MatIconButton,
    MatIcon,
    MatBadge,
    MatTooltip,
    TranslatePipe,
    SimpleCounterButtonComponent,
    LongPressDirective,
    EmlDropDirective,
    PluginHeaderBtnsComponent,
    PluginWorkContextHeaderBtnsComponent,
    PluginSidePanelBtnsComponent,
    PageTitleComponent,
    PlayButtonComponent,
    DesktopPanelButtonsComponent,
    UserProfileButtonComponent,
    FocusButtonComponent,
  ],
})
export class MainHeaderComponent implements OnDestroy {
  private readonly _elRef = inject(ElementRef<HTMLElement>);
  private _teleportedNav: HTMLElement | null = null;
  private _teleportObserver: MutationObserver | null = null;
  readonly projectService = inject(ProjectService);
  readonly matDialog = inject(MatDialog);
  readonly workContextService = inject(WorkContextService);
  readonly taskService = inject(TaskService);
  readonly layoutService = inject(LayoutService);
  readonly simpleCounterService = inject(SimpleCounterService);
  readonly syncWrapperService = inject(SyncWrapperService);
  readonly globalConfigService = inject(GlobalConfigService);
  private readonly _snackService = inject(SnackService);
  private readonly _router = inject(Router);
  private readonly _configService = inject(GlobalConfigService);
  private readonly _dataInitStateService = inject(DataInitStateService);
  private readonly _conflictJournal = inject(ConflictJournalService);
  private readonly _focusModeService = inject(FocusModeService);

  readonly isDataLoaded = toSignal(this._dataInitStateService.isAllDataLoadedInitially$, {
    initialValue: false,
  });

  // SPAP-15: persistent badge on the sync icon — count of unreviewed
  // auto-resolved sync conflicts awaiting review.
  readonly unreviewedConflictCount = this._conflictJournal.unreviewedCount;

  T: typeof T = T;

  isXs = this.layoutService.isXs;

  private _currentTaskContext$ = this.taskService.currentTaskParentOrCurrent$.pipe(
    filter((ct) => !!ct),
    switchMap((currentTask) =>
      this.workContextService.activeWorkContextId$.pipe(
        filter((activeWorkContextId) => !!activeWorkContextId),
        switchMap((activeWorkContextId) => {
          if (
            currentTask.projectId === activeWorkContextId ||
            currentTask.tagIds.includes(activeWorkContextId as string)
          ) {
            return of(null);
          }
          return currentTask.projectId
            ? this.projectService.getByIdOnce$(currentTask.projectId)
            : of(null);
        }),
      ),
    ),
  );

  currentTaskContext = toSignal(this._currentTaskContext$);

  private _isRouteWithSidePanel$ = this._router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map((event) => true), // Always true since right-panel is now global
    startWith(true), // Always true since right-panel is now global
  );
  isRouteWithSidePanel = toSignal(this._isRouteWithSidePanel$, { initialValue: true });

  // Convert more observables to signals

  currentTask = toSignal(this.taskService.currentTask$);
  currentTaskId = this.taskService.currentTaskId;
  enabledSimpleCounters = toSignal(this.simpleCounterService.enabledSimpleCounters$, {
    initialValue: [],
  });
  isShowIssuePanel = computed(() => this.layoutService.isShowIssuePanel());
  isShowNotes = computed(() => this.layoutService.isShowNotes());
  isShowScheduleDayPanel = computed(() => this.layoutService.isShowScheduleDayPanel());
  syncIsEnabledAndReady = toSignal(this.syncWrapperService.isEnabledAndReady$);
  syncState = toSignal(this.syncWrapperService.syncState$);
  isSyncInProgress = toSignal(this.syncWrapperService.isSyncInProgress$);
  hasNoPendingOps = toSignal(this.syncWrapperService.hasNoPendingOps$, {
    initialValue: false,
  });
  superSyncIsConfirmedInSync = toSignal(
    this.syncWrapperService.superSyncIsConfirmedInSync$,
    { initialValue: false },
  );
  isOnline = toSignal(isOnline$);
  // State-aware tooltip for the sync button: the icon alone (sync_problem /
  // wifi_off) signals a problem but never explains it. Surfacing the state in
  // the tooltip is the ambient counterpart to suppressing the transient
  // network snack on automatic syncs — a persistent problem stays discoverable
  // by glancing at / hovering the always-present header button.
  // Precedence mirrors the icon @if cascade in the template (disabled →
  // offline → error → syncing → in-sync); keep the two in sync.
  syncTooltip = computed(() => {
    if (!this.syncIsEnabledAndReady()) {
      return T.MH.TRIGGER_SYNC;
    }
    if (!this.isOnline()) {
      return T.MH.SYNC_STATE.OFFLINE;
    }
    if (this.syncState() === 'ERROR') {
      return T.MH.SYNC_STATE.ERROR;
    }
    if (this.isSyncInProgress()) {
      return T.MH.SYNC_STATE.SYNCING;
    }
    if (this.hasNoPendingOps()) {
      return T.MH.SYNC_STATE.IN_SYNC;
    }
    return T.MH.TRIGGER_SYNC;
  });
  readonly isTimeTrackingEnabled = computed(() => {
    return this.globalConfigService.appFeatures().isTimeTrackingEnabled;
  });
  // Keep the focus entry point visible on mobile too when the feature is enabled.
  // Otherwise Android users can only discover focus mode by rotating to a wider layout (#8157).

  // Check if there are any undone tasks that can be tracked
  private readonly _hasTrackableTasks$ = this.workContextService.undoneTasks$.pipe(
    map((tasks) => tasks.length > 0),
  );
  hasTrackableTasks = toSignal(this._hasTrackableTasks$, { initialValue: true });

  private _subs: Subscription = new Subscription();

  // Vertical action bar is desktop-only and opt-in via misc config.
  private readonly _isVerticalActionBar = computed(
    () => !this.isXs() && !!this.globalConfigService.misc()?.isVerticalActionBar,
  );

  // --- Overflow handling (#9480) ------------------------------------------
  // The row fits itself to its own width rather than to the window's, which the
  // in-flow side nav and the right panel both narrow. See HeaderOverflowService
  // for why that is arithmetic over button counts and not a measurement.
  readonly overflow = inject(HeaderOverflowService);

  private readonly _pageTitle = viewChild(PageTitleComponent);
  private readonly _wrapper = viewChild.required<ElementRef<HTMLElement>>('wrapper');

  /**
   * Widening the header empties the overflow panel and removes its trigger — so
   * the open flag must not outlive it, or the panel springs open by itself the
   * next time the row narrows. `linkedSignal` resets it in the same pass rather
   * than a scheduling hop later, so there is never a moment where the panel
   * reports itself open with nothing in it.
   */
  readonly isOverflowOpen = linkedSignal<boolean, boolean>({
    source: this.overflow.hasOverflow,
    computation: (hasOverflow, prev) => hasOverflow && (prev?.value ?? false),
  });

  toggleOverflow(): void {
    this.isOverflowOpen.update((v) => !v);
  }

  /**
   * A demoted action behaves like a menu item: using it dismisses the panel,
   * the same way picking anything from a `mat-menu` closes it. Without this the
   * panel stays open over the content after every tap.
   *
   * Except where the panel template marks a control `data-keeps-overflow-open`,
   * for either of two reasons: it opens an overlay of its own, and closing
   * would apply `inert` to the subtree that overlay restores focus into (the
   * same case `_isInsidePanel` already keeps the panel open for); or it is
   * pressed repeatedly and carries its own readout, like a counter, where
   * dismissing on each press defeats the tray.
   *
   * Closing parks focus on the trigger before `inert` lands. That is as far as
   * this can go on its own: an action that widens the header — a panel toggle,
   * typically — empties the overflow and the trigger's own `@if` then removes
   * the element focus is standing on, so focus still ends up on `<body>`.
   * Pre-existing, and not something dismissing later would avoid.
   *
   * An explicit marker rather than probing for `aria-haspopup`, because that
   * attribute answers "does this announce a popup?" and not "will this restore
   * focus into me later" — `mat-menu` sets it, `MatDialog` does not, and a
   * plugin's button could set it without the header having any say.
   */
  onDemotedActionClick(ev: Event): void {
    const target = ev.target instanceof Element ? ev.target : null;
    const control = target?.closest('button, a');
    // Bounded to the panel, so an attribute that later appears on some ancestor
    // cannot silently switch the whole behaviour off.
    if (
      !control ||
      control.closest('.header-overflow-panel [data-keeps-overflow-open]')
    ) {
      return;
    }
    this._closeOverflow(true);
  }

  constructor() {
    // Teleport the action nav to document.body (and back) so the fixed
    // vertical strip escapes any ancestor containing-block
    // (transform/filter/contain) and reliably anchors to the viewport.
    // Reacts live to the config toggle and the desktop/mobile breakpoint;
    // also re-runs when data load fills in the nav's gated content (the nav
    // shell itself renders from first paint).
    effect(() => {
      const enabled = this._isVerticalActionBar();
      this.isDataLoaded();
      this._syncTeleport(enabled);
    });

    // How much room the title's own buttons need is the one part of the fit
    // that page-title owns, so it is read from there rather than restated here.
    // `viewChild` is undefined until the view exists, hence the fallback.
    this.overflow.bindTitleActionCount(
      computed(() => this._pageTitle()?.actionButtonCount() ?? 0),
    );
    this.overflow.bindTitleTextWidth(
      computed(() => this._pageTitle()?.naturalTextWidth() ?? 0),
    );

    // The row is the header's own element, so the header is what hands it over.
    afterNextRender(() => this.overflow.observe(this._wrapper().nativeElement));

    this._listenForDismissal();
  }

  private _syncTeleport(enabled: boolean): void {
    if (enabled) {
      if (this._teleportedNav?.isConnected) return;
      if (!this._teleportNav()) {
        this._teleportObserver?.disconnect();
        this._teleportObserver = new MutationObserver(() => {
          if (this._teleportNav()) this._teleportObserver?.disconnect();
        });
        this._teleportObserver.observe(this._elRef.nativeElement, {
          childList: true,
          subtree: true,
        });
      }
    } else {
      this._teleportObserver?.disconnect();
      this._teleportObserver = null;
      this._restoreNav();
    }
  }

  private _teleportNav(): boolean {
    if (this._teleportedNav?.isConnected) return true;
    this._teleportedNav = null;
    const nav = (this._elRef.nativeElement as HTMLElement).querySelector(
      'nav.action-nav-right',
    ) as HTMLElement | null;
    if (!nav) return false;
    nav.classList.add('action-nav-right--teleported');
    document.body.appendChild(nav);
    this._teleportedNav = nav;
    return true;
  }

  private _restoreNav(): void {
    const nav = this._teleportedNav;
    if (!nav) return;
    this._teleportedNav = null;
    nav.classList.remove('action-nav-right--teleported');
    const wrapper = (this._elRef.nativeElement as HTMLElement).querySelector('.wrapper');
    if (wrapper) {
      wrapper.appendChild(nav);
    } else {
      nav.remove();
    }
  }

  ngOnDestroy(): void {
    this._subs.unsubscribe();
    this._teleportObserver?.disconnect();
    this._teleportedNav?.remove();
    this._teleportedNav = null;
  }

  trackById(i: number, item: SimpleCounter): string {
    return item.id;
  }

  sync(): void {
    this.syncWrapperService.sync(true).then((r) => {
      // Keep persistent recovery actions (for example USE_REMOTE Undo) visible;
      // routine sync-success feedback must not replace them.
      if (this._snackService.hasPendingPersistentAction()) {
        return;
      }
      if (
        r === SyncStatus.UpdateLocal ||
        r === SyncStatus.UpdateRemoteAll ||
        r === SyncStatus.UpdateRemote
      ) {
        this._snackService.open({ type: 'SUCCESS', msg: T.F.SYNC.S.SUCCESS_VIA_BUTTON });
      } else if (r === SyncStatus.InSync) {
        this._snackService.open({
          type: 'SUCCESS',
          msg: T.F.SYNC.S.ALREADY_IN_SYNC,
        });
      }
    });
  }

  onSyncButtonClick(): void {
    const ready = !!this.syncIsEnabledAndReady();
    if (ready) {
      this.sync();
    } else {
      this.setupSync();
    }
  }

  private dialogSyncCfgRef: MatDialogRef<unknown> | null = null;

  async setupSync(): Promise<void> {
    // to prevent multiple dialogs on longpress from android
    if (this.dialogSyncCfgRef) {
      return;
    }
    const { DialogSyncCfgComponent } =
      await import('../../imex/sync/dialog-sync-cfg/dialog-sync-cfg.component');
    this.dialogSyncCfgRef = this.matDialog.open(DialogSyncCfgComponent);
    this._subs.add(
      this.dialogSyncCfgRef.afterClosed().subscribe(() => {
        this.dialogSyncCfgRef = null;
      }),
    );
  }

  /** Accent the trigger while a demoted counter is still running. */
  readonly isDemotedCounterRunning = computed(
    () =>
      this.overflow.isDemotedCounters() &&
      this.enabledSimpleCounters().some((c) => c.isOn),
  );

  /**
   * Same, for a focus session — which takes a live countdown with it when it
   * goes, so the trigger has to keep saying something is in progress.
   *
   * Matches `focus-button`'s own `circleVisible()` exactly, paused sessions and
   * breaks included: those are the states where the user has most lost sight of
   * the session, so they are the last ones that may go unindicated.
   */
  readonly isDemotedFocusRunning = computed(
    () =>
      this.overflow.isDemotedFocus() &&
      (this._focusModeService.isSessionRunning() ||
        this._focusModeService.isSessionPaused() ||
        this._focusModeService.isBreakActive()),
  );

  // Sync is the one demotable action carrying state the user is meant to notice
  // without opening anything, and `MainHeaderComponent` is the app's only
  // consumer of `syncState$` — several ERROR transitions show no snack at all,
  // so this button is the whole persistent signal. While sync is in the panel
  // the trigger has to speak for it.
  //
  // One computed rather than a class binding per state, so the precedence is a
  // testable line of code instead of a cascade accident, and so a seventh slot
  // wanting the trigger's attention has somewhere to plug in. Order matches the
  // inline button's own icon cascade: offline short-circuits before error.
  //
  // Deliberately does NOT republish `!syncIsEnabledAndReady()`. Inline that
  // renders `sync_disabled`, but it is also the resting state of everyone who
  // has never configured sync, so mirroring it would brand the trigger for the
  // majority who have nothing wrong. The cost is that a mid-session credential
  // revocation reads as plain "more actions" until the panel is opened.
  readonly demotedSyncState = computed<'offline' | 'error' | null>(() => {
    if (!this.overflow.isDemotedSync() || !this.syncIsEnabledAndReady()) {
      return null;
    }
    if (!this.isOnline()) {
      return 'offline';
    }
    return this.syncState() === 'ERROR' ? 'error' : null;
  });

  /**
   * Colour alone would be WCAG 1.4.1 — and useless to a screen reader — so the
   * trigger also swaps its glyph and hands its tooltip over to `syncTooltip()`,
   * which MatTooltip exposes as `aria-describedby`. The `aria-label` stays
   * "More actions": that is still what the button *does*.
   */
  readonly overflowIcon = computed(() => {
    if (this.isOverflowOpen()) {
      return 'close';
    }
    switch (this.demotedSyncState()) {
      case 'error':
        return 'sync_problem';
      case 'offline':
        return 'wifi_off';
      default:
        return 'more_horiz';
    }
  });

  readonly overflowTooltip = computed(() =>
    this.demotedSyncState() ? this.syncTooltip() : T.G.MORE_ACTIONS,
  );

  readonly demotedConflictCount = computed(() =>
    this.overflow.isDemotedSync() ? this.unreviewedConflictCount() : 0,
  );

  /**
   * The panel is not a `mat-menu`, so dismissal is ours to handle — but only
   * while there is something to dismiss.
   *
   * These were `@HostListener('document:…')`, which arms them for the app's
   * whole lifetime. Angular's listener wrapper marks the view dirty *before*
   * the handler body runs, and the zoneless scheduler does not skip that, so
   * every pointerdown anywhere in the app — every tap on a task row — was
   * scheduling a change-detection pass over this header just to be told the
   * panel was closed. Native listeners, attached only while it is open, notify
   * nothing.
   */
  private _listenForDismissal(): void {
    effect((onCleanup) => {
      if (!this.isOverflowOpen()) {
        return;
      }
      const onPointerDown = (ev: Event): void => {
        const target = ev.target as Node | null;
        if (!target || this._isInsidePanel(target)) {
          return;
        }
        this._closeOverflow();
      };
      const onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape') {
          this._closeOverflow(true);
        }
      };
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      onCleanup(() => {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
      });
    });
  }

  /**
   * Whether an event target counts as "inside" the open panel.
   *
   * The CDK overlay container is inside for this purpose even though it lives
   * on `document.body`: demoted actions open real menus and dialogs
   * (`user-profile-button`, `simple-counter-button`), and treating the first
   * click on one of their items as an outside click closed the panel out from
   * under the still-open menu — after which the menu's own focus restore
   * pointed into a now-`inert` subtree and focus fell to `<body>`.
   */
  private _isInsidePanel(target: Node): boolean {
    const host = this._elRef.nativeElement as HTMLElement;
    const panel = host?.querySelector?.('.header-overflow-panel');
    const trigger = host?.querySelector?.('.header-overflow-btn');
    const el = target instanceof Element ? target : target.parentElement;
    return (
      !!panel?.contains(target) ||
      !!trigger?.contains(target) ||
      !!el?.closest('.cdk-overlay-container')
    );
  }

  /**
   * @param restoreFocus hand focus back to the trigger first. Closing applies
   * `inert` to the panel, so focus standing inside it would otherwise be
   * dropped to `<body>` — which is what Escape does to a keyboard user who has
   * tabbed into a demoted action.
   */
  private _closeOverflow(restoreFocus = false): void {
    if (restoreFocus) {
      const host = this._elRef.nativeElement as HTMLElement;
      const panel = host?.querySelector?.('.header-overflow-panel');
      if (panel?.contains(document.activeElement)) {
        (host?.querySelector?.('.header-overflow-btn') as HTMLElement | null)?.focus();
      }
    }
    this.isOverflowOpen.set(false);
  }

  get kb(): KeyboardConfig {
    return keyboardConfigOrEmpty(this._configService.cfg()?.keyboard as KeyboardConfig);
  }
}
