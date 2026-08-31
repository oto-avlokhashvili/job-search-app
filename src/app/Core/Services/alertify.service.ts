import { Injectable } from '@angular/core';
import alertify from 'alertifyjs'

@Injectable({
  providedIn: 'root'
})
export class AlertifyService {

  constructor() { }

  success(message: string) {
    alertify.success(message);
  }

  error(message: string) {
    alertify.error(message);
  }

  warning(message: string) {
    alertify.warning(message);
  }

  message(message: string) {
    alertify.message(message);
  }

  prompt(
    title: string,
    message: string,
    value: string,
    onOk: (evt: any, value: string) => void,
    onCancel?: () => void
  ) {
    alertify.prompt(title, message, value, onOk, onCancel);
  }

  confirm(
    title: string,
    message: string,
    onOk: () => void,
    onCancel?: () => void
  ) {
    alertify.confirm(title, message, onOk, onCancel);
  }
}

