// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { render } from 'solid-js/web';
import { Main } from './components/Main';

const footer = document.querySelector('footer')!;
footer.innerHTML = `
  xschem-viewer revision 
  <a href="https://github.com/TinyTapeout/xschem-viewer/commit/${__COMMIT_HASH__}">${__COMMIT_HASH__}</a>
  built ${__BUILD_TIME__}.
`;

render(Main, document.getElementById('root')!);
