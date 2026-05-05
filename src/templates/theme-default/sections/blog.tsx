import React from "react";

interface BlogPost {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  published_at?: string;
  cover_image_url?: string;
}

interface BlogProps {
  title: string;
  subtitle?: string;
  posts?: BlogPost[];
  settings: { postsPerPage: number; showExcerpt: boolean };
  variables: Record<string, string>;
  subdomain?: string;
}

const Blog: React.FC<BlogProps> = ({ title, subtitle, posts, settings, subdomain }) => {
  const displayed = (posts ?? []).slice(0, settings.postsPerPage);

  return (
    <section className="py-16 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-text)] mb-4">{title}</h2>
          {subtitle && (
            <p className="text-lg text-[var(--color-secondary)]">{subtitle}</p>
          )}
        </div>

        {displayed.length === 0 ? (
          <p className="text-center text-[var(--color-secondary)]">Aucun article disponible.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayed.map((post) => (
              <a
                key={post.id}
                href={`${subdomain ? `/${subdomain}` : ""}/blog/${post.slug}`}
                className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow"
              >
                {post.cover_image_url && (
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
                <div className="p-5">
                  <h3 className="font-semibold text-lg text-[var(--color-text)] mb-2 line-clamp-2">
                    {post.title}
                  </h3>
                  {settings.showExcerpt && post.excerpt && (
                    <p className="text-sm text-[var(--color-secondary)] line-clamp-3 mb-3">
                      {post.excerpt}
                    </p>
                  )}
                  {post.published_at && (
                    <p className="text-xs text-gray-400">
                      {new Date(post.published_at).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Blog;
