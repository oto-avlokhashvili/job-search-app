import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { Job } from '../Core/Interfaces/jobs';
type State = {
    profile: User;
    jobsCount:number | 0;
    matchedJobsCount:number | 0;
    matchedJobs:Job[];
    matchedJobsPage:number | 0;
    matchedJobsLimit:number | 0;
    totalPages:number | 0;
    totalJobs:number | 0;
}


const initialState: State = {
    profile: {id: 0, firstName: '---', lastName: '---', email: '', subscription: 'BASIC', searchQuery: '---', createdAt: ''},
    jobsCount:0,
    matchedJobsCount:0,
    matchedJobs:[],
    matchedJobsPage:1,
    matchedJobsLimit:10,
    totalPages:0,
    totalJobs:0
}

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService)) => ({
        async loadProfile() {
            const profile = await firstValueFrom(authService.getUserProfile());
            patchState(store, { 
                profile 
            })
        },
        async loadJobs() {
            const res = await jobsService.getJobs();
            patchState(store, { jobsCount: res.count })
        },
        async loadMatchedJobs(id:number, page?:number) {
            const res = await jobsService.getUserMatchedJobs(id, page);            
            patchState(store, { matchedJobsCount: res.count, matchedJobs: res.sentJobs.map(el => el.job), totalJobs: page, totalPages: res.totalPages, matchedJobsPage: page })
        },
    })),
)