import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeNav } from "./HomeNav";

afterEach(cleanup);

describe("the sidebar", () => {
  it("leaves out Opportunities and Resume Studio for this release", () => {
    const none = () => undefined;
    render(
      <HomeNav
        collapsed={false}
        mobileOpen={false}
        page="home"
        onCloseMobile={none}
        onGoHome={none}
        onGoHistory={none}
        onGoPage={none}
        onCanvas={none}
      />,
    );
    expect(screen.getByText("My Network")).toBeTruthy();
    expect(screen.getByText("My Docs")).toBeTruthy();
    expect(screen.queryByText("Opportunities")).toBeNull();
    expect(screen.queryByText("Resume Studio")).toBeNull();
  });
});
