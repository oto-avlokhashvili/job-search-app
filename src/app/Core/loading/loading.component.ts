import { Component, inject, signal, Signal, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
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
        'Initializing systems',
        'Loading AI core',
        'Calibrating engines',
        'T-minus 3... 2... 1...'
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
        clearInterval(this.interval);
    }

    @ViewChild('starsContainer') starsContainer!: ElementRef;

    ngAfterViewInit() {
        for (let i = 0; i < 60; i++) {
            const s = document.createElement('div');
            s.className = 'star-dot';
            s.style.left = Math.random() * 600 + 'px';
            s.style.top = Math.random() * 340 + 'px';
            s.style.animationDelay = (Math.random() * 2) + 's';
            s.style.opacity = String(0.3 + Math.random() * 0.7);
            this.starsContainer?.nativeElement?.appendChild(s);
        }
    }
}