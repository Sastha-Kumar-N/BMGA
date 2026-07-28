import Image from 'next/image';
import Link from 'next/link';
import { BRAND_FULL_NAME, BRAND_SHORT_NAME } from '../lib/brand';

type BrandLogoProps = {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  homeLink?: boolean;
};

const sizeClasses = {
  sm: {
    mark: 'h-9 w-9 rounded-lg',
    short: 'text-base',
    full: 'text-[8px] leading-tight',
  },
  md: {
    mark: 'h-11 w-11 rounded-xl',
    short: 'text-xl',
    full: 'text-[9px] leading-tight',
  },
  lg: {
    mark: 'h-14 w-14 rounded-2xl',
    short: 'text-2xl',
    full: 'text-[10px] leading-tight',
  },
};

export default function BrandLogo({ variant = 'dark', size = 'md', showText = true, className = '', homeLink = true }: BrandLogoProps) {
  const classes = sizeClasses[size];
  const shortText = variant === 'light' ? 'text-white' : 'text-[#0B1B3A]';
  const fullText = variant === 'light' ? 'text-orange-300' : 'text-orange-600';

  const content = (
    <span className={`inline-flex min-w-0 items-center gap-3 ${className}`}>
      <span className={`shrink-0 overflow-hidden bg-[#07142D] shadow-lg shadow-orange-500/15 ring-1 ring-white/10 ${classes.mark}`}>
        <Image src="/bmga-logo-mark.svg" alt="" width={56} height={56} className="h-full w-full object-cover" aria-hidden="true" />
      </span>
      {showText && (
        <span className="min-w-0">
          <span className={`block font-black tracking-tight ${classes.short} ${shortText}`}>{BRAND_SHORT_NAME}</span>
          <span className={`block max-w-[13.5rem] whitespace-normal font-black uppercase tracking-widest ${classes.full} ${fullText}`}>
            {BRAND_FULL_NAME}
          </span>
        </span>
      )}
    </span>
  );

  if (!homeLink) return content;

  return (
    <Link href="/" aria-label={`${BRAND_FULL_NAME} home`} className="inline-flex shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500">
      {content}
    </Link>
  );
}
