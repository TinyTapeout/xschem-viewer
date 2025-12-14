// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import { Layers } from '../parser/Layers';
import { type LibraryLoader } from '../model/LibraryLoader';
import { tclEval } from '../tcl/tcl';
import { EventEmitter } from '../util/EventEmitter';
import { isPointInsideWire } from '../util/geometry';
import type { VersionObject, Wire, Object_1 as XschemObject } from '../parser/xschem-parser';
import { parse } from '../parser/xschem-parser';

const fontScale = 50;
const junctionRadius = 3;

interface XSchemTransform {
  flip: boolean;
  rotation: number;
}

export class SVGRenderer extends EventTarget {
  private readonly componentClickEmitter = new EventEmitter<string>();
  readonly onComponentClick = this.componentClickEmitter.event;

  private readonly loadingComponentEmitter = new EventEmitter<string>();
  readonly onLoadComponent = this.loadingComponentEmitter.event;

  constructor(
    private readonly libraryLoader: LibraryLoader,
    private readonly colors: string[],
  ) {
    super();
  }

  private async renderItem(
    item: XschemObject | VersionObject,
    parent: SVGElement,
    properties: Record<string, string> = {},
    globalTransform: XSchemTransform = { flip: false, rotation: 0 },
  ) {
    // Many xschem symbols use the spice_get_voltage/spice_get_current property, so specify a default value
    properties.spice_get_voltage ??= '';
    properties.spice_get_current ??= '';

    switch (item.type) {
      case 'Wire': {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', item.x1.toString());
        line.setAttribute('y1', item.y1.toString());
        line.setAttribute('x2', item.x2.toString());
        line.setAttribute('y2', item.y2.toString());
        line.setAttribute('stroke', this.colors[Layers.Wire]);
        parent.appendChild(line);
        break;
      }

      case 'Line': {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', item.x1.toString());
        line.setAttribute('y1', item.y1.toString());
        line.setAttribute('x2', item.x2.toString());
        line.setAttribute('y2', item.y2.toString());
        line.setAttribute('stroke', this.colors[item.layer]);
        if (item.properties.dash != null) {
          line.setAttribute('stroke-dasharray', item.properties.dash);
        }
        parent.appendChild(line);
        break;
      }

      case 'Text': {
        const hide = item.properties.hide === 'true';
        if (hide) {
          // hidden for now
          break;
        }

        // attribute substitution
        let text = item.text.replace(/@([\w#:]+)/g, (match, attrName: string) => {
          if (attrName.startsWith('#') && attrName.endsWith(':net_name')) {
            // see https://github.com/TinyTapeout/xschem-viewer/issues/1#issuecomment-1989506966
            return '';
          }
          return properties[attrName] ?? match;
        });
        if (text.startsWith('tcleval(') && text.endsWith(')')) {
          const tclExpr = text.substring(8, text.length - 1);
          text = await tclEval(`string cat "${tclExpr}"`).catch((error) => {
            console.warn('tcleval failed:', tclExpr, error);
            return '';
          });
        }

        // Special case: labels inside pins use the Wire layer.
        // see https://github.com/TinyTapeout/xschem-viewer/issues/2#issuecomment-1997048537
        const insidePin = ['ipin', 'opin', 'iopin', 'label'].includes(properties.type ?? '');

        // deal with multi-line text
        const lines = text.split('\n');
        const layer =
          item.properties.layer != null
            ? Number(item.properties.layer)
            : insidePin
              ? Layers.Wire
              : Layers.Text;
        const hCenter = item.properties.hcenter === 'true';
        const vCenter = item.properties.vcenter === 'true';
        const finalRotation = (item.rotation + globalTransform.rotation) % 4;
        const vMirror = finalRotation === 2 || finalRotation === 1;
        let hMirror = vMirror;
        if (item.mirror === 1) {
          hMirror = !hMirror;
        }
        if (globalTransform.flip) {
          hMirror = !hMirror;
        }

        for (let i = 0; i < lines.length; i++) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          const transforms = [`translate(${item.x},${item.y})`];
          if (item.rotation !== 0) {
            transforms.push(`rotate(${item.rotation * 90})`);
          }
          if (item.mirror === 1) {
            transforms.push('scale(-1, 1)');
          }
          const lineIndex = vMirror ? lines.length - i - 1 : i;
          transforms.push(`translate(0, ${lineIndex * item.vSize * fontScale})`);
          if (vMirror) {
            transforms.push('scale(1, -1)');
          }
          if (hMirror) {
            transforms.push('scale(-1, 1)');
          }
          text.setAttribute('transform', transforms.join(' '));
          text.setAttribute('font-size', (item.vSize * fontScale).toString());
          text.setAttribute('fill', this.colors[layer]);
          if (hCenter) {
            text.setAttribute('text-anchor', 'middle');
          } else if (hMirror) {
            text.setAttribute('text-anchor', 'end');
          }

          text.setAttribute(
            'alignment-baseline',
            vCenter ? 'middle' : vMirror ? 'after-edge' : 'before-edge',
          );
          text.textContent = lines[i];
          parent.appendChild(text);
        }
        break;
      }

      case 'Rectangle': {
        const flags = (item.properties?.flags ?? '').split(',');
        if (flags.includes('graph')) {
          // We currently don't support graph rectangles
          break;
        }
        if (item.properties.pinnumber) {
          for (let i = 0; i < 255; i++) {
            const name = `#${i}:pinnumber`;
            if (properties[name] == null) {
              properties[name] = item.properties.pinnumber;
              break;
            }
          }
        }
        if (item.properties.image_data != null) {
          const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
          image.setAttribute('x', Math.min(item.x1, item.x2).toString());
          image.setAttribute('y', Math.min(item.y1, item.y2).toString());
          image.setAttribute('width', Math.abs(item.x2 - item.x1).toString());
          image.setAttribute('height', Math.abs(item.y1 - item.y2).toString());
          image.setAttribute('href', 'data:image/png;base64,' + item.properties.image_data);
          image.style.opacity = item.properties.alpha ?? '1';
          parent.appendChild(image);
        } else {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', Math.min(item.x1, item.x2).toString());
          rect.setAttribute('y', Math.min(item.y1, item.y2).toString());
          rect.setAttribute('width', Math.abs(item.x2 - item.x1).toString());
          rect.setAttribute('height', Math.abs(item.y1 - item.y2).toString());
          rect.setAttribute('stroke', this.colors[item.layer]);
          if (item.properties.fill !== 'false') {
            rect.setAttribute('fill', this.colors[item.layer]);
          }
          parent.appendChild(rect);
        }
        break;
      }

      case 'Polygon': {
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = item.points.map((p) => `${p.x},${p.y}`).join(' ');
        polygon.setAttribute('points', points);
        polygon.setAttribute('fill', 'none');
        if (item.properties.fill === 'true') {
          polygon.setAttribute('fill', this.colors[item.layer]);
        }
        polygon.setAttribute('stroke', this.colors[item.layer]);
        parent.appendChild(polygon);
        break;
      }

      case 'Arc': {
        if (Math.abs(item.sweepAngle) >= 360) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', item.centerX.toString());
          circle.setAttribute('cy', item.centerY.toString());
          circle.setAttribute('r', item.radius.toString());
          circle.setAttribute('fill', 'none');
          circle.setAttribute('stroke', this.colors[item.layer]);
          parent.appendChild(circle);
        } else {
          const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const startAngle = -item.startAngle;
          const sweepAngle = -item.sweepAngle;
          const x1 = item.centerX + item.radius * Math.cos((startAngle * Math.PI) / 180);
          const y1 = item.centerY + item.radius * Math.sin((startAngle * Math.PI) / 180);
          const x2 =
            item.centerX + item.radius * Math.cos(((startAngle + sweepAngle) * Math.PI) / 180);
          const y2 =
            item.centerY + item.radius * Math.sin(((startAngle + sweepAngle) * Math.PI) / 180);
          const largeArcFlag = sweepAngle > 180 ? 1 : 0;
          const sweepFlag = sweepAngle > 0 ? 1 : 0;
          const d = `M ${x1} ${y1} A ${item.radius} ${item.radius} 0 ${largeArcFlag} ${sweepFlag} ${x2} ${y2}`;
          arc.setAttribute('d', d);
          arc.setAttribute('fill', 'none');
          arc.setAttribute('stroke', this.colors[item.layer]);
          parent.appendChild(arc);
        }
        break;
      }

      case 'Component': {
        const symbolName =
          item.symbolReference.split('/').pop()?.split('.').shift() ?? item.symbolReference;
        this.loadingComponentEmitter.fire(symbolName);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.dataset.symbol = item.symbolReference;
        const transforms = [`translate(${item.x},${item.y})`];
        if (item.rotation !== 0) {
          transforms.push(`rotate(${item.rotation * 90})`);
        }
        if (item.flip) {
          transforms.push('scale(-1, 1)');
        }
        if (item.properties.spice_ignore === 'true') {
          g.style.filter = 'grayscale(1)';
          g.style.opacity = '0.5';
        }
        g.setAttribute('transform', transforms.join(' '));
        g.setAttribute('tabindex', '0');
        parent.appendChild(g);
        const symFileName = item.symbolReference.endsWith('.sym')
          ? item.symbolReference
          : item.symbolReference + '.sym';
        const componentClickHandler = () => {
          this.componentClickEmitter.fire(symFileName.replace(/\.sym$/, '.sch'));
        };
        g.addEventListener('click', componentClickHandler);
        g.addEventListener('touchend', componentClickHandler);
        try {
          const component = await this.libraryLoader.load(symFileName);
          const parsed = parse(component);
          const componentProperties = { ...item.properties, symname: symbolName };
          for (const subItem of parsed) {
            await this.renderItem(subItem, g, componentProperties, {
              flip: item.flip ? !globalTransform.flip : globalTransform.flip,
              rotation: (globalTransform.rotation + item.rotation) % 4,
            });
          }
        } catch (e) {
          console.error('Error loading component', symFileName, e);
        }
        break;
      }

      case 'GlobalProperties':
        Object.assign(properties, item.properties);
        break;

      case 'Version':
      case 'Verilog':
      case 'Spectre':
      case 'Spice':
      case 'VHDL':
      case 'TEDAx':
        break;
      default:
        console.warn('Unsupported object type', item);
    }
  }

  private renderJunctions(wires: Wire[], targetEl: SVGSVGElement) {
    const endPoints = new Map<string, number>();
    for (const wire of wires) {
      const key1 = `${wire.x1},${wire.y1}`;
      const key2 = `${wire.x2},${wire.y2}`;
      endPoints.set(key1, (endPoints.get(key1) ?? 0) + 1);
      endPoints.set(key2, (endPoints.get(key2) ?? 0) + 1);
    }

    // a Junction is defined as a point where 3 or more wires meet
    const junctions = new Set<string>();
    for (const [key, count] of endPoints) {
      if (count >= 3) {
        junctions.add(key);
      }
    }

    // Or a point where one wire ends in the middle of another wire
    for (const wire of wires) {
      for (const otherWire of wires) {
        if (wire === otherWire) {
          continue;
        }

        if (isPointInsideWire({ x: otherWire.x1, y: otherWire.y1 }, wire)) {
          junctions.add(`${otherWire.x1},${otherWire.y1}`);
        }
        if (isPointInsideWire({ x: otherWire.x2, y: otherWire.y2 }, wire)) {
          junctions.add(`${otherWire.x2},${otherWire.y2}`);
        }
      }
    }

    for (const coords of junctions) {
      const [x, y] = coords.split(',').map(Number);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x.toString());
      circle.setAttribute('cy', y.toString());
      circle.setAttribute('r', junctionRadius.toString());
      circle.setAttribute('fill', this.colors[Layers.Wire]);
      targetEl.appendChild(circle);
    }
  }

  async render(path: string, targetEl: SVGSVGElement) {
    const schematic = parse(await this.libraryLoader.load(path));
    targetEl.innerHTML = '';
    targetEl.setAttribute('width', '');
    targetEl.setAttribute('height', '');
    for (const item of schematic) {
      await this.renderItem(item, targetEl, {});
    }
    const wires = schematic.filter((item) => item.type === 'Wire') as Wire[];
    this.renderJunctions(wires, targetEl);
    const bbox = targetEl.getBBox({ stroke: true });
    targetEl.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    targetEl.setAttribute('width', `${bbox.width}`);
    targetEl.setAttribute('height', `${bbox.height}`);
  }
}
