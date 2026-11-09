/**
 * Categories of the list's category filter. Keys match the API (job-search-api/src/job/job-category.ts),
 * which works them out from job titles and filters with ?category=<key>.
 */
export interface JobCategoryOption {
  key: string;
  label: string;
  /** Short label for the mobile chips */
  short: string;
  icon: string;
}

export const JOB_CATEGORIES: JobCategoryOption[] = [
  { key: 'sales', label: 'გაყიდვები', short: 'გაყიდვები', icon: 'storefront' },
  { key: 'finance', label: 'ფინანსები და ბანკი', short: 'ფინანსები', icon: 'account_balance' },
  { key: 'it', label: 'IT და პროგრამირება', short: 'IT', icon: 'code' },
  { key: 'customer-service', label: 'მომხმარებელთა მომსახურება', short: 'მომსახურება', icon: 'support_agent' },
  { key: 'hospitality', label: 'რესტორნები და სასტუმროები', short: 'რესტორნები', icon: 'restaurant' },
  { key: 'medicine', label: 'მედიცინა და ფარმაცია', short: 'მედიცინა', icon: 'medical_services' },
  { key: 'logistics', label: 'ლოგისტიკა და ტრანსპორტი', short: 'ლოგისტიკა', icon: 'local_shipping' },
  { key: 'engineering', label: 'ინჟინერია და მშენებლობა', short: 'ინჟინერია', icon: 'engineering' },
  { key: 'admin', label: 'ადმინისტრაცია და HR', short: 'ადმინისტრაცია', icon: 'badge' },
  { key: 'marketing', label: 'მარკეტინგი და დიზაინი', short: 'მარკეტინგი', icon: 'campaign' },
  { key: 'education', label: 'განათლება', short: 'განათლება', icon: 'school' },
  { key: 'legal', label: 'სამართალი', short: 'სამართალი', icon: 'gavel' },
  { key: 'services', label: 'სილამაზე, დასუფთავება, დაცვა', short: 'სერვისი', icon: 'spa' },
];

export function findJobCategory(key: string | null | undefined): JobCategoryOption | undefined {
  return JOB_CATEGORIES.find((c) => c.key === key);
}
