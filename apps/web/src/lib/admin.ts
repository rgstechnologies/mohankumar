'use client';

/** Super-admin console API — all routes require a platform staff account. */

import { api } from './api';

export interface AdminSubscription {
  planCode: string;
  planName: string;
  status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | null;
  rawStatus?: string;
  startsAt?: string;
  expiresAt: string | null;
  notes?: string | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isBlocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  membershipCount: number;
  ownedCompanies: { id: string; name: string }[];
  subscription: AdminSubscription | null;
}

export interface AdminOverview {
  totalUsers: number;
  newUsers30d: number;
  trialUsers: number;
  paidUsers: number;
  expiredUsers: number;
  blockedUsers: number;
  noPlanUsers: number;
  totalCompanies: number;
  planDistribution: { code: string; name: string; users: number }[];
  recentUsers: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    lastLoginAt: string | null;
    subscription: AdminSubscription | null;
  }[];
}

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  maxCompanies: number;
  maxBranches: number;
  maxMembers: number;
  trialDays: number;
  features: Record<string, boolean>;
  isActive: boolean;
  sortOrder: number;
  subscribers: number;
}

export const fetchAdminOverview = () => api.get<AdminOverview>('/admin/overview');

export const fetchAdminUsers = (q?: string, status?: string) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const suffix = params.toString() ? `?${params}` : '';
  return api.get<AdminUserRow[]>(`/admin/users${suffix}`);
};

export const updateAdminUser = (
  userId: string,
  payload: { isBlocked?: boolean; isSuperAdmin?: boolean },
) => api.patch<AdminUserRow>(`/admin/users/${userId}`, payload);

export const updateAdminSubscription = (
  userId: string,
  payload: { planCode: string; status?: string; expiresAt?: string | null; notes?: string },
) => api.patch<AdminSubscription & { userId: string }>(
  `/admin/users/${userId}/subscription`,
  payload,
);

export const fetchAdminPlans = () => api.get<PlanRow[]>('/admin/plans');

export const createAdminPlan = (payload: Partial<PlanRow>) =>
  api.post<PlanRow>('/admin/plans', payload);

export const updateAdminPlan = (planId: string, payload: Partial<PlanRow>) =>
  api.patch<PlanRow>(`/admin/plans/${planId}`, payload);

export interface ReferralCodeRow {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
}

export const fetchAdminReferralCodes = () =>
  api.get<ReferralCodeRow[]>('/admin/referral-codes');

export const createAdminReferralCode = (payload: {
  code: string;
  description?: string;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  maxUses?: number;
  expiresAt?: string | null;
}) => api.post<ReferralCodeRow>('/admin/referral-codes', payload);

export const updateAdminReferralCode = (
  id: string,
  payload: Partial<{ isActive: boolean; discountValue: number; maxUses: number | null; expiresAt: string | null }>,
) => api.patch<ReferralCodeRow>(`/admin/referral-codes/${id}`, payload);
