import LessonImage from "@/components/LessonImage";
import Link from "next/link";
import StudentLogin from "@/components/StudentLogin";
import { BIG_QUESTION, IMAMS, LESSON_SUBTITLE, LESSON_TITLE, SLIDES } from "@/lib/lesson-content";

const STRATEGIES = Array.from(new Set(SLIDES.map((s) => s.strategy)));

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <LessonImage src="/images/hero.jpg" alt="" fill priority className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-saudi-dark/80 via-saudi-dark/60 to-sand" />
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div className="text-white">
            <span className="chip bg-white/15 text-base text-white ring-1 ring-white/30">الوحدة الثالثة — الدرس الثامن — فصل ٦/ب</span>
            <h1 className="mt-4 font-heading text-4xl font-black leading-tight drop-shadow sm:text-5xl">{LESSON_TITLE}</h1>
            <p className="mt-2 text-white/85">{LESSON_SUBTITLE}</p>
            <div className="mt-6 rounded-3xl bg-white/10 p-4 ring-1 ring-white/25 backdrop-blur">
              <p className="text-sm text-gold">سؤال الدرس</p>
              <p className="font-heading text-lg font-bold leading-relaxed">{BIG_QUESTION}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {IMAMS.map((im, i) => (
                <div key={im.id} className="rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/20">
                  <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-full font-heading font-black text-white" style={{ background: im.color }}>
                    {i + 1}
                  </div>
                  <p className="text-xs font-bold leading-tight">{im.name}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/teacher" className="btn bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25">
                👩‍🏫 لوحة تحكم المعلم
              </Link>
            </div>
          </div>
          <div className="lg:pt-6">
            <StudentLogin />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 className="font-heading text-2xl font-black text-saudi">🎯 استراتيجيات التعلم في هذا الدرس</h2>
        <p className="mt-1 text-ink/60">{SLIDES.length} شريحة تفاعلية تجمع بين القراءة والاكتشاف واللعب والتقويم.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {STRATEGIES.map((s) => (
            <span key={s} className="chip bg-white text-ink/80 ring-1 ring-black/10">
              {s}
            </span>
          ))}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SLIDES.map((s, i) => (
            <div key={s.id} className="card flex items-center gap-3 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sand text-2xl">{s.icon}</span>
              <div className="min-w-0">
                <p className="truncate font-heading text-sm font-extrabold">
                  {i + 1}. {s.title}
                </p>
                <p className="truncate text-xs text-ink/50">{s.strategy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-black/5 py-6 text-center text-sm text-ink/50">
        منصة تعليمية تفاعلية — الدراسات الاجتماعية — الصف السادس الابتدائي
      </footer>
    </div>
  );
}
