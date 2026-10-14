'use client';

import { Asset } from '@/shared/domain';
import type { WorkspaceData } from '@/shared/models';
import RequestsView from '@/frontend/features/requests/requests-view';
import StocktakesView from '@/frontend/features/stocktakes/stocktakes-view';
import ReportsView from '@/frontend/features/reports/reports-view';
import AuditView from '@/frontend/features/audit/audit-view';
import UsersView from '@/frontend/features/users/users-view';

export default function Operations({
  view,
  data,
  open,
  write,
  busy,
  revision,
  select
}: {
  view: string;
  data: WorkspaceData;
  open: (k: string, a?: Record<string, unknown>) => void;
  write: (b: Record<string, unknown>) => Promise<unknown>;
  busy: boolean;
  revision: number;
  select: (a: Asset) => void;
}) {

  if (view === 'requests') {
    return <RequestsView data={data} open={open} />;
  }

  if (view === 'stocktakes') {
    return (
      <StocktakesView
        data={data}
        open={open}
        write={write}
        busy={busy}
        revision={revision}
      />
    );
  }

  if (view === 'reports') {
    return (
      <ReportsView
        data={data}
        select={select}
      />
    );
  }

  if (view === 'audit') {
    return <AuditView data={data} select={select} open={open} />;
  }

  if (view === 'users' && data.me.role === 'admin') {
    return <UsersView data={data} open={open} write={write} />;
  }

  return null;
}
