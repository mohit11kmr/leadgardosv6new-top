import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@leadguard/database';

export const publicTestimonialsRouter = Router();

// Publicly accessible approved testimonials
publicTestimonialsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const organizationId = req.query.organizationId as string | undefined;
    const clientWorkspaceId = req.query.clientWorkspaceId as string | undefined;

    const testimonials = await db.testimonial.findMany({
      where: {
        status: 'APPROVED',
        ...(organizationId ? { organizationId } : {}),
        ...(clientWorkspaceId ? { clientWorkspaceId } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authorName: true,
        companyName: true,
        role: true,
        content: true,
        rating: true,
        publishedAt: true,
      },
    });

    res.json({
      success: true,
      data: testimonials,
    });
  } catch (error) {
    next(error);
  }
});
