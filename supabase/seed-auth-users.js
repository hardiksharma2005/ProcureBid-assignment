// One-off/repeatable script: creates a Supabase Auth user for every buyer
// (BUYER_EMAILS) and every vendor currently in the `vendors` table.
//
// Why this exists: signInWithOtp() 500s the first time it tries to
// auto-create a brand-new auth user on this project (even with "Allow new
// user signups" enabled in the dashboard). Pre-creating the auth user here
// via the admin API sidesteps that entirely — afterwards, signInWithOtp
// just sends a magic link to an already-existing user, which works fine.
//
// Run again any time a new vendor is added to the vendors table.
//
// Usage: npm run seed:auth

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = { ...process.env };

  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match) env[match[1]] = match[2];
      });
  }

  return env;
}

function isAlreadyRegistered(error) {
  return (
    error.code === "email_exists" ||
    error.message?.toLowerCase().includes("already been registered")
  );
}

// BUYER_EMAILS is comma-separated; falls back to the legacy single-value
// BUYER_EMAIL so this script keeps working mid-migration.
function getBuyerEmails(env) {
  const raw = env.BUYER_EMAILS ?? env.BUYER_EMAIL ?? "";
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const buyerEmails = getBuyerEmails(env);

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabaseAdmin = createClient(url, serviceKey);

  const { data: vendors, error: vendorsError } = await supabaseAdmin
    .from("vendors")
    .select("email, name");

  if (vendorsError) {
    console.error("Failed to fetch vendors:", vendorsError.message);
    process.exit(1);
  }

  if (buyerEmails.length === 0) {
    console.warn(
      "BUYER_EMAILS (or legacy BUYER_EMAIL) not set in .env.local — skipping buyer account(s)."
    );
  }

  const accounts = [
    ...buyerEmails.map((email) => ({ email, name: "Buyer" })),
    ...vendors.map((v) => ({ email: v.email, name: v.name })),
  ];

  for (const { email, name } of accounts) {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (!error) {
      console.log(`created auth user for ${name} <${email}>`);
    } else if (isAlreadyRegistered(error)) {
      console.log(`skipped ${name} <${email}> — already exists`);
    } else {
      console.error(`failed to create auth user for ${name} <${email}>: ${error.message}`);
    }
  }
}

main();
