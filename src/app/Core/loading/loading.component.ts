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
        'სისტემის ინიციალიზაცია...',
        'ხელოვნური ინტელექტის მომზადება...',
        'მონაცემთა ბაზის ანალიზი...',
        'უსაფრთხო კავშირის დამყარება...'
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
        if (!this.starsContainer) return;
        for (let i = 0; i < 40; i++) {
            const s = document.createElement('div');
            s.className = 'star-dot';
            s.style.left = Math.random() * 100 + 'vw';
            s.style.top = Math.random() * 100 + 'vh';
            s.style.animationDelay = (Math.random() * 3) + 's';
            s.style.opacity = String(0.2 + Math.random() * 0.8);
            this.starsContainer.nativeElement.appendChild(s);
        }
    }
}