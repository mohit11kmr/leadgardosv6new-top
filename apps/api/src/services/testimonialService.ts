import { db } from '@leadguard/database';

export class TestimonialService {
  /**
   * Creates a testimonial submission
   */
  async createTestimonial(
    organizationId: string,
    data: {
      authorName: string;
      companyName?: string;
      role?: string;
      content: string;
      rating?: number;
      clientWorkspaceId?: string;
    }
  ) {
    if (!data.authorName || !data.content) {
      const err = new Error('authorName and content are required');
      (err as unknown as { code: string }).code = 'INVALID_REQUEST';
      throw err;
    }

    const rating = Math.min(Math.max(data.rating || 5, 1), 5);

    return db.testimonial.create({
      data: {
        organizationId,
        clientWorkspaceId: data.clientWorkspaceId,
        authorName: data.authorName,
        companyName: data.companyName,
        role: data.role,
        content: data.content,
        rating,
        status: 'PENDING',
      },
    });
  }

  /**
   * Updates status of testimonial (moderation: APPROVED, REJECTED, ARCHIVED)
   */
  async updateTestimonialStatus(
    organizationId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'ARCHIVED' | 'PENDING'
  ) {
    const testimonial = await db.testimonial.findFirst({
      where: { id, organizationId },
    });

    if (!testimonial) {
      const err = new Error('Testimonial not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    return db.testimonial.update({
      where: { id },
      data: {
        status,
        publishedAt: status === 'APPROVED' ? new Date() : testimonial.publishedAt,
      },
    });
  }

  /**
   * Lists testimonials for organization
   */
  async listTestimonials(
    organizationId: string,
    options: { status?: string; limit?: number } = {}
  ) {
    const limit = Math.min(Math.max(options.limit || 50, 1), 100);

    return db.testimonial.findMany({
      where: {
        organizationId,
        ...(options.status ? { status: options.status } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        clientWorkspace: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Deletes a testimonial
   */
  async deleteTestimonial(organizationId: string, id: string) {
    const res = await db.testimonial.deleteMany({
      where: { id, organizationId },
    });
    return res.count > 0;
  }
}

export const testimonialService = new TestimonialService();
