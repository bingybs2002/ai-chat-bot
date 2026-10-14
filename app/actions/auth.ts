"use server";

import bcrypt from "bcryptjs";
import * as z from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { FormState, LoginFormSchema, SignupFormSchema } from "@/lib/definitions";

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so login takes similar time
// whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

export async function signup(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignupFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const fields = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, fields };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { errors: { email: ["An account with this email already exists."] }, fields };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true },
  });

  await createSession(user.id);
  redirect("/");
}

export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const fields = { email: String(formData.get("email") ?? "") };

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, fields };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    return { message: "Invalid email or password.", fields };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

/** Signs out and goes straight to sign-up (used when an account has run out of tokens). */
export async function logoutToSignup() {
  await deleteSession();
  redirect("/signup");
}
