import CityPage from "@/components/marketing/CityPage";
import { cityMetadata, getCityPage } from "@/lib/cityPages";

const config = getCityPage("chess-coaching-in-bangalore");

export const metadata = cityMetadata(config);

export default function ChessCoachingInBangalorePage() {
  return <CityPage config={config} />;
}
