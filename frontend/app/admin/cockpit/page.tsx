'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, BookOpenCheck, ClipboardCheck, Database, FileCheck2, Globe2, History, Inbox, MessageSquare, Plus, Search, ShieldCheck, Trash2, UserCog, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';

type StatusRecord = {
  status: 'PENDING' | 'UNDER_REVIEW' | 'NEEDS_CHANGES' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
};

type AdminUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  affiliation?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    organismUploads: number;
    blogPosts: number;
  };
};

type AdminBlogPostRecord = {
  id: string;
  title: string;
  status: StatusRecord['status'];
  createdAt: string;
  reviewedAt?: string | null;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type OrganismRecord = {
  id: number;
  scientificName: string;
  displayName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    strains: number;
  };
};

type StrainRecord = {
  id: number;
  organismId: number;
  strainName: string;
  isolateName?: string | null;
  sourceType?: string | null;
  createdAt?: string;
};

type ContactMessagesResponse = {
  unreadCount: number;
};

type AuditLogResponse = {
  total: number;
};

type DeleteDialogState = {
  title: string;
  body: string;
  confirmationLabel: string;
  confirmationValue: string;
  endpoint: string;
  payloadKey: 'confirmEmail' | 'confirmTitle' | 'confirmScientificName';
} | null;

