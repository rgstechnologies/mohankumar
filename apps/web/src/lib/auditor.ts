import { api } from './api';

export const BILLING_TYPES = [
  'one_time',
  'monthly',
  'annual',
  'retainer',
  'bundle',
  'custom',
] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export interface AuditorProfile {
  id: string;
  displayName: string;
  firmName: string | null;
  tagline: string | null;
  bio: string | null;
  experienceYrs: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  logo: string | null;
  isPublished: boolean;
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
}

export interface TierFeature {
  id: string;
  label: string;
  included: boolean;
  sortOrder: number;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  gstApplicable: boolean;
  gstPercent: number;
  description: string | null;
  deliveryTimeline: string | null;
  revisions: number | null;
  prioritySupport: boolean;
  dedicatedConsultant: boolean;
  billingType: string;
  isActive: boolean;
  sortOrder: number;
  features: TierFeature[];
}

export interface AuditorService {
  id: string;
  name: string;
  category: string | null;
  shortDesc: string | null;
  detailDesc: string | null;
  image: string | null;
  deliveryTime: string | null;
  isActive: boolean;
  sortOrder: number;
  tiers: PricingTier[];
  startingFrom: number | null;
}

export const fetchMyAuditor = () => api.get<AuditorProfile | null>('/auditors/me');

export const createAuditor = (body: Partial<AuditorProfile>) =>
  api.post<AuditorProfile>('/auditors', body);

export const updateAuditor = (body: Partial<AuditorProfile>) =>
  api.patch<AuditorProfile>('/auditors/me', body);

export const fetchMyServices = () => api.get<AuditorService[]>('/auditors/me/services');

export const createService = (body: Record<string, unknown>) =>
  api.post<AuditorService>('/auditors/me/services', body);

export const updateService = (id: string, body: Record<string, unknown>) =>
  api.patch<AuditorService>(`/auditors/me/services/${id}`, body);

export const deleteService = (id: string) =>
  api.delete(`/auditors/me/services/${id}`);

export const createTier = (serviceId: string, body: Record<string, unknown>) =>
  api.post<PricingTier>(`/auditors/me/services/${serviceId}/tiers`, body);

export const updateTier = (
  serviceId: string,
  tierId: string,
  body: Record<string, unknown>,
) => api.patch<PricingTier>(`/auditors/me/services/${serviceId}/tiers/${tierId}`, body);

export const deleteTier = (serviceId: string, tierId: string) =>
  api.delete(`/auditors/me/services/${serviceId}/tiers/${tierId}`);

// ---- Phase 2: marketplace + requests + quotations ----

export interface MarketAuditor {
  id: string;
  displayName: string;
  firmName: string | null;
  city: string | null;
  state: string | null;
  experienceYrs: number | null;
  ratingAvg: number;
  ratingCount: number;
  logo: string | null;
}

export interface MarketService extends AuditorService {
  auditor: MarketAuditor;
}

export type RequestKind = 'ENQUIRY' | 'SERVICE' | 'CUSTOM_QUOTE';

export interface ServiceRequestView {
  id: string;
  kind: RequestKind;
  status: string;
  message: string | null;
  createdAt: string;
  auditor: { id: string; displayName: string };
  client: { id: string; name: string; email: string };
  service: { id: string; name: string } | null;
  tier: { id: string; name: string; price: number } | null;
  quotations: { id: string; quoteNo: string; status: string }[];
}

export interface QuotationView {
  id: string;
  quoteNo: string;
  description: string;
  amount: number;
  gstApplicable: boolean;
  gstPercent: number;
  gstAmount: number;
  total: number;
  billingType: string;
  dueDate: string | null;
  notes: string | null;
  status: string;
  invoiceNo: string | null;
  acceptedAt: string | null;
  createdAt: string;
  auditor: { id: string; displayName: string };
  client: { id: string; name: string; email: string };
}

export interface MarketFilters {
  q?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  city?: string;
  state?: string;
  minExperience?: string;
  minRating?: string;
}

export const browseMarket = (f: MarketFilters) => {
  const qs = new URLSearchParams(
    Object.entries(f).filter(([, v]) => v != null && v !== '') as [string, string][],
  ).toString();
  return api.get<MarketService[]>(`/marketplace/services${qs ? `?${qs}` : ''}`);
};

export const fetchMarketService = (id: string) =>
  api.get<MarketService>(`/marketplace/services/${id}`);

export const sendRequest = (
  serviceId: string,
  body: { kind: RequestKind; tierId?: string; message?: string },
) => api.post<ServiceRequestView>(`/marketplace/services/${serviceId}/requests`, body);

export const fetchMyRequests = () =>
  api.get<ServiceRequestView[]>('/marketplace/my/requests');
export const fetchMyQuotations = () =>
  api.get<QuotationView[]>('/marketplace/my/quotations');
export const acceptQuotation = (id: string) =>
  api.post<QuotationView>(`/marketplace/quotations/${id}/accept`, {});
export const declineQuotation = (id: string) =>
  api.post<QuotationView>(`/marketplace/quotations/${id}/decline`, {});

// ---- Phase 3: reviews + analytics ----

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  clientName: string;
  createdAt: string;
}

export interface AuditorAnalytics {
  totalServices: number;
  totalRequests: number;
  requestsByKind: { ENQUIRY: number; SERVICE: number; CUSTOM_QUOTE: number };
  quotationsSent: number;
  quotationsAccepted: number;
  revenue: number;
  conversionRate: number;
  enquiries: number;
  purchases: number;
  mostPurchased: string | null;
  revenuePerService: { name: string; revenue: number; count: number }[];
}

export const fetchReviews = (auditorId: string) =>
  api.get<ReviewView[]>(`/marketplace/auditors/${auditorId}/reviews`);
export const submitReview = (
  auditorId: string,
  body: { rating: number; comment?: string },
) => api.post(`/marketplace/auditors/${auditorId}/reviews`, body);
export const fetchAuditorAnalytics = () =>
  api.get<AuditorAnalytics>('/auditors/me/analytics');

// ---- Data-access grants ----

export interface AuditorClient {
  companyId: string;
  name: string;
  gstin: string | null;
}
export interface GrantedAuditor {
  userId: string;
  name: string;
  email: string;
  since: string;
}

export const grantQuotationAccess = (quotationId: string, companyId: string) =>
  api.post(`/marketplace/quotations/${quotationId}/grant-access`, { companyId });
export const fetchAuditorClients = () =>
  api.get<AuditorClient[]>('/auditors/me/clients');
export const fetchGrantedAuditors = (companyId: string) =>
  api.get<GrantedAuditor[]>(`/companies/${companyId}/auditor-access`);
export const revokeAuditorAccess = (companyId: string, auditorUserId: string) =>
  api.delete(`/companies/${companyId}/auditor-access/${auditorUserId}`);

// Auditor inbox
export const fetchAuditorRequests = () =>
  api.get<ServiceRequestView[]>('/auditors/me/requests');
export const setRequestStatus = (id: string, status: string) =>
  api.patch<ServiceRequestView>(`/auditors/me/requests/${id}`, { status });
export const sendQuotation = (
  requestId: string,
  body: Record<string, unknown>,
) => api.post<QuotationView>(`/auditors/me/requests/${requestId}/quotations`, body);
export const fetchAuditorQuotations = () =>
  api.get<QuotationView[]>('/auditors/me/quotations');
