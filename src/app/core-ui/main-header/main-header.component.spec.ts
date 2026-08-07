import {
  Component,
  ElementRef,
  EnvironmentInjector,
  NO_ERRORS_SCHEMA,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { EMPTY, of } from 'rxjs';
import { TranslateModule, TranslatePipe } from '@ngx-translate/core';
import { PluginBridgeService } from '../../plugins/plugin-bridge.service';

import { MainHeaderComponent } from './main-header.component';
import { ProjectService } from '../../features/project/project.service';
import { LayoutService } from '../layout/layout.service';
import { TaskService } from '../../features/tasks/task.service';
import { WorkContextService } from '../../features/work-context/work-context.service';
import { SimpleCounterService } from '../../features/simple-counter/simple-counter.service';
import { SyncWrapperService } from '../../imex/sync/sync-wrapper.service';
import { SnackService } from '../../core/snack/snack.service';
import { Router } from '@angular/router';
import { GlobalConfigService } from '../../features/config/global-config.service';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { DataInitStateService } from '../../core/data-init/data-init-state.service';
import { MetricService } from '../../features/metric/metric.service';
import { DateService } from '../../core/date/date.service';
import { UserProfileService } from '../../features/user-profile/user-profile.service';
import { DEFAULT_GLOBAL_CONFIG } from '../../features/config/default-global-config.const';
import { SyncStatus } from '../../op-log/sync-exports';
import { SimpleCounter } from '../../features/simple-counter/simple-counter.model';
import { ConflictJournalService } from '../../op-log/sync/conflict-journal.service';
import { MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { HeaderTokens, readHeaderTokens, runWidth } from './overflow/header-tokens';
import { HeaderOverflowService } from './overflow/header-overflow.service';

// Regression test for #7477: in a project view a long title pushed the
// right-side header actions (simple-counter / habit buttons) off screen.
//
// The fix is a CSS-only flex change on `.action-nav-right` in
// main-header.component.scss, so we don't instantiate the real (heavy)
// MainHeaderComponent. Instead we mount a tiny host that pulls in the *real*
// compiled stylesheet via `styleUrls` and reproduces the exact failing flex
// structure: a constrained `.wrapper` row containing a shrinkable title and
// the `.action-nav-right` nav whose `.counters-action-group` children are
// `flex-shrink: 0`. We then assert observable layout rather than CSS strings.
//
// The rule under test used to be `.action-nav-right { flex: 0 0 auto }`. Since
// #9480 the nav has to be shrinkable so that it can scroll as a last resort, so
// the same guarantee is expressed as a shrink *priority* instead: the title
// carries `flex-shrink: 999` and absorbs essentially all of the squeeze before
// the nav gives up a pixel. That declaration lives in page-title.component.ts
// (which owns the title's own flex behaviour, as it owns its `min-width`), and
// this synthetic host mirrors it — it loads only main-header's stylesheet, so
// it cannot inherit it. Drop the priority and both shrink at factor 1, the
// nav's non-shrinking buttons overflow, and the last button escapes the row.
//
// The second assertion covers the #9480 floor itself, which does live in
// main-header.component.scss: even when the row genuinely cannot fit, the nav
// is a scroll container, so no button is ever unreachable.
@Component({
  standalone: true,
  styleUrls: ['./main-header.component.scss'],
  template: `
    <div
      class="wrapper"
      style="width: 320px; box-sizing: border-box"
    >
      <div
        class="page-title"
        style="
          flex: 1 999 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        "
      >
        {{ title }}
      </div>

      <nav class="action-nav-right">
        <div class="header-action-group secondary-action-group counters-action-group">
          <button type="button"></button>
          <button type="button"></button>
          <button type="button"></button>
          <button type="button"></button>
        </div>
      </nav>
    </div>
  `,
})
class HeaderLayoutHostComponent {
  title = 'A very long active work context title '.repeat(8);
}

// The state the demotion model cannot fix: the row is narrower than the PINNED
// actions alone, so there is nothing left to move into the panel. Measured
// against the real CSS this is not a corner -- play + add-task + focus + the
// overflow trigger plus the title's floor stop fitting somewhere under a
// ~1050px window with the right panel open, and at 600-730px with just the
// default side nav. `_reflow` bails at `count === ids.length` and, before the
// scroll floor, the row simply ran off an edge nothing in the ancestor chain
// can scroll (`.main-content` is `overflow: hidden`) -- issue #9480 exactly.
// `action-nav-right--scrolls` is the class `_reflow` sets on reaching that
// state; this host hard-codes it because the CSS is what is under test here.
@Component({
  standalone: true,
  styleUrls: ['./main-header.component.scss'],
  template: `
    <div
      class="wrapper"
      style="width: 260px; box-sizing: border-box"
    >
      <div
        class="page-title"
        style="flex: 1 999 auto; min-width: 160px; overflow: hidden"
      >
        A project name
      </div>

      <nav class="action-nav-right action-nav-right--scrolls">
        <div class="action-nav-scroll">
          <button
            type="button"
            style="width: 40px; height: 40px"
          ></button>
          <button
            type="button"
            style="width: 40px; height: 40px"
          ></button>
          <button
            type="button"
            style="width: 40px; height: 40px"
          ></button>
        </div>
        <button
          type="button"
          class="header-overflow-btn"
          style="flex-shrink: 0; width: 40px; height: 40px"
        ></button>
      </nav>
    </div>
  `,
})
class PinnedOverflowHostComponent {}

// The Electron custom-title-bar reserve. `main-header` keeps the window
// controls clear by padding its own right edge -- but the controls sit in the
// top-right corner of the WINDOW, and with the right panel open that corner
// belongs to the panel. Reserving there anyway cost the action row ~140px it
// did not owe, which measured out at a nav 8px wide: every header action gone,
// overflow trigger included.
//
// `:host-context` resolves against real ancestors, so the host is mounted
// inside a `<right-panel>` the test toggles `isOpen` on, exactly as
// RightPanelComponent's own host binding does.
@Component({
  standalone: true,
  styleUrls: ['./main-header.component.scss'],
  template: `<div class="wrapper"></div>`,
})
class WindowControlsHostComponent {}

// The header decides which actions fit by arithmetic over button counts and the
// spacing tokens on its host, never by measuring the row it is deciding. That
// only holds if the tokens are what the browser actually laid out with, so this
// host renders real Material buttons against the real stylesheets (Karma loads
// `src/styles.scss`, which is where the 40px/48px button boxes come from) and
// the specs below compare the two. A stylesheet change that outgrows
// `readHeaderTokens` fails here instead of silently mis-sizing the row.
// Mirrors the shipped row: the pinned group, the counters group, then singles
// that reach the flex container directly because their component hosts are
// `display: contents`, and the trigger as a sibling of the scroller. The point
// is that all of it is one uninterrupted gap chain, which is what lets the fit
// add a row up from button counts alone.
@Component({
  standalone: true,
  imports: [MatIconButton, MatMiniFabButton, MatIcon],
  styleUrls: ['./main-header.component.scss'],
  template: `
    <div class="wrapper">
      <nav class="action-nav-right">
        <div class="action-nav-scroll">
          <div class="header-action-group primary-action-group">
            <button
              mat-mini-fab
              class="play-btn"
            >
              <mat-icon>play_arrow</mat-icon>
            </button>
            <button mat-icon-button><mat-icon>add</mat-icon></button>
          </div>
          <div class="header-action-group secondary-action-group counters-action-group">
            <button mat-icon-button><mat-icon>bolt</mat-icon></button>
            <button mat-icon-button><mat-icon>timer</mat-icon></button>
          </div>
          <button mat-icon-button><mat-icon>sync</mat-icon></button>
          <button mat-icon-button><mat-icon>schedule</mat-icon></button>
          <button mat-icon-button><mat-icon>comment</mat-icon></button>
        </div>
        <button
          mat-icon-button
          class="header-overflow-btn"
        >
          <mat-icon>more_horiz</mat-icon>
        </button>
      </nav>
    </div>
  `,
})
class TokenPinHostComponent {}

/** Every action button the host above renders, the play button included. */
const PIN_HOST_BUTTONS = 8;

const WINDOW_CONTROL_BODY_CLASSES = ['isElectron', 'isNoMac', 'isObsidianStyleHeader'];

describe('MainHeaderComponent layout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HeaderLayoutHostComponent,
        PinnedOverflowHostComponent,
        WindowControlsHostComponent,
        TokenPinHostComponent,
      ],
    }).compileComponents();
  });

  describe('spacing tokens', () => {
    let fixture: ComponentFixture<TokenPinHostComponent>;
    let tokens: HeaderTokens;
    let host: HTMLElement;

    beforeEach(() => {
      fixture = TestBed.createComponent(TokenPinHostComponent);
      host = fixture.nativeElement as HTMLElement;
      document.body.appendChild(host);
      fixture.detectChanges();
      tokens = readHeaderTokens(host);
    });

    afterEach(() => host.remove());

    const rect = (sel: string): DOMRect =>
      (host.querySelector(sel) as HTMLElement).getBoundingClientRect();

    // A token whose value the reader cannot parse — a `calc()` on the CSS side
    // is the way in — degrades to 0 without an error anywhere, and a 0 in the
    // fit reads as "this costs nothing". Every token is a real length or this
    // fails.
    it('reads every token as a real length', () => {
      Object.entries(tokens).forEach(([name, value]) => {
        expect(Number.isFinite(value))
          .withContext(`${name} did not parse as a length`)
          .toBe(true);
        expect(value).withContext(name).toBeGreaterThan(0);
      });
    });

    it('sizes an action button exactly as --header-button-size says', () => {
      expect(tokens.btn).toBeGreaterThan(0);
      expect(rect('button[mat-icon-button]').width).toBe(tokens.btn);
    });

    it('sizes the play button exactly as --header-play-size says', () => {
      expect(tokens.play).toBeGreaterThan(0);
      expect(rect('button[mat-mini-fab]').width).toBe(tokens.play);
    });

    it('spaces buttons and groups exactly as the gap tokens say', () => {
      const gapOf = (sel: string): number =>
        parseFloat(getComputedStyle(host.querySelector(sel) as HTMLElement).columnGap);

      expect(gapOf('nav.action-nav-right')).toBe(tokens.gap);
      expect(gapOf('.header-action-group')).toBe(tokens.gap);
      // A non-trailing group separates with the wider group gap, expressed as
      // the difference on top of the gap the row already pays.
      expect(
        parseFloat(
          getComputedStyle(host.querySelector('.primary-action-group') as HTMLElement)
            .marginInlineEnd,
        ),
      ).toBe(tokens.groupGap - tokens.gap);
    });

    // The composite is the claim that actually matters: a run of buttons costs
    // what `runWidth` says it costs, so the fit can add up a row it is not
    // allowed to measure.
    it('lays a run of buttons out at exactly runWidth()', () => {
      expect(rect('.primary-action-group').width).toBe(
        tokens.play + tokens.gap + tokens.btn,
      );
      expect(rect('.counters-action-group').width).toBe(
        runWidth(2, tokens.btn, tokens.gap),
      );
    });

    // The claim the whole fit rests on: groups, singles and the trigger form
    // one uninterrupted gap chain, so a row of N buttons is runWidth(N) wide
    // whatever boxes they happen to be nested in — plus the one group
    // separator, and play's extra width over a plain action. Nest the buttons
    // differently and this is the spec that fails.
    it('adds a whole row up from its button count alone', () => {
      const predicted =
        runWidth(PIN_HOST_BUTTONS, tokens.btn, tokens.gap) +
        (tokens.play - tokens.btn) +
        (tokens.groupGap - tokens.gap);

      expect(rect('nav.action-nav-right').width).toBe(predicted);
    });
  });

  // The row is narrower than its pinned actions, so the floor is engaged and
  // the actions scroll. Everything asserted here is about the one button that
  // must survive that: at `scrollLeft: 0` -- where the row rests, because the
  // floor hides the scrollbar -- the trigger used to be the last child and so
  // the one button outside the scrollport, and it is the only route to
  // everything demoted. It now sits outside the scrolling box entirely.
  it('keeps the whole overflow trigger beside the scrolling row, not over it', () => {
    const fixture = TestBed.createComponent(PinnedOverflowHostComponent);
    document.body.appendChild(fixture.nativeElement);
    try {
      fixture.detectChanges();

      const wrapper = fixture.nativeElement.querySelector('.wrapper') as HTMLElement;
      const nav = fixture.nativeElement.querySelector('.action-nav-right') as HTMLElement;
      const scroller = fixture.nativeElement.querySelector(
        '.action-nav-scroll',
      ) as HTMLElement;
      const trigger = fixture.nativeElement.querySelector(
        '.header-overflow-btn',
      ) as HTMLElement;

      // Precondition: the row genuinely overflows, so none of this is
      // trivially true.
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
      expect(scroller.scrollLeft).toBe(0);

      // The nav stays inside the clip edge rather than spilling past it.
      expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(
        wrapper.getBoundingClientRect().right + 0.5,
      );

      // The whole trigger is inside the nav, at rest -- not a sliver of one.
      const navRect = nav.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      expect(triggerRect.right).toBeLessThanOrEqual(navRect.right + 0.5);
      expect(triggerRect.left).toBeGreaterThanOrEqual(navRect.left - 0.5);
      expect(triggerRect.width).toBeGreaterThanOrEqual(40);

      // ...and it earns that by standing beside the scrolling region, not on
      // top of it: the two boxes are disjoint.
      expect(triggerRect.left).toBeGreaterThanOrEqual(
        scroller.getBoundingClientRect().right - 0.5,
      );

      // The actions it displaced are still reachable by scrolling.
      scroller.scrollLeft = scroller.scrollWidth;
      expect(scroller.scrollLeft).toBeGreaterThan(0);
    } finally {
      document.body.removeChild(fixture.nativeElement);
    }
  });

  it('drops the window-controls reserve while the right panel is open', () => {
    // Setup inside the `try`: these body classes gate real CSS, so leaking them
    // on a throw would silently apply a 140px reserve to every later fixture.
    const panel = document.createElement('right-panel');
    try {
      document.body.appendChild(panel);
      document.body.classList.add(...WINDOW_CONTROL_BODY_CLASSES);
      const fixture = TestBed.createComponent(WindowControlsHostComponent);
      panel.appendChild(fixture.nativeElement);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      // Panel closed: the controls are above the header, so the reserve stands.
      expect(parseFloat(getComputedStyle(host).paddingRight)).toBeGreaterThan(0);

      panel.classList.add('isOpen');
      expect(parseFloat(getComputedStyle(host).paddingRight)).toBe(0);
    } finally {
      document.body.classList.remove(...WINDOW_CONTROL_BODY_CLASSES);
      panel.remove();
    }
  });

  it('keeps pinned actions reachable when even they do not fit (#9480)', () => {
    const fixture = TestBed.createComponent(PinnedOverflowHostComponent);
    document.body.appendChild(fixture.nativeElement);
    try {
      fixture.detectChanges();

      const wrapper = fixture.nativeElement.querySelector('.wrapper') as HTMLElement;
      const nav = fixture.nativeElement.querySelector('.action-nav-right') as HTMLElement;
      const scroller = fixture.nativeElement.querySelector(
        '.action-nav-scroll',
      ) as HTMLElement;

      // Precondition: the row genuinely cannot fit its pinned actions, so this
      // is the unfixable-by-demotion case and not a trivially passing setup.
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);

      // The nav stays inside the clip edge instead of spilling past it, and the
      // actions really are scrollable rather than merely clipped.
      expect(nav.getBoundingClientRect().right).toBeLessThanOrEqual(
        wrapper.getBoundingClientRect().right + 0.5,
      );
      scroller.scrollLeft = scroller.scrollWidth;
      expect(scroller.scrollLeft).toBeGreaterThan(0);
      // Whether the trigger is reachable is the tests above's job -- it is
      // outside this box, so asserting it here could no longer fail.
    } finally {
      document.body.removeChild(fixture.nativeElement);
    }
  });

  it('keeps the action buttons on screen when the title is long (#7477)', () => {
    const fixture = TestBed.createComponent(HeaderLayoutHostComponent);
    // Layout must be computed in the live DOM for width measurements.
    document.body.appendChild(fixture.nativeElement);
    try {
      fixture.detectChanges();

      const wrapper = fixture.nativeElement.querySelector('.wrapper') as HTMLElement;
      const title = fixture.nativeElement.querySelector('.page-title') as HTMLElement;
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('.counters-action-group button'),
      ) as HTMLElement[];
      const lastButton = buttons[buttons.length - 1];

      // Sanity: the real stylesheet was applied, so the buttons have width.
      expect(buttons.length).toBe(4);
      expect(lastButton.getBoundingClientRect().width).toBeGreaterThan(0);

      // The title takes the squeeze and ellipsizes...
      expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);

      // ...so the trailing action button stays fully inside the header row.
      const wrapperRect = wrapper.getBoundingClientRect();
      const lastButtonRect = lastButton.getBoundingClientRect();
      expect(lastButtonRect.right).toBeLessThanOrEqual(wrapperRect.right + 0.5);

      // And because everything fits here, the #9480 floor stays off: a clipping
      // row would take `.current-task-title` with it, which `play-button` hangs
      // off `right: 100%` of the play button -- wholly outside the inline-start
      // clip edge, and unreachable by scrolling.
      const nav = fixture.nativeElement.querySelector('.action-nav-right') as HTMLElement;
      expect(getComputedStyle(nav).overflowX).toBe('visible');
    } finally {
      document.body.removeChild(fixture.nativeElement);
    }
  });
});

