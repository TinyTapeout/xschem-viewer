// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

/** Convert a GitHub URL to a raw.githubusercontent.com URL */
export function githubURLToRaw(path: string) {
  const parsedURL = new URL(path);
  if (parsedURL.hostname !== 'github.com') {
    return path;
  }

  parsedURL.hostname = 'raw.githubusercontent.com';
  const pathParts = parsedURL.pathname.substring(1).split('/');
  if (pathParts[2] === 'blob') {
    pathParts.splice(2, 1);
    parsedURL.pathname = pathParts.join('/');
  }
  return parsedURL.toString();
}
