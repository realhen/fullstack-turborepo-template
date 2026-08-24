'use client'
import { useFormStatus } from 'react-dom'
export function AuthSubmit({ children }: Readonly<{ children: string }>) { const { pending } = useFormStatus(); return <button className="mt-6 w-full rounded bg-white px-4 py-2 text-black disabled:opacity-60" disabled={pending} type="submit">{pending ? 'Please wait…' : children}</button> }
