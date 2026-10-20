// The landing page's interactive demo reuses the studio surface styles. The
// conversational /studio route is gone; this stylesheet stays because the
// guest demo on the landing page is built on it.
import "./studio.css";
import HomeScreen from "@/screens/HomeScreen";
import { clipCapability } from "@/lib/film/duration";

export default function HomePage() {
  return <HomeScreen capability={clipCapability()} />;
}
