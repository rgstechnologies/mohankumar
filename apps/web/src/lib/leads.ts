'use client';

import { api } from './api';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'CLOSED';

export interface SalesLead {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  requirements: string | null;
  plan: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadInput {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  requirements?: string;
  plan?: 'ENTERPRISE' | 'BUSINESS';
}

/** Public — submit an enterprise "Contact sales" enquiry from the pricing page. */
export const submitLead = (input: CreateLeadInput) =>
  api.post<{ id: string }>('/leads', input);

/** Admin — list sales enquiries, optionally filtered by status. */
export const fetchLeads = (status?: LeadStatus) =>
  api.get<SalesLead[]>(`/leads${status ? `?status=${status}` : ''}`);

/** Admin — update a sales enquiry's status. */
export const updateLeadStatus = (id: string, status: LeadStatus) =>
  api.patch<SalesLead>(`/leads/${id}`, { status });
