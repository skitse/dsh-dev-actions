declare module '*.module.css' {
  const classes: Record<string, string>
  export function installStyles(): () => void
  export default classes
}
