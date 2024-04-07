declare module '*.module.css';

declare module '*.tcl?raw' {
  const content: string;
  export default content;
}
