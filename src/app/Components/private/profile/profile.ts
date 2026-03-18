import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StateStore } from '../../../Store/state.store';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  validators = signal(false);
  fb = inject(FormBuilder);
  stateStore = inject(StateStore);
  profileForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', Validators.required],
    subscription: ['', Validators.required],
    searchQuery: [[] as string[], [Validators.required, Validators.minLength(1)]],
    telegramChatId: ['', Validators.required],
  })

  constructor() {
    effect(() => {
      const profile = this.stateStore.profile();
      const loaded = this.stateStore.profileLoaded();

      if (loaded && profile) {
        this.profileForm.patchValue({
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          subscription: profile.subscription,
          telegramChatId: profile.telegramChatId,
          searchQuery: profile.searchQuery,
        });
      }
    });
  }
  isInvalid(name: string) {
    const control = this.profileForm.get(name);
    return !!(control && control.invalid && (control.touched || this.validators()));
  }

  addKeyword(event: any) {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();

    if (value) {
      const currentKeywords = this.profileForm.get('searchQuery')?.value as string[] || [];
      if (!currentKeywords.includes(value)) {
        this.profileForm.get('searchQuery')?.setValue([...currentKeywords, value]);
      }
      input.value = '';
    }
  }

  removeKeyword(index: number) {
    const currentKeywords = this.profileForm.get('searchQuery')?.value as string[] || [];
    const updatedKeywords = currentKeywords.filter((_, i) => i !== index);
    this.profileForm.get('searchQuery')?.setValue(updatedKeywords);
  }

  save() {
    this.validators.set(true);
    if (this.profileForm.valid) {
      this.stateStore.updateProfile(this.stateStore.profile()?.id, this.profileForm.value);
    }
  }
}
