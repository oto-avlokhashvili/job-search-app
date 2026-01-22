import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  http = inject(HttpClient);
  url = "http://localhost:3000"
  async getJobs() {
    const jobs$ = this.http.get(this.url + "/job/all")
    const jobs = await firstValueFrom(jobs$);
    return jobs;
  }
  async getUserMatchedJobs(id:number) {
    const jobs$ = this.http.get(this.url + `/sent-jobs/${id}`)
    const jobs = await firstValueFrom(jobs$);
    return jobs;
  }
}
