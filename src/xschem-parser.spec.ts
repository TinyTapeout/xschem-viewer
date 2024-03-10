import { describe, expect, it } from 'vitest';
import { parse } from './xschem-parser';

describe('parse', () => {
  it('parses an empty file correctly', () => {
    const result = parse('');
    expect(result).toEqual([]);
  });

  it('parses a file with a single line object correctly', () => {
    const content = 'L 4 -50 20 50 20 {dash=5}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Line',
        x1: -50,
        y1: 20,
        x2: 50,
        y2: 20,
        layer: 4,
        properties: {
          dash: '5',
        },
      },
    ]);
  });

  it('parses a file with a single rectangle object correctly', () => {
    const content = 'B 5 -60 30 60 -30 {fill=true}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Rectangle',
        x1: -60,
        y1: 30,
        x2: 60,
        y2: -30,
        layer: 5,
        properties: { fill: 'true' },
      },
    ]);
  });

  it('parses a file with a single polygon object correctly', () => {
    const content = 'P 3 4 0 0 100 0 100 100 0 100 {fill=false}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Polygon',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        layer: 3,
        properties: { fill: 'false' },
      },
    ]);
  });

  it('parses a file with a single arc object correctly', () => {
    const content = 'A 4 50 50 25 0 180 {fill=true}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Arc',
        centerX: 50,
        centerY: 50,
        radius: 25,
        startAngle: 0,
        sweepAngle: 180,
        layer: 4,
        properties: { fill: 'true' },
      },
    ]);
  });

  it('parses a file with a single text object correctly', () => {
    const content = 'T {Sample Text} 100 150 0 0 1 1 {font=Arial}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Text',
        text: 'Sample Text',
        x: 100,
        y: 150,
        rotation: 0,
        mirror: 0,
        hSize: 1,
        vSize: 1,
        properties: { font: 'Arial' },
      },
    ]);
  });

  it('parses a file with a single wire object correctly', () => {
    const content = 'N 10 10 100 100 {}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Wire',
        x1: 10,
        y1: 10,
        x2: 100,
        y2: 100,
        properties: {},
      },
    ]);
  });

  it('parses a file with a single component object correctly', () => {
    const content = 'C {component.sym} 200 -200 1 0 {name=U1}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Component',
        symbolReference: 'component.sym',
        x: 200,
        y: -200,
        rotation: 1,
        flip: 0,
        properties: { name: 'U1' },
      },
    ]);
  });

  it('parses a file with quoted properties correctly', () => {
    const content = 'C {devices/title.sym} 160 -30 0 0 {name=l1 author="Tiny Tapeout"}';
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Component',
        symbolReference: 'devices/title.sym',
        x: 160,
        y: -30,
        rotation: 0,
        flip: 0,
        properties: { name: 'l1', author: 'Tiny Tapeout' },
      },
    ]);
  });

  it('parses a file with escaped properties correctly', () => {
    const content = `C {devices/res.sym} 1450 -740 1 0 {name=R1
value=\\{2/1.82p/FREQ\\}
footprint=1206
device=resistor
m=1}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Component',
        symbolReference: 'devices/res.sym',
        x: 1450,
        y: -740,
        rotation: 1,
        flip: 0,
        properties: {
          name: 'R1',
          value: '{2/1.82p/FREQ}',
          footprint: '1206',
          device: 'resistor',
          m: '1',
        },
      },
    ]);
  });

  it('parses a file with multiple objects correctly', () => {
    const content = `
L 4 -50 20 50 20 {dash=5}
B 5 -60 30 60 -30 {fill=true}
P 3 4 0 0 100 0 100 100 0 100 {fill=false}
A 4 50 50 25 0 180 {fill=true}
`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Line',
        x1: -50,
        y1: 20,
        x2: 50,
        y2: 20,
        layer: 4,
        properties: { dash: '5' },
      },
      {
        type: 'Rectangle',
        x1: -60,
        y1: 30,
        x2: 60,
        y2: -30,
        layer: 5,
        properties: { fill: 'true' },
      },
      {
        type: 'Polygon',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        layer: 3,
        properties: { fill: 'false' },
      },
      {
        type: 'Arc',
        centerX: 50,
        centerY: 50,
        radius: 25,
        startAngle: 0,
        sweepAngle: 180,
        layer: 4,
        properties: { fill: 'true' },
      },
    ]);
  });

  it('parses a file with a single component object with multi-line properties correctly', () => {
    const content = `C {sky130_fd_pr/nfet3_05v0_nvt.sym} 3460 -840 0 0 {name=M20
L=0.9
W=1
body=GND
nf=1 mult=1
model=nfet_05v0_nvt
spiceprefix=X
}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Component',
        symbolReference: 'sky130_fd_pr/nfet3_05v0_nvt.sym',
        x: 3460,
        y: -840,
        rotation: 0,
        flip: 0,
        properties: {
          name: 'M20',
          L: '0.9',
          W: '1',
          body: 'GND',
          nf: '1',
          mult: '1',
          model: 'nfet_05v0_nvt',
          spiceprefix: 'X',
        },
      },
    ]);
  });

  it('parses a file with a single version object correctly', () => {
    const content = `v {xschem version=3.4.5 file_version=1.2}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Version',
        version: '3.4.5',
        fileVersion: '1.2',
        license: '',
      },
    ]);
  });

  it('parses a version object that contains license text correctly', () => {
    const content = `v {xschem version=3.4.5 file_version=1.2
* Copyright 2021 Stefan Frederik Schippers
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     https://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.

}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Version',
        version: '3.4.5',
        fileVersion: '1.2',
        license:
          '* Copyright 2021 Stefan Frederik Schippers\n' +
          '* \n' +
          '* Licensed under the Apache License, Version 2.0 (the "License");\n' +
          '* you may not use this file except in compliance with the License.\n' +
          '* You may obtain a copy of the License at\n' +
          '*\n' +
          '*     https://www.apache.org/licenses/LICENSE-2.0\n' +
          '*\n' +
          '* Unless required by applicable law or agreed to in writing, software\n' +
          '* distributed under the License is distributed on an "AS IS" BASIS,\n' +
          '* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n' +
          '* See the License for the specific language governing permissions and\n' +
          '* limitations under the License.\n' +
          '\n',
      },
    ]);
  });

  it('parses a file with a single verilog object correctly', () => {
    const content = `V {assign #1500 LDOUT = LDIN +1;
}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Verilog',
        content: 'assign #1500 LDOUT = LDIN +1;\n',
      },
    ]);
  });

  it('parses a text object with escaped braces correctly', () => {
    const content = `T {tcleval(gm=[to_eng [ngspice::get_node [subst -nocommand \\{\\\\@m.$\\{path\\}@spiceprefix@name\\\\.m1[gm]\\}]]] )} 32.5 -8.75 0 0 0.15 0.15 {layer=15
      hide=true}`;
    const result = parse(content);
    expect(result).toEqual([
      {
        type: 'Text',
        text:
          // eslint-disable-next-line no-template-curly-in-string
          'tcleval(gm=[to_eng [ngspice::get_node [subst -nocommand {\\@m.${path}@' +
          'spiceprefix@name\\.m1[gm]}]]] )',
        x: 32.5,
        y: -8.75,
        rotation: 0,
        mirror: 0,
        hSize: 0.15,
        vSize: 0.15,
        properties: {
          layer: '15',
          hide: 'true',
        },
      },
    ]);
  });
});
