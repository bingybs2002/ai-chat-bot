import "server-only";
import { prisma } from "@/lib/db";

// Every read is scoped to the owning user, so a conversation id alone never grants access.
export const conversationRepository = {
  listByUser(userId: string) {
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    });
  },

  findWithMessages(id: string, userId: string) {
    return prisma.conversation.findFirst({
      where: { id, userId },
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
  },

  findUsage(id: string, userId: string) {
    return prisma.conversation.findFirst({ where: { id, userId }, select: { tokensUsed: true } });
  },

  create(userId: string, title: string) {
    return prisma.conversation.create({ data: { userId, title }, select: { id: true } });
  },

  /** Bumps updatedAt so the chat moves to the top of the list. */
  touch(id: string) {
    return prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() }, select: { id: true } });
  },

  // updateMany, so a chat deleted mid-reply is a no-op rather than an error.
  addTokensUsed(id: string, tokens: number) {
    return prisma.conversation.updateMany({ where: { id }, data: { tokensUsed: { increment: tokens } } });
  },

  deleteAllByUser(userId: string) {
    return prisma.conversation.deleteMany({ where: { userId } });
  },
};
