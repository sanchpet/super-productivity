import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import {
  DesktopPanelButtonsComponent,
  desktopPanelButtonCount,
} from './desktop-panel-buttons.component';
import { GlobalConfigService } from '../../../features/config/global-config.service';
import { LayoutService } from '../../layout/layout.service';
import { DEFAULT_GLOBAL_CONFIG } from '../../../features/config/default-global-config.const';
import { AppFeaturesConfig } from '../../../features/config/global-config.model';

/**
 * `MainHeaderComponent` reserves room for these buttons by counting them rather
 * than measuring them, and it counts them with `desktopPanelButtonCount` —
 * without an instance, because a demoted copy is not where the row's width
 * comes from. So the count has to agree with the template in every
 * configuration, and a fourth button added to one but not the other would
 * silently mis-size the row. That is what this pins.
 */
describe('DesktopPanelButtonsComponent', () => {
  let appFeatures: ReturnType<typeof signal<AppFeaturesConfig>>;

  const render = async (
    over: Partial<AppFeaturesConfig>,
  ): Promise<ComponentFixture<DesktopPanelButtonsComponent>> => {
    appFeatures = signal({ ...DEFAULT_GLOBAL_CONFIG.appFeatures, ...over });

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), DesktopPanelButtonsComponent],
      providers: [
        { provide: GlobalConfigService, useValue: { appFeatures } },
        { provide: LayoutService, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    const fixture = TestBed.createComponent(DesktopPanelButtonsComponent);
    fixture.componentRef.setInput('isRouteWithSidePanel', true);
    fixture.componentRef.setInput('isShowScheduleDayPanel', false);
    fixture.componentRef.setInput('isShowIssuePanel', false);
    fixture.componentRef.setInput('isShowNotes', false);
    fixture.detectChanges();
    return fixture;
  };

  const cases: Array<[string, Partial<AppFeaturesConfig>]> = [
    ['all three enabled', {}],
    [
      'none enabled',
      {
        isScheduleDayPanelEnabled: false,
        isIssuesPanelEnabled: false,
        isProjectNotesEnabled: false,
      },
    ],
    ['only schedule', { isIssuesPanelEnabled: false, isProjectNotesEnabled: false }],
    ['only issues', { isScheduleDayPanelEnabled: false, isProjectNotesEnabled: false }],
    ['only notes', { isScheduleDayPanelEnabled: false, isIssuesPanelEnabled: false }],
    ['schedule and notes', { isIssuesPanelEnabled: false }],
  ];

  cases.forEach(([name, over]) => {
    it(`counts what it renders — ${name}`, async () => {
      const fixture = await render(over);
      const rendered = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'button.panel-btn',
      ).length;

      expect(desktopPanelButtonCount(appFeatures())).toBe(rendered);
    });
  });
});
