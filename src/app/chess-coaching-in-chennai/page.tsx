import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-chennai");

export const metadata = cityMetadata(config);

export default function ChessCoachingInChennaiPage() {
  return <CityPage config={config} />;
}
