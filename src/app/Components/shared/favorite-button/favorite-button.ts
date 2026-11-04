import { Component, computed, inject, input } from '@angular/core';
import { FavoritesService } from '../../../Core/Services/favorites.service';

/**
 * Heart toggle for saving a vacancy. Works inside links and clickable cards: the click
 * never reaches them. `icon` is the round heart for lists, `action` the labelled button.
 */
@Component({
  selector: 'app-favorite-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="fav-btn"
      [class.action]="variant() === 'action'"
      [class.active]="active()"
      [attr.aria-pressed]="active()"
      [attr.aria-label]="label()"
      [title]="label()"
      (click)="onClick($event)"
    >
      <span class="material-symbols-outlined fav-icon">favorite</span>
      @if (variant() === 'action') {
        <span class="fav-text">{{ active() ? 'შენახულია' : 'შენახვა' }}</span>
      }
    </button>
  `,
  styleUrl: './favorite-button.scss',
})
export class FavoriteButton {
  private favorites = inject(FavoritesService);

  jobId = input.required<number>();
  variant = input<'icon' | 'action'>('icon');

  active = computed(() => this.favorites.isFavorite(this.jobId()));
  label = computed(() => (this.active() ? 'შენახულიდან წაშლა' : 'ვაკანსიის შენახვა'));

  onClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggle(this.jobId());
  }
}
