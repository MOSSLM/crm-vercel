import React from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveSite, fetchBlogPost } from "@/lib/site-resolver";
import type { Metadata } from "next";

interface BlogPostPageProps {
  params: Promise<{ subdomain: string; slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { subdomain, slug } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const site = await resolveSite(subdomain, host);
  if (!site) return {};

  const post = await fetchBlogPost(site.siteId, slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: post.cover_image_url ? { images: [post.cover_image_url] } : undefined,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { subdomain, slug } = await params;
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  const site = await resolveSite(subdomain, host);
  if (!site) notFound();

  const post = await fetchBlogPost(site.siteId, slug);
  if (!post) notFound();

  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      {post.cover_image_url && (
        <img
          src={post.cover_image_url}
          alt={post.title}
          className="w-full h-64 object-cover rounded-2xl mb-8"
        />
      )}
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-4">
          {post.title}
        </h1>
        {post.published_at && (
          <p className="text-sm text-gray-500">
            Publié le {new Date(post.published_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </header>
      {post.excerpt && (
        <p className="text-xl text-gray-600 mb-8 italic leading-relaxed">{post.excerpt}</p>
      )}
      {post.content && (
        <div
          className="prose prose-lg max-w-none text-[var(--color-text)]"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      )}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <a
          href="/"
          className="text-[var(--color-primary)] hover:underline text-sm font-medium"
        >
          ← Retour à l'accueil
        </a>
      </div>
    </article>
  );
}

export const revalidate = 60;
