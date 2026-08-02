import demoBundle from "@/public/data/demo-bundle.json";
import { SplitTasteExperience } from "@/components/SplitTasteExperience";
import type { DemoBundle } from "@/types/demo";

export default function Home() {
  return <SplitTasteExperience bundle={demoBundle as unknown as DemoBundle} />;
}
