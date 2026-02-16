import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { Job } from '../Core/Interfaces/jobs';
import { Users } from '../Core/Services/users';
type State = {
    profile: User;
    profileLoaded: boolean;
    jobsCount: number | 0;
    searchedJobsCount: number | 0;

    matchedJobsCount: number | 0;
    matchedJobs: Job[];
    matchedJobsDashboard: Job[];
    matchedJobsPage: number | 0;
    matchedJobsLimit: number | 0;

    totalPages: number | 0;
    totalJobs: number | 0;
}


const initialState: State = {
    profile: { id: 0, firstName: '---', lastName: '---', email: '', subscription: 'BASIC', searchQuery: [], createdAt: '' },
    profileLoaded: false,
    jobsCount: 0,
    searchedJobsCount: 0,

    matchedJobsCount: 0,
    matchedJobs: [],
    matchedJobsDashboard: [],
    matchedJobsPage: 1,
    matchedJobsLimit: 10,

    totalPages: 0,
    totalJobs: 0
}

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users)) => ({
        async loadProfile() {
            const profile = await authService.getUserProfile()
            patchState(store, {
                profile, profileLoaded: true
            })
        },
        loadJobs() {
            jobsService.getJobs().subscribe(res => {
                patchState(store, { jobsCount: res.count })
            })
        },
        loadMatchedJobs(id: number, page?: number) {
            jobsService.getUserMatchedJobs(id, page).subscribe(res => {
                patchState(store, { matchedJobsCount: res.count, matchedJobsDashboard: res.page === 1 ? res.sentJobs.map(el => el.job) : store.matchedJobsDashboard(), matchedJobs: res.sentJobs.map(el => el.job), totalJobs: page, totalPages: res.totalPages, matchedJobsPage: page })
            })
        },
        findJobsByQuery(queries: string[]) {
            jobsService.findByQuery(queries).subscribe(res => {
                patchState(store, {
                    searchedJobsCount: res?.length
                });
            });
        },

        updateProfile(id: number, data: any) {
            userService.getUserById(id, data).subscribe(res => {
                patchState(store, {
                    profile: res
                })
            })
        }
    })),
)