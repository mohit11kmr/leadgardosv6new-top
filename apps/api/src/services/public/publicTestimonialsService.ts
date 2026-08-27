import { db } from '@leadguard/database';
import type { PublicTestimonialDTO } from '../../dtos/public.js';

export class PublicTestimonialsService {
  /**
   * Lists approved public testimonials with safe optional tenant filtering
   */
  async listApprovedTestimonials(options: {
    organizationId?: string;
    clientWorkspaceId?: string;
    limit?: number;
  } = {}): Promise<PublicTestimonialDTO[]> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);

    const testimonials = await db.testimonial.findMany({
      where: {
        status: 'APPROVED',
        ...(options.organizationId ? { organizationId: options.organizationId } : {}),
        ...(options.clientWorkspaceId ? { clientWorkspaceId: options.clientWorkspaceId } : {}),
      },
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        authorName: true,
        companyName: true,
        role: true,
        content: true,
        rating: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    return testimonials.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      companyName: t.companyName,
      role: t.role,
      content: t.content,
      rating: t.rating,
      publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    }));
  }
}

export const publicTestimonialsService = new PublicTestimonialsService();
