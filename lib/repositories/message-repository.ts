import "server-only";
import { prisma } from "@/lib/db";

export const messageRepository = {
  create(data: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    error?: string | null;
    tokens?: number;
  }) {
    return prisma.message.create({ data, select: { id: true } });
  },

  /** The turns sent back to the model: failed assistant turns are shown in the UI but left out here. */
  listForModel(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId, error: null },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
  },
};
