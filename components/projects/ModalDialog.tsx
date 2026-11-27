"use client"

import { useEffect, useRef, type ReactNode } from "react"

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusablesIn(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)
}

/**
 * <dialog> modal: showModal() (resto da página fica inert e o diálogo vai para o top layer),
 * foco preso com Tab/Shift+Tab, Esc tratado no document, scroll do body travado
 * e foco devolvido a quem abriu. Montar só quando aberto.
 *
 * Esc, clique no fundo e o X chamam `onRequestClose` — quem usa decide se fecha
 * (ex.: confirmar alterações não salvas).
 */
export function ModalDialog({
    onRequestClose,
    labelledBy,
    label,
    className,
    children,
}: {
    onRequestClose: () => void
    labelledBy?: string
    label?: string
    className?: string
    children: ReactNode
}) {
    const ref = useRef<HTMLDialogElement>(null)
    const closeRef = useRef(onRequestClose)
    useEffect(() => {
        closeRef.current = onRequestClose
    }, [onRequestClose])

    useEffect(() => {
        const dlg = ref.current
        if (!dlg) return
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (!dlg.open) dlg.showModal()
        const initial = dlg.querySelector<HTMLElement>("[data-autofocus]") ?? focusablesIn(dlg)[0]
        initial?.focus()

        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                closeRef.current()
                return
            }
            if (e.key !== "Tab") return
            const items = focusablesIn(dlg)
            if (items.length === 0) {
                e.preventDefault()
                return
            }
            const first = items[0]
            const last = items[items.length - 1]
            const active = document.activeElement
            if (!dlg.contains(active)) {
                e.preventDefault()
                first.focus()
            } else if (e.shiftKey && active === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && active === last) {
                e.preventDefault()
                first.focus()
            }
        }
        // o "cancel" nativo do Esc fecharia o diálogo sem passar pela confirmação
        const onCancel = (e: Event) => e.preventDefault()

        document.addEventListener("keydown", onKeyDown, true)
        dlg.addEventListener("cancel", onCancel)
        return () => {
            document.removeEventListener("keydown", onKeyDown, true)
            dlg.removeEventListener("cancel", onCancel)
            document.body.style.overflow = prevOverflow
            if (dlg.open) dlg.close()
            if (opener && opener.isConnected) opener.focus()
        }
    }, [])

    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : label}
            className={className}
            onClick={(e) => {
                // clique no ::backdrop chega com target = o próprio <dialog>
                if (e.target === e.currentTarget) closeRef.current()
            }}
        >
            {children}
        </dialog>
    )
}
