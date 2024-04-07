// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import tclInitCode from './init.tcl?raw';
let tclInterpPromise: any = null;

export async function tclInit() {
  const { wacl } = await import('../wacl/wacl');
  const interp = await new Promise<any>((resolve) => wacl.onReady(resolve));
  interp.Eval(tclInitCode);
  return interp;
}

export async function tclEval(expr: string) {
  if (tclInterpPromise == null) {
    tclInterpPromise = tclInit();
  }
  const interp = await tclInterpPromise;
  return interp.Eval(expr);
}
