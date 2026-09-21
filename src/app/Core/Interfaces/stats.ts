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
}
