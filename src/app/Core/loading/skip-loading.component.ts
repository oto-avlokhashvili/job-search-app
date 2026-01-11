import { HttpContextToken } from "@angular/common/http";

export const skipLoading = new HttpContextToken(() => false)