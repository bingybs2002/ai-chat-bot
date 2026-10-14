"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const toErrors = (messages?: string[]) => messages?.map((message) => ({ message }));

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate>
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                defaultValue={state?.fields?.email}
                aria-invalid={!!state?.errors?.email}
                required
              />
              <FieldError errors={toErrors(state?.errors?.email)} />
            </Field>
            <Field data-invalid={!!state?.errors?.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!state?.errors?.password}
                required
              />
              <FieldError errors={toErrors(state?.errors?.password)} />
            </Field>
            {state?.message && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Logging in…" : "Log in"}
              </Button>
              <FieldDescription className="text-center">
                Don&apos;t have an account? <Link href="/signup">Sign up</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
