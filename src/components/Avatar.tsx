import { initials } from '../lib/format'

export function Avatar({ name, color, size = 40, dimmed = false }: { name: string; color: string; size?: number; dimmed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white ${dimmed ? 'grayscale' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38, opacity: dimmed ? 0.6 : 1 }}
    >
      {initials(name)}
    </span>
  )
}
