/* eslint-disable @typescript-eslint/no-non-null-assertion */

const footer = document.querySelector('footer')!;
footer.innerHTML = `
  xschem-viewer revision 
  <a href="https://github.com/TinyTapeout/xschem-viewer/commit/${__COMMIT_HASH__}">${__COMMIT_HASH__}</a>
  built ${__BUILD_TIME__}.
`;

const target = document.querySelector('#xschem')!;
target.textContent = `Loading...`;
