"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-muted">The service may be temporarily unavailable. Please try again in a moment.</p>
      <button className="btn-primary" onClick={reset}>Try again</button>
    </main>
  );
}
