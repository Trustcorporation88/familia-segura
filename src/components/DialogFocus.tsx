import { useEffect, useRef, type ReactNode } from 'react'

/** Keep keyboard navigation inside a modal and restore its trigger on close. */
export function DialogFocus({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current!
    const selector = 'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]'
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(e => e.getClientRects().length > 0)
    items()[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return }
      if (e.key !== 'Tab') return
      const list = items(), first = list[0], last = list[list.length - 1]
      if (!first) { e.preventDefault(); root.focus(); return }
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div ref={ref} tabIndex={-1} className="contents">{children}</div>
}
