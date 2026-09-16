import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("online-chess-coaching-courses/pro-chess-course");

export const metadata = courseMetadata(config);

export default function ProCoursePage() {
  return <CoursePage config={config} />;
}
