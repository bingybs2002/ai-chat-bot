"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { FormState, LoginFormSchema, SignupFormSchema } from "@/lib/definitions";
import { registerUser, verifyCredentials } from "@/lib/services/auth-service";
import { createSession, deleteSession } from "@/lib/session";

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

  const userId = await registerUser(parsed.data);
  if (!userId) {
    return { errors: { email: ["An account with this email already exists."] }, fields };
  }

  await createSession(userId);
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

  const userId = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!userId) {
    return { message: "Invalid email or password.", fields };
  }

  await createSession(userId);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
