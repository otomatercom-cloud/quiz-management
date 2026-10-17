import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
      <ButtonLink href="/">Back to home</ButtonLink>
    </main>
  );
}
