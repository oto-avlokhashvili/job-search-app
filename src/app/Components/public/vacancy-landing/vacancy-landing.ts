import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { Job, VacancyItem } from '../../../Core/Interfaces/jobs';
import { JobsService } from '../../../Core/Services/jobs-service';
import { SeoService, SITE_URL } from '../../../Core/Services/seo.service';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
import { getLandingPage, LANDING_PAGES, LandingPage } from '../../../Core/Utils/landing-pages';
import { detectJobSource, formatJobDate } from '../../../Store/state.store';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';

interface Faq {
  q: string;
  a: string;
}

const PAGE_SIZE = 30;
// The public API refuses anonymous requests beyond page 5.
const MAX_PUBLIC_PAGE = 5;

@Component({
  selector: 'app-vacancy-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './vacancy-landing.html',
  styleUrl: './vacancy-landing.scss',
})
export class VacancyLanding implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private jobsService = inject(JobsService);
  private seo = inject(SeoService);
  private dialog = inject(MatDialog);

  landing = signal<LandingPage | null>(null);
  jobs = signal<VacancyItem[]>([]);
  total = signal(0);
  loading = signal(true);
  appending = signal(false);
  error = signal(false);
  private page = signal(1);
  readonly skeletonCards = [1, 2, 3, 4, 5, 6];
  private paramSub?: Subscription;
  private jobsSub?: Subscription;

  hasMore = computed(() => this.jobs().length < this.total() && this.page() < MAX_PUBLIC_PAGE);

  /** Only city pages show a count: keyword totals include description matches. */
  showCount = computed(() => this.landing()?.kind === 'city' && this.total() > 0);

  cities = computed(() => this.related('city'));
  categories = computed(() => this.related('category'));
  types = computed(() => this.related('type'));

  /** Same filter on the main list page, where users get every filter control. */
  allFiltersLink = computed(() => {
    const filter = this.landing()?.filter ?? {};
    return filter.location ? { location: filter.location } : { search: filter.query };
  });

  faqs = computed<Faq[]>(() => {
    const page = this.landing();
    if (!page) return [];
    const faqs: Faq[] = [];
    if (page.kind === 'city' && this.total() > 0) {
      faqs.push({
        q: `რამდენი აქტიური ვაკანსიაა ${page.inCity}?`,
        a: `ამ მომენტში Job Up-ზე ${page.inCity} ${this.total()} აქტიური ვაკანსიაა. სია ყოველდღიურად ახლდება.`,
      });
    }
    faqs.push(
      {
        q: 'როგორ გავაგზავნო განაცხადი?',
        a: 'გახსენით თქვენთვის საინტერესო ვაკანსია, გაეცანით მოთხოვნებს და მიჰყევით დამსაქმებლის მიერ მითითებულ ინსტრუქციას — ელ-ფოსტით ან ორიგინალ განცხადებაზე გადასვლით.',
      },
      {
        q: 'რამდენად ხშირად ახლდება ვაკანსიები?',
        a: 'ვაკანსიები ყოველდღიურად ახლდება — Job Up ავტომატურად აგროვებს ახალ განცხადებებს Jobs.ge, HR.ge, Awork.ge და Myjobs.ge-დან.',
      },
      {
        q: 'შემიძლია ახალი ვაკანსიების შესახებ შეტყობინების მიღება?',
        a: 'დიახ — ატვირთეთ CV და Job Up-ის AI აგენტი თქვენს პროფილს შესაბამის ახალ ვაკანსიებს Telegram-ით ან ელ-ფოსტით გამოგიგზავნით.',
      },
    );
    return faqs;
  });

  ngOnInit() {
    // The component is reused when navigating between landing pages, so react to each slug.
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const page = getLandingPage(params.get('slug'));
      if (!page) return; // the route matcher only lets known slugs through
      this.landing.set(page);
      this.applySeo(page);
      this.load(false);
    });
  }

  ngOnDestroy() {
    this.paramSub?.unsubscribe();
    this.jobsSub?.unsubscribe();
  }

  loadMore() {
    if (this.hasMore() && !this.appending()) {
      this.load(true);
    }
  }

  getJobSlug(job: VacancyItem): string {
    return generateJobSlug(job.vacancy, job.company, job.id);
  }

  openPublicCvModal() {
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  private load(append: boolean) {
    const page = this.landing();
    if (!page) return;

    const nextPage = append ? this.page() + 1 : 1;
    if (append) {
      this.appending.set(true);
    } else {
      // Clear the previous landing page's results so its count/jobs don't linger
      // while navigating between landing pages.
      this.jobs.set([]);
      this.total.set(0);
      this.loading.set(true);
      this.error.set(false);
    }

    this.jobsSub?.unsubscribe();
    this.jobsSub = this.jobsService
      .getJobs(page.filter.query ?? '', nextPage, 'all', page.filter.location ?? 'all', '', 'all', PAGE_SIZE)
      .subscribe({
        next: (res) => {
          const mapped = (res.jobs || []).map((job) => this.toVacancyItem(job));
          this.page.set(nextPage);
          this.jobs.set(append ? [...this.jobs(), ...mapped] : mapped);
          this.total.set(res.counts?.filteredRecords || 0);
          this.loading.set(false);
          this.appending.set(false);
          if (!append) {
            this.seo.addJsonLd(this.faqSchema());
          }
        },
        error: (err) => {
          console.error('Error loading landing page jobs:', err);
          this.loading.set(false);
          this.appending.set(false);
          if (!append) this.error.set(true);
        },
      });
  }

  private applySeo(page: LandingPage) {
    const url = `${SITE_URL}/vacancies/${page.slug}`;
    this.seo.update({ title: page.title, description: page.description, path: `/vacancies/${page.slug}` });
    this.seo.addJsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ვაკანსიები', item: `${SITE_URL}/vacancies` },
        { '@type': 'ListItem', position: 2, name: page.h1, item: url },
      ],
    });
  }

  private faqSchema(): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: this.faqs().map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    };
  }

  private related(kind: LandingPage['kind']): LandingPage[] {
    const current = this.landing()?.slug;
    return LANDING_PAGES.filter((p) => p.kind === kind && p.slug !== current);
  }

  private toVacancyItem(job: Job): VacancyItem {
    return {
      id: job.id,
      vacancy: job.vacancy,
      company: job.company,
      location: job.location || 'Remote',
      source: detectJobSource(job.source || '', job.link || '', job.company),
      salaryRange: extractSalary(job),
      publishDate: formatJobDate(job.publishDate),
      deadline: job.deadline ? formatJobDate(job.deadline) : '',
      matchScore: job.match || 0,
      link: job.link || '/jobs',
    };
  }
}
