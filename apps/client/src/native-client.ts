export function isNativeClient(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
