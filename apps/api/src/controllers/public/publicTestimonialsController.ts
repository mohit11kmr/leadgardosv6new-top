import { Router, type Request, type Response, type NextFunction } from 'express';
import { publicTestimonialsService } from '../../services/public/publicTestimonialsService.js';

export const publicTestimonialsRouter = Router();

// Publicly accessible approved testimonials
publicTestimonialsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const organizationId = req.query.organizationId as string | undefined;
    const clientWorkspaceId = req.query.clientWorkspaceId as string | undefined;

    const data = await publicTestimonialsService.listApprovedTestimonials({
      organizationId,
      clientWorkspaceId,
      limit,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});
