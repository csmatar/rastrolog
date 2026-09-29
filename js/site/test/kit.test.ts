import { describe, expect, it } from "vitest";
import { kitFormAction, submitToKit } from "../src/lib/kit.ts";
import type { FetchLike } from "../src/lib/site-fetch.ts";

describe("Kit forms", () => {
  it("builds the form action from an ID", () => {
    expect(kitFormAction("1234567")).toBe("https://app.kit.com/forms/1234567/subscriptions");
    expect(kitFormAction("a/b")).toBe("https://app.kit.com/forms/a%2Fb/subscriptions");
  });

  it("posts the fields the way a form would, without cookies", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const spy: FetchLike = async (url, init) => {
      seen = { url, init };
      return new Response("{}", { status: 200 });
    };
    const body = new URLSearchParams({ email_address: "ana@example.org" });
    expect(await submitToKit("https://app.kit.com/forms/1/subscriptions", body, spy)).toBe("ok");
    expect(seen?.url).toBe("https://app.kit.com/forms/1/subscriptions");
    expect(seen?.init).toMatchObject({ method: "POST", mode: "cors", credentials: "omit" });
    expect(String(seen?.init.body)).toBe("email_address=ana%40example.org");
  });

  it("any failure is an error the form can retry", async () => {
    const body = new URLSearchParams({ email_address: "a@b.co" });
    expect(
      await submitToKit("https://x.example", body, async () => new Response("", { status: 500 })),
    ).toBe("error");
    const offline: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await submitToKit("https://x.example", body, offline)).toBe("error");
  });
});
