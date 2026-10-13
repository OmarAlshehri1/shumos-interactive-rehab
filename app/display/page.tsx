import type { Metadata } from "next";
import { YouTubeDisplay } from "@/components/display/youtube/YouTubeDisplay";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — Display",
};

export default function DisplayPage() {
  return <YouTubeDisplay />;
}
