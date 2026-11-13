import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../../Core/Services/seo.service';
import { StateStore } from '../../../Store/state.store';

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

  ngOnInit() {
    this.seo.update({
      title: 'ჩვენ შესახებ | Job Up',
      description: 'Job Up აერთიანებს საქართველოს წამყვანი სამსახურის პორტალების ვაკანსიებს ერთ სივრცეში და AI აგენტის დახმარებით გეხმარება შესაფერისი სამსახურის პოვნაში.',
      path: '/about',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
