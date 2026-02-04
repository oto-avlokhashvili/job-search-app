import { CommonModule } from '@angular/common';
import { Component, Inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'app-qr-modal',
  imports: [MatDialogModule, QRCodeComponent, CommonModule],
  templateUrl: './qr-modal.html',
  styleUrl: './qr-modal.scss',
})
export class QrModal {

    isDarkMode = signal(localStorage.getItem('theme') === 'dark' || false);
    constructor(
    public dialogRef: MatDialogRef<QrModal>,
    @Inject(MAT_DIALOG_DATA) public data: { telegramLink: string }
  ) {}

  close() {
    this.dialogRef.close();
  }
}
