"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAgent } from "@/lib/auth";
import { audit, createKbArticle, getKbArticle, publishKbArticle, updateKbArticle } from "@/lib/db/queries";
import { embedDocument } from "@/lib/ai/embeddings";
import { env } from "@/lib/env";

const articleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50000),
});

// Embed for publish without letting the embedding service crash the click.
// Pre-go-live (Voyage not wired) we publish now and embed once the key lands;
// with a wired key a transient failure propagates (caught by the route's error
// boundary) so the agent retries rather than shipping an unsearchable article.
async function embedForPublish(text: string): Promise<number[] | null> {
  if (!env.voyageConfigured) return null;
  return embedDocument(text);
}

export async function saveArticleAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const input = articleSchema.parse(Object.fromEntries(formData));

  if (input.id) {
    const existing = await getKbArticle(input.id);
    if (!existing) throw new Error("Article not found");
    await updateKbArticle(input.id, { title: input.title, body: input.body });
    // Published articles answer live tickets — re-embed on edit.
    if (existing.status === "published") {
      await publishKbArticle(input.id, await embedForPublish(`${input.title}\n\n${input.body}`));
    }
    await audit("human", session.email, "kb.updated", { type: "kb_article", id: input.id });
    revalidatePath("/staff/kb");
  } else {
    const article = await createKbArticle({
      title: input.title,
      body: input.body,
      status: "draft",
      source: "manual",
      created_by: session.email,
    });
    await audit("human", session.email, "kb.created", { type: "kb_article", id: article.id });
    revalidatePath("/staff/kb");
    redirect(`/staff/kb?status=draft&id=${article.id}`);
  }
}

export async function publishArticleAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));
  const article = await getKbArticle(id);
  if (!article) throw new Error("Article not found");

  await publishKbArticle(id, await embedForPublish(`${article.title}\n\n${article.body}`));
  await audit("human", session.email, "kb.published", { type: "kb_article", id });
  revalidatePath("/staff/kb");
  redirect(`/staff/kb?status=published&id=${id}`);
}

export async function archiveArticleAction(formData: FormData): Promise<void> {
  const session = await requireAgent();
  const id = z.string().uuid().parse(formData.get("id"));

  await updateKbArticle(id, { status: "archived" });
  await audit("human", session.email, "kb.archived", { type: "kb_article", id });
  revalidatePath("/staff/kb");
  redirect("/staff/kb");
}
