import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1 });

const [{ version }] = await sql`select version()`;
console.log(version);

await sql.end();