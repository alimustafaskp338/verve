import { app, ensureDbReady } from '../server/app';

export default async function handler(req: any, res: any) {
  // Ensure database tables and initial seed data are populated on serverless cold starts
  await ensureDbReady();
  return app(req, res);
}
