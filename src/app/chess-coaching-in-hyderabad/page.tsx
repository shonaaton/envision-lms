import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-hyderabad");

export const metadata = cityMetadata(config);

export default function ChessCoachingInHyderabadPage() {
  return <CityPage config={config} />;
}
