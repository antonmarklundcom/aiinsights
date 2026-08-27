"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { processItem } from "@/lib/process-item";

export async function setImplemented(id: number, implemented: boolean) {
  await db.update(items).set({ implemented, updatedAt: new Date() }).where(eq(items.id, id));
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function retryProcessing(id: number) {
  await processItem(id);
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function saveNote(id: number, note: string) {
  await db.update(items).set({ userNote: note, updatedAt: new Date() }).where(eq(items.id, id));
  await processItem(id);
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}

export async function deleteItem(id: number) {
  await db.delete(items).where(eq(items.id, id));
  revalidatePath("/");
}
