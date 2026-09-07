import { useMessagingStore } from '../stores/messaging'
import { useAssistantChrome } from '../stores/assistantChrome'
import { parseMessageUrl } from './messageLink'

// DEC-127 — the way BACK from an Attention item to the message it was filed
// from. Operator: "it needs to link me back to that exact message with that
// exact person… it should automatically open up in the floating box with the
// PlexiiMessage tab opened to the person that it came from."
//
// So: the persistent assistant (the panel that follows you page to page)
// opens on its PlexiiMessage tab, the conversation opens on that person, and
// the view lands on the exact message (scrolled to centre, flashed) once it
// is on screen — MessagesView consumes `landOnMessage` when the message (and,
// for a reply, its thread) has rendered. Nothing here touches the Chat page.
export function openMessageInPanel(
  conversationId: string,
  messageId: string | null,
  parentId: string | null = null
): void {
  const messaging = useMessagingStore.getState()
  messaging.landOn(messageId, parentId)
  void messaging.openConversation(conversationId)
  const chrome = useAssistantChrome.getState()
  chrome.setTab('messages')
  chrome.openPanel()
}

/** Route an internal message link (plexii://message/…). False when the URL
 *  is not one — the caller falls through to its own door (the web page). */
export function openMessageLink(url: string | null | undefined): boolean {
  const msg = parseMessageUrl(url)
  if (!msg) return false
  openMessageInPanel(msg.conversationId, msg.messageId, msg.parentId)
  return true
}
