import { redirect } from "next/navigation";

/** The product entry point uses the existing authenticated Control workflow. */
export default function Home() {
  redirect("/control");
}
