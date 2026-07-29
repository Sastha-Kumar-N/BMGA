'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Building2, GraduationCap, Mail, UserRound } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type TeamSection = 'LEADERSHIP' | 'PLATFORM' | 'STUDENT';

type TeamMember = {
  id: string;
  section: TeamSection;
  name: string;
  title?: string | null;
  affiliation?: string | null;
  contribution?: string | null;
  email?: string | null;
  course?: string | null;
  portraitSrc?: string | null;
};

const sectionMeta: Record<TeamSection, { heading: string; body: string }> = {
  LEADERSHIP: {
    heading: 'Scientific leadership',
    body: 'Scientific direction, institutional partnerships, and long-term stewardship of the platform.',
  },
  PLATFORM: {
    heading: 'Platform development',
    body: 'Research and technical contributors building the tools, data workflows, and scientific user experience.',
  },
  STUDENT: {
    heading: 'Students',
    body: 'Student contributors supporting bioinformatics research and knowledge organization.',
  },
};

export default function AboutTeamDirectory() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath('/about/team'), { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load team members');
        const payload = await response.json() as { members?: TeamMember[] };
        setMembers(payload.members || []);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('About team load failed', error);
        setState('error');
      });
    return () => controller.abort();
  }, []);

  const grouped = useMemo(() => ({
    LEADERSHIP: members.filter((member) => member.section === 'LEADERSHIP'),
    PLATFORM: members.filter((member) => member.section === 'PLATFORM'),
    STUDENT: members.filter((member) => member.section === 'STUDENT'),
  }), [members]);

  if (state === 'loading') {
    return <div className="border border-slate-200 bg-slate-50 p-8 text-sm font-bold text-slate-500">Loading team directory...</div>;
  }

  if (state === 'error') {
    return <div className="border border-amber-200 bg-amber-50 p-8 text-sm font-bold text-amber-900">Team information is temporarily unavailable.</div>;
  }

  return (
    <div className="space-y-16">
      {(['LEADERSHIP', 'PLATFORM', 'STUDENT'] as const).map((section) => {
        const sectionMembers = grouped[section];
        const meta = sectionMeta[section];
        if (!sectionMembers.length) return null;

        return (
          <section key={section} aria-labelledby={`${section.toLowerCase()}-title`} className={section === 'STUDENT' ? 'border-y border-slate-200 bg-[#f4f7fa] px-5 py-12 md:px-8' : ''}>
            <div className={section === 'STUDENT' ? 'mx-auto max-w-[1320px]' : ''}>
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase text-orange-600">Our people</p>
                <h2 id={`${section.toLowerCase()}-title`} className="mt-2 text-3xl font-black sm:text-4xl">{meta.heading}</h2>
                <p className="mt-3 text-base font-semibold leading-7 text-slate-600">{meta.body}</p>
              </div>
              <div className={`mt-8 grid gap-6 ${section === 'STUDENT' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                {sectionMembers.map((member) => section === 'STUDENT'
                  ? <StudentCard key={member.id} member={member} />
                  : <MemberCard key={member.id} member={member} section={section} />)}
              </div>
            </div>
          </section>
        );
      })}

      {!members.length && <div className="border border-dashed border-slate-300 p-8 text-sm font-bold text-slate-500">No team members are published yet.</div>}
    </div>
  );
}

function MemberCard({ member, section }: { member: TeamMember; section: TeamSection }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-orange-200 hover:shadow-lg">
      <div className="relative aspect-[4/3] bg-[#0B1B3A]">
        {member.portraitSrc ? <Image src={member.portraitSrc} alt={`Portrait of ${member.name}`} fill sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" /> : <div role="img" aria-label={`Portrait placeholder for ${member.name}`} className="flex h-full items-center justify-center text-orange-300"><UserRound size={74} /></div>}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-black uppercase text-orange-600">{section === 'LEADERSHIP' ? 'Scientific leadership' : 'Platform development'}</p>
        <h3 className="mt-3 text-2xl font-black">{member.name}</h3>
        {member.title && <p className="mt-3 flex items-start gap-2 text-sm font-black text-slate-700"><Building2 className="mt-0.5 shrink-0 text-teal-700" size={16} />{member.title}</p>}
        {member.affiliation && <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-500"><BookOpenCheck className="mt-0.5 shrink-0 text-teal-700" size={16} />{member.affiliation}</p>}
        {member.contribution && <p className="mt-5 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">{member.contribution}</p>}
        {member.email && <a href={`mailto:${member.email}`} className="mt-auto pt-6 inline-flex min-h-11 items-center gap-2 text-sm font-black text-orange-700 hover:text-[#0B1B3A]"><Mail size={16} />{member.email}</a>}
      </div>
    </article>
  );
}

function StudentCard({ member }: { member: TeamMember }) {
  return (
    <article className="border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-teal-300 hover:shadow-md">
      <GraduationCap className="text-teal-700" size={25} />
      <h3 className="mt-5 text-lg font-black">{member.name}</h3>
      {member.course && <p className="mt-2 text-sm font-black text-orange-700">{member.course}</p>}
      {member.affiliation && <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{member.affiliation}</p>}
      {member.contribution && <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">{member.contribution}</p>}
      {member.email && <a href={`mailto:${member.email}`} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-orange-700 hover:text-[#0B1B3A]"><Mail size={15} />{member.email}</a>}
    </article>
  );
}
