import { redirect } from 'next/navigation';

/**
 * This install serves one business, so there is no marketing site to land on —
 * the root goes straight to the sign-in screen.
 */
export default function Home() {
  redirect('/login');
}
