import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-mumbai");

export const metadata = cityMetadata(config);

export default function ChessCoachingInMumbaiPage() {
  return <CityPage config={config} />;
}
