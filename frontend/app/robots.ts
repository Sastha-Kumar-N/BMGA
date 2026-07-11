import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return { rules: [{ userAgent: '*', allow: ['/', '/dashboard', '/surveillance', '/organisms/', '/blog', '/team', '/about', '/fair'], disallow: ['/admin/', '/account/', '/submissions/', '/api/auth/'] }], sitemap: `${baseUrl.replace(/\/$/, '')}/sitemap.xml` };
}

