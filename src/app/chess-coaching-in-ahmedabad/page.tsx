import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-ahmedabad");

export const metadata = cityMetadata(config);

export default function ChessCoachingInAhmedabadPage() {
  return <CityPage config={config} />;
}
