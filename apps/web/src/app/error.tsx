'use client'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <button
          className="mt-6 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
