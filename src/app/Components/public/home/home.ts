import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  authService = inject(AuthService);

  contactEmail = new FormControl<string>('', {
    validators: [Validators.required, Validators.email],
    nonNullable: true
  });
  contactComment = new FormControl<string>('', {
    validators: [Validators.required],
    nonNullable: true
  });

  private http = inject(HttpClient);
  private alertify = inject(AlertifyService);

  ngOnInit() {
    // Initialization if any
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  sendContactEmail() {
    if (this.contactEmail.invalid || this.contactComment.invalid) {
      this.alertify.error('გთხოვთ შეავსოთ ყველა ველი სწორად');
      return;
    }

    const payload = {
      email: this.contactEmail.value,
      comment: this.contactComment.value
    };

    this.http.post(`${environment.apiUrl}/email/contact`, payload).subscribe({
      next: () => {
        this.alertify.success('შეტყობინება წარმატებით გაიგზავნა');
        this.contactEmail.reset();
        this.contactComment.reset();
      },
      error: (err) => {
        console.error('Error sending contact email:', err);
        this.alertify.error('შეტყობინების გაგზავნისას დაფიქსირდა შეცდომა');
      }
    });
  }
}
