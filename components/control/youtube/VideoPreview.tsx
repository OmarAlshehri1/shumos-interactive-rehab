"use client";
import { validVideo, type Video } from "@/lib/youtube/model";
import styles from "./youtube.module.css";

/** Official embedded player. YouTube controls playback, ads and embedding availability. */
export function VideoPreview({ video }: { video: Video }) {
  if (!validVideo(video)) return null;
  return <div className={styles.preview}>
    <iframe
      key={video.videoId}
      src={`https://www.youtube-nocookie.com/embed/${video.videoId}?playsinline=1`}
      title={`معاينة ${video.title}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  </div>;
}
