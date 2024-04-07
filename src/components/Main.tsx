import { Show, createSignal, onMount } from 'solid-js';
import { Home } from './Home';
import { SchematicView } from './SchematicView';

/**
 * This component renders the main viewport of the app and implements basic routing:
 * If the URL contains a "file" query parameter, we show the schematic view,
 * using the value of the "file" query parameter as the URL to load.
 * Otherwise, we show the home screen.
 *
 */
export function Main() {
  const [currentURL, setCurrentURL] = createSignal<string | null>();

  // When the component mounts, we read the "file" query parameter from the URL so
  // we can show the correct view.
  onMount(() => {
    const url = new URLSearchParams(window.location.search).get('file');
    setCurrentURL(url);

    // Listen to the "popstate" event to update the view when the user navigates back
    // and forth using the browser's history.
    window.addEventListener('popstate', (event) => {
      const newUrl =
        (event.state?.path as string) ?? new URLSearchParams(window.location.search).get('file');
      setCurrentURL(newUrl);
    });
  });

  /**
   * Navigate to a new schematic by updating the "file" URL query parameter.
   */
  const loadNewSchematic = (url: string) => {
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('file', url);
    setCurrentURL(url);
    window.history.pushState({ path: url }, '', targetUrl.toString());
  };

  return (
    <>
      <Show when={currentURL() == null}>
        <Home />
      </Show>
      <Show when={currentURL()}>
        {(url) => <SchematicView url={url()} onComponentClick={loadNewSchematic} />}
      </Show>
    </>
  );
}
