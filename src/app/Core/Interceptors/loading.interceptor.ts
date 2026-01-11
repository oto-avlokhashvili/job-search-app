import { HttpInterceptorFn } from '@angular/common/http';
import { LoadingService } from '../Services/loading.service';
import { inject } from '@angular/core';
import { finalize, skip } from 'rxjs';
import { skipLoading } from '../loading/skip-loading.component';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if(req.context.get(skipLoading)){
    return next(req);
  }
  const loadingService = inject(LoadingService);
  loadingService.loadingOn();
  return next(req).pipe(finalize(() => {
    loadingService.loadingOff();
  }))
  
};
