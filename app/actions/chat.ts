"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * Deletes all of the user's chats (and with them, their token usage) and releases the
 * "reply in progress" lock, which can otherwise stay held for up to 10 minutes after a
 * request dies mid-reply.
 */
export async function clearAllChats() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  await prisma.$transaction([
    prisma.conversation.deleteMany({ where: { userId: session.userId } }),
    prisma.user.updateMany({ where: { id: session.userId }, data: { generatingSince: null } }),
  ]);
}
