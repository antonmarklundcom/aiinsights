"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { processItem } from "@/lib/process-item";

export async function setImplemented(id: number, implemented: boolean) {
  await requireSession();
  await db.update(items).set({ implemented, updatedAt: new Date() }).where(eq(items.id, id));
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function retryProcessing(id: number) {
  await requireSession();
  // processItem already records failures on the item (status/processingError);
  // don't let a rejected AI/network call blow up the form submission on top of that.
  // `force` because this IS the manual override — an item that burned through
  // MAX_ATTEMPTS is exactly the one the user is clicking retry on.
  await processItem(id, { force: true }).catch(() => {});
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function saveNote(id: number, note: string) {
  await requireSession();
  await db.update(items).set({ userNote: note, updatedAt: new Date() }).where(eq(items.id, id));
  // Adding a note is a fresh request to process it, ceiling included.
  await processItem(id, { force: true }).catch(() => {});
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function deleteItem(id: number) {
  await requireSession();
  await db.delete(items).where(eq(items.id, id));
  revalidatePath("/");
}
