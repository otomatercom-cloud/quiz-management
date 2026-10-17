import { ButtonLink } from "@/components/ui";

export default function Unauthorized() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-primary">403</p>
      <h1 className="text-2xl font-bold">You don&apos;t have access to this page</h1>
      <p className="text-muted">Ask an administrator to grant the required quiz role.</p>
      <ButtonLink href="/">Back to home</ButtonLink>
    </main>
  );
}
