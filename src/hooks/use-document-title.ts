import { useEffect } from "react";

/**
 * Sets the tab title from what a page shows, for a title the route's `head`
 * cannot know. The next page's `head` puts its own back.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
