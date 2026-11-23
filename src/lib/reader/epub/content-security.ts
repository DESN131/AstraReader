const REMOTE_PROTOCOL = /^(?:https?|ftp):/i;
const SCRIPT_PROTOCOL = /^(?:javascript|vbscript):/i;

function isRemoteReference(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  return REMOTE_PROTOCOL.test(normalized) || normalized.startsWith("//");
}

function isScriptReference(value: string | null): boolean {
  return Boolean(value && SCRIPT_PROTOCOL.test(value.trim()));
}

export function stripRemoteCss(css: string): string {
  return css
    .replace(/@import\s+(?:url\()?["']?(?:https?:)?\/\/[^;]+;?/gi, "")
    .replace(
      /url\(\s*(["']?)(?:https?:)?\/\/[^)"']*\1\s*\)/gi,
      "none",
    )
    .replace(
      /url\(\s*(["']?)(?:javascript|vbscript):[\s\S]*?\1\s*\)/gi,
      "none",
    );
}

function removeUnsafeAttribute(
  element: Element,
  attribute: string,
  blockAttribute: string,
) {
  const value = element.getAttribute(attribute);

  if (!isRemoteReference(value) && !isScriptReference(value)) {
    return;
  }

  element.removeAttribute(attribute);
  element.setAttribute(blockAttribute, value ?? "");
}

export function hardenEpubDocument(document: Document): void {
  document
    .querySelectorAll(
      "script, iframe, object, embed, meta[http-equiv='refresh' i]",
    )
    .forEach((element) => element.remove());

  document.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.getAttribute("style");

    if (style?.toLowerCase().includes("url(")) {
      element.setAttribute("style", stripRemoteCss(style));
    }
  });

  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
    }
  });

  document.querySelectorAll("style").forEach((element) => {
    const css = element.textContent ?? "";

    if (/url\(|@import/i.test(css)) {
      element.textContent = stripRemoteCss(css);
    }
  });

  document
    .querySelectorAll(
      "img, image, use, audio, video, source, track, link, input, body, table, td, th",
    )
    .forEach((element) => {
      for (const attribute of ["src", "poster", "href", "data"]) {
        removeUnsafeAttribute(
          element,
          attribute,
          `data-astra-blocked-${attribute}`,
        );
      }
    });

  document.querySelectorAll("base").forEach((element) => {
    removeUnsafeAttribute(element, "href", "data-astra-blocked-href");
  });

  document.querySelectorAll("[srcset]").forEach((element) => {
    const sources = element
      .getAttribute("srcset")
      ?.split(",")
      .map((source) => source.trim())
      .filter((source) => source && !isRemoteReference(source.split(/\s+/, 1)[0]));

    if (sources?.length) {
      element.setAttribute("srcset", sources.join(", "));
    } else {
      element.removeAttribute("srcset");
    }
  });

  document.querySelectorAll("form[action]").forEach((element) => {
    removeUnsafeAttribute(element, "action", "data-astra-blocked-action");
  });

  document.querySelectorAll("a[href]").forEach((element) => {
    const href = element.getAttribute("href");

    if (isScriptReference(href)) {
      element.removeAttribute("href");
      element.setAttribute("data-astra-blocked-href", href ?? "");
      element.setAttribute("title", "脚本链接已在阅读器中禁用");
      return;
    }

    if (!isRemoteReference(href)) {
      return;
    }

    element.removeAttribute("href");
    element.setAttribute("data-astra-blocked-href", href ?? "");
    element.setAttribute("title", "外部链接已在阅读器中禁用");
  });

  document.querySelectorAll("[xlink\\:href]").forEach((element) => {
    const href = element.getAttribute("xlink:href");
    if (isScriptReference(href)) {
      element.removeAttribute("xlink:href");
      element.setAttribute("data-astra-blocked-xlink-href", href ?? "");
      return;
    }

    removeUnsafeAttribute(
      element,
      "xlink:href",
      "data-astra-blocked-xlink-href",
    );
  });

  document.querySelectorAll(
    "img[data-astra-blocked-src], video[data-astra-blocked-src], audio[data-astra-blocked-src]",
  ).forEach((element) => {
    element.setAttribute("data-astra-blocked", "");
  });
}

export function hardenEpubMarkup(markup: string): string {
  const parser = new DOMParser();
  let document = parser.parseFromString(markup, "application/xhtml+xml");

  if (document.querySelector("parsererror")) {
    document = parser.parseFromString(markup, "text/html");
  }

  hardenEpubDocument(document);

  return new XMLSerializer().serializeToString(document);
}

export function hardenEpubContents(contents: unknown): void {
  if (
    contents &&
    typeof contents === "object" &&
    "document" in contents &&
    (contents as { document?: Document }).document
  ) {
    hardenEpubDocument((contents as { document: Document }).document);
  }
}
