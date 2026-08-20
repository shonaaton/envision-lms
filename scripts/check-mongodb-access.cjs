#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const envPath = path.resolve(process.cwd(), ".env");

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function redactMongoUri(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, (_, user) => `//${user}:***@`);
}

async function getPublicIp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://api.ipify.org?format=text", { signal: controller.signal });
    if (!response.ok) return "";
    return (await response.text()).trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  loadEnvFile();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("!! MONGODB_URI is not set in .env");
    process.exit(1);
  }

  const publicIp = await getPublicIp();
  console.log("==> Checking MongoDB Atlas connectivity...");
  if (publicIp) console.log(`    VPS outbound IP: ${publicIp}`);
  console.log(`    MongoDB URI: ${redactMongoUri(uri)}`);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
    family: 4,
  });

  try {
    await client.connect();
    await client.db(process.env.MONGODB_DB || "envision_chess").command({ ping: 1 });
    console.log("==> MongoDB Atlas connection OK.");
  } catch (error) {
    console.error("!! MongoDB Atlas connection failed.");
    console.error(`   ${error?.name || "Error"}: ${error?.message || String(error)}`);
    console.error("");
    console.error("   Things to check:");
    console.error("   1. MongoDB Atlas > Security > Network Access allows this VPS IP.");
    if (publicIp) console.error(`      VPS IP detected by this script: ${publicIp}/32`);
    else console.error("      Could not detect the VPS public outbound IP automatically.");
    console.error("   2. If Atlas already allows 0.0.0.0/0, check the VPS firewall/provider firewall.");
    console.error("      Outbound TCP traffic to MongoDB Atlas on port 27017 must be allowed.");
    console.error("   3. Confirm the Atlas cluster is running and the MONGODB_URI username/password are correct.");
    console.error("   4. Wait 1-2 minutes after Atlas access-list changes, then run the deploy again.");
    console.error("");
    console.error("   For a quick temporary test only, Atlas also allows 0.0.0.0/0,");
    console.error("   but a single VPS IP is safer for production.");
    process.exit(1);
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("!! MongoDB connectivity check crashed.");
  console.error(error);
  process.exit(1);
});
