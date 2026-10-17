"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@/components/ui";
import { Field, postJson } from "@/components/forms";
import { profileSchema } from "@/lib/validation/schemas";

type Values = z.input<typeof profileSchema>;

export function ProfileForm({ initial }: { initial: { name: string; phone: string; student_code: string; education: string } }) {
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(profileSchema), defaultValues: initial });
  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setMsg(null);
      try { await postJson("/api/student/update_profile", v); setMsg({ tone: "success", text: "Profile updated." }); }
      catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
    })}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Full name" error={errors.name?.message}><input className="input" {...register("name")} /></Field>
      <Field label="Mobile number" error={errors.phone?.message}><input className="input" type="tel" {...register("phone")} /></Field>
      <Field label="Student ID"><input className="input" {...register("student_code")} /></Field>
      <Field label="Course / education"><input className="input" {...register("education")} /></Field>
      <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
