// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    resolve: {
      alias: [{ find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
    },
  };
});
