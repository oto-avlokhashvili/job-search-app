import { Component, inject, OnInit } from '@angular/core';
import { SeoService } from '../../../Core/Services/seo.service';
import { ContactSection } from '../contact-section/contact-section';

/** /contact: the same "write us a message" block as the bottom of the home page. */
@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ContactSection],
  template: `<main><app-contact-section [asPage]="true" /></main>`,
})
export class Contact implements OnInit {
  private seo = inject(SeoService);

  ngOnInit() {
    this.seo.update({
      title: 'კონტაქტი | Job Up',
      description: 'დაუკავშირდით Job Up-ის გუნდს — კითხვები, შენიშვნები ან თანამშრომლობის შეთავაზებები. ელ-ფოსტა: jobup.ge@gmail.com',
      path: '/contact',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
}
