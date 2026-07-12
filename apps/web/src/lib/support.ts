'use client';

import { api } from './api';

/** Send an in-app contact/support query to the admin inbox. */
export const sendContactQuery = (message: string, subject?: string) =>
  api.post<{ ok: boolean }>('/support/contact', { message, subject });
