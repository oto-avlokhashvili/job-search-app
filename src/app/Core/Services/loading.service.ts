import {Injectable, signal} from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class LoadingService {
  #loadingCount = signal<number>(0);
  loading = signal<boolean>(false);

  loadingOn() {
    this.#loadingCount.update(count => count + 1);
    this.loading.set(true);
  }

  loadingOff() {
    this.#loadingCount.update(count => Math.max(0, count - 1));
    if (this.#loadingCount() === 0) {
      this.loading.set(false);
    }
  }
}
