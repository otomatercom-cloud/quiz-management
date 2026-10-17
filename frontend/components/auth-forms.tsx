"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";
import { loginSchema, registerSchema, type RegisterInput } from "@/lib/validation/schemas";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null);
      try {
        await postJson("/api/auth/register", v);
        router.push("/student/dashboard");
        router.refresh();
      } catch (e) { setError((e as Error).message); }
    })}>
      {error && <Alert>{error}</Alert>}
      <Field label="Full name" error={errors.name?.message}><input className="input" autoComplete="name" {...register("name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label="Mobile number" error={errors.phone?.message}><input className="input" type="tel" autoComplete="tel" {...register("phone")} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student ID (optional)" error={errors.student_code?.message}><input className="input" {...register("student_code")} /></Field>
        <Field label="Course / education (optional)" error={errors.education?.message}><input className="input" {...register("education")} /></Field>
      </div>
      <Field label="Password" error={errors.password?.message} hint="At least 8 characters">
        <input className="input" type="password" autoComplete="new-password" {...register("password")} />
      </Field>
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Creating account…" : "Create account"}</button>
      <p className="text-center text-sm text-muted">Already registered? <Link className="font-semibold text-primary" href="/login">Sign in</Link></p>
    </form>
  );
}

type LoginInput = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [staff, setStaff] = useState(params.get("staff") === "1");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null);
      try {
        await postJson(staff ? "/api/auth/staff-login" : "/api/auth/login", v);
        const next = params.get("next");
        router.push(staff ? "/admin/dashboard" : next && next.startsWith("/student") ? next : "/student/dashboard");
        router.refresh();
      } catch (e) { setError((e as Error).message); }
    })}>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold" role="tablist">
        <button type="button" role="tab" aria-selected={!staff} onClick={() => setStaff(false)} className={!staff ? "rounded-md bg-white py-2 shadow-card" : "py-2 text-muted"}>Student</button>
        <button type="button" role="tab" aria-selected={staff} onClick={() => setStaff(true)} className={staff ? "rounded-md bg-white py-2 shadow-card" : "py-2 text-muted"}>Staff</button>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label={staff ? "Odoo login" : "Email"} error={errors.login?.message}><input className="input" autoComplete="username" {...register("login")} /></Field>
      <Field label="Password" error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" {...register("password")} /></Field>
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button>
      {!staff && (
        <p className="text-center text-sm text-muted">
          <Link className="text-primary" href="/forgot-password">Forgot password?</Link> · <Link className="font-semibold text-primary" href="/register">Create account</Link>
        </p>
      )}
    </form>
  );
}

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().trim().email("Enter a valid email address") })),
  });
  if (done) return <Alert tone="success">If an account exists for that email, a reset link has been sent.</Alert>;
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null);
      try { await postJson("/api/auth/forgot", v); setDone(true); } catch (e) { setError((e as Error).message); }
    })}>
      {error && <Alert>{error}</Alert>}
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register("email")} /></Field>
      <button className="btn-primary w-full" disabled={isSubmitting}>Send reset link</button>
    </form>
  );
}
