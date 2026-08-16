import { redirect } from "next/navigation";

// Rosters is the site's entry point for now — there's no separate home page.
export default function Home() {
  redirect("/rosters");
}
