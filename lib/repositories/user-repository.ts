import "server-only";
import { prisma } from "@/lib/db";

export const userRepository = {
  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  },

  findCredentialsByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  },

  async emailExists(email: string) {
    return (await prisma.user.count({ where: { email } })) > 0;
  },

  create(data: { name: string; email: string; passwordHash: string }) {
    return prisma.user.create({ data, select: { id: true } });
  },

  /**
   * Takes the user's "reply in progress" lock if it's free or older than `staleBefore`.
   * The conditional update makes this atomic. Returns whether the lock was taken.
   */
  async acquireReplyLock(id: string, staleBefore: Date) {
    const { count } = await prisma.user.updateMany({
      where: { id, OR: [{ generatingSince: null }, { generatingSince: { lt: staleBefore } }] },
      data: { generatingSince: new Date() },
    });
    return count > 0;
  },

  // updateMany, so it's a no-op (not an error) if the user was deleted mid-reply.
  releaseReplyLock(id: string) {
    return prisma.user.updateMany({ where: { id }, data: { generatingSince: null } });
  },
};
