'use client';

import { api } from './api';

export interface BillingPlan {
  code: string;
  name: string;
  priceMonthly: number;
  maxCompanies: number;
  maxBranches: number;
  maxMembers: number;
  features: Record<string, boolean>;
}

export interface BillingOrder {
  orderId: string;
  amountPaise: number;
  grossPaise: number;
  discountPaise: number;
  currency: string;
  keyId: string;
  planCode: string;
  planName: string;
  months: number;
  prefill: { email: string; name: string };
}

export interface ReferralPreview {
  code: string;
  grossPaise: number;
  discountPaise: number;
  amountPaise: number;
}

export const fetchBillingPlans = () => api.get<BillingPlan[]>('/billing/plans');

export const createBillingOrder = (
  planCode: string,
  months: number,
  referralCode?: string,
) => api.post<BillingOrder>('/billing/orders', { planCode, months, referralCode });

export const previewReferral = (planCode: string, months: number, referralCode: string) =>
  api.post<ReferralPreview>('/billing/referral/preview', { planCode, months, referralCode });

export const verifyBillingPayment = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) =>
  api.post<{ planName: string; expiresAt: string }>('/billing/verify', {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

interface RazorpayCheckout {
  open(): void;
}

interface RazorpayConstructor {
  new (options: {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill: { email: string; name: string };
    theme: { color: string };
    handler: (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => void;
    modal?: { ondismiss?: () => void };
  }): RazorpayCheckout;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/** Loads checkout.js once; resolves false when the script cannot load. */
export function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('#razorpay-checkout-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(!!window.Razorpay));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(!!window.Razorpay);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
