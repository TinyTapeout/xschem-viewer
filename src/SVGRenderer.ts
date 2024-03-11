// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Tiny Tapeout LTD
// Author: Uri Shaked

import { Layers } from './Layers';
import { type LibraryLoader } from './LibraryLoader';
import { EventEmitter } from './util/EventEmitter';
import { parse, type VersionObject, type Object_1 as XschemObject } from './xschem-parser';

const fontScale = 50;

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
        // deal with multi-line text
        const lines = item.text.split('\n');
        const layer = item.properties.layer != null ? Number(item.properties.layer) : Layers.Text;
        const hCenter = item.properties.hcenter === 'true';
        const vCenter = item.properties.vcenter === 'true';
        const hide = item.properties.hide === 'true';
        if (hide) {
          // hidden for now
          break;
        }

        for (let i = 0; i < lines.length; i++) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', item.x.toString());
          text.setAttribute('y', (item.y + i * item.vSize * fontScale).toString());
          text.setAttribute('font-size', (item.vSize * fontScale).toString());
          text.setAttribute('fill', this.colors[layer]);
          if (hCenter) {
            text.setAttribute('text-anchor', 'middle');
          }
          text.setAttribute('alignment-baseline', vCenter ? 'middle' : 'before-edge');
          text.textContent = lines[i].replace(/@(\w+)/g, (match, p1) => properties[p1] ?? match);
          parent.appendChild(text);
        }
        break;
      }

      case 'Rectangle': {
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
          for (const subItem of parsed) {
            await this.renderItem(subItem, g, { ...item.properties, symname: symbolName });
          }
        } catch (e) {
          console.error('Error loading component', symFileName, e);
        }
        break;
      }

      case 'Version':
      case 'Netlisting':
      case 'Verilog':
      case 'Spice':
      case 'VHDL':
      case 'TEDAx':
        break;
      default:
        console.warn('Unsupported object type', item);
    }
  }

  async render(path: string, targetEl: SVGSVGElement) {
    const schematic = parse(await this.libraryLoader.load(path));
    targetEl.innerHTML = '';
    targetEl.setAttribute('width', '0');
    targetEl.setAttribute('height', '0');
    for (const item of schematic) {
      await this.renderItem(item, targetEl, {});
    }
    const bbox = targetEl.getBBox({ stroke: true });
    targetEl.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    targetEl.setAttribute('width', `${bbox.width}`);
    targetEl.setAttribute('height', `${bbox.height}`);
  }
}
