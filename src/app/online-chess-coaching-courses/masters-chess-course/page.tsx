import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("online-chess-coaching-courses/masters-chess-course");

export const metadata = courseMetadata(config);

export default function MastersCoursePage() {
  return <CoursePage config={config} />;
}
