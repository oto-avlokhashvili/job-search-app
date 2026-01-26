import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SentJobs } from './sent-jobs';

describe('SentJobs', () => {
  let component: SentJobs;
  let fixture: ComponentFixture<SentJobs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SentJobs]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SentJobs);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
