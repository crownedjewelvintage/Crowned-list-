import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SPA fallback for the Crowned Jewel Vintage shop (served at /shop/)
  const shopIndex = path.resolve(distPath, "shop", "index.html");
  app.use("/shop/{*path}", (_req, res) => {
    if (fs.existsSync(shopIndex)) {
      res.sendFile(shopIndex);
    } else {
      res.status(404).send("Shop not built. Run `npm run build` in crowned-jewel-shop.");
    }
  });

  // fall through to Crown List index.html for everything else
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
