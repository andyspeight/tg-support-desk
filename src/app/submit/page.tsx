import { redirect } from "next/navigation";

// The separate public web-form has been retired — there is now a single place to
// raise a ticket: the client portal. Any link here (older KB pages, bookmarks)
// lands there instead; logged-out visitors are taken through SSO on the way.
export default function SubmitRedirect() {
  redirect("/");
}
