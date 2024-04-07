import { createSignal } from 'solid-js';
import styles from './Home.module.css';

export function Home() {
  const [url, setURL] = createSignal('');
  const loadFromURL = () => {
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('file', url());
    window.location.href = targetUrl.toString();
  };

  return (
    <div class={styles.page}>
      <h2>Welcome!</h2>
      <p>
        Xschem Viewer is an online viewer for Xschem schematics, brought to your by{' '}
        <a href="https://tinytapeout.com" target="_blank">
          Tiny Tapeout
        </a>
        .
      </p>
      <h2>Load schematic from a URL</h2>
      <p>Paste the URL of an XSchem schematic file to load it into the viewer:</p>
      <div class={styles.urlInput}>
        <input
          type="text"
          id="uri-input"
          placeholder="URL to load (e.g. https://github.com/owner/repo/blob/main/schematic.sch)"
          value={url()}
          onInput={(e) => setURL(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              loadFromURL();
            }
          }}
        />
        <button id="load-uri" onClick={loadFromURL}>
          Load
        </button>
      </div>

      <h3>Or choose an example:</h3>
      <div class="examples">
        <a href="?file=https://github.com/StefanSchippers/xschem_sky130/blob/main/sky130_tests/top.sch">
          Sky130 PDK
        </a>
      </div>
    </div>
  );
}
