import type { ComponentProps } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  intent?: 'primary' | 'secondary'
}

const intentClasses = {
  primary: 'bg-zinc-100 text-zinc-950 hover:bg-white',
  secondary:
    'border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800',
} as const

export function Button({
  className = '',
  intent = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 ${intentClasses[intent]} ${className}`}
      type={type}
      {...props}
    />
  )
}
