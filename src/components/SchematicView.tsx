import panzoom, { type PanZoom } from 'panzoom';
import { createEffect, createSignal } from 'solid-js';
import { libraryLoader } from '~/model/libraries';
import { Layers } from '~/parser/Layers';
import { SVGRenderer } from '~/render/SVGRenderer';
import { colors } from '~/render/colors';

export interface ISchematicProps {
  /** URL of the schematic to load */
  url: string;

  /**
   * Callback to be called when a component is clicked, should navigate to the new component.
   * `path` contains the path or URL of the component that was clicked.
   */
  onComponentClick?: (path: string) => void;
}

export function SchematicView(props: ISchematicProps) {
  let svgRoot: SVGSVGElement | undefined;
  let panzoomInstance: PanZoom | undefined;
  const [loadingText, setLoadingText] = createSignal('Loading...');
  const [svgReady, setSVGReady] = createSignal(false);

  const renderer = new SVGRenderer(libraryLoader, colors);

  renderer.onLoadComponent.listen((path) => {
    setLoadingText(`Loading... ${path}`);
  });

  renderer.onComponentClick.listen(async (path) => {
    if (!(await libraryLoader.fileExists(path))) {
      return;
    }

    props.onComponentClick?.(path);
  });

  createEffect(async () => {
    if (!props.url || !svgRoot) {
      return;
    }

    if (!panzoomInstance) {
      panzoomInstance = panzoom(svgRoot, { maxZoom: 10, minZoom: 0.1 });
    }

    const path = props.url;
    setLoadingText(`Loading... ${path}`);
    setSVGReady(false);

    if (path.startsWith('https://')) {
      libraryLoader.baseURL = path.substring(0, path.lastIndexOf('/') + 1);
    }

    try {
      panzoomInstance.pause();
      await renderer.render(path, svgRoot);
      setLoadingText('');
      setSVGReady(true);
      const bbox = svgRoot.getBBox();
      panzoomInstance.showRectangle(new DOMRect(0, 0, bbox.width, bbox.height));
      panzoomInstance.resume();
    } catch (error) {
      console.error('Error loading', path, error);
      setLoadingText(`Error loading ${path}: ${(error as Error).toString()}`);
    }
  }, [props.url]);

  return (
    <div class="xschem" style={{ 'background-color': colors[Layers.Background], height: 0 }}>
      <div>{loadingText()}</div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        ref={svgRoot}
        style={{ visibility: svgReady() ? 'visible' : 'hidden' }}
      />
    </div>
  );
}
