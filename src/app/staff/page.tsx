import { redirect } from "next/navigation";

// The desk has no landing page of its own — /staff drops the agent into their
// day. The layout above enforces the agent session.
export default function StaffIndex() {
  redirect("/staff/home");
}
