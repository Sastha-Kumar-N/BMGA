'use client';

import { usePathname } from 'next/navigation';
import HomeNavigation from '../home/HomeNavigation';

function ownsNavigation(pathname: string) {
  if (pathname === '/' || pathname === '/blog') return true;
  if (pathname.startsWith('/surveillance')) return true;
  if (pathname.startsWith('/team') || pathname.startsWith('/about')) return true;
  if (pathname.startsWith('/fair') || pathname.startsWith('/privacy') || pathname.startsWith('/cookies')) return true;
  if (/^\/organisms\/[^/]+\/(results|genome)(\/|$)/.test(pathname)) return true;
  return false;
}

export default function UniversalNavigationGate() {
  const pathname = usePathname();
  if (ownsNavigation(pathname)) return null;
  return <HomeNavigation genomeHref="/dashboard#genome-toolset" />;
}
