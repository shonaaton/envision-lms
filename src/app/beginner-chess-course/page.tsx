import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("beginner-chess-course");

export const metadata = courseMetadata(config);

export default function BeginnerCoursePage() {
  return <CoursePage config={config} />;
}
