/**
 * True when a message reads as if the writer attached (or means to attach) a
 * file — "I've attached screenshots", "see the image below", "photo of the
 * error attached". Used to nudge portal submitters who mention attachments but
 * haven't actually added one (a common way screenshots go missing).
 *
 * Deliberately conservative. It fires on the attachment-y word forms
 * (attached / attaching / attachment / screenshot / enclosed) and on
 * "see/find/below … image/photo/picture", but NOT on the bare verb "attach"
 * ("attach the widget to the page") or incidental words like "screen size".
 */
const STRONG = /\b(attached|attaching|attachments?|enclosed|screen\s?shots?|screen[- ]?grabs?)\b/i;
const SEE_IMAGE = /\b(see|find|below|here'?s?|attached)\b[^.!?]{0,24}\b(image|images|photo|photos|picture|pictures|pics?)\b/i;

export function mentionsAttachment(text: string): boolean {
  if (!text) return false;
  return STRONG.test(text) || SEE_IMAGE.test(text);
}
