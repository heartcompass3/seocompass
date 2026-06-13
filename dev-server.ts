// Local development server with Vite middleware + HMR. Run via `npm run dev`.
//
// This file is the ONLY place `vite` (a devDependency) is imported. It is never
// imported by server.ts or api/index.ts, so the Vercel serverless function's
// bundle stays completely free of vite — which is what prevents the
// FUNCTION_INVOCATION_FAILED ("A server error has occurred") crash at load.
//
// DEV_SERVER is set before importing ./server so that server.ts skips its own
// standalone listen() and lets us attach the Vite dev middleware instead.
process.env.DEV_SERVER = "1";

async function start() {
  const { default: app } = await import("./server");
  const { createServer: createViteServer } = await import("vite");

  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dev server running on http://0.0.0.0:${PORT}`);
  });
}

start();
