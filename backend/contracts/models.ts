import type { Asset, Role } from './domain';

// JSON response contracts. Database string fields stay strings unless the
// service validates a narrower value before returning them.
export interface RequestRecord {
  id: string;
  assetId: string;
  assetVersion: number;
  kind: string;
  status: string;
  reason: string;
  payload: string;
  chain: string;
  stage: number;
  version: number;
  actor: string;
  createdAt: string;
  code: string;
  name: string;
}

export interface ApprovalRecord {
  id: string;
  requestId: string;
  stage: number;
  actor: string;
  actorName: string;
  decision: string;
  note: string;
  createdAt: string;
}

export interface StocktakeRound {
  id: string;
  name: string;
  year: number;
  status: string;
  total: number;
  checked: number;
  createdAt: string;
  closedAt: string | null;
}

export interface StocktakeItem {
  id: string;
  roundId: string;
  assetId: string;
  code: string;
  name: string;
  snapshot: string;
  quantity: number | null;
  result: string;
  checkedAt: string | null;
  notes: string;
  actor: string | null;
}

export interface StocktakeResponse {
  items: StocktakeItem[];
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  branch?: string | null;
  // Persistence returns integer flags (0/1), not JSON booleans.
  active: number;
  createdAt: string;
  isOnline?: boolean;
}

export interface InviteRecord {
  email: string;
  name: string;
  role: string;
  branch?: string | null;
  active: number;
}

export interface AuditRecord {
  id: string;
  actor: string;
  actorName: string;
  action: string;
  assetId: string | null;
  before: string;
  after: string;
  reason: string;
  createdAt: string;
}

export interface ImportFileRecord {
  id: string;
  name: string;
  hash: string;
  objectKey: string;
  rowCount: number;
  createdAt: string;
  actor: string;
}

export interface RepairRecord {
  id: string;
  assetId: string;
  requestId: string | null;
  repairedBy: string;
  costSatang: number;
  result: string;
  actor: string;
  createdAt: string;
}

export interface CurrentUser extends UserRecord {
  role: Role;
}

export interface WorkspaceData {
  me: CurrentUser;
  assets: Asset[];
  requests: RequestRecord[];
  rounds: StocktakeRound[];
  users: UserRecord[];
  invites: InviteRecord[];
  events: AuditRecord[];
  imports: ImportFileRecord[];
  settings: Record<string, string>;
  approvals: ApprovalRecord[];
}
