import type { Metadata } from "next";
import TeacherDashboard from "@/components/teacher/TeacherDashboard";

export const metadata: Metadata = {
  title: "لوحة تحكم المعلم | أئمة الدولة السعودية الثانية",
};

export default function TeacherPage() {
  return <TeacherDashboard />;
}
