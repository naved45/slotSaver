import { Router } from 'express';
import publicRoutes from './public.routes.js';
import invitationRoutes from './invitations.routes.js';
import orgRoutes from './org.routes.js';

/** All API routers mounted under /api/v1 (auth and dev routes are mounted in app.js). */
export const apiRoutes = Router();
apiRoutes.use('/public', publicRoutes);
apiRoutes.use('/invitations', invitationRoutes);
apiRoutes.use('/orgs/:orgId', orgRoutes);
