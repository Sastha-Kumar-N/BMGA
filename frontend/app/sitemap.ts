import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return ['', '/blog', '/team', '/about', '/fair', '/privacy', '/cookies'].map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: 'weekly' as const, priority: path === '' ? 1 : 0.7 }));
}
