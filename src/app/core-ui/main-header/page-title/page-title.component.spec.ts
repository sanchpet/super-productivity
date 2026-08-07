import { Component, NO_ERRORS_SCHEMA, Provider } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { readHeaderTokens } from '../overflow/header-tokens';
import { runWidth } from '../overflow/header-fit';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { TranslateModule, TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatMenu } from '@angular/material/menu';
import { Store } from '@ngrx/store';

import { PageTitleComponent } from './page-title.component';
import { WorkContextService } from '../../../features/work-context/work-context.service';
import {
  WorkContext,
  WorkContextType,
} from '../../../features/work-context/work-context.model';
import { TaskViewCustomizerService } from '../../../features/task-view-customizer/task-view-customizer.service';
import { GlobalConfigService } from '../../../features/config/global-config.service';
import { PlainspaceShareService } from '../../../features/issue/providers/plainspace/plainspace-share.service';
import { T } from '../../../t.const';

// `MainHeaderComponent` owes the title's buttons their full width when it sizes
// the action row, and computes that owed width from `actionButtonCount()` and
// its own spacing tokens rather than by measuring. This host makes that
// comparison possible: it pulls in main-header's stylesheet, so the real tokens
// cascade onto the real `page-title` underneath, and the spec checks the
// arithmetic against the box the browser actually laid out.
@Component({
  standalone: true,
  imports: [PageTitleComponent],
  styleUrls: ['../main-header.component.scss'],
  template: `<div class="wrapper"><page-title></page-title></div>`,
})
class TitleReserveHostComponent {}

