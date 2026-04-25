import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Tracebee</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Open-source observability for LLM agents.
      </p>

      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}
        className="mt-6"
      >
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in with GitHub
        </button>
      </form>
    </main>
  );
}