describe('MainHeaderComponent focus button visibility', () => {
  let component: MainHeaderComponent;
  let fixture: ComponentFixture<MainHeaderComponent> | undefined;
  let isXs = signal(false);
  let isXxxs = signal(false);
  let appFeatures = signal(DEFAULT_GLOBAL_CONFIG.appFeatures);
  let enabledSimpleCounters: SimpleCounter[] = [];
  let isAllDataLoaded = true;
  // Plugins register their header buttons after boot, so this is writable: it
  // is how a demotable slot appears at the *head* of the list while the bar is
  // already collapsed.
  let pluginHeaderButtons = signal<unknown[]>([]);

  const configureTestBed = (): void => {
    const cfg = {
      ...DEFAULT_GLOBAL_CONFIG,
      appFeatures: appFeatures(),
    };

    TestBed.configureTestingModule({
      imports: [MainHeaderComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ElementRef,
          useValue: {
            nativeElement: {
              querySelector: () => null,
            },
          },
        },
        { provide: ProjectService, useValue: { getByIdOnce$: () => of(null) } },
        {
          provide: LayoutService,
          useValue: {
            isXs,
            isXxxs,
            isShowMobileBottomNav: isXs,
            isShowIssuePanel: signal(false),
            isShowNotes: signal(false),
            isShowScheduleDayPanel: signal(false),
          },
        },
        {
          provide: PluginBridgeService,
          useValue: {
            headerButtons: pluginHeaderButtons,
            workContextHeaderButtons: signal([]),
            sidePanelButtons: signal([]),
          },
        },
        {
          provide: TaskService,
          useValue: {
            currentTaskParentOrCurrent$: of(null),
            currentTask$: of(null),
            currentTaskId: signal(null),
          },
        },
        {
          provide: WorkContextService,
          useValue: {
            activeWorkContextId$: of(null),
            undoneTasks$: of([]),
          },
        },
        {
          provide: SimpleCounterService,
          useValue: { enabledSimpleCounters$: of(enabledSimpleCounters) },
        },
        {
          provide: SyncWrapperService,
          useValue: {
            sync: jasmine.createSpy('sync'),
            isEnabledAndReady$: of(false),
            syncState$: of('IN_SYNC'),
            isSyncInProgress$: of(false),
            hasNoPendingOps$: of(true),
            superSyncIsConfirmedInSync$: of(false),
          },
        },
        {
          provide: SnackService,
          useValue: {
            open: jasmine.createSpy('open'),
            hasPendingPersistentAction: jasmine.createSpy('hasPendingPersistentAction'),
          },
        },
        { provide: Router, useValue: { events: EMPTY } },
        {
          provide: GlobalConfigService,
          useValue: {
            cfg$: of(cfg),
            cfg: signal(cfg),
            appFeatures,
            misc: signal({ isVerticalActionBar: false }),
          },
        },
        { provide: MatDialog, useValue: { open: jasmine.createSpy('open') } },
        { provide: Store, useValue: { dispatch: jasmine.createSpy('dispatch') } },
        {
          provide: DataInitStateService,
          useValue: { isAllDataLoadedInitially$: isAllDataLoaded ? of(true) : EMPTY },
        },
        { provide: MetricService, useValue: { getFocusSummaryForDay: () => null } },
        { provide: DateService, useValue: { todayStr: () => '2026-06-09' } },
        { provide: UserProfileService, useValue: { isInitialized: () => false } },
        { provide: ConflictJournalService, useValue: { unreviewedCount: signal(0) } },
        // `createComponent()` builds the component outside a component
        // injector, where neither its own `providers` nor a host element
        // exist. The specs that use it only read placement rules, so an
        // unattached element is enough: the service finds no `.wrapper`, never
        // records a width, and reports nothing demoted.
        HeaderOverflowService,
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    }).overrideComponent(MainHeaderComponent, {
      set: {
        // NgTemplateOutlet is real, not stubbed: the sync button is mounted
        // through it, and a stubbed outlet would leave the sync slot empty.
        imports: [TranslatePipe, NgTemplateOutlet],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
  };

  const createComponent = (): MainHeaderComponent => {
    configureTestBed();
    return runInInjectionContext(TestBed.inject(EnvironmentInjector), () => {
      return new MainHeaderComponent();
    });
  };

  beforeEach(() => {
    isXs = signal(false);
    isXxxs = signal(false);
    appFeatures = signal(DEFAULT_GLOBAL_CONFIG.appFeatures);
    enabledSimpleCounters = [];
    isAllDataLoaded = true;
    pluginHeaderButtons = signal<unknown[]>([]);
  });

  afterEach(() => {
    component?.ngOnDestroy();
    fixture?.destroy();
  });

  it('keeps the focus mode entry visible on narrow mobile screens (#8157)', () => {
    isXs = signal(true);
    isXxxs = signal(true);
    appFeatures = signal({
      ...DEFAULT_GLOBAL_CONFIG.appFeatures,
      isFocusModeEnabled: true,
    });

    component = createComponent();

    // The add button lives in the bottom nav's FAB on mobile, not the header.
    expect(component.showAddTaskInline()).toBe(false);
    expect(component.isFocusButtonVisible()).toBe(true);
  });

  it('hides the focus button when the app feature is disabled', () => {
    appFeatures = signal({
      ...DEFAULT_GLOBAL_CONFIG.appFeatures,
      isFocusModeEnabled: false,
    });

    component = createComponent();

    expect(component.isFocusButtonVisible()).toBe(false);
  });

  // These mount the real component into the live DOM at a fixed width and let
  // the browser lay it out. Nothing here fakes a width any more: the fit adds
  // the row up from how many buttons each action contributes, and those counts
  // come from the same stubbed services production reads, so the only input the
  // test controls is how much room the header gets. Earlier versions injected a
  // width per slot because the fit measured them — and every one of the bugs
  // #9480 went through was that injected number disagreeing with the CSS.
  let box: HTMLElement | undefined;

  const mountAtWidth = async (width: number): Promise<HTMLElement> => {
    configureTestBed();
    fixture = TestBed.createComponent(MainHeaderComponent);
    const host = fixture.nativeElement as HTMLElement;
    box = document.createElement('div');
    box.style.width = `${width}px`;
    document.body.appendChild(box);
    box.appendChild(host);
    await settle();
    return host;
  };

  /**
   * Let the fit settle. It is a `computed()`, so there is nothing to wait out —
   * but the width that feeds it arrives from a ResizeObserver, which the
   * browser delivers on its own schedule. A couple of turns is enough; the
   * reflow this replaced needed twelve, one per demotable action plus the
   * 120ms a widening spent waiting before it dared re-offer anything.
   */
  const settle = async (): Promise<void> => {
    const appRef = TestBed.inject(ApplicationRef);
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      appRef.tick();
      await fixture!.whenStable();
    }
  };

  /** Resize the mounted header and let the reflow settle again. */
  const resizeTo = async (width: number): Promise<void> => {
    box!.style.width = `${width}px`;
    await settle();
  };

  afterEach(() => {
    box?.remove();
    box = undefined;
  });

  it('brings actions back when the header widens again (#9480)', async () => {
    // Demotion must not be a one-way ratchet. It was: slack was measured only
    // as how much further `.page-title` could shrink, and a short name sits at
    // its min-width already, so there was never any slack to report. One
    // transient overflow demoted an action and nothing could restore it, until
    // the header was collapsed at every width.
    const host = await mountAtWidth(220);
    expect(host.querySelector('.header-overflow-btn')).toBeTruthy();

    await resizeTo(1400);

    expect(host.querySelector('[data-slot="panelButtons"]')).toBeTruthy();
    expect(host.querySelector('[data-slot="sync"]')).toBeTruthy();
    expect(host.querySelector('.header-overflow-btn')).toBeFalsy();
  });

  it('moves actions into the overflow panel when the header is narrow (#9480)', async () => {
    // Two 200px slots (panel buttons, sync) cannot both sit in 320px.
    const host = await mountAtWidth(320);

    const panel = host.querySelector('.header-overflow-panel');
    expect(host.querySelector('.header-overflow-btn')).toBeTruthy();
    expect(panel).toBeTruthy();
    // Panel buttons lead the demotion order, so they are what left the bar.
    expect(host.querySelector('[data-slot="panelButtons"]')).toBeFalsy();
    expect(panel!.querySelector('desktop-panel-buttons')).toBeTruthy();
  });

  it('keeps every action in the bar when the header is wide (#9480)', async () => {
    const host = await mountAtWidth(1400);

    expect(host.querySelector('.header-overflow-btn')).toBeFalsy();
    expect(host.querySelector('.header-overflow-panel')).toBeFalsy();
    expect(host.querySelector('.tour-addBtn')).toBeTruthy();
    expect(host.querySelector('[data-slot="panelButtons"]')).toBeTruthy();
  });

  it('never leaves a demoted action with nowhere to be (#9480)', async () => {
    // The bug this whole change exists to fix is an action that is in neither
    // the bar nor a panel. At 220px nothing fits, so everything demotable has
    // to have moved -- and every one of them must be findable in the panel.
    const host = await mountAtWidth(220);
    const panel = host.querySelector('.header-overflow-panel');

    expect(panel).toBeTruthy();
    expect(host.querySelector('[data-slot="panelButtons"]')).toBeFalsy();
    expect(panel!.querySelector('desktop-panel-buttons')).toBeTruthy();
    expect(host.querySelector('[data-slot="sync"]')).toBeFalsy();
    expect(panel!.querySelector('.sync-btn')).toBeTruthy();
  });

  it('holds the collapsed overflow panel out of the a11y tree (#9272)', async () => {
    const host = await mountAtWidth(220);
    const panel = host.querySelector('.header-overflow-panel')!;

    expect(panel.getAttribute('inert')).toBe('');
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    fixture!.componentInstance.toggleOverflow();
    await settle();

    expect(panel.getAttribute('inert')).toBeNull();
    expect(panel.classList.contains('isVisible')).toBe(true);
  });

  it('does not dismiss the panel when a menu it opened is clicked (#9480)', async () => {
    // Demoted actions open real menus and dialogs, and the CDK renders those
    // into `.cdk-overlay-container` on <body> -- outside the panel. Treating
    // the first click on a menu item as an outside click closed the panel from
    // under the open menu, and the menu's own focus restore then pointed into
    // an `inert` subtree, dropping focus to <body>.
    const host = await mountAtWidth(220);
    const header = fixture!.componentInstance;
    header.toggleOverflow();
    await settle();
    expect(host.querySelector('.header-overflow-panel.isVisible')).toBeTruthy();

    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    const menuItem = document.createElement('button');
    overlay.appendChild(menuItem);
    document.body.appendChild(overlay);
    try {
      menuItem.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await settle();
      expect(header.isOverflowOpen()).toBe(true);
    } finally {
      overlay.remove();
    }

    // A click that really is elsewhere still dismisses it.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(header.isOverflowOpen()).toBe(false);
  });

  it('dismisses the panel when a demoted action is used, unless it is marked', async () => {
    // Using a demoted action closes the tray, the way picking from a menu
    // does. The exception is a control the panel template marks: one that
    // opens an overlay restoring focus into a subtree about to go `inert`, or
    // one pressed repeatedly with its own readout, where dismissing per press
    // would make the tray the opposite of what it is for.
    const host = await mountAtWidth(220);
    const header = fixture!.componentInstance;
    const panel = host.querySelector('.header-overflow-panel') as HTMLElement;

    const plain = document.createElement('button');
    const marked = document.createElement('button');
    marked.setAttribute('data-keeps-overflow-open', '');
    panel.append(plain, marked);

    header.isOverflowOpen.set(true);
    marked.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(header.isOverflowOpen()).toBe(true);

    plain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(header.isOverflowOpen()).toBe(false);
  });

  it('restores a slot that was demoted before it was ever measured (#9480)', async () => {
    // `_demotedCount` is a prefix count over `_demotableIds`, so an id
    // appearing at the HEAD of that list lands inside the already-demoted
    // prefix without ever having been inline *with content* -- a plugin
    // registering its header buttons while the bar is collapsed. Its only
    // recorded width is the 0 it measured while empty, and the old
    // `cost > 0` guard read that as "cannot be costed" and refused it forever:
    // the panel held it, and the trigger stayed, at every width for the rest of
    // the session.
    const host = await mountAtWidth(320);
    expect(host.querySelector('.header-overflow-btn')).toBeTruthy();
    // With no buttons registered the slot is not rendered at all, so there is
    // no width on record for it -- which is the same standing start the bug
    // came from, now without an empty wrapper spending a gap to get there.
    expect(host.querySelector('[data-slot="pluginHeader"]')).toBeFalsy();

    // The plugin arrives while the header is already collapsed.
    pluginHeaderButtons.set(
      Array.from({ length: 4 }, () => ({ label: 'x', icon: 'x', onClick: () => {} })),
    );
    await resizeTo(320);
    expect(host.querySelector('[data-slot="pluginHeader"]')).toBeFalsy();

    await resizeTo(1400);

    // Fails against `cost > 0`: pluginHeader's recorded width is 0, so it is
    // never restored and holds the trigger open even at 1400px.
    expect(host.querySelector('[data-slot="pluginHeader"]')).toBeTruthy();
    expect(host.querySelector('.header-overflow-btn')).toBeFalsy();
  });

  it('does not demote a slot that is no wider than the trigger it adds (#9480)', async () => {
    // On a phone the bottom nav owns add-task, the panel buttons and the
    // side-panel buttons, so a default install with no plugins, no user
    // profiles and no counters has exactly ONE demotable action: sync. Every
    // header action is a 40px icon button and so is the overflow trigger, so
    // demoting it removes 40px and immediately adds 40px back -- reclaiming
    // nothing while hiding the app's only persistent sync indicator behind a
    // tap. The row is still overflowing afterwards, and `count === ids.length`
    // stops the loop, so it is not even a step towards a fix.
    isXs = signal(true);
    isXxxs = signal(true);

    // Narrow enough that the row genuinely overflows, so the demote branch is
    // reached and the guard is what stops it -- not a lack of pressure.
    const host = await mountAtWidth(50);

    expect(host.querySelector('[data-slot="sync"]')).toBeTruthy();
    expect(host.querySelector('.header-overflow-btn')).toBeFalsy();
  });

  it('re-fits when a slot grows without changing which slots exist (#9480)', async () => {
    // One plugin button becoming several leaves the set of demotable actions
    // identical, and the header's own width does not change either -- so the
    // ResizeObserver never fires and the old model never re-measured. This is
    // the case the reporter says gets worse "with every enabled simple
    // counter". Counts are a direct input to the fit now, so the row re-fits
    // for the same reason it fits at all.
    const btn = { label: 'x', icon: 'x', onClick: () => {} };
    pluginHeaderButtons.set([btn]);
    const host = await mountAtWidth(560);
    expect(host.querySelector('.header-overflow-btn')).toBeFalsy();

    pluginHeaderButtons.set(Array.from({ length: 8 }, () => btn));
    await settle();

    expect(host.querySelector('.header-overflow-btn')).toBeTruthy();
  });

  it('leaves the scroll floor off while the row fits (#9480)', async () => {
    // The floor is a clip, and clipping this row is not free: `play-button`
    // hangs `.current-task-title` -- the pill naming the tracked task -- off
    // `right: 100%` of the play button, which is the row's first child. That
    // puts the whole pill beyond the inline-start clip edge, in the one
    // direction `scrollLeft` cannot reach, so an always-on floor did not hide
    // the pill, it deleted it.
    const host = await mountAtWidth(1400);
    const nav = host.querySelector('nav.action-nav-right') as HTMLElement;
    const scroller = host.querySelector('.action-nav-scroll') as HTMLElement;

    expect(nav.classList.contains('action-nav-right--scrolls')).toBe(false);
    // The clip lives on the inner box (so the overflow trigger, its sibling,
    // can never be the button that scrolls away), and that box is not even a
    // box until the floor engages.
    expect(getComputedStyle(nav).overflowX).toBe('visible');
    expect(getComputedStyle(scroller).display).toBe('contents');
  });

  it('engages the scroll floor when even the pinned actions do not fit (#9480)', async () => {
    // Everything demotable leaves and the row is still over-wide -- the state
    // the floor exists for, and the only one that may pay its clip. Play,
    // add-task, focus and the trigger are four buttons plus a separator, so
    // nothing above ~190px can hold them however much it demotes.
    const host = await mountAtWidth(150);
    const nav = host.querySelector('nav.action-nav-right') as HTMLElement;
    const scroller = host.querySelector('.action-nav-scroll') as HTMLElement;

    expect(host.querySelector('[data-slot="sync"]')).toBeFalsy();
    expect(nav.classList.contains('action-nav-right--scrolls')).toBe(true);
    // The actions scroll; the nav itself does not, so the overflow trigger it
    // holds beside them stays put.
    expect(getComputedStyle(scroller).overflowX).toBe('auto');
    expect(getComputedStyle(nav).overflowX).toBe('visible');
  });

  /** Which demotable actions are currently in the bar. */
  const inlineSlots = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll('nav.action-nav-right [data-slot]')).map(
      (el) => (el as HTMLElement).dataset.slot as string,
    );

  it('lands on the same row whichever width it was resized from', async () => {
    // The old model could not promise this. Its answer depended on what was
    // rendered when it looked, and the only way it could uncollapse was to put
    // every demoted action back inline for a frame and re-measure — so the same
    // width could settle differently depending on how it got there, and the
    // frame in between is what the header visibly flickered.
    const host = await mountAtWidth(1400);
    await resizeTo(320);
    const arrivedFromWide = inlineSlots(host);

    await resizeTo(150);
    await resizeTo(320);

    expect(inlineSlots(host)).toEqual(arrivedFromWide);
  });

  it('rebuilds nothing while the header is resized within one regime', async () => {
    // Dragging the right-panel divider or the side nav walks the header through
    // dozens of widths. Re-offering on each one tore down and rebuilt every
    // demoted component — including `simple-counter-button`, which owns its
    // countdown subscription, so a drag could restart a running counter's
    // pipeline. Nothing here crosses a demotion threshold, so nothing should be
    // rebuilt at all.
    const host = await mountAtWidth(300);
    const nav = host.querySelector('nav.action-nav-right') as HTMLElement;
    const before = inlineSlots(host);

    let mutations = 0;
    const observer = new MutationObserver((records) => {
      mutations += records.length;
    });
    observer.observe(nav, { childList: true, subtree: true });
    for (const width of [310, 320, 330, 340, 350, 340, 330, 320, 310, 300]) {
      await resizeTo(width);
    }
    expect(inlineSlots(host)).toEqual(before);
    expect(mutations).toBe(0);

    // ...and the observer is watching the right node: crossing a threshold
    // does rebuild the row, so the zero above is a result, not a wiring bug.
    await resizeTo(1400);
    observer.disconnect();
    expect(inlineSlots(host)).not.toEqual(before);
    expect(mutations).toBeGreaterThan(0);
  });

  it('keeps the add-task button in the bar at any width (#9480)', async () => {
    // Add-task is pinned, not demoted last. It is the primary quick-capture
    // entry point and where there is no bottom-nav FAB the header button is the
    // only one on the page, so it must never end up behind the overflow tap --
    // however little room is left. Sync yields in its place.
    const host = await mountAtWidth(220);

    const addBtn = host.querySelector('.tour-addBtn');
    expect(addBtn).toBeTruthy();
    // In the bar, not in the panel.
    expect(host.querySelector('.header-overflow-panel')!.contains(addBtn)).toBe(false);
    expect(host.querySelector('nav.action-nav-right')!.contains(addBtn)).toBe(true);
  });

  it('shows the add-task button before initial data load finishes', () => {
    // The shell paints before op-log hydration completes; the quick-capture
    // entry point must already be there in that window, while the
    // data-dependent header parts still wait for the data-loaded signal.
    isAllDataLoaded = false;

    configureTestBed();
    fixture = TestBed.createComponent(MainHeaderComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tour-addBtn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('page-title')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.counters-action-group')).toBeFalsy();
  });

  it('keeps a persistent recovery action instead of showing routine sync success', async () => {
    component = createComponent();
    const syncWrapperService = TestBed.inject(
      SyncWrapperService,
    ) as jasmine.SpyObj<SyncWrapperService>;
    const snackService = TestBed.inject(SnackService) as jasmine.SpyObj<SnackService>;
    syncWrapperService.sync.and.resolveTo(SyncStatus.UpdateRemote);
    snackService.hasPendingPersistentAction.and.returnValue(true);

    component.sync();
    await Promise.resolve();

    expect(snackService.open).not.toHaveBeenCalled();
  });
});
