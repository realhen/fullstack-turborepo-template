import type { InputHTMLAttributes } from 'react'
export function AuthField({
  label,
  ...props
}: Readonly<{ label: string } & InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <label className="mt-4 block text-sm">
      <span>{label}</span>
      <input
        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 p-2"
        {...props}
      />
    </label>
  )
}
