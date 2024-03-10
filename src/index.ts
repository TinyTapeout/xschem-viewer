/* eslint-disable @typescript-eslint/no-non-null-assertion */

import panzoom from 'panzoom';
import { Layers } from './Layers';
import { LibraryLoader } from './LibraryLoader';
import { SVGRenderer } from './SVGRenderer';
import { colors } from './colors';

const defaultFile = 'sky130_tests/top.sch';

const footer = document.querySelector('footer')!;
footer.innerHTML = `
  xschem-viewer revision 
  <a href="https://github.com/TinyTapeout/xschem-viewer/commit/${__COMMIT_HASH__}">${__COMMIT_HASH__}</a>
  built ${__BUILD_TIME__}.
`;

const target = document.querySelector<HTMLDivElement>('#xschem')!;
target.style.backgroundColor = colors[Layers.Background];

const loadingText = document.createElement('div');
loadingText.textContent = `Loading...`;
target.appendChild(loadingText);

const libraryLoader = new LibraryLoader([
  {
    path: 'devices/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem/master/xschem_library/',
  },
  {
    path: 'sky130_tests/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem_sky130/main/',
  },
  {
    path: 'sky130_fd_pr/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem_sky130/main/',
  },
  {
    path: 'sky130_stdcells/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem_sky130/main/',
  },
  {
    path: 'mips_cpu/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem_sky130/main/',
  },
]);
const renderer = new SVGRenderer(libraryLoader, colors);
const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
target.appendChild(svgRoot);

async function render(path: string) {
  loadingText.textContent = `Loading... ${path}`;
  svgRoot.style.visibility = 'hidden';
  try {
    pz.pause();
    await renderer.render(path, svgRoot);
    loadingText.textContent = '';
    svgRoot.style.visibility = 'visible';
    const bbox = svgRoot.getBBox();
    pz.showRectangle(new DOMRect(0, 0, bbox.width, bbox.height));
    pz.resume();
  } catch (error) {
    loadingText.textContent = `Error loading ${path}: ${(error as Error).toString()}`;
  }
}

renderer.onLoadComponent.listen((path) => {
  loadingText.innerText = `Loading... ${path}`;
});

renderer.onComponentClick.listen(async (path) => {
  if (!(await libraryLoader.fileExists(path))) {
    return;
  }

  const newParams = new URLSearchParams(window.location.search);
  newParams.set('file', path);
  history.pushState({ path }, '', '?' + newParams.toString());
  await render(path);
});

window.addEventListener('popstate', (event) => {
  const newPath =
    (event.state?.path as string) ??
    new URLSearchParams(window.location.search).get('file') ??
    defaultFile;
  void render(newPath);
});

const pz = panzoom(svgRoot, { maxZoom: 10, minZoom: 0.1 });
const topFile = new URLSearchParams(window.location.search).get('file') ?? defaultFile;
void render(topFile);
