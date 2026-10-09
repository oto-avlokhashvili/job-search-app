import { Component, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';

/**
 * "Write us a message" block for the /contact page. Same markup and styles as the
 * contact section at the bottom of the home page (kept as a copy there).
 */
@Component({
  selector: 'app-contact-section',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './contact-section.html',
  styleUrl: './contact-section.scss',
  host: { '[class.as-page]': 'asPage()' },
})
export class ContactSection {
  private http = inject(HttpClient);
  private alertify = inject(AlertifyService);

  /** On the /contact page the heading is the page's h1 and the block clears the fixed header. */
  asPage = input(false);

  sending = signal(false);

  contactEmail = new FormControl<string>('', {
    validators: [Validators.required, Validators.email],
    nonNullable: true,
  });
  contactComment = new FormControl<string>('', {
    validators: [Validators.required],
    nonNullable: true,
  });

  sendContactEmail() {
    if (this.contactEmail.invalid || this.contactComment.invalid) {
      this.alertify.error('გთხოვთ შეავსოთ ყველა ველი სწორად');
      return;
    }

    this.sending.set(true);
    const payload = { email: this.contactEmail.value, comment: this.contactComment.value };
    this.http.post(`${environment.apiUrl}/email/contact`, payload).subscribe({
      next: () => {
        this.sending.set(false);
        this.alertify.success('შეტყობინება წარმატებით გაიგზავნა');
        this.contactEmail.reset();
        this.contactComment.reset();
      },
      error: (err) => {
        this.sending.set(false);
        console.error('Error sending contact email:', err);
        this.alertify.error(
          err?.status === 429
            ? 'ძალიან ბევრი მოთხოვნაა. გთხოვთ სცადოთ ცოტა ხანში.'
            : 'შეტყობინების გაგზავნისას დაფიქსირდა შეცდომა',
        );
      },
    });
  }
}
