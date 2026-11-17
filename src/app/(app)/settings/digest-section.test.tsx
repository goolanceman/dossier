import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";

import { previewDigest, saveDigestSettings } from "./actions";
import { DigestSection, type DigestSettings } from "./digest-section";

vi.mock("./actions", () => ({ saveDigestSettings: vi.fn(), previewDigest: vi.fn() }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: { ok: boolean; error?: string }) => (result.ok ? result : (toast(result.error!), result)) }));

const initial: DigestSettings = { enabled: false, hour: 7, includeMarkdown: true, emailEnabled: false };

const open = (props: { initial?: Partial<DigestSettings>; emailAvailable?: boolean } = {}) =>
  render(
    <DigestSection
      initial={{ ...initial, ...props.initial }}
      emailAvailable={props.emailAvailable ?? true}
      timeZone="Europe/Berlin"
    />,
  );

beforeEach(() => {
  vi.mocked(saveDigestSettings).mockReset().mockResolvedValue({ ok: true, data: null });
  vi.mocked(previewDigest).mockReset().mockResolvedValue({ ok: true, data: { markdown: "# Daily job digest\n\nNothing ran in the last 24 hours.\n" } });
});

describe("Settings → Automation (master.md Phase 15)", () => {
  it("is off until it's turned on, and says when it will run", async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole("switch", { name: "Build the daily digest" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription("Off. Nothing is built until it's on.");
    await user.click(toggle);
    expect(saveDigestSettings).toHaveBeenCalledWith({ enabled: true });
    expect(toggle).toHaveAccessibleDescription("On. It's built once a day after 07:00 your time (Europe/Berlin), from the last 24 hours.");
  });

  it("saves the hour and the Markdown export as they change", async () => {
    const user = userEvent.setup();
    open({ initial: { enabled: true } });
    await user.selectOptions(screen.getByLabelText("Built after"), "08:00");
    expect(saveDigestSettings).toHaveBeenLastCalledWith({ hour: 8 });
    await user.click(screen.getByRole("switch", { name: "Keep each digest as Markdown" }));
    expect(saveDigestSettings).toHaveBeenLastCalledWith({ includeMarkdown: false });
  });

  it("offers the digest email only while a sending Gmail account is connected", async () => {
    const user = userEvent.setup();
    open();
    const toggle = screen.getByRole("switch", { name: "Email me the digest" });
    await user.click(toggle);
    expect(saveDigestSettings).toHaveBeenLastCalledWith({ emailEnabled: true });
  });

  it("points to the Google settings while no sending account is connected", async () => {
    open({ emailAvailable: false });
    expect(screen.queryByRole("switch", { name: "Email me the digest" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("The digest can arrive by email from your own Gmail account. Connect it in Settings → Google to turn that on.");
    expect(screen.getByRole("link", { name: "Settings → Google" })).toHaveAttribute("href", "/settings?section=google");
  });

  it("previews today's digest from the server, without keeping or sending it", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Preview today's digest" }));
    await waitFor(() => expect(previewDigest).toHaveBeenCalledWith({}));
    expect(await screen.findByText(/Nothing ran in the last 24 hours\./)).toBeInTheDocument();
  });

  it("links to the runs history on the Discovery screen", () => {
    open();
    expect(screen.getByRole("link", { name: "View runs" })).toHaveAttribute("href", "/discovery");
  });
});
