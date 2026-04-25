"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { projects, projectUsers } from "@/db/schema";

export async function createProject(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0 || name.length > 80) {
    throw new Error("Project name must be 1–80 characters.");
  }

  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(projects).values({ id, name });
    await tx.insert(projectUsers).values({
      userId: session.user.id,
      projectId: id,
      role: "owner",
    });
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
