import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-pune");

export const metadata = cityMetadata(config);

export default function ChessCoachingInPunePage() {
  return <CityPage config={config} />;
}
