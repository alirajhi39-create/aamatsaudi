import type { Metadata } from "next";
import LessonPlayer from "@/components/lesson/LessonPlayer";

export const metadata: Metadata = {
  title: "الدرس التفاعلي | أئمة الدولة السعودية الثانية",
};

export default function LessonPage() {
  return <LessonPlayer />;
}
