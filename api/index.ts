// Vercel serverless entry point.
//
// Vercel automatically turns any file under /api into a serverless function.
// This file simply re-exports the existing Express app from server.ts so all
// the /api/seo/* routes defined there run as a single serverless function.
// See vercel.json for the rewrite rule that sends /api/* requests here, and
// server.ts for the guard that prevents app.listen() from running on Vercel.
import app from "../server";

export default app;
