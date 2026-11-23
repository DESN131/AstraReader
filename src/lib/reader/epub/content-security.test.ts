// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  hardenEpubMarkup,
  stripRemoteCss,
} from "./content-security";

describe("EPUB content hardening", () => {
  it("removes scripts, event handlers, form targets and unsafe URLs", () => {
    const hardened = hardenEpubMarkup(`
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body onload="alert(1)">
          <script>alert(2)</script>
          <iframe srcdoc="<script>alert(3)</script>"></iframe>
          <img src="https://example.com/tracker.png" onerror="alert(4)" />
          <a href="javascript:alert(5)">unsafe</a>
          <form action="https://example.com/collect"></form>
        </body>
      </html>
    `);
    const document = new DOMParser().parseFromString(hardened, "text/html");

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.body.hasAttribute("onload")).toBe(false);

    const image = document.querySelector("img");
    expect(image?.hasAttribute("src")).toBe(false);
    expect(image?.hasAttribute("onerror")).toBe(false);
    expect(image?.getAttribute("data-astra-blocked-src")).toBe(
      "https://example.com/tracker.png",
    );

    expect(document.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(document.querySelector("form")?.hasAttribute("action")).toBe(
      false,
    );
  });

  it("removes remote and script URLs from CSS", () => {
    const css = stripRemoteCss(`
      @import url("https://example.com/theme.css");
      .cover { background: url(https://example.com/tracker.png); }
      .unsafe { background: url("javascript:alert(1)"); }
      .local { background: url("../Images/cover.jpg"); }
    `);

    expect(css).not.toContain("example.com");
    expect(css).not.toContain("javascript:");
    expect(css).toContain("../Images/cover.jpg");
  });
});
