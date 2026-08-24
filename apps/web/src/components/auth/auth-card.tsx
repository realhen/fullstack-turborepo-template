import type { ReactNode } from 'react'
export function AuthCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) { return <main className="mx-auto flex min-h-screen max-w-md items-center px-6"><section className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-8"><h1 className="text-2xl font-semibold">{title}</h1>{children}</section></main> }
