"use server";

import { getUser } from "@/lib/dal";
import { clearAllChats as clearAllChatsForUser } from "@/lib/services/chat-service";

export async function clearAllChats() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  await clearAllChatsForUser(user.id);
}
