"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const toErrors = (messages?: string[]) => messages?.map((message) => ({ message }));

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your details below to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate>
          <FieldGroup>
            <Field data-invalid={!!state?.errors?.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                defaultValue={state?.fields?.name}
                aria-invalid={!!state?.errors?.name}
                required
              />
              <FieldError errors={toErrors(state?.errors?.name)} />
            </Field>
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
                autoComplete="new-password"
                aria-invalid={!!state?.errors?.password}
                required
              />
              {state?.errors?.password ? (
                <FieldError errors={toErrors(state.errors.password)} />
              ) : (
                <FieldDescription>At least 8 characters, with a letter and a number.</FieldDescription>
              )}
            </Field>
            {state?.message && <p className="text-sm text-destructive">{state.message}</p>}
            <Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating account…" : "Sign up"}
              </Button>
              <FieldDescription className="text-center">
                Already have an account? <Link href="/login">Log in</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
