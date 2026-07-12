import Link from 'next/link';
import BrandLogo from '../BrandLogo';
import { BRAND_TAGLINE } from '../../lib/brand';

type FooterLink = { label: string; href: string };

export default function HomeFooter({ genomeHref, resultsHref, signedIn }: { genomeHref: string; resultsHref: string; signedIn: boolean }) {
  const sections: Array<{ title: string; links: FooterLink[] }> = [
    {
      title: 'Platform',
      links: [
        { label: 'Global Surveillance', href: '/surveillance' },
        { label: 'India Dashboard', href: '/dashboard' },
        { label: 'Organism Atlas', href: '/dashboard#india-atlas' },
        { label: 'Genome Tools', href: genomeHref },
        { label: 'MAYA Results', href: resultsHref },
      ],
    },
    {
      title: 'Data & Research',
      links: [
        { label: 'Surveillance Records', href: '/surveillance/records' },
        { label: 'AMR Insights', href: '/surveillance/amr' },
        { label: 'Methods & Limitations', href: '/surveillance/methodology' },
        { label: 'FAIR Data Gateway', href: '/fair' },
        { label: 'Submit Organism Data', href: signedIn ? '/submit-organism' : '/login' },
      ],
    },
    {
      title: 'Organization',
      links: [
        { label: 'About BMGA', href: '/about' },
        { label: 'Our Projects', href: '/#projects' },
        { label: 'Blog', href: '/blog' },
        { label: 'Contact Us', href: '/#contact' },
        { label: signedIn ? 'Account Dashboard' : 'Create Account', href: signedIn ? '/account' : '/register' },
      ],
    },
    {
      title: 'Policies',
      links: [
        { label: 'Privacy & Data Use', href: '/privacy' },
        { label: 'Cookie Notice', href: '/cookies' },
        { label: 'Accessibility', href: '/#accessibility' },
        { label: 'FAIR Registration', href: '/fair#registration' },
      ],
    },
  ];

  return (
    <footer className="bg-[#041126] px-4 pb-0 pt-14 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1320px] gap-10 border-b border-white/10 pb-12 lg:grid-cols-[1.35fr_repeat(4,0.75fr)]">
        <div>
          <BrandLogo variant="light" size="md" />
          <p className="mt-5 max-w-sm text-sm font-semibold leading-7 text-slate-400">
            Reviewed microbial genome data, India-focused discovery, responsible global surveillance, and interoperable analysis tools in one scientific portal.
          </p>
        </div>
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-sm font-black text-white">{section.title}</h2>
            <ul className="mt-4 space-y-3">
              {section.links.map((link) => (
                <li key={`${section.title}-${link.label}`}>
                  <Link href={link.href} className="text-sm font-semibold text-slate-400 transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1320px] flex-col gap-3 py-6 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>&copy; 2026 BMGA. All rights reserved.</span>
        <span>{BRAND_TAGLINE}</span>
      </div>
      <div className="-mx-4 flex h-1.5 sm:-mx-6 lg:-mx-8" aria-hidden="true">
        <span className="flex-1 bg-orange-500" />
        <span className="flex-1 bg-white" />
        <span className="flex-1 bg-[#138808]" />
      </div>
    </footer>
  );
}
