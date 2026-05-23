#!/usr/bin/env node
/**
 * Nightly backup script.
 *
 * Runs `sqlite3 .backup` against the live DB (safe even with concurrent writes),
 * tars it with the uploads directory, and ships the result to Cloudflare R2.
 *
 * Required env vars:
 *   DB_PATH                e.g. /var/data/data.db
 *   UPLOAD_DIR             e.g. /var/data/uploads
 *   R2_ACCOUNT_ID          Cloudflare account id (32 hex chars)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET              bucket name (default: crownlist-backups)
 *   RETENTION_DAYS         days to keep (default: 30)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, statSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

const env = process.env;
const REQUIRED = ["DB_PATH", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
for (const k of REQUIRED) {
  if (!env[k]) {
    console.error(`[backup] missing env: ${k}`);
    process.exit(1);
  }
}

const DB_PATH = env.DB_PATH;
const UPLOAD_DIR = env.UPLOAD_DIR || "";
const BUCKET = env.R2_BUCKET || "crownlist-backups";
const RETENTION_DAYS = Number(env.RETENTION_DAYS || 30);
const ENDPOINT = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} -> exit ${r.status}`);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"); // 2026-05-23T21-17-00-000Z
  const date = stamp.slice(0, 10);
  const work = mkdtempSync(join(tmpdir(), "crownlist-backup-"));
  const dbCopy = join(work, "data.db");
  const archive = join(work, `crownlist-${stamp}.tar.gz`);

  try {
    if (!existsSync(DB_PATH)) {
      console.error(`[backup] DB not found at ${DB_PATH}`);
      process.exit(1);
    }
    console.log(`[backup] copying ${DB_PATH} -> ${dbCopy}`);
    {
      const src = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      try {
        await src.backup(dbCopy);
      } finally {
        src.close();
      }
    }

    const tarArgs = ["-czf", archive, "-C", work, "data.db"];
    if (UPLOAD_DIR && existsSync(UPLOAD_DIR)) {
      tarArgs.push("-C", UPLOAD_DIR === "/" ? "/" : UPLOAD_DIR.replace(/\/[^/]+$/, "") || "/", UPLOAD_DIR.split("/").pop());
    }
    console.log(`[backup] tar ${archive}`);
    run("tar", tarArgs);

    const size = statSync(archive).size;
    console.log(`[backup] archive ${(size / 1024 / 1024).toFixed(2)} MB`);

    const s3 = new S3Client({
      region: "auto",
      endpoint: ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const key = `daily/${date}/crownlist-${stamp}.tar.gz`;
    console.log(`[backup] uploading to r2://${BUCKET}/${key}`);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: readFileSync(archive),
        ContentType: "application/gzip",
      })
    );
    console.log(`[backup] upload ok`);

    // Retention: delete anything older than RETENTION_DAYS
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let continuationToken;
    let deleted = 0;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "daily/", ContinuationToken: continuationToken })
      );
      for (const obj of list.Contents || []) {
        if (obj.LastModified && obj.LastModified.getTime() < cutoff) {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
          deleted++;
        }
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
    if (deleted) console.log(`[backup] retention: deleted ${deleted} old object(s)`);
    console.log(`[backup] done`);
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("[backup] FAILED:", err);
  process.exit(1);
});
