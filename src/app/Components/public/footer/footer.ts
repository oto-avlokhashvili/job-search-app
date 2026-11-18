import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SiteModalsService } from '../../../Core/Services/site-modals.service';
import { JOBUP_LOGO } from '../../../Store/state.store';

/**
 * The site footer (about, privacy, terms and the other inner pages). Home and /employers hide it and
 * show the same row in their hero's bottom corners instead.
 */
@Component({
  selector: 'app-footer',
  imports: [RouterModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  modals = inject(SiteModalsService);
  readonly jobUpLogo = JOBUP_LOGO;
  readonly year = new Date().getFullYear();
}