describe('PageTitleComponent', () => {
  let routerEvents$: Subject<NavigationEnd>;
  let routerStub: { events: Subject<NavigationEnd>; url: string };
  let typeAndId$: BehaviorSubject<{ activeId: string; activeType: WorkContextType }>;
  let activeWorkContext$: BehaviorSubject<WorkContext>;
  let isShared$: BehaviorSubject<boolean>;
  let isXxxs$: BehaviorSubject<{ matches: boolean }>;
  let openSpy: jasmine.Spy;

  // `color` is a Tag-only field not surfaced on WorkContext's type.
  const wc = (o: Partial<WorkContext> & { color?: string | null }): WorkContext =>
    o as WorkContext;

  const setupComponent = (initialUrl: string): PageTitleComponent => {
    routerStub.url = initialUrl;
    return TestBed.createComponent(PageTitleComponent).componentInstance;
  };

  const stubProviders = (opts: { realTranslate?: boolean } = {}): Provider[] => [
    { provide: Router, useValue: routerStub },
    {
      provide: BreakpointObserver,
      useValue: { observe: () => isXxxs$ },
    },
    {
      provide: WorkContextService,
      useValue: {
        activeWorkContextTitle$: of('Today'),
        activeWorkContextTypeAndId$: typeAndId$,
        activeWorkContext$,
      },
    },
    // Ignores the selector arg — the switchMap only calls select() for a
    // project context, so `isShared$` stands in for the shared-state result.
    { provide: Store, useValue: { select: () => isShared$ } },
    {
      provide: PlainspaceShareService,
      useValue: { openProjectOnPlainspace: openSpy },
    },
    {
      provide: TaskViewCustomizerService,
      useValue: { isCustomized: () => false },
    },
    {
      provide: GlobalConfigService,
      useValue: { cfg: () => ({ keyboard: {} }) },
    },
    // The rendering specs below mount the real template, whose `| translate`
    // needs more of TranslateService than `instant`.
    ...(opts.realTranslate
      ? []
      : [
          {
            provide: TranslateService,
            useValue: { instant: (key: string) => key },
          },
        ]),
  ];

  beforeEach(async () => {
    routerEvents$ = new Subject<NavigationEnd>();
    routerStub = { events: routerEvents$, url: '/' };
    typeAndId$ = new BehaviorSubject<{ activeId: string; activeType: WorkContextType }>({
      activeId: 'TODAY',
      activeType: WorkContextType.TAG,
    });
    activeWorkContext$ = new BehaviorSubject<WorkContext>(
      wc({
        id: 'TODAY',
        title: 'Today',
        type: WorkContextType.TAG,
        icon: 'wb_sunny',
        theme: { primary: '#abcdef' } as WorkContext['theme'],
      }),
    );
    isShared$ = new BehaviorSubject(false);
    isXxxs$ = new BehaviorSubject<{ matches: boolean }>({ matches: false });
    openSpy = jasmine
      .createSpy('openProjectOnPlainspace')
      .and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({ providers: stubProviders() })
      .overrideComponent(PageTitleComponent, {
        set: { imports: [], template: '' },
      })
      .compileComponents();
  });

  describe('displayTitle()', () => {
    const cases: Array<[string, string]> = [
      ['/schedule', T.MH.SCHEDULE],
      ['/planner', T.MH.PLANNER],
      ['/boards', T.MH.BOARDS],
      ['/habits', T.MH.HABITS],
      ['/search', T.MH.SEARCH],
      ['/scheduled-list', T.MH.ALL_PLANNED_LIST],
      ['/donate', T.MH.DONATE],
      ['/config', T.PS.GLOBAL_SETTINGS],
    ];

    cases.forEach(([url, expectedKey]) => {
      it(`returns "${expectedKey}" for ${url}`, () => {
        const c = setupComponent(url);
        expect(c.displayTitle()).toBe(expectedKey);
      });
    });

    it('falls through to activeWorkContextTitle for non-special routes', () => {
      const c = setupComponent('/active/tasks');
      expect(c.displayTitle()).toBe('Today');
    });

    it('matches /config#plugins (URL with fragment)', () => {
      const c = setupComponent('/config#plugins');
      expect(c.displayTitle()).toBe(T.PS.GLOBAL_SETTINGS);
    });

    it('matches /config?tab=2 (URL with query params)', () => {
      const c = setupComponent('/config?tab=2');
      expect(c.displayTitle()).toBe(T.PS.GLOBAL_SETTINGS);
    });

    it('updates on navigation', () => {
      const c = setupComponent('/active/tasks');
      expect(c.displayTitle()).toBe('Today');

      routerEvents$.next(new NavigationEnd(1, '/planner', '/planner'));
      expect(c.displayTitle()).toBe(T.MH.PLANNER);

      routerEvents$.next(new NavigationEnd(2, '/config', '/config#plugins'));
      expect(c.displayTitle()).toBe(T.PS.GLOBAL_SETTINGS);
    });
  });

  describe('isSpecialSection()', () => {
    it('is true for /config', () => {
      const c = setupComponent('/config');
      expect(c.isSpecialSection()).toBe(true);
    });

    it('is false for /active/tasks', () => {
      const c = setupComponent('/active/tasks');
      expect(c.isSpecialSection()).toBe(false);
    });

    it('does not collide /scheduled-list with /schedule', () => {
      const c = setupComponent('/scheduled-list');
      expect(c.isSpecialSection()).toBe(true);
      expect(c.displayTitle()).toBe(T.MH.ALL_PLANNED_LIST);
    });
  });

  describe('isWorkViewPage()', () => {
    it('is true for /active/tasks', () => {
      const c = setupComponent('/active/tasks');
      expect(c.isWorkViewPage()).toBe(true);
    });

    it('is true for /project/abc/tasks?focus=1 (with query)', () => {
      const c = setupComponent('/project/abc/tasks?focus=1');
      expect(c.isWorkViewPage()).toBe(true);
    });

    it('is false for /config', () => {
      const c = setupComponent('/config');
      expect(c.isWorkViewPage()).toBe(false);
    });
  });

  describe('isSharedOnPlainspace()', () => {
    it('is false for a tag context (store never consulted)', () => {
      typeAndId$.next({ activeId: 'TODAY', activeType: WorkContextType.TAG });
      const c = setupComponent('/active/tasks');
      expect(c.isSharedOnPlainspace()).toBe(false);
    });

    it('is false for a project that is not shared', () => {
      typeAndId$.next({ activeId: 'p1', activeType: WorkContextType.PROJECT });
      isShared$.next(false);
      const c = setupComponent('/project/p1/tasks');
      expect(c.isSharedOnPlainspace()).toBe(false);
    });

    it('is true for a project shared on Plainspace', () => {
      typeAndId$.next({ activeId: 'p1', activeType: WorkContextType.PROJECT });
      isShared$.next(true);
      const c = setupComponent('/project/p1/tasks');
      expect(c.isSharedOnPlainspace()).toBe(true);
    });
  });

  describe('context icon', () => {
    it('uses the tag icon and tag color when set', () => {
      activeWorkContext$.next(
        wc({
          id: 't1',
          title: 'Tag',
          type: WorkContextType.TAG,
          icon: 'star',
          color: '#ff0000',
          theme: { primary: '#00ff00' } as WorkContext['theme'],
        }),
      );
      const c = setupComponent('/tag/t1/tasks');
      expect(c.contextIcon()).toBe('star');
      // Tag color wins over theme primary.
      expect(c.contextIconColor()).toBe('#ff0000');
      expect(c.isContextEmojiIcon()).toBe(false);
    });

    it('falls back to the theme primary for a tag without its own color', () => {
      activeWorkContext$.next(
        wc({
          id: 't2',
          title: 'Tag',
          type: WorkContextType.TAG,
          icon: null,
          color: null,
          theme: { primary: '#00ff00' } as WorkContext['theme'],
        }),
      );
      const c = setupComponent('/tag/t2/tasks');
      // Default tag icon.
      expect(c.contextIcon()).toBe('label');
      expect(c.contextIconColor()).toBe('#00ff00');
    });

    it('uses the project default icon and theme primary', () => {
      activeWorkContext$.next(
        wc({
          id: 'p1',
          title: 'Project',
          type: WorkContextType.PROJECT,
          icon: null,
          theme: { primary: '#123456' } as WorkContext['theme'],
        }),
      );
      const c = setupComponent('/project/p1/tasks');
      expect(c.contextIcon()).toBe('list_alt');
      expect(c.contextIconColor()).toBe('#123456');
    });

    it('detects an emoji icon', () => {
      activeWorkContext$.next(
        wc({
          id: 'p2',
          title: 'Project',
          type: WorkContextType.PROJECT,
          icon: '🚀',
          theme: { primary: '#123456' } as WorkContext['theme'],
        }),
      );
      const c = setupComponent('/project/p2/tasks');
      expect(c.contextIcon()).toBe('🚀');
      expect(c.isContextEmojiIcon()).toBe(true);
    });
  });

  describe('openInPlainspace()', () => {
    it('delegates to the share service with the active project id', () => {
      typeAndId$.next({ activeId: 'p1', activeType: WorkContextType.PROJECT });
      const c = setupComponent('/project/p1/tasks');
      c.openInPlainspace();
      expect(openSpy).toHaveBeenCalledWith('p1');
    });
  });

  /**
   * `MainHeaderComponent` sizes its action row from `actionButtonCount()`
   * rather than from a measurement, so a count that disagrees with the template
   * silently mis-sizes the header. These render the real template — the rest of
   * this file stubs it away — and compare the count against what the DOM
   * actually holds, so any future `@if` added to `.page-title-actions` without
   * a matching term fails here instead of shipping.
   */
  // Keeps the real template — that is the whole point — but drops the
  // directives that only decorate it. Three have to stay: `MatMenu`, because
  // the template resolves `#activeWorkContextMenu="matMenu"` and an
  // unresolvable `exportAs` is a compile error NO_ERRORS_SCHEMA does not cover,
  // and `MatIconButton`/`MatIcon`, because the reserve spec measures the boxes
  // they draw. `RouterLink` stays out, so no `ActivatedRoute` is needed.
  const configureRender = async (): Promise<void> => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TitleReserveHostComponent],
      providers: stubProviders({ realTranslate: true }),
    })
      .overrideComponent(PageTitleComponent, {
        set: {
          imports: [TranslatePipe, MatMenu, MatIconButton, MatIcon],
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();
  };

  describe('actionButtonCount()', () => {
    const renderAt = async (
      url: string,
    ): Promise<{ count: number; rendered: number }> => {
      await configureRender();
      routerStub.url = url;
      const fixture = TestBed.createComponent(PageTitleComponent);
      fixture.detectChanges();
      return {
        count: fixture.componentInstance.actionButtonCount(),
        rendered: fixture.nativeElement.querySelectorAll('.page-title-actions button')
          .length,
      };
    };

    it('matches the rendered buttons on the work view', async () => {
      const { count, rendered } = await renderAt('/active/tasks');
      expect(count).toBe(rendered);
      expect(count).toBe(2);
    });

    it('matches the rendered buttons on a non-work-view context route', async () => {
      const { count, rendered } = await renderAt('/active/notes');
      expect(count).toBe(rendered);
      expect(count).toBe(1);
    });

    it('counts the Plainspace button for a shared project', async () => {
      typeAndId$.next({ activeId: 'p1', activeType: WorkContextType.PROJECT });
      isShared$.next(true);
      const { count, rendered } = await renderAt('/project/p1/tasks');
      expect(count).toBe(rendered);
      expect(count).toBe(3);
    });

    it('renders no actions on a special section', async () => {
      const { count, rendered } = await renderAt('/config');
      expect(count).toBe(rendered);
      expect(count).toBe(0);
    });

    it('renders no actions at the smallest breakpoint', async () => {
      isXxxs$.next({ matches: true });
      const { count, rendered } = await renderAt('/active/tasks');
      expect(count).toBe(rendered);
      expect(count).toBe(0);
    });
  });

  /**
   * The other half of the same contract: the header turns the count into a
   * width using its own spacing tokens, so those tokens have to describe the
   * box this component actually draws. Mounted under a host that carries
   * main-header's stylesheet, so the real tokens cascade down exactly as they
   * do in the app.
   */
  describe('the width the header reserves for the title', () => {
    let host: HTMLElement;

    const render = async (url: string): Promise<void> => {
      await configureRender();
      routerStub.url = url;
      const fixture = TestBed.createComponent(TitleReserveHostComponent);
      host = fixture.nativeElement as HTMLElement;
      document.body.appendChild(host);
      fixture.detectChanges();
    };

    afterEach(() => host?.remove());

    it('reserves exactly the box the action buttons occupy', async () => {
      await render('/active/tasks');
      const tokens = readHeaderTokens(host);
      const actions = host.querySelector('.page-title-actions') as HTMLElement;
      const style = getComputedStyle(actions);
      const outerWidth =
        actions.getBoundingClientRect().width +
        parseFloat(style.marginLeft) +
        parseFloat(style.marginRight);

      const count = (
        host.querySelector('page-title') as HTMLElement & {
          [k: string]: unknown;
        }
      ).querySelectorAll('.page-title-actions button').length;

      expect(count).toBe(2);
      expect(outerWidth).toBe(
        runWidth(count, tokens.btn, tokens.titleActionGap) + tokens.titleActionsMargin,
      );
    });

    // The title text shrinks to nothing, but a flex item never shrinks below
    // its own padding — so that padding is the floor the row still owes.
    it('reserves exactly the padding the title cannot shrink past', async () => {
      await render('/active/tasks');
      const tokens = readHeaderTokens(host);
      const style = getComputedStyle(host.querySelector('.page-title') as HTMLElement);

      expect(parseFloat(style.minWidth) || 0).toBe(0);
      expect(parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)).toBe(
        tokens.titlePadding,
      );
    });
  });
});
