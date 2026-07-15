"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Sign out of the support desk: clear the desk session cookie and return to the
// public help centre. Desk-scoped by design — the central Travelgenix session
// (tg_session, managed at id.travelify.io) lives on a different domain and stays
// put, so other Travelgenix apps remain signed in. To sign out everywhere, the
// user uses their account menu at id.travelify.io.
export async function signOutAction(): Promise<void> {
  const store = await cookies();
  // Match the attributes the callback set desk_session with (path "/"), so the
  // browser actually replaces + expires it.
  store.set("desk_session", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  redirect("/");
}
