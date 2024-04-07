import { LibraryLoader } from './LibraryLoader';

export const libraryLoader = new LibraryLoader([
  {
    path: 'devices/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem/master/xschem_library/',
  },
  {
    path: 'stdcells/',
    url: 'https://raw.githubusercontent.com/StefanSchippers/xschem_sky130/main/',
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
