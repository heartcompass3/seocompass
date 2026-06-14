// Vercel serverless entry point.
//
// Vercel automatically turns any file under /api into a serverless function.
// This file simply re-exports the existing Express app from server.ts so all
// the /api/seo/* routes defined there run as a single serverless function.
// See vercel.json for the rewrite rule that sends /api/* requests here, and
// server.ts for the guard that prevents app.listen() from running on Vercel.
// NOTE: the ".js" extension is REQUIRED. package.json is `"type": "module"`,
// so Vercel runs this as native ESM, and Node's ESM resolver demands an
// explicit file extension. A bare `../server` import throws ERR_MODULE_NOT_FOUND
// at function load on Vercel ("A server error has occurred"). With
// moduleResolution "bundler", TypeScript still resolves "../server.js" to
// server.ts locally, so the build and dev server are unaffected.
import app from "../server.js";

export default app;
