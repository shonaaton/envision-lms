import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("advanced-chess-course-online");

export const metadata = courseMetadata(config);

export default function AdvancedCoursePage() {
  return <CoursePage config={config} />;
}
