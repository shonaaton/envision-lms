import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-delhi");

export const metadata = cityMetadata(config);

export default function ChessCoachingInDelhiPage() {
  return <CityPage config={config} />;
}
