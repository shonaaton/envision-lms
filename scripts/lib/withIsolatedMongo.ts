import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";

/** Local fixtures only. No .env file is loaded and no LMS connection is used. */
export async function withIsolatedMongo(run: (uri: string) => Promise<void>) {
  const binary = process.env.WHATSAPP_TEST_MONGO_BINARY || path.join(os.homedir(), ".cache", "mongodb-binaries", "mongod-x64-win32-7.0.24.exe");
  assert(fs.existsSync(binary), "Set WHATSAPP_TEST_MONGO_BINARY to a local mongod executable.");
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "whatsapp-features-"));
  const socket = net.createServer().listen(0, "127.0.0.1"); await once(socket, "listening");
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const child = spawn(binary, ["--dbpath", directory, "--port", String(port), "--bind_ip", "127.0.0.1", "--noauth", "--quiet"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stdout.on("data", (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-3000); });
  child.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-3000); });
  child.on("error", (error) => { diagnostics += error.message; });
  const uri = `mongodb://127.0.0.1:${port}/whatsapp_feature_test`;
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 500 }); ready = true; break; }
      catch { if (child.exitCode !== null) break; await new Promise((resolve) => setTimeout(resolve, 150)); }
    }
    assert(ready, `Isolated MongoDB could not start: ${diagnostics}`);
    await run(uri);
  } finally {
    await mongoose.disconnect();
    if (child.pid && child.exitCode === null) { const stopped = once(child, "exit"); child.kill(); await stopped; }
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert(path.basename(directory).startsWith("whatsapp-features-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
