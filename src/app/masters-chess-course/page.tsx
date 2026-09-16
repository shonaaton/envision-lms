import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("masters-chess-course");

export const metadata = courseMetadata(config);

export default function MastersCoursePage() {
  return <CoursePage config={config} />;
}
