import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../../Core/Services/seo.service';
import { StateStore } from '../../../Store/state.store';
import { VACANCY_TOTAL_PHRASE } from '../../../Core/Constants/vacancy-total';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './about.html',
  // Same layout as the privacy policy and terms pages.
  styleUrl: '../privacy-policy/privacy-policy.scss',
})
export class About implements OnInit {
  private seo = inject(SeoService);
  stateStore = inject(StateStore);
  readonly vacancyTotalPhrase = VACANCY_TOTAL_PHRASE;

  ngOnInit() {
    this.seo.update({
      title: 'ჩვენ შესახებ — AI, რომელიც ვაკანსიებს ეძებს | Job Up',
      description: 'Job Up-ის AI მთელ ინტერნეტში ეძებს ვაკანსიებს საქართველოში და თქვენს CV-ზე მორგებულ შეთავაზებებს თავად გიგზავნით.',
      path: '/about',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
