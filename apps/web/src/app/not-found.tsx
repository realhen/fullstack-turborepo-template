import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="font-mono text-sm text-zinc-500">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
        <Link
          className="mt-6 inline-block text-zinc-300 underline underline-offset-4"
          href="/"
        >
          Return home
        </Link>
      </div>
    </main>
  )
}
