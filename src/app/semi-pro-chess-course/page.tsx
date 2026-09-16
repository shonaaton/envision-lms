import CoursePage from "@/components/marketing/CoursePage";
import { courseMetadata, getCoursePage } from "@/lib/coursePages";

const config = getCoursePage("semi-pro-chess-course");

export const metadata = courseMetadata(config);

export default function AdvancedCoursePage() {
  return <CoursePage config={config} />;
}
