import Link from "next/link";
import { createProject } from "../actions";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">New project</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Projects group your traces and own their API keys.
      </p>

      <form action={createProject} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-neutral-900"
          >
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            autoFocus
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create project
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-neutral-600 hover:text-neutral-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
