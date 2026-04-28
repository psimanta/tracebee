import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { count } = await import("drizzle-orm");
  const { db } = await import("../src/db/client");
  const { accounts, sessions, users } = await import("../src/db/schema");

  async function counts() {
    const [u] = await db.select({ n: count() }).from(users);
    const [a] = await db.select({ n: count() }).from(accounts);
    const [s] = await db.select({ n: count() }).from(sessions);
    return { users: u.n, accounts: a.n, sessions: s.n };
  }

  console.log("before:", await counts());

  await db.delete(sessions);
  await db.delete(accounts);

  console.log("after: ", await counts());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
