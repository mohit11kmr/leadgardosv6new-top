import { db } from '@leadguard/database';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export class BlogService {
  private async recordAdminAction(
    userId: string | null,
    action: string,
    resourceId: string | null,
    details?: Record<string, unknown>
  ) {
    await db.adminAuditLog.create({
      data: { userId, action, resourceType: 'BLOG_POST', resourceId, details: details as any },
    });
  }

  async createPost(
    adminUserId: string,
    data: { title: string; slug?: string; excerpt?: string; content: string; coverImageUrl?: string; authorName?: string }
  ) {
    const slug = data.slug ? slugify(data.slug) : slugify(data.title);
    if (!slug) {
      const err = new Error('Could not derive a valid slug from the title');
      (err as unknown as { code: string }).code = 'INVALID_SLUG';
      throw err;
    }

    const existing = await db.blogPost.findUnique({ where: { slug } });
    if (existing) {
      const err = new Error(`A blog post with slug "${slug}" already exists`);
      (err as unknown as { code: string }).code = 'SLUG_TAKEN';
      throw err;
    }

    const post = await db.blogPost.create({
      data: {
        slug,
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        coverImageUrl: data.coverImageUrl,
        authorName: data.authorName || 'LeadGuard Team',
        status: 'DRAFT',
        createdByUserId: adminUserId,
      },
    });

    await this.recordAdminAction(adminUserId, 'BLOG_POST_CREATED', post.id, { slug });
    return post;
  }

  async updatePost(
    adminUserId: string,
    id: string,
    data: { title?: string; excerpt?: string; content?: string; coverImageUrl?: string; authorName?: string }
  ) {
    const post = await db.blogPost.update({
      where: { id },
      data: {
        title: data.title,
        excerpt: data.excerpt,
        content: data.content,
        coverImageUrl: data.coverImageUrl,
        authorName: data.authorName,
      },
    });
    await this.recordAdminAction(adminUserId, 'BLOG_POST_UPDATED', post.id);
    return post;
  }

  async setStatus(adminUserId: string, id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    const post = await db.blogPost.update({
      where: { id },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : undefined,
      },
    });
    await this.recordAdminAction(adminUserId, 'BLOG_POST_STATUS_CHANGED', post.id, { status });
    return post;
  }

  async deletePost(adminUserId: string, id: string) {
    await db.blogPost.delete({ where: { id } });
    await this.recordAdminAction(adminUserId, 'BLOG_POST_DELETED', id);
  }

  async listPostsAdmin(options: { cursor?: string; limit?: number; status?: string } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const posts = await db.blogPost.findMany({
      where: options.status ? { status: options.status } : {},
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null, hasMore };
  }

  async listPublishedPosts(options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 50);
    const posts = await db.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImageUrl: true,
        authorName: true,
        publishedAt: true,
      },
    });
    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null, hasMore };
  }

  async getPublishedPostBySlug(slug: string) {
    return db.blogPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        content: true,
        coverImageUrl: true,
        authorName: true,
        publishedAt: true,
      },
    });
  }
}

export const blogService = new BlogService();