export default function AdminCockpitPage() {
  const { data: session } = useSession();
  const [userCount, setUserCount] = useState(0);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [uploads, setUploads] = useState<StatusRecord[]>([]);
  const [posts, setPosts] = useState<AdminBlogPostRecord[]>([]);
  const [organisms, setOrganisms] = useState<OrganismRecord[]>([]);
  const [strains, setStrains] = useState<StrainRecord[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [auditEvents, setAuditEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [blogSearch, setBlogSearch] = useState('');
  const [organismSearch, setOrganismSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);
  const jsonHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  useEffect(() => {
    if (!session?.user?.accessToken) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [usersRes, uploadsRes, postsRes, messagesRes, auditRes, organismsRes, strainsRes] = await Promise.all([
          fetch(apiPath('/admin/users'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/organism-uploads'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/blog-posts'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/contact-messages'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/audit-logs?limit=1'), { headers, cache: 'no-store' }),
          fetch(apiPath('/organisms'), { cache: 'no-store' }),
          fetch(apiPath('/strains'), { cache: 'no-store' }),
        ]);
        const [usersData, uploadsData, postsData, messagesData, auditData, organismsData, strainsData] = await Promise.all([
          usersRes.ok ? usersRes.json() as Promise<AdminUserRecord[]> : Promise.resolve([]),
          uploadsRes.ok ? uploadsRes.json() as Promise<StatusRecord[]> : Promise.resolve([]),
          postsRes.ok ? postsRes.json() as Promise<AdminBlogPostRecord[]> : Promise.resolve([]),
          messagesRes.ok ? messagesRes.json() as Promise<ContactMessagesResponse> : Promise.resolve({ unreadCount: 0 }),
          auditRes.ok ? auditRes.json() as Promise<AuditLogResponse> : Promise.resolve({ total: 0 }),
          organismsRes.ok ? organismsRes.json() as Promise<OrganismRecord[]> : Promise.resolve([]),
          strainsRes.ok ? strainsRes.json() as Promise<StrainRecord[]> : Promise.resolve([]),
        ]);
        if (!active) return;
        setUserCount(usersData.length);
        setUsers(usersData);
        setUploads(uploadsData);
        setPosts(postsData);
        setOrganisms(organismsData);
        setStrains(strainsData);
        setUnreadMessages(messagesData.unreadCount || 0);
        setAuditEvents(auditData.total || 0);
      } catch (error) {
        console.error('Admin cockpit load failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [headers, refreshKey, session?.user?.accessToken]);

  const pendingUploads = uploads.filter((item) => item.status === 'PENDING').length;
  const pendingPosts = posts.filter((item) => item.status === 'PENDING').length;
  const adminCount = users.filter((user) => user.role === 'ADMIN').length;
  const visibleUsers = users.filter((user) => searchable(`${user.name} ${user.email} ${user.role}`, userSearch)).slice(0, 8);
  const visiblePosts = posts.filter((post) => searchable(`${post.title} ${post.author?.name || ''} ${post.author?.email || ''} ${post.status}`, blogSearch)).slice(0, 8);
  const visibleOrganisms = organisms.filter((organism) => {
    const organismStrains = strains.filter((strain) => strain.organismId === organism.id);
    return searchable(`${organism.scientificName} ${organism.displayName || ''} ${organismStrains.map((strain) => `${strain.strainName} ${strain.sourceType || ''}`).join(' ')}`, organismSearch);
  }).slice(0, 8);
  const operationGroups: Array<{
    title: string;
    description: string;
    icon: LucideIcon;
    tone: string;
    actions: Array<{ href: string; title: string; body: string; icon: LucideIcon }>;
  }> = [
    {
      title: 'Data Ingestion',
      description: 'Create organism records and process submitted datasets.',
      icon: Database,
      tone: 'text-teal-700 bg-teal-50',
      actions: [
        { href: '/admin', title: 'Add Organism', body: 'Open the organism and MAYA ingestion portal.', icon: Plus },
        { href: '/admin/uploads', title: 'Review Uploads', body: `${pendingUploads} submissions awaiting review.`, icon: ClipboardCheck },
      ],
    },
    {
      title: 'Content Review',
      description: 'Verify organism submissions and approve scientific writing.',
      icon: FileCheck2,
      tone: 'text-orange-700 bg-orange-50',
      actions: [
        { href: '/admin/uploads', title: 'Organism Review', body: 'Approve, reject, edit, or request changes.', icon: ClipboardCheck },
        { href: '/admin/blogs', title: 'Blog Review', body: `${pendingPosts} posts awaiting approval.`, icon: BookOpenCheck },
      ],
    },
    {
      title: 'People & Access',
      description: 'Manage accounts, roles, and contributor privileges.',
      icon: UserCog,
      tone: 'text-blue-700 bg-blue-50',
      actions: [
        { href: '/admin/users', title: 'Registered Users', body: `${userCount} accounts in the portal.`, icon: UsersRound },
      ],
    },
    {
      title: 'Communications',
      description: 'Review collaboration requests and public enquiries.',
      icon: MessageSquare,
      tone: 'text-teal-700 bg-teal-50',
      actions: [
        { href: '/admin/contact-messages', title: 'Contact Messages', body: `${unreadMessages} unread messages.`, icon: Inbox },
      ],
    },
    {
      title: 'Audit & Security',
      description: 'Inspect administrative activity and authorization events.',
      icon: ShieldCheck,
      tone: 'text-slate-700 bg-slate-100',
      actions: [
        { href: '/admin/audit-logs', title: 'Audit Logs', body: `${auditEvents} recorded events.`, icon: History },
      ],
    },
    {
      title: 'Surveillance Views',
      description: 'Inspect the public outputs produced from approved data.',
      icon: Globe2,
      tone: 'text-emerald-700 bg-emerald-50',
      actions: [
        { href: '/surveillance', title: 'Global Surveillance', body: 'Open worldwide genomic signals and AMR insights.', icon: Globe2 },
        { href: '/dashboard', title: 'India Dashboard', body: 'Open the national atlas and organism registry.', icon: Database },
      ],
    },
  ];

  const runDelete = async () => {
    if (!deleteDialog) return;
    setDeleteMessage({ type: 'loading', text: 'Deleting selected record...' });
    try {
      const response = await fetch(apiPath(deleteDialog.endpoint), {
        method: 'DELETE',
        headers: jsonHeaders,
        body: JSON.stringify({ [deleteDialog.payloadKey]: deleteConfirmation }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      setDeleteMessage({ type: 'success', text: data.message || 'Delete completed' });
      setDeleteDialog(null);
      setDeleteConfirmation('');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setDeleteMessage({ type: 'error', text: error instanceof Error ? error.message : 'Delete failed' });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-6 border-l-4 border-orange-500 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-8">
            <div>
              <p className="text-xs font-black uppercase text-orange-600">Private administration</p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl">
                <ShieldCheck className="text-orange-500" size={32} /> Admin Cockpit
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Manage data ingestion, user access, scientific review workflows, communications, and security activity from one private workspace.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/admin" className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-500 px-5 text-sm font-black text-white shadow-lg shadow-orange-500/15 transition hover:bg-orange-600">
                <Plus size={17} /> Add Organism
              </Link>
              <Link href="/admin/uploads" className="inline-flex min-h-12 items-center justify-center gap-2 border border-slate-300 bg-white px-5 text-sm font-black text-[#0B1B3A] transition hover:border-orange-400 hover:text-orange-700">
                <ClipboardCheck size={17} /> Review Queue
              </Link>
            </div>
          </div>
        </header>

        <section aria-label="Admin cockpit metrics" className="grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard icon={UsersRound} label="Registered Users" value={loading ? '...' : String(userCount)} href="/admin/users" />
          <MetricCard icon={ClipboardCheck} label="Pending Uploads" value={loading ? '...' : String(pendingUploads)} href="/admin/uploads" />
          <MetricCard icon={BookOpenCheck} label="Pending Blog Posts" value={loading ? '...' : String(pendingPosts)} href="/admin/blogs" />
          <MetricCard icon={Inbox} label="Contact Messages" value={loading ? '...' : String(unreadMessages)} href="/admin/contact-messages" />
          <MetricCard icon={Database} label="Published Uploads" value={loading ? '...' : String(uploads.filter((item) => item.status === 'APPROVED').length)} href="/dashboard" />
          <MetricCard icon={History} label="Audit Events" value={loading ? '...' : String(auditEvents)} href="/admin/audit-logs" />
        </section>

        <section aria-labelledby="admin-operations-title">
          <div className="mb-4"><p className="text-xs font-black uppercase text-teal-700">Administrative workspace</p><h2 id="admin-operations-title" className="mt-1 text-2xl font-black">Operations</h2></div>
          <div className="space-y-3">
            {operationGroups.map((group) => <OperationGroup key={group.title} {...group} loading={loading} />)}
          </div>
        </section>

        {session?.user?.role === 'ADMIN' && (
          <section id="delete-management" className="rounded-lg border border-red-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-col gap-4 border-b border-red-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Admin Danger Zone</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Delete Management</h2>
                <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
                  Manage destructive administrative actions. Deleting users, blog posts, or organism data may affect public pages, submissions, downloads, and audit history.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700">
                <AlertCircle size={14} /> Admin only
              </span>
            </div>

            {deleteMessage.type !== 'idle' && (
              <div className={`mt-5 flex items-center gap-3 rounded-md p-4 text-sm font-bold ${deleteMessage.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {deleteMessage.text}
              </div>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <DangerMetric label="Total Users" value={loading ? '...' : String(users.length)} deleted="N/A" />
              <DangerMetric label="Total Blog Posts" value={loading ? '...' : String(posts.length)} deleted="N/A" />
              <DangerMetric label="Total Organisms" value={loading ? '...' : String(organisms.length)} deleted="N/A" />
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-3">
              <DangerCard
                title="Delete Users"
                description="Remove accounts only when necessary. Self-deletion and last-admin deletion are blocked by the server."
                searchValue={userSearch}
                onSearchChange={setUserSearch}
                searchPlaceholder="Search users..."
              >
                {visibleUsers.length ? visibleUsers.map((user) => {
                  const blocked = user.id === session?.user?.id || (user.role === 'ADMIN' && adminCount <= 1);

                  return (
                    <DangerRow key={user.id}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{user.name}</p>
                        <p className="mt-1 truncate font-mono text-xs font-bold text-slate-500">{user.email}</p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          {user.role} | Active | Joined {new Date(user.createdAt).toLocaleDateString()} | Last login N/A
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={blocked || deleteMessage.type === 'loading'}
                        onClick={() => {
                          setDeleteDialog({
                            title: 'Delete User Account',
                            body: `This will permanently delete ${user.email} and cascade user-owned submissions and blog posts according to database relations. Type the email or DELETE to continue.`,
                            confirmationLabel: `Type ${user.email} to confirm`,
                            confirmationValue: user.email,
                            endpoint: `/admin/users/${user.id}`,
                            payloadKey: 'confirmEmail',
                          });
                          setDeleteConfirmation('');
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </DangerRow>
                  );
                }) : <EmptyDangerState label="No users found." />}
              </DangerCard>

              <DangerCard
                title="Delete Blog Posts"
                description="Deleted posts disappear from the public blog and admin review lists."
                searchValue={blogSearch}
                onSearchChange={setBlogSearch}
                searchPlaceholder="Search blog posts..."
              >
                {visiblePosts.length ? visiblePosts.map((post) => (
                  <DangerRow key={post.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{post.title}</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-500">{post.author?.email || post.author?.name || 'Unknown author'}</p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {post.status} | Submitted {new Date(post.createdAt).toLocaleDateString()} | Published {post.reviewedAt ? new Date(post.reviewedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={deleteMessage.type === 'loading'}
                      onClick={() => {
                        setDeleteDialog({
                          title: 'Delete Blog Post',
                          body: `This will permanently delete "${post.title}" from the review workflow and public blog if it is approved. Type the title or DELETE to continue.`,
                          confirmationLabel: `Type ${post.title} to confirm`,
                          confirmationValue: post.title,
                          endpoint: `/admin/blog-posts/${post.id}`,
                          payloadKey: 'confirmTitle',
                        });
                        setDeleteConfirmation('');
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </DangerRow>
                )) : <EmptyDangerState label="No blog posts found." />}
              </DangerCard>

              <DangerCard
                title="Delete Organism Data"
                description="Removes organism profile, strains, source/location data, MAYA/tool results, AMR/BGC/domain outputs, and atlas visibility."
                searchValue={organismSearch}
                onSearchChange={setOrganismSearch}
                searchPlaceholder="Search organisms..."
              >
                {visibleOrganisms.length ? visibleOrganisms.map((organism) => {
                  const organismStrains = strains.filter((strain) => strain.organismId === organism.id);
                  const firstStrain = organismStrains[0];

                  return (
                    <DangerRow key={organism.id}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black italic">{organism.scientificName}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">
                          {firstStrain?.strainName || 'No strain'} | {firstStrain?.sourceType || 'Source N/A'}
                        </p>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          Public | {organism._count?.strains ?? organismStrains.length} strains | Created {organism.createdAt ? new Date(organism.createdAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={deleteMessage.type === 'loading'}
                        onClick={() => {
                          setDeleteDialog({
                            title: 'Delete Full Organism Data',
                            body: `This will permanently delete ${organism.scientificName}, including associated strains, genome metadata, MAYA/tool results, and public atlas/dashboard records. Type the organism name or DELETE to continue.`,
                            confirmationLabel: `Type ${organism.scientificName} to confirm`,
                            confirmationValue: organism.scientificName,
                            endpoint: `/admin/organisms/${organism.id}`,
                            payloadKey: 'confirmScientificName',
                          });
                          setDeleteConfirmation('');
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </DangerRow>
                  );
                }) : <EmptyDangerState label="No organisms found." />}
              </DangerCard>
            </div>
          </section>
        )}
      </div>

      <DeleteConfirmationModal
        open={Boolean(deleteDialog)}
        title={deleteDialog?.title || ''}
        body={deleteDialog?.body || ''}
        confirmationLabel={deleteDialog?.confirmationLabel || 'Type DELETE to confirm'}
        confirmationValue={deleteDialog?.confirmationValue || ''}
        typedValue={deleteConfirmation}
        loading={deleteMessage.type === 'loading'}
        onTypedValueChange={setDeleteConfirmation}
        onCancel={() => {
          setDeleteDialog(null);
          setDeleteConfirmation('');
        }}
        onConfirm={runDelete}
      />
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="flex min-h-28 items-center gap-4 border-b border-r border-slate-200 p-4 transition hover:bg-orange-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-orange-500 xl:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-orange-50 text-orange-600"><Icon size={20} /></span>
      <span className="min-w-0"><span className="block text-[10px] font-black uppercase text-slate-500">{label}</span><span className="mt-1 block font-mono text-2xl font-black">{value}</span></span>
    </Link>
  );
}

function OperationGroup({ title, description, icon: Icon, tone, actions, loading }: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  actions: Array<{ href: string; title: string; body: string; icon: LucideIcon }>;
  loading: boolean;
}) {
  return (
    <section className="grid border border-slate-200 bg-white lg:grid-cols-[250px_minmax(0,1fr)]">
      <div className="flex gap-4 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center ${tone}`}><Icon size={19} /></span>
        <div><h3 className="text-base font-black">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p></div>
      </div>
      <div className={`grid divide-y divide-slate-200 ${actions.length > 1 ? 'md:grid-cols-2 md:divide-x md:divide-y-0' : ''}`}>
        {actions.map((action) => {
          const ActionIcon = action.icon;
          return (
            <Link key={`${title}-${action.title}`} href={action.href} className="group flex min-h-24 items-center gap-4 p-5 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-teal-600">
              <ActionIcon className="shrink-0 text-slate-500 group-hover:text-orange-600" size={19} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-black">{action.title}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{loading ? 'Loading current status...' : action.body}</span></span>
              <ArrowRight className="shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-orange-600" size={16} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DangerMetric({ label, value, deleted }: { label: string; value: string; deleted: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Deleted / archived: {deleted}</p>
    </div>
  );
}

function DangerCard({ title, description, searchValue, onSearchChange, searchPlaceholder, children }: {
  title: string;
  description: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-xl font-black tracking-tight">{title}</h3>
      <p className="mt-2 min-h-[72px] text-sm font-semibold leading-6 text-slate-600">{description}</p>
      <label className="mt-4 flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
        <Search size={15} className="text-slate-400" />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
        />
      </label>
      <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {children}
      </div>
    </section>
  );
}

function DangerRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      {children}
    </div>
  );
}

function EmptyDangerState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-white p-6 text-center text-sm font-bold text-slate-500">
      {label}
    </div>
  );
}

function searchable(haystack: string, query: string) {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}
