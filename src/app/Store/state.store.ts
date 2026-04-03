import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { Job } from '../Core/Interfaces/jobs';
import { Users } from '../Core/Services/users';
import { Ai } from '../Core/Services/ai';
type State = {
    profile: User;
    profileLoaded: boolean;
    jobsCount: number | 0;
    searchedJobsCount: number | 0;

    matchedJobsCount: number | 0;
    activeJobs: Job[];
    matchedJobs: Job[];
    searchedJobs: Job[];
    matchedJobsDashboard: Job[];
    matchedJobsPage: number | 0;
    matchedJobsLimit: number | 0;
    matchedPercentage: number | 0;

    totalPages: number | 0;
    totalJobs: number | 0;
}


const initialState: State = {
    profile: { id: 0, firstName: '---', lastName: '---', email: '', subscription: 'BASIC', searchQuery: [], createdAt: '' },
    profileLoaded: false,
    jobsCount: 0,
    searchedJobsCount: 0,

    matchedJobsCount: 0,
    activeJobs: [],
    matchedJobs: [],
    searchedJobs: [],
    matchedJobsDashboard: [],
    matchedJobsPage: 1,
    matchedJobsLimit: 10,
    matchedPercentage: 0,

    totalPages: 0,
    totalJobs: 0
}

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users), aiService = inject(Ai)) => ({
        async loadProfile() {
            const profile = await authService.getUserProfile()
            patchState(store, {
                profile, profileLoaded: true
            })
        },
        loadJobs(vacancy?: string[], page?: number) {
            jobsService.getJobs(vacancy, page).subscribe(res => {
                patchState(store, { searchedJobs: res.jobs });

                animateValue(0, res.counts.totalRecords, 400, v =>
                    patchState(store, { jobsCount: v })
                );
                animateValue(0, res.counts.filteredRecords, 400, v =>
                    patchState(store, { searchedJobsCount: v })
                );
                animateValue(0, (res.counts.filteredRecords / res.counts.totalRecords) * 100, 400, v =>
                    patchState(store, { matchedPercentage: Math.round(v) })
                );
            })
        },

        loadMatchedJobs(id: number, page?: number) {
            jobsService.getUserMatchedJobs(id, page).subscribe(res => {
                patchState(store, {
                    matchedJobsDashboard: res.page === 1 ? res.sentJobs.map(el => el.job) : store.matchedJobsDashboard(),
                    matchedJobs: res.sentJobs.map(el => el.job),
                    totalJobs: page,
                    totalPages: res.totalPages,
                    matchedJobsPage: page
                });

                animateValue(0, res.count, 400, v =>
                    patchState(store, { matchedJobsCount: v })
                );

            })
        },
        /* findJobsByQuery(queries: string[]) {
            jobsService.findByQuery(queries).subscribe(res => {
                patchState(store, {
                    searchedJobsCount: res?.length,
                });
            });
        }, */
        loadAllJobs(vacancy?: string[], page?: number) {
            jobsService.getJobs(vacancy, page).subscribe(res => {
                patchState(store, { activeJobs: res.jobs })
            })
        },
        updateProfile(id: number, data: any) {
            patchState(store, {
                profile: { ...store.profile(), ...data }
            });
            userService.getUserById(id, data).subscribe(res => {
                patchState(store, {
                    profile: res
                })
            })
        },
        addMatchedJobs(jobs: Job[]) {
            patchState(store, {
                matchedJobs: [...store.matchedJobs(), ...jobs]
            })
        },
        analyzeCvAndJobs() {
            aiService.analyzeCvAndJobs().subscribe({
                next: (res: any) => {
                    patchState(store, { matchedJobsDashboard: res.topJobs });
                },
                error: (err: any) => {
                    console.log(err);
                }
            });
        }
    })),
)

export function animateValue(start: number, end: number, duration: number, onUpdate: (val: number) => void) {
    const startTime = performance.now();
    const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        onUpdate(Math.round(start + (end - start) * eased));
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}