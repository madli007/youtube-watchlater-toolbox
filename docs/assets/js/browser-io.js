(function registerBrowserIo(root) {
  "use strict";

  function parseJsonText(text) {
    return JSON.parse(String(text));
  }

  function serializeJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function readFileText(file, FileReaderClass = root.FileReader) {
    if (!file) return Promise.reject(new Error("No file was selected."));
    if (typeof file.text === "function") return file.text();
    if (typeof FileReaderClass !== "function") {
      return Promise.reject(new Error("This browser cannot read the selected file."));
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReaderClass();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(
        reader.error || new Error("The selected file could not be read."),
      ), { once: true });
      reader.readAsText(file);
    });
  }

  function downloadTextFile(filename, text, dependencies = {}) {
    const documentRef = dependencies.document || root.document;
    const BlobClass = dependencies.Blob || root.Blob;
    const urlApi = dependencies.URL || root.URL;
    const schedule = dependencies.setTimeout || root.setTimeout;
    if (!documentRef?.body || typeof documentRef.createElement !== "function"
      || typeof BlobClass !== "function" || typeof urlApi?.createObjectURL !== "function") {
      throw new Error("This browser cannot download files.");
    }

    const blob = new BlobClass([String(text)], { type: "application/json;charset=utf-8" });
    const url = urlApi.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = String(filename || "download.json");
    documentRef.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      if (typeof schedule === "function" && typeof urlApi.revokeObjectURL === "function") {
        schedule(() => urlApi.revokeObjectURL(url), 1000);
      }
    }
  }

  const app = root.WatchLaterApp ||= {};
  app.browserIo = Object.freeze({
    parseJsonText,
    serializeJson,
    readFileText,
    downloadTextFile,
  });
})(globalThis);
