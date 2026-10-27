import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition, Overlay } from '@angular/cdk/overlay';
import { PipelineStage } from '../../../Core/Interfaces/hr';
import { OUTCOME_STAGES, PIPELINE_STAGES, STAGE_BY_ID } from '../../../Core/Utils/pipeline';

// Stage picker for a candidate: a colored pill showing the current stage, opening a menu of all
// stages with their icons and colors. The menu is a CDK overlay so board columns can't clip it.
@Component({
  selector: 'app-hr-stage-menu',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, NgTemplateOutlet],
  templateUrl: './hr-stage-menu.html',
  styleUrl: './hr-stage-menu.scss',
})
export class HrStageMenu {
  stage = input.required<PipelineStage>();
  // sm: compact pill on board cards; md: full-width field in the candidate panel
  size = input<'sm' | 'md'>('sm');
  stageChange = output<PipelineStage>();

  // Pipeline stages first, then the final outcomes under a divider
  activeStages = PIPELINE_STAGES.filter((s) => !OUTCOME_STAGES.includes(s.id));
  outcomeStages = PIPELINE_STAGES.filter((s) => OUTCOME_STAGES.includes(s.id));
  current = computed(() => STAGE_BY_ID[this.stage()]);
  open = signal(false);

  // Below the trigger, right-aligned; flips above when there's no room
  positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  ];
  // Scrolling the board while the menu is open just closes it
  scrollStrategy = inject(Overlay).scrollStrategies.close();

  toggle(event: Event) {
    // Inside a card: don't open the candidate panel
    event.stopPropagation();
    this.open.update((open) => !open);
  }

  choose(stage: PipelineStage) {
    this.open.set(false);
    if (stage !== this.stage()) this.stageChange.emit(stage);
  }

  onOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Close only the menu: pages skip Escape events that are already handled
      event.preventDefault();
      this.open.set(false);
    }
  }
}
