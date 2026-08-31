import { Component, inject, signal, Signal, OnInit, OnDestroy } from "@angular/core";
import { LoadingService } from "../Services/loading.service";
import { CommonModule } from "@angular/common";

@Component({
    selector: "loading",
    templateUrl: "./loading.component.html",
    styleUrls: ["./loading.component.scss"],
    imports: [CommonModule]
})
export class LoadingIndicatorComponent implements OnInit, OnDestroy {
    private loadingService = inject(LoadingService);
    loading: Signal<boolean> = this.loadingService.loading;

    private readonly statusMessages = [
        'მონაცემების ჩატვირთვა...',
        'მიმდინარეობს დამუშავება...',
        'გთხოვთ დაელოდოთ...'
    ];

    statusMessage = signal(this.statusMessages[0]);
    private interval?: ReturnType<typeof setInterval>;

    ngOnInit() {
        let i = 0;
        this.interval = setInterval(() => {
            i = (i + 1) % this.statusMessages.length;
            this.statusMessage.set(this.statusMessages[i]);
        }, 1400);
    }

    ngOnDestroy() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }
}