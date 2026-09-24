import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/mail.ts";

describe("account emails", () => {
  it("escapes everything that goes into the HTML version", () => {
    const html = renderHtml({
      to: "a@example.com",
      subject: "Hi",
      text: 'Team "<script>alert(1)</script>" & co\n\nSecond paragraph',
      action: { label: "Join <now>", url: 'https://app.test/team?invite=1&x="y"' },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp; co");
    expect(html).toContain('href="https://app.test/team?invite=1&amp;x=&quot;y&quot;"');
    expect(html).toContain("Join &lt;now&gt;");
    expect(html.match(/<p /g)?.length).toBe(4);
  });
});
