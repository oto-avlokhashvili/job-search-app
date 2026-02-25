import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoundJobs } from './found-jobs';

describe('FoundJobs', () => {
  let component: FoundJobs;
  let fixture: ComponentFixture<FoundJobs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoundJobs]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FoundJobs);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
