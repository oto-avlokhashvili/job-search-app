import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { AiMatchedJobsResponse, Job, SentJobsResponse } from '../Core/Interfaces/jobs';
import { Users } from '../Core/Services/users';
import { Ai } from '../Core/Services/ai';
import { Cv } from '../Core/Services/cv';
type State = {
    profile: User;
    profileLoaded: boolean;

    matchedJobsCount: number | 0;
    sentJobsCount: number | 0;
    matchedJobsDashboard: AiMatchedJobsResponse;
    sentJobs: SentJobsResponse;
    searchQuery: string[];

    userCv: any;
    cvLoading: boolean;

    chatMatchedJobs: any[];
    chatShowJobs: boolean;
    chatAiSummary: string;
    chatAiDetectedRole: string;
    chatAiLocationPreference: string;
    chatAiPrimarySkills: string[];
}


const initialState: State = {
    profile: { id: 0, firstName: '---', lastName: '---', email: '', subscription: 'BASIC', searchQuery: [], createdAt: '' },
    profileLoaded: false,
    matchedJobsCount: 0,
    sentJobsCount: 0,
    searchQuery: [],

    sentJobs: { sentJobs: [], total: 0, page: 1, lastPage: 1 },
    matchedJobsDashboard: { data: [], total: 0, page: 1, lastPage: 1 },

    userCv: null,
    cvLoading: false,

    chatMatchedJobs: [],
    chatShowJobs: false,
    chatAiSummary: '',
    chatAiDetectedRole: '',
    chatAiLocationPreference: '',
    chatAiPrimarySkills: [],
}

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users), aiService = inject(Ai), cvService = inject(Cv)) => ({
        async loadProfile() {
            const profile = await authService.getUserProfile()
            patchState(store, {
                profile, profileLoaded: true
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
        getCv() {
            patchState(store, { cvLoading: true });
            cvService.getCV().subscribe({
                next: (res) => {
                    patchState(store, { userCv: res, cvLoading: false, searchQuery: res.summary?.searchQueries ?? [] });
                },
                error: (err) => {
                    patchState(store, { cvLoading: false });
                    console.error('Error fetching CV:', err);
                }
            });
        },
        updateSearchQueries(searchQueries: string[]) {
            cvService.updateSearchQueries(searchQueries).subscribe({
                next: (res) => {
                    patchState(store, { searchQuery: res.summary?.searchQueries ?? [] });
                },
                error: (err) => {
                    console.error('Error updating search queries:', err);
                }
            });
        },
        updateChatSearchResults(jobs: any[], summary: string, role: string, location: string, skills: string[], show: boolean) {
            patchState(store, {
                chatMatchedJobs: jobs,
                chatAiSummary: summary,
                chatAiDetectedRole: role,
                chatAiLocationPreference: location,
                chatAiPrimarySkills: skills,
                chatShowJobs: show
            });
        },
        deleteCv() {
            patchState(store, { cvLoading: true });
            cvService.deleteCV().subscribe({
                next: () => {
                    patchState(store, { userCv: null, cvLoading: false });
                },
                error: (err) => {
                    patchState(store, { cvLoading: false });
                    console.error('Error deleting CV:', err);
                }
            });
        },
        uploadCv(file: File) {
            patchState(store, { cvLoading: true });
            cvService.upload(file).subscribe({
                next: (res) => {
                    patchState(store, { userCv: res, cvLoading: false });
                },
                error: (err) => {
                    patchState(store, { cvLoading: false });
                    console.error('Error uploading CV:', err);
                }
            });
        },
        loadAIMatchedJobs(page: number = 1, limit: number = 5) {
            aiService.getAiMatchedJobs(page, limit).subscribe({
                next: (res: AiMatchedJobsResponse) => {
                    patchState(store, {
                        matchedJobsDashboard: res,
                    });

                    animateValue(0, res.total, 400, v =>
                        patchState(store, { matchedJobsCount: v })
                    );
                },
                error: (err: any) => {
                    console.error('Error loading AI matched jobs:', err);
                }
            });
        },
        loadSentJobs(page: number = 1, take: number = 10) {
            jobsService.getUserSentJobs(page, take).subscribe({
                next: (res: any) => {
                    patchState(store, {
                        sentJobs: res
                    });
                    animateValue(0, res.total, 400, v =>
                        patchState(store, { sentJobsCount: v })
                    );
                },
                error: (err: any) => {
                    console.error('Error loading sent jobs:', err);
                }

            })
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