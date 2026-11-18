import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * The Job Up logo starts over: on home it tells the page to drop its search (query, filters,
 * results); elsewhere the header just opens home, which starts clean anyway.
 */
@Injectable({ providedIn: 'root' })
export class HomeResetService {
  private readonly requests = new Subject<void>();
  readonly resets = this.requests.asObservable();

  request() {
    this.requests.next();
  }
}
