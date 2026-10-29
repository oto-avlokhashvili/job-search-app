import { Component, computed, DestroyRef, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';

export interface SelectOption<T> {
  value: T;
  label: string;
  icon?: string;
  /** Second, muted line */
  hint?: string;
  disabled?: boolean;
  /** Options with the same group are listed under one heading, in order of first appearance */
  group?: string;
}

export interface SelectGroupInfo {
  label: string;
  icon?: string;
}

interface Section<T> {
  label: string | null;
  icon?: string;
  items: { option: SelectOption<T>; index: number }[];
}

interface PanelPosition {
  left: number;
  width: number;
  maxHeight: number;
  top: number | null;
  bottom: number | null;
}

// Times in the grid layout: arrow up/down moves a row
const GRID_COLUMNS = 4;
const GAP = 6;
let nextId = 0;

/**
 * Dropdown in the site's style, for places where the browser's own <select> list (drawn by the OS)
 * looks out of place. The list is fixed-positioned next to the button, so a dialog's scroll area
 * can't clip it; it opens upward when there's no room below. Keyboard: arrows, Home/End, Enter,
 * Escape, Tab. `layout="grid"` shows options as chips (times).
 */
@Component({
  selector: 'app-select-menu',
  templateUrl: './select-menu.html',
  styleUrl: './select-menu.scss',
  host: {
    '(document:pointerdown)': 'onOutside($event)',
    '(window:resize)': 'close()',
  },
})
export class SelectMenu<T> {
  private destroyRef = inject(DestroyRef);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  options = input.required<SelectOption<T>[]>();
  value = model<T | null>(null);
  placeholder = input('აირჩიეთ');
  /** Icon before the value */
  icon = input<string | null>(null);
  ariaLabel = input('');
  layout = input<'list' | 'grid'>('list');
  /** Icons for group headings */
  groups = input<SelectGroupInfo[]>([]);
  /** Accent color (CSS), e.g. the dialog's */
  accent = input('var(--primary)');

  readonly id = `select-menu-${nextId++}`;
  open = signal(false);
  active = signal(-1);
  position = signal<PanelPosition | null>(null);

  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private panel = viewChild<ElementRef<HTMLElement>>('panel');

  selectedIndex = computed(() => this.options().findIndex((o) => o.value === this.value()));
  selected = computed<SelectOption<T> | null>(() => this.options()[this.selectedIndex()] ?? null);

  sections = computed<Section<T>[]>(() => {
    const icons = new Map(this.groups().map((g) => [g.label, g.icon]));
    const sections: Section<T>[] = [];
    this.options().forEach((option, index) => {
      const label = option.group ?? null;
      let section = sections.find((s) => s.label === label);
      if (!section) {
        section = { label, icon: label ? icons.get(label) : undefined, items: [] };
        sections.push(section);
      }
      section.items.push({ option, index });
    });
    return sections;
  });

  private onScroll = (event: Event) => {
    // The list's own scrolling is fine; the page or dialog moving would leave it behind
    if (this.panel()?.nativeElement.contains(event.target as Node)) return;
    this.close();
  };

  constructor() {
    this.destroyRef.onDestroy(() => document.removeEventListener('scroll', this.onScroll, true));
  }

  optionId(index: number) {
    return `${this.id}-opt-${index}`;
  }

  toggle() {
    if (this.open()) this.close();
    else this.show();
  }

  show() {
    const button = this.trigger()?.nativeElement;
    if (!button || this.open()) return;
    this.position.set(this.place(button.getBoundingClientRect()));
    this.active.set(this.selectedIndex() >= 0 ? this.selectedIndex() : this.step(-1, 1));
    this.open.set(true);
    document.addEventListener('scroll', this.onScroll, true);
    // Bring the chosen option into view once the list is drawn
    requestAnimationFrame(() => this.revealActive());
  }

  close() {
    if (!this.open()) return;
    this.open.set(false);
    document.removeEventListener('scroll', this.onScroll, true);
  }

  choose(index: number) {
    const option = this.options()[index];
    if (!option || option.disabled) return;
    this.value.set(option.value);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  onOutside(event: PointerEvent) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  onKeydown(event: KeyboardEvent) {
    const grid = this.layout() === 'grid';
    const moves: Record<string, number> = grid
      ? { ArrowRight: 1, ArrowLeft: -1, ArrowDown: GRID_COLUMNS, ArrowUp: -GRID_COLUMNS }
      : { ArrowDown: 1, ArrowUp: -1 };

    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        this.show();
      }
      return;
    }
    if (event.key in moves) {
      event.preventDefault();
      this.moveActive(moves[event.key]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.active.set(event.key === 'Home' ? this.step(-1, 1) : this.step(this.options().length, -1));
      this.revealActive();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.choose(this.active());
    } else if (event.key === 'Escape') {
      // Only the list closes, not the dialog around it
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  /** Next enabled option from `from` in direction `dir` (±1), or the same index if there is none */
  private step(from: number, dir: number): number {
    const options = this.options();
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i;
    }
    return from;
  }

  private moveActive(delta: number) {
    const options = this.options();
    let target = Math.min(options.length - 1, Math.max(0, this.active() + delta));
    // Landed on a disabled one (past times): keep going the same way, else stay
    if (options[target]?.disabled) target = this.step(target, Math.sign(delta));
    if (!options[target]?.disabled) this.active.set(target);
    this.revealActive();
  }

  private revealActive() {
    const el = document.getElementById(this.optionId(this.active()));
    el?.scrollIntoView({ block: 'nearest' });
  }

  private place(rect: DOMRect): PanelPosition {
    const grid = this.layout() === 'grid';
    const preferred = grid ? 300 : 280;
    const width = Math.min(window.innerWidth - 2 * GAP, Math.max(rect.width, grid ? 290 : 220));
    // Wider than its button: line up with the button's right edge (buttons sit at the end of a row)
    const preferredLeft = width > rect.width ? rect.right - width : rect.left;
    const left = Math.max(GAP, Math.min(preferredLeft, window.innerWidth - width - GAP));
    const below = window.innerHeight - rect.bottom - 2 * GAP;
    const above = rect.top - 2 * GAP;
    const up = below < Math.min(preferred, 200) && above > below;
    return {
      left,
      width,
      maxHeight: Math.max(120, Math.min(preferred, up ? above : below)),
      top: up ? null : rect.bottom + GAP,
      bottom: up ? window.innerHeight - rect.top + GAP : null,
    };
  }
}
