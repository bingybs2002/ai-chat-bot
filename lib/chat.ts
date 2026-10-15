import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error: string | null;
};

export async function getConversations() {
  const user = await getCurrentUser();
  return prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
}

export async function getConversation(id: string) {
  const user = await getCurrentUser();
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      tokensUsed: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, content: true, error: true },
      },
    },
  });
  if (!conversation) notFound();
  return { ...conversation, messages: conversation.messages as ChatMessage[] };
}
