export interface AggregatorItem {
  id: string;
  name: string;
  active: boolean;
}

export interface SystemStats {
  activeAgents: number;
  activeUsers: number;
  activeAggregators: number;
  activeVacancies: number;
  uploadedCvs: number;
  systemStatus: string;
  syncedPortals: number;
  avgCalculationTimeSeconds: number;
  aggregators: AggregatorItem[];
  /** Optional so an older API without this field doesn't break the page. */
  portalCounts?: PortalCounts;
}

export interface PortalCounts {
  jobsGe: number;
  hrGe: number;
  aworkGe: number;
  myjobsGe: number;
  linkedin: number;
}
