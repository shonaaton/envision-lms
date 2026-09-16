import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("online-chess-coaching-courses/intermediate-chess-course");

export const metadata = courseMetadata(config);

export default function IntermediateCoursePage() {
  return <CoursePage config={config} />;
}
