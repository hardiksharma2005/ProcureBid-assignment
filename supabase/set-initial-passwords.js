// One-off script: sets a password for an existing Supabase Auth user (a
// buyer or a seeded vendor that predates password auth) via the admin API.
//
// Why this exists: existing users only ever signed in via magic link and
// have no password set. Run this once per user after the password-auth
// migration to give them a way to sign in with email + password too.
//
// Usage:
//   node supabase/set-initial-passwords.js <email> <password>
//   PASSWORD=... node supabase/set-initial-passwords.js <email>
//
// The password is never hardcoded here — pass it as a CLI argument or via
// the PASSWORD env var (e.g. .env.local, or inline on the command line).

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

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const email = process.argv[2];
  const password = process.argv[3] || env.PASSWORD;

  if (!email) {
    console.error("Usage: node supabase/set-initial-passwords.js <email> [password]");
    process.exit(1);
  }
  if (!password) {
    console.error("No password given — pass it as a second argument or set PASSWORD in .env.local.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const supabaseAdmin = createClient(url, serviceKey);

  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error("Failed to list auth users:", listError.message);
    process.exit(1);
  }

  const user = userList.users.find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
  );
  if (!user) {
    console.error(`No auth user found for ${email}. Run "npm run seed:auth" first.`);
    process.exit(1);
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });

  if (error) {
    console.error(`Failed to set password for ${email}: ${error.message}`);
    process.exit(1);
  }

  console.log(`Password set for ${email}.`);
}

main();
