import { redirect } from "next/navigation";

export default function Page() {
	// Redirect to the split play experience
	redirect("/story/play");
}
