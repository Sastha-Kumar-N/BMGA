'use client';

import Link from 'next/link';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  IdCard,
  Link2,
  LockKeyhole,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type ProfileFields = {
  title: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  institutionalAddress: string;
  country: string;
  city: string;
  designation: string;
  department: string;
  institution: string;
  employmentStatus: string;
  highestDegree: string;
  specialization: string;
  researchInterests: string;
  researchAreas: string;
  keywords: string;
  currentProjects: string;
  orcidId: string;
  researcherId: string;
  scopusAuthorId: string;
  googleScholarUrl: string;
  linkedInUrl: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | null;
};

type ProfileResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    affiliation: string;
  };
  profile: ProfileFields;
};

type Notice = {
  type: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const EMPTY_PROFILE: ProfileFields = {
  title: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  institutionalAddress: '',
  country: '',
  city: '',
  designation: '',
  department: '',
  institution: '',
  employmentStatus: '',
  highestDegree: '',
  specialization: '',
  researchInterests: '',
  researchAreas: '',
  keywords: '',
  currentProjects: '',
  orcidId: '',
  researcherId: '',
  scopusAuthorId: '',
  googleScholarUrl: '',
  linkedInUrl: '',
  hasProfilePhoto: false,
  profilePhotoUpdatedAt: null,
};

export default function AccountProfilePage() {
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileFields>(EMPTY_PROFILE);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>({ type: 'idle', message: '' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const photoObjectUrl = useRef('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordNotice, setPasswordNotice] = useState<Notice>({ type: 'idle', message: '' });

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);
  const jsonHeaders = useMemo(() => ({
    ...authHeaders,
    'Content-Type': 'application/json',
  }), [authHeaders]);

  const replacePhotoUrl = useCallback((nextUrl: string) => {
    if (photoObjectUrl.current) URL.revokeObjectURL(photoObjectUrl.current);
    photoObjectUrl.current = nextUrl;
    setPhotoUrl(nextUrl);
  }, []);

  const loadPhoto = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    const response = await fetch(apiPath('/me/profile-photo'), {
      headers: authHeaders,
      cache: 'no-store',
    });
    if (!response.ok) {
      replacePhotoUrl('');
      return;
    }
    replacePhotoUrl(URL.createObjectURL(await response.blob()));
  }, [authHeaders, replacePhotoUrl, session?.user?.accessToken]);

  const loadProfile = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setLoading(true);
    try {
      const response = await fetch(apiPath('/me/profile'), {
        headers: authHeaders,
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as ProfileResponse & { error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || 'Profile could not be loaded');
      setFullName(data.user.name);
      setEmail(data.user.email);
      setRole(data.user.role);
      setAffiliation(data.user.affiliation);
      setProfile(data.profile);
      if (data.profile.hasProfilePhoto) await loadPhoto();
      else replacePhotoUrl('');
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Profile could not be loaded' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadPhoto, replacePhotoUrl, session?.user?.accessToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => () => {
    if (photoObjectUrl.current) URL.revokeObjectURL(photoObjectUrl.current);
  }, []);

  const setField = (field: keyof ProfileFields, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice({ type: 'loading', message: 'Saving profile...' });
    try {
      const response = await fetch(apiPath('/me/profile'), {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ name: fullName, ...profile }),
      });
      const data = await response.json().catch(() => ({})) as ProfileResponse & { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Profile could not be saved');
      setFullName(data.user.name);
      setProfile(data.profile);
      await updateSession();
      setNotice({ type: 'success', message: data.message || 'Profile saved' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Profile could not be saved' });
    }
  };

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice({ type: 'error', message: 'Choose a JPEG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice({ type: 'error', message: 'Profile photos must be smaller than 2 MB.' });
      return;
    }

    setPhotoBusy(true);
    setNotice({ type: 'loading', message: 'Uploading profile photo...' });
    try {
      const fileContentBase64 = await readFileAsDataUrl(file);
      const response = await fetch(apiPath('/me/profile-photo'), {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileContentBase64,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Profile photo could not be uploaded');
      setProfile((current) => ({ ...current, hasProfilePhoto: true }));
      await loadPhoto();
      setNotice({ type: 'success', message: data.message || 'Profile photo updated' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Profile photo could not be uploaded' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setNotice({ type: 'loading', message: 'Removing profile photo...' });
    try {
      const response = await fetch(apiPath('/me/profile-photo'), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Profile photo could not be removed');
      replacePhotoUrl('');
      setProfile((current) => ({ ...current, hasProfilePhoto: false }));
      setNotice({ type: 'success', message: data.message || 'Profile photo removed' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Profile photo could not be removed' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordNotice({ type: 'loading', message: 'Changing password...' });
    try {
      const response = await fetch(apiPath('/me/password'), {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(passwords),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Password could not be changed');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordNotice({ type: 'success', message: data.message || 'Password changed' });
      window.setTimeout(() => void signOut({ callbackUrl: '/login?passwordChanged=1' }), 1_200);
    } catch (error) {
      setPasswordNotice({ type: 'error', message: error instanceof Error ? error.message : 'Password could not be changed' });
    }
  };

  const completedFields = [
    fullName,
    profile.country,
    profile.city,
    profile.designation,
    profile.institution,
    profile.highestDegree,
    profile.specialization,
    profile.researchInterests,
    profile.researchAreas,
    profile.keywords,
    profile.orcidId,
    profile.hasProfilePhoto ? 'photo' : '',
  ].filter(Boolean).length;
  const completion = Math.round((completedFields / 12) * 100);

  if (sessionStatus === 'loading' || loading) {
    return (
      <main id="main-content" className="flex min-h-[70vh] items-center justify-center bg-[#f6f8fb] text-xs font-black uppercase text-orange-600">
        Loading profile
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px] space-y-6">
        <header className="grid gap-6 border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:p-7">
          <ProfilePhoto
            fullName={fullName}
            photoUrl={photoUrl}
            busy={photoBusy}
            onUpload={uploadPhoto}
            onRemove={removePhoto}
          />
          <div className="min-w-0">
            <Link href="/account" className="inline-flex items-center gap-2 text-xs font-black uppercase text-orange-600">
              <ArrowLeft size={15} /> Account dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Profile &amp; Security</h1>
            <p className="mt-2 truncate text-sm font-bold text-slate-500">{email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag label={roleLabel(role)} />
              <Tag label={affiliationLabel(affiliation)} />
            </div>
          </div>
          <div className="min-w-44 border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase text-slate-500">Profile completeness</span>
              <span className="font-mono text-lg font-black text-teal-700">{completion}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden bg-slate-200">
              <div className="h-full bg-teal-600 transition-[width]" style={{ width: `${completion}%` }} />
            </div>
          </div>
        </header>

        <NoticeBanner notice={notice} />

        <form onSubmit={saveProfile} className="space-y-5">
          <ProfileSection icon={IdCard} eyebrow="Identity" title="Basic Information">
            <FieldGrid>
              <SelectField label="Title" value={profile.title} onChange={(value) => setField('title', value)}>
                <option value="">Not specified</option>
                <option value="Dr.">Dr.</option>
                <option value="Prof.">Prof.</option>
                <option value="Mr.">Mr.</option>
                <option value="Ms.">Ms.</option>
              </SelectField>
              <TextField label="Full name" value={fullName} onChange={setFullName} required autoComplete="name" />
              <SelectField label="Gender (optional)" value={profile.gender} onChange={(value) => setField('gender', value)}>
                <option value="">Not specified</option>
                <option value="WOMAN">Woman</option>
                <option value="MAN">Man</option>
                <option value="NON_BINARY">Non-binary</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </SelectField>
              <TextField label="Date of birth (optional)" type="date" value={profile.dateOfBirth} onChange={(value) => setField('dateOfBirth', value)} />
            </FieldGrid>
          </ProfileSection>

          <ProfileSection icon={Mail} eyebrow="Reachability" title="Contact Information">
            <FieldGrid>
              <TextField label="Email address" value={email} disabled />
              <TextField label="Phone number (optional)" type="tel" value={profile.phone} onChange={(value) => setField('phone', value)} autoComplete="tel" />
              <TextField label="Country" value={profile.country} onChange={(value) => setField('country', value)} autoComplete="country-name" />
              <TextField label="City" value={profile.city} onChange={(value) => setField('city', value)} autoComplete="address-level2" />
              <TextAreaField label="Institutional address" value={profile.institutionalAddress} onChange={(value) => setField('institutionalAddress', value)} wide />
            </FieldGrid>
          </ProfileSection>

          <ProfileSection icon={BriefcaseBusiness} eyebrow="Career" title="Professional Information">
            <FieldGrid>
              <TextField label="Current designation" value={profile.designation} onChange={(value) => setField('designation', value)} />
              <TextField label="Department" value={profile.department} onChange={(value) => setField('department', value)} />
              <TextField label="Institution / organization" value={profile.institution} onChange={(value) => setField('institution', value)} />
              <SelectField label="Employment status" value={profile.employmentStatus} onChange={(value) => setField('employmentStatus', value)}>
                <option value="">Not specified</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Student">Student</option>
                <option value="Postdoctoral researcher">Postdoctoral researcher</option>
                <option value="Independent researcher">Independent researcher</option>
                <option value="Retired">Retired</option>
                <option value="Other">Other</option>
              </SelectField>
            </FieldGrid>
          </ProfileSection>

          <ProfileSection icon={GraduationCap} eyebrow="Education" title="Academic Qualifications">
            <FieldGrid>
              <TextField label="Highest degree" value={profile.highestDegree} onChange={(value) => setField('highestDegree', value)} />
              <TextField label="Specialization" value={profile.specialization} onChange={(value) => setField('specialization', value)} />
            </FieldGrid>
          </ProfileSection>

          <ProfileSection icon={FlaskConical} eyebrow="Scientific work" title="Research Information">
            <FieldGrid>
              <TextAreaField label="Research interests" value={profile.researchInterests} onChange={(value) => setField('researchInterests', value)} />
              <TextAreaField label="Research areas" value={profile.researchAreas} onChange={(value) => setField('researchAreas', value)} />
              <TextAreaField label="Keywords" value={profile.keywords} onChange={(value) => setField('keywords', value)} />
              <TextAreaField label="Current projects" value={profile.currentProjects} onChange={(value) => setField('currentProjects', value)} />
            </FieldGrid>
          </ProfileSection>

          <ProfileSection icon={Link2} eyebrow="Research identity" title="Identifiers">
            <FieldGrid>
              <TextField label="ORCID ID" value={profile.orcidId} onChange={(value) => setField('orcidId', value)} placeholder="0000-0000-0000-0000" />
              <TextField label="ResearcherID" value={profile.researcherId} onChange={(value) => setField('researcherId', value)} />
              <TextField label="Scopus Author ID" value={profile.scopusAuthorId} onChange={(value) => setField('scopusAuthorId', value)} />
              <TextField label="Google Scholar profile" type="url" value={profile.googleScholarUrl} onChange={(value) => setField('googleScholarUrl', value)} placeholder="https://" />
              <TextField label="LinkedIn profile" type="url" value={profile.linkedInUrl} onChange={(value) => setField('linkedInUrl', value)} placeholder="https://" wide />
            </FieldGrid>
          </ProfileSection>

          <div className="flex flex-col gap-3 border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">Profile changes are private to your authenticated account and administrators.</p>
            <button type="submit" disabled={notice.type === 'loading'} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#0B1B3A] px-5 text-xs font-black uppercase text-white transition hover:bg-orange-600 disabled:opacity-50">
              <Save size={16} /> Save profile
            </button>
          </div>
        </form>

        <section className="grid border border-slate-200 bg-white shadow-sm lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 bg-[#0B1B3A] p-6 text-white lg:border-b-0 lg:border-r">
            <LockKeyhole className="text-orange-400" size={28} />
            <h2 className="mt-4 text-2xl font-black">Change Password</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
              Changing your password invalidates existing API sessions and signs this browser out.
            </p>
          </div>
          <form onSubmit={changePassword} className="grid gap-4 p-5 sm:grid-cols-2 lg:p-6">
            <TextField label="Current password" type="password" value={passwords.currentPassword} onChange={(value) => setPasswords((current) => ({ ...current, currentPassword: value }))} required autoComplete="current-password" wide />
            <TextField label="New password" type="password" value={passwords.newPassword} onChange={(value) => setPasswords((current) => ({ ...current, newPassword: value }))} required autoComplete="new-password" />
            <TextField label="Confirm new password" type="password" value={passwords.confirmPassword} onChange={(value) => setPasswords((current) => ({ ...current, confirmPassword: value }))} required autoComplete="new-password" />
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-slate-500">Use at least 10 characters with uppercase, lowercase, number, and symbol characters.</p>
              <NoticeBanner notice={passwordNotice} compact />
              <button type="submit" disabled={passwordNotice.type === 'loading'} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 bg-orange-500 px-5 text-xs font-black uppercase text-white transition hover:bg-orange-600 disabled:opacity-50">
                <ShieldCheck size={16} /> Change password
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function ProfilePhoto({ fullName, photoUrl, busy, onUpload, onRemove }: {
  fullName: string;
  photoUrl: string;
  busy: boolean;
  onUpload: (file?: File) => void;
  onRemove: () => void;
}) {
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'BM';
  return (
    <div className="flex items-center gap-3 md:flex-col">
      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border-2 border-white bg-[#0B1B3A] text-2xl font-black text-white shadow-md">
        {photoUrl ? <Image src={photoUrl} alt={`Profile of ${fullName || 'BMGA user'}`} fill sizes="96px" unoptimized className="object-cover" /> : initials}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-center">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-slate-300 bg-white px-3 text-[10px] font-black uppercase text-slate-700 transition hover:border-orange-400 hover:text-orange-700">
          <Camera size={14} /> {busy ? 'Working' : 'Upload'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              void onUpload(event.target.files?.[0]);
              event.target.value = '';
            }}
            className="sr-only"
          />
        </label>
        {photoUrl && (
          <button type="button" title="Remove profile photo" aria-label="Remove profile photo" disabled={busy} onClick={onRemove} className="inline-flex h-10 w-10 items-center justify-center border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function ProfileSection({ icon: Icon, eyebrow, title, children }: { icon: LucideIcon; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid border border-slate-200 bg-white shadow-sm lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-orange-50 text-orange-600"><Icon size={20} /></span>
        <div>
          <p className="text-[10px] font-black uppercase text-teal-700">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-black">{title}</h2>
        </div>
      </div>
      <div className="p-5 lg:p-6">{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function TextField({ label, value, onChange, type = 'text', required = false, disabled = false, placeholder, autoComplete, wide = false }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'md:col-span-2' : ''}>
      <span className="mb-2 block text-[10px] font-black uppercase text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-11 w-full border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15">
        {children}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <label className={wide ? 'md:col-span-2' : ''}>
      <span className="mb-2 block text-[10px] font-black uppercase text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" />
    </label>
  );
}

function NoticeBanner({ notice, compact = false }: { notice: Notice; compact?: boolean }) {
  if (notice.type === 'idle') return null;
  const error = notice.type === 'error';
  return (
    <div role={error ? 'alert' : 'status'} className={`${compact ? 'mt-4' : ''} flex items-center gap-3 border p-4 text-sm font-bold ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
      {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
      {notice.message}
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">{label}</span>;
}

function roleLabel(value: string) {
  if (!value || value === 'STUDENT') return 'Normal User';
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function affiliationLabel(value: string) {
  if (!value) return 'Research';
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Photo file could not be read'));
    reader.readAsDataURL(file);
  });
}
