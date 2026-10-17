const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { status: number; data: unknown };
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Auth
export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request<{ user: AuthUser }>('/auth/me'),

  // Dashboard
  getDashboardSummary: () => request<DashboardSummary>('/dashboard/summary'),

  // Items
  getItems: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ items: WorkItem[]; nextCursor: string | null; hasMore: boolean }>(
      `/items?${qs}`
    );
  },

  getItem: (id: string) => request<{ item: WorkItem }>(`/items/${id}`),

  createItem: (data: CreateItemData, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return request<{ item: WorkItem }>('/items', {
      method: 'POST',
      body: JSON.stringify(data),
      headers,
    });
  },

  updateItem: (id: string, data: UpdateItemData) =>
    request<{ item: WorkItem }>(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  claimItem: (id: string, version: number) =>
    request<{ item: WorkItem }>(`/items/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  transitionItem: (id: string, to: string, version: number, reason?: string) =>
    request<{ item: WorkItem }>(`/items/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to, version, reason }),
    }),

  // Comments
  getComments: (itemId: string) =>
    request<{ comments: Comment[] }>(`/items/${itemId}/comments`),

  addComment: (itemId: string, body: string) =>
    request<{ comment: Comment }>(`/items/${itemId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  // Activity
  getActivity: (itemId: string, cursor?: string) => {
    const qs = cursor ? `?cursor=${cursor}&limit=25` : '?limit=25';
    return request<{ events: ActivityEvent[]; nextCursor: string | null; hasMore: boolean }>(
      `/items/${itemId}/activity${qs}`
    );
  },
};

// Types
export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Membership {
  teamId: string;
  teamName: string;
  role: 'Viewer' | 'Member' | 'Lead' | 'Admin';
}

export interface AuthUser extends User {
  memberships: Membership[];
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  creatorName: string;
  teamId: string;
  teamName: string;
  dueAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemData {
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  teamId: string;
  assigneeId?: string;
  dueAt?: string;
}

export interface UpdateItemData {
  title?: string;
  description?: string;
  priority?: string;
  dueAt?: string | null;
  assigneeId?: string | null;
  version: number;
}

export interface Comment {
  id: string;
  workItemId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  workItemId: string;
  actorId: string;
  actorName: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardSummary {
  assignedToMe: number;
  unassignedUrgent: number;
  awaitingMyApproval: number;
  totalOpen: number;
  totalInProgress: number;
  totalResolved: number;
  recentActivity: Array<{
    id: string;
    workItemId: string;
    workItemTitle: string;
    eventType: string;
    payload: Record<string, unknown>;
    actorName: string;
    createdAt: string;
  }>;
}
