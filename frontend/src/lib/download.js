// Same-origin authenticated file download that works in every browser.
// A programmatic <a download> click is never caught by a popup blocker, unlike
// window.open(), which Safari/iOS reject outside a trusted gesture.
export function downloadFile(path, filename) {
  const a = document.createElement("a");
  a.href = path;
  if (filename) a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
