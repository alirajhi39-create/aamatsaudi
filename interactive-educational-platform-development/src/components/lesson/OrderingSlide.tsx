"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ORDER_EVENTS } from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";
import { DoneBanner, Feedback, cx } from "@/components/ui";
import { arr, type SlideProps } from "./types";
import { shuffleUnsorted } from "./useShuffle";

type Ghost = { id: string; top: number; left: number; width: number; height: number };
type DragState = { id: string; pointerId: number; offsetY: number; el: HTMLElement };

const LONG_PRESS_MS = 200;
const MOVE_TOLERANCE = 8;

/**
 * Ordering strategy with real drag & drop:
 *  - Mouse: press anywhere on a card and drag.
 *  - Touch: drag from the ⠿ handle immediately, or long-press the card (quick swipes still scroll the page).
 *  - A "ghost" copy follows the pointer (portal → body) while the slot moves inside the list.
 *  - ▲▼ buttons remain as a keyboard/accessibility fallback.
 */
const EVENT_IDS = ORDER_EVENTS.map((e) => e.id);

export function OrderingSlide({ value, update, done, markDone }: SlideProps) {
  // A fresh random (never pre-sorted) order every time the slide is opened without saved progress
  const [initial] = useState(() => shuffleUnsorted(EVENT_IDS));
  const saved = arr<string>(value.order);
  const order = saved.length === ORDER_EVENTS.length ? saved : initial;
  const checked = Boolean(value.checked);
  const correctIds = ORDER_EVENTS.map((e) => e.id);
  const allCorrect = order.every((id, i) => id === correctIds[i]);

  const orderRef = useRef(order);
  orderRef.current = order;
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const dragRef = useRef<DragState | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const preventScroll = useCallback((e: TouchEvent) => {
    if (dragRef.current) e.preventDefault();
  }, []);
  useEffect(
    () => () => {
      document.removeEventListener("touchmove", preventScroll);
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [preventScroll],
  );

  const commit = (next: string[]) => {
    orderRef.current = next;
    update({ order: next, checked: false });
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const beginDrag = (id: string, el: HTMLElement, pointerId: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    dragRef.current = { id, pointerId, offsetY: clientY - rect.top, el };
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* pointer may already be gone */
    }
    setGhost({ id, top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    playSound("click");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLLIElement>, id: string) => {
    if (done) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return; // ▲▼ fallback buttons
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const fromHandle = Boolean(target.closest("[data-handle]"));
    startPos.current = { x: e.clientX, y: e.clientY };
    document.addEventListener("touchmove", preventScroll, { passive: false });
    if (e.pointerType === "mouse" || fromHandle) {
      e.preventDefault();
      beginDrag(id, el, e.pointerId, e.clientY);
    } else {
      const { pointerId, clientY } = e;
      cancelPress();
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null;
        beginDrag(id, el, pointerId, clientY);
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const d = dragRef.current;
    if (!d) {
      // Finger moved before the long-press fired → the user wants to scroll, not drag.
      if (pressTimer.current && startPos.current && Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y) > MOVE_TOLERANCE) cancelPress();
      return;
    }
    if (e.pointerId !== d.pointerId) return;
    setGhost((g) => (g ? { ...g, top: e.clientY - d.offsetY } : g));

    const current = orderRef.current;
    const others = current.filter((x) => x !== d.id);
    let target = 0;
    for (const oid of others) {
      const el = itemRefs.current.get(oid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) target++;
    }
    if (target !== current.indexOf(d.id)) {
      const next = [...others];
      next.splice(target, 0, d.id);
      commit(next);
    }
    // Auto-scroll when dragging near the viewport edges
    const edge = 72;
    if (e.clientY < edge) window.scrollBy({ top: -14 });
    else if (e.clientY > window.innerHeight - edge) window.scrollBy({ top: 14 });
  };

  const endDrag = () => {
    cancelPress();
    document.removeEventListener("touchmove", preventScroll);
    const d = dragRef.current;
    if (!d) return;
    try {
      d.el.releasePointerCapture(d.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setGhost(null);
    playSound("flip");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    playSound("click");
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const check = () => {
    playSound(allCorrect ? "success" : "wrong");
    update({ checked: true, attempts: (typeof value.attempts === "number" ? (value.attempts as number) : 0) + 1 });
    if (allCorrect) markDone();
  };

  const renderCard = (id: string, i: number, isGhost = false) => {
    const ev = ORDER_EVENTS.find((e) => e.id === id)!;
    const ok = checked && id === correctIds[i];
    const bad = checked && id !== correctIds[i];
    const isPlaceholder = !isGhost && ghost?.id === id;
    return (
      <div
        className={cx(
          "flex items-center gap-2 rounded-2xl border-2 bg-white p-2 transition-colors sm:gap-3",
          ok ? "border-emerald-400 bg-emerald-50" : bad ? "border-rose-300 bg-rose-50" : "border-sand-dark",
          isPlaceholder && "drag-placeholder",
          isGhost && "border-saudi",
        )}
      >
        <span
          data-handle
          style={{ touchAction: "none" }}
          className={cx(
            "flex h-12 w-12 shrink-0 select-none flex-col items-center justify-center rounded-xl font-heading font-bold text-white",
            done ? "bg-saudi" : "cursor-grab bg-saudi active:cursor-grabbing",
          )}
          aria-hidden
        >
          <span className="text-lg leading-none">{i + 1}</span>
          {!done && <span className="mt-0.5 text-[11px] leading-none opacity-80">⠿</span>}
        </span>
        <span className="flex-1 text-base font-medium leading-relaxed sm:text-lg">
          {ev.text}
          {(ok || done) && <span className="mr-2 chip bg-gold-light text-amber-900">{ev.year}</span>}
        </span>
        {!done && !isGhost && (
          <div className="flex flex-col gap-1">
            <button type="button" className="rounded-lg bg-sand px-2 py-0.5 text-sm hover:bg-saudi hover:text-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="تحريك لأعلى">
              ▲
            </button>
            <button type="button" className="rounded-lg bg-sand px-2 py-0.5 text-sm hover:bg-saudi hover:text-white disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="تحريك لأسفل">
              ▼
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="grid content-start gap-4 lg:col-span-2">
        <div className="card p-4 sm:p-5">
          <h3 className="mb-2 font-heading text-xl font-extrabold text-maroon">📜 نهاية الدولة السعودية الثانية</h3>
          <div className="space-y-2 text-base leading-[2] sm:text-lg">
            <p>
              واجه الإمام عبدالرحمن بن فيصل في أثناء حكمه تحديات كثيرة نتيجة النزاع الداخلي، وأطماع محمد بن رشيد الشخصية. وفي <b>معركة المُلَيْداء عام ١٣٠٨هـ</b> انتصر محمد بن رشيد، وغادر الإمام عبدالرحمن بن فيصل الرياض في العام اللاحق ومعه أسرته وابنه الملك عبدالعزيز حتى استقروا في <b>الكويت</b>.
            </p>
            <p>وبذلك انتهت الدولة السعودية الثانية لتعود مرة ثالثة على يد الملك عبدالعزيز.</p>
            <p>
              عادت شبه الجزيرة العربية بعد سقوط الدولة السعودية الثانية إلى غياب الدولة الواحدة؛ وهو ما أدى إلى الفوضى والنزاعات، وجعل الناس يتطلعون إلى عودة الحكم. وفي زمن أحداث النزاع وُلد <b className="text-saudi">الملك عبدالعزيز بن عبدالرحمن</b> في الرياض عام <b className="text-maroon">١٢٩٣هـ</b>، وعاصر انتهاء الدولة السعودية الثانية.
            </p>
          </div>
        </div>
      </div>
      <div className="card p-4 sm:p-5 lg:col-span-3">
        <h4 className="font-heading text-lg font-extrabold text-saudi sm:text-xl">رتّب الأحداث من الأقدم إلى الأحدث</h4>
        <p className="mb-3 text-sm text-ink/60 sm:text-base">🖐️ اسحب كل حدث وأفلته في مكانه الصحيح (على الجوال: اسحب من المقبض ⠿ أو اضغط مطولاً على البطاقة)، ثم اضغط «تحقق».</p>
        <ol className="grid select-none gap-2" style={{ WebkitTouchCallout: "none" }}>
          {order.map((id, i) => (
            <li
              key={id}
              ref={(el) => {
                if (el) itemRefs.current.set(id, el);
                else itemRefs.current.delete(id);
              }}
              onPointerDown={(e) => onPointerDown(e, id)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={cx(!done && "cursor-grab")}
            >
              {renderCard(id, i)}
            </li>
          ))}
        </ol>
        {mounted &&
          ghost &&
          createPortal(
            <div className="drag-ghost" style={{ top: ghost.top, left: ghost.left, width: ghost.width }}>
              {renderCard(ghost.id, order.indexOf(ghost.id), true)}
            </div>,
            document.body,
          )}
        {!done && (
          <button className="btn-primary mt-4 text-lg" onClick={check}>
            تحقق ✔
          </button>
        )}
        {checked && !allCorrect && (
          <div className="mt-3">
            <Feedback kind="wrong">بعض الأحداث ليست في مكانها الصحيح (البطاقات الحمراء). فكّر في السنوات واسحبها إلى مكانها الصحيح ثم حاول مجدداً.</Feedback>
          </div>
        )}
        {done && (
          <div className="mt-3">
            <DoneBanner>أحسنت! رتبت الأحداث ترتيباً زمنياً صحيحاً.</DoneBanner>
          </div>
        )}
      </div>
    </div>
  );
}
