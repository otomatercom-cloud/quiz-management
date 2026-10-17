import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthCard title="Reset your password" subtitle="We will email you a reset link.">
      <ForgotForm />
    </AuthCard>
  );
}
