# SPDX-License-Identifier: Apache-2.0
# Copyright 2024 Tiny Tapeout LTD
# Author: Uri Shaked

proc ev {args} {
  return [format %.4g [expr [join $args]]]
}
