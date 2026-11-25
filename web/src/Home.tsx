import { useEffect, useRef, useState } from "react";
import type { CanvasBoard } from "@core/canvas-board";
import type { WorkMapRole } from "@core/work-map";
import type { CareerFile } from "@core/career-file";
import { planContactSubmission } from "@core/career-management";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Carousel } from "@astryxdesign/core/Carousel";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "@astryxdesign/core/Layout";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { MapPin } from "lucide-react";
import { OPEN_REQUESTS, REQUESTS_CHANGED, RequestsDialog, type RequestsTab } from "./Requests";
import { AccessDialog, OPEN_ACCESS } from "./Access";
import { HomeBar, type HomeBioMode } from "./HomeBar";
import { HomeNav, type HomePage } from "./HomeNav";
import { HomeProfileEdit } from "./HomeProfileEdit";
import { HomeSearch, type SearchPlace } from "./HomeSearch";
import { HomeSettings, type SettingsSection } from "./HomeSettings";
import { ResumeImport } from "./ResumeImport";
import { SocialMark } from "./SocialMark";
import type { DetailTab } from "./RoleDetailPanel";
import { WorkHistory } from "./WorkHistory";
import { CareerHistoryCard } from "./CareerHistoryCard";
import { CareerWorkspace } from "./CareerWorkspace";
import { ToolsPage } from "./ToolsPage";
import { HomeCenter } from "./HomeCenter";
import { HomeProforna, type ChatRole } from "./HomeProforna";
import {
  assistantReducer,
  chatInPanel,
  chatShowing,
  readAssistantState,
  type AssistantAction,
  type AssistantState,
} from "@core/assistant-panel";
import { RoleCanvasEntry } from "./RoleCanvas";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { WelcomeTour, type FirstRunMarks } from "./WelcomeTour";
import { clearEvidenceRole } from "./onboarding-evidence";
import { careerPreviewWindowUrl, isCareerPreview } from "./preview-placement";
import type { RoleSearchTarget } from "@core/role-search";
import type { RoleFocusRequest } from "./RoleView";
import "./home.css";

const NAV_COLLAPSED_KEY = "proforna.navCollapsed";
const PANEL_OPEN_KEY = "proforna.panelOpen";
const ASSISTANT_KEY = "proforna.assistant";
const WORKBENCH = "(min-width: 760px)";
const SPLIT_SCREEN = "(min-width: 801px)";

export function Home({
  initialFocusJobId = null,
  initialFocusTab,
  profile,
  career,
  careerReady = true,
  careerError,
  onProfileSaved,
}: {
  initialFocusJobId?: string | null;
  initialFocusTab?: DetailTab;
  profile: OnboardingProfileValue & FirstRunMarks;
  career: CareerFile;
  /** False until the career has loaded; the welcome card waits for it. */
  careerReady?: boolean;
  careerError: string | null;
  onProfileSaved: (profile: OnboardingProfileValue & FirstRunMarks) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Bumped by "Take the tour" in the user menu.
  const [tourRequest, setTourRequest] = useState(0);
  const [bioMode, setBioMode] = useState<HomeBioMode>(isCareerPreview() ? "preview" : "browse");
  const [canvasFromNav, setCanvasFromNav] = useState(false);
  const [chatRoles, setChatRoles] = useState<ChatRole[]>([]);
  const [chatRelease, setChatRelease] = useState<{ id: string; nonce: number } | null>(null);
  const [chatAttach, setChatAttach] = useState<{ id: string; nonce: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("profile");
  const [importOpen, setImportOpen] = useState(false);
  // A first job or school started from the empty Home opens in Career History.
  const [addRequest, setAddRequest] = useState<{ kind: "job" | "school"; nonce: number } | null>(null);
  const [careerRevision, setCareerRevision] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [centerView, setCenterView] = useState<{
    id: number;
    updates: boolean;
    updateId: string | null;
  } | null>(null);
  const [page, setPage] = useState<HomePage>(readPage);
  const [focusJobId, setFocusJobId] = useState<string | null>(() => initialFocusJobId ?? readRoleId());
  const [photoTick, setPhotoTick] = useState(0);
  const [mapRevision, setMapRevision] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Something found by search inside a role, shown when the role opens.
  const [roleRequest, setRoleRequest] = useState<RoleFocusRequest | null>(null);
  const [collapsed, setCollapsed] = useState(() => (isCareerPreview() ? false : readCollapsed()));
  const bioPopRef = useRef<HTMLDivElement>(null);
  const [assistant, setAssistant] = useState<AssistantState>(readAssistant);
  const chatDocked = chatInPanel(assistant);
  // On wider screens docked chat sits over History's own place, so switching
  // between them moves nothing else. Phones (and the old reserve page) give it a row of its own.
  const [splitScreen, setSplitScreen] = useState(() => window.matchMedia(SPLIT_SCREEN).matches);
  const chatOverRail = chatDocked && splitScreen && page !== "historyReserve";
  const [requests, setRequests] = useState<{ tab: RequestsTab; focusId: string | null } | null>(null);
  const [previewNote, setPreviewNote] = useState("");
  const [bioDialog, setBioDialog] = useState<"know" | "contact" | "place" | null>(null);
  const [desktop, setDesktop] = useState(readDesktop);
  const leftClosed = desktop && collapsed;
  const place = [
    profile.address,
    [profile.city, profile.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  const photoSrc = profile.avatarUrl
    ? `${profile.avatarUrl}?v=${photoTick}`
    : null;

  useEffect(() => {
    const mq = window.matchMedia(SPLIT_SCREEN);
    const onChange = () => setSplitScreen(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(WORKBENCH);
    function onChange() {
      setDesktop(mq.matches);
      if (mq.matches) setMobileOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function onRoute() {
      setEditing(false);
      const next = readPage();
      setPage(next);
      // Each role has its own address in Career History, so back and forward move between roles.
      if (next === "history") setFocusJobId(readRoleId());
      if (isCareerPreview()) setBioMode("preview");
    }
    window.addEventListener("hashchange", onRoute);
    return () => window.removeEventListener("hashchange", onRoute);
  }, []);

  useEffect(() => {
    if (!initialFocusJobId || focusJobId === initialFocusJobId) return;
    clearEvidenceRole();
  }, [focusJobId, initialFocusJobId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog.home-settings-dialog[open]")) return;
      event.preventDefault();
      setSearchOpen((open) => !open);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!bioDialog) return;
    const trap = bioDialog === "know" || bioDialog === "place";
    const trigger = trap && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = bioPopRef.current;
    const focusable = () => {
      if (!root) return [];
      return [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
        (element) => !element.hasAttribute("disabled"),
      );
    };
    if (trap) (focusable()[0] ?? root)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBioDialog(null);
        return;
      }
      if (!trap || event.key !== "Tab" || !root) return;
      const list = focusable();
      if (list.length === 0) {
        event.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [bioDialog]);

  function toggleMenu() {
    if (desktop) {
      setCollapsed((value) => {
        const next = !value;
        writeCollapsed(next);
        return next;
      });
      return;
    }
    setMobileOpen((open) => !open);
  }

  function goHome() {
    setFocusJobId(null);
    goPage("home");
  }

  function assist(action: AssistantAction) {
    setAssistant((current) => {
      const next = assistantReducer(current, action);
      writeAssistant(next);
      return next;
    });
  }

  function resizeChat(box: { x: number; y: number; width: number; height: number }) {
    setAssistant((current) => {
      const next = { ...current, float: { x: box.x, y: box.y }, size: { width: box.width, height: box.height } };
      writeAssistant(next);
      return next;
    });
  }

  function moveChat(float: { x: number; y: number }) {
    setAssistant((current) => {
      const next = { ...current, float };
      writeAssistant(next);
      return next;
    });
  }

  function openRequests(tab: RequestsTab, focusId?: string) {
    setRequests({ tab, focusId: focusId ?? null });
  }

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<{ tab?: RequestsTab; id?: string }>).detail ?? {};
      openRequests(detail.tab ?? "sent", detail.id);
    }
    window.addEventListener(OPEN_REQUESTS, onOpen);
    return () => window.removeEventListener(OPEN_REQUESTS, onOpen);
  }, []);

  const [access, setAccess] = useState<{ focusId: string | null; share: boolean } | null>(null);
  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; share?: boolean }>).detail ?? {};
      // Access opens on its own; Requests steps aside so one window shows at a time.
      setRequests(null);
      setAccess({ focusId: detail.id ?? null, share: Boolean(detail.share) });
    }
    window.addEventListener(OPEN_ACCESS, onOpen);
    return () => window.removeEventListener(OPEN_ACCESS, onOpen);
  }, []);

  function goPage(next: HomePage, roleId: string | null = null) {
    setPage(next);
    const hash =
      next === "home"
        ? ""
        : next === "historyReserve"
          ? "#/history-reserve"
          : next === "history" && roleId
            ? `#/history/${encodeURIComponent(roleId)}`
            : `#/${next}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }

  // The profile card is only shown while previewing the public page, so
  // editing the profile opens Settings on Profile, which is always visible.
  function goProfile() {
    setEditing(false);
    setSettingsSection("profile");
    setSettingsOpen(true);
  }

  function showLeft() {
    setMobileOpen(false);
    if (collapsed) {
      setCollapsed(false);
      writeCollapsed(false);
    }
  }

  function showCenter() {
    if (page === "home" || page === "history") return;
    setEditing(false);
    goPage("home");
  }

  function openSearchPlace(id: SearchPlace) {
    if (id === "profile") {
      goProfile();
      return;
    }
    if (id === "history") {
      showLeft();
      setEditing(false);
      setFocusJobId(null);
      goPage("history", null);
      return;
    }
    if (id === "map") {
      showCenter();
      setCenterView({ id: Date.now(), updates: false, updateId: null });
      return;
    }
    if (id === "updates") {
      showCenter();
      setFocusJobId(null);
      setCenterView({ id: Date.now(), updates: true, updateId: null });
      return;
    }
    if (id === "media") {
      showCenter();
      return;
    }
    assist("openChat");
  }

  function openSearchRole(id: string, target?: RoleSearchTarget) {
    showLeft();
    setEditing(false);
    setFocusJobId(id);
    goPage("history", id);
    if (!target) return;
    const nonce = Date.now();
    setRoleRequest(
      "tab" in target
        ? { kind: "tab", id: target.tab, nonce }
        : "achievement" in target
          ? { kind: "achievement", id: target.achievement, nonce }
          : { kind: "person", id: target.person, nonce },
    );
  }

  function openSearchUpdate(id: string, roleId: string) {
    showCenter();
    setFocusJobId(roleId);
    setCenterView({ id: Date.now(), updates: true, updateId: id });
  }

  function chooseBioMode(mode: HomeBioMode) {
    setBioMode(mode);
    setPreviewNote("");
    if (mode === "preview") {
      setEditing(false);
      setFocusJobId(null);
      goPage("history", null);
      return;
    }
    if (!isCareerPreview()) return;
    const next = window.location.hash.split("?")[0];
    if (window.location.hash !== next) window.location.hash = next;
  }

  function openCareerPreview(where: "here" | "window") {
    if (where === "window") {
      const opened = window.open(
        careerPreviewWindowUrl(),
        "proforna-career-preview",
        "popup,width=1100,height=800",
      );
      if (opened) return;
    }
    chooseBioMode("preview");
    if (where === "window") {
      setPreviewNote("The browser blocked the preview window. Preview is staying in this window.");
    }
  }

  return (
    <div className="home">
      <HomeSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPlace={openSearchPlace}
        onRole={openSearchRole}
        onUpdate={openSearchUpdate}
        onTool={(id) => {
          setEditing(false);
          window.location.hash = `#/tools/${encodeURIComponent(id)}`;
        }}
      />
      <HomeSettings
        open={settingsOpen}
        section={settingsSection}
        profile={profile}
        onClose={() => setSettingsOpen(false)}
        onProfileSaved={(next) => {
          setPhotoTick((n) => n + 1);
          onProfileSaved(next);
        }}
        onMapsSaved={() => setMapRevision((n) => n + 1)}
      />
      {importOpen ? (
        <ResumeImport
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            setCareerRevision((n) => n + 1);
          }}
        />
      ) : null}
      <div
        className={[
          "home-sheet",
          leftClosed ? "is-left-closed has-rail" : "",
          chatDocked && !chatOverRail ? "is-right-open" : "",
          chatOverRail ? "is-chat-docked" : "",
          assistant.open || chatDocked ? "" : "is-panel-closed",
          page === "historyReserve" ? "" : "is-home",
          page === "history" && bioMode === "preview" ? "" : "is-bio-hidden",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <HomeBar
          name={profile.fullName}
          headline={profile.headline}
          photoSrc={photoSrc}
          menuExpanded={desktop ? !collapsed : mobileOpen}
          menuLabel={page === "history" && !desktop ? "Home" : undefined}
          onMenu={() => {
            // On narrow screens Career history has no side column to close, so
            // the button goes home; on wider ones it closes the column in place.
            if (page === "history" && !desktop) {
              setEditing(false);
              goHome();
              return;
            }
            toggleMenu();
          }}
          onSettings={(section = "profile") => {
            setSettingsSection(section);
            setSettingsOpen(true);
          }}
          onTour={() => setTourRequest((count) => count + 1)}
          onSearch={() => setSearchOpen(true)}
          assistant={assistant}
          onAssist={assist}
          onRequests={openRequests}
          bioMode={bioMode}
          onBioMode={chooseBioMode}
          notice={previewNote}
          onPreview={openCareerPreview}
          onExitPreview={() => chooseBioMode("browse")}
          revision={careerRevision}
          onNotice={(href) => {
            setEditing(false);
            setMobileOpen(false);
            if (href === "worklog") {
              goHome();
              return;
            }
            goPage(href);
          }}
        />
        {leftClosed ? null : (
          <>
            <section className="home-card home-bio" aria-label="Profile">
              {editing ? (
                <div className="home-file home-edit">
                  <HomeProfileEdit
                    initial={profile}
                    onCancel={() => setEditing(false)}
                    onSaved={(saved) => {
                      setPhotoTick((n) => n + 1);
                      onProfileSaved(saved);
                      setEditing(false);
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className="home-bio-row">
                    <Avatar
                      name={profile.fullName || "Career"}
                      src={photoSrc ?? undefined}
                      size={48}
                      tooltip={false}
                    />
                    <div className="home-bio-id">
                      <h2>{profile.fullName || "Career"}</h2>
                      {profile.headline.trim() ? <p>{profile.headline.trim()}</p> : null}
                    </div>
                    <div className="home-bio-socials">
                      <button type="button" aria-label="Request location" onClick={() => setBioDialog("place")}>
                        <Icon className="home-bio-pin" icon={MapPin} size="sm" />
                      </button>
                      {bioSocials(profile).map((item) =>
                        item.url ? (
                          <a key={item.name} href={item.url} target="_blank" rel="noreferrer" aria-label={item.name}>
                            <SocialMark kind={item.kind} />
                          </a>
                        ) : (
                          <span key={item.name} aria-label={`${item.name}, not added`} title={item.name}>
                            <SocialMark kind={item.kind} />
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="home-bio-actions">
                    <Button
                      label="Contact"
                      variant="secondary"
                      size="sm"
                      onClick={() => setBioDialog("contact")}
                    />
                    <Button
                      label="Get to know me"
                      variant="secondary"
                      size="sm"
                      onClick={() => setBioDialog("know")}
                    />
                  </div>
                </>
              )}
            </section>
            <section className="home-card home-history" aria-label="Career history">
              <HomeNav
                collapsed={false}
                mobileOpen={mobileOpen}
                page={page}
                onCloseMobile={() => setMobileOpen(false)}
                onGoHome={() => {
                  goHome();
                }}
                onGoHistory={(jobId) => {
                  setEditing(false);
                  setFocusJobId(jobId ?? null);
                  goPage("history", jobId ?? null);
                }}
                onGoPage={(next) => {
                  setEditing(false);
                  setFocusJobId(null);
                  goPage(next);
                }}
                onCanvas={setCanvasFromNav}
                canvasOpen={canvasFromNav}
                history={
                  page === "history" ? (
                    <CareerHistoryCard
                      revision={careerRevision}
                      focusRoleId={focusJobId}
                      onOpenRole={(id) => {
                        setEditing(false);
                        setFocusJobId(id);
                        goPage("history", id);
                      }}
                      onBack={() => {
                        setFocusJobId(null);
                        goHome();
                      }}
                      onImport={() => setImportOpen(true)}
                      addRequest={addRequest}
                      onAsk={() => {
                        if (!chatShowing(assistant)) assist("openChat");
                      }}
                      onAdded={() => setCareerRevision((n) => n + 1)}
                      onRemoved={(ids) => {
                        setCareerRevision((n) => n + 1);
                        if (focusJobId && ids.includes(focusJobId)) {
                          setFocusJobId(null);
                          goPage("history", null);
                        }
                      }}
                      onSelectionChange={setChatRoles}
                      release={chatRelease}
                      attach={chatAttach}
                      selectedRoleIds={chatRoles.map((role) => role.id)}
                      onAttachApplied={(nonce) => {
                        setChatAttach((current) => (current?.nonce === nonce ? null : current));
                      }}
                    />
                  ) : null
                }
              />
            </section>
          </>
        )}
        {leftClosed ? (
          <section className="home-card home-rail" aria-label="Menu">
            <HomeNav
              collapsed
              mobileOpen={false}
              page={page}
              onCloseMobile={() => setMobileOpen(false)}
              onExpand={showLeft}
              onGoHome={goHome}
              onGoHistory={() => {
                setEditing(false);
                // Already on Career history: the icon brings the list back.
                if (page === "history") {
                  showLeft();
                  return;
                }
                setFocusJobId(null);
                goPage("history", null);
              }}
              onGoPage={(next) => {
                setEditing(false);
                setFocusJobId(null);
                goPage(next);
              }}
              onCanvas={setCanvasFromNav}
              canvasOpen={canvasFromNav}
            />
          </section>
        ) : null}
        {page === "historyReserve" ? (
          <main className="home-card home-stage">
            <WorkHistory
              career={career}
              careerError={careerError}
              focusJobId={focusJobId}
              focusTab={focusJobId === initialFocusJobId ? initialFocusTab : undefined}
              mapRevision={mapRevision}
              careerRevision={careerRevision}
              canvasFromNav={canvasFromNav}
              onCareerChanged={() => setCareerRevision((n) => n + 1)}
              onHome={() => {
                setEditing(false);
                goHome();
              }}
            />
          </main>
        ) : (
          <HomeCenter
            revision={careerRevision}
            focusRoleId={focusJobId}
            roleView={page === "history"}
            assistant={{ chatPopped: assistant.chat === "floating", onAssist: assist }}
            onRoleSaved={() => setCareerRevision((n) => n + 1)}
            viewRequest={centerView}
            roleRequest={roleRequest}
            pageContent={
              page === "tools" ? <ToolsPage /> : page !== "home" && page !== "history" ? <CareerWorkspace page={page} /> : null
            }
            onSelectRole={(id) => {
              setEditing(false);
              setFocusJobId(id);
              goPage("history", id);
            }}
            onCloseRole={() => {
              setFocusJobId(null);
              goPage("history", null);
            }}
            onStart={(action) => {
              if (action === "import") {
                setImportOpen(true);
                return;
              }
              setFocusJobId(null);
              goPage("history");
              setAddRequest({ kind: action, nonce: Date.now() });
            }}
          />
        )}
        <HomeProforna
          place={chatDocked ? "docked" : assistant.chat === "floating" ? "floating" : "closed"}
          float={assistant.float}
          size={assistant.size}
          overRail={chatOverRail}
          minimized={assistant.minimized}
          onResize={resizeChat}
          onAssist={assist}
          onMove={moveChat}
          historyLabel={page === "history" && focusJobId ? "History" : "Updates"}
          roles={chatRoles}
          focusRoleId={focusJobId}
          careerRevision={careerRevision}
          onReleaseRole={(id) => {
            setChatRoles((current) => current.filter((role) => role.id !== id));
            setChatRelease({ id, nonce: Date.now() });
            setChatAttach((current) => (current?.id === id ? null : current));
          }}
          onAttachRole={(role) => {
            setChatRoles((current) =>
              current.some((item) => item.id === role.id) ? current : [...current, role],
            );
            setChatAttach({ id: role.id, nonce: Date.now() });
            setChatRelease((current) => (current?.id === role.id ? null : current));
          }}
        />
        {canvasFromNav && page !== "historyReserve" ? (
          <HomeCanvas onClose={() => setCanvasFromNav(false)} />
        ) : null}
      </div>
      {bioDialog === "know" || bioDialog === "place" ? (
        <div
          ref={bioPopRef}
          className="home-bio-pop"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label={bioDialog === "know" ? "Get to know me" : "Location"}
          onClick={(event) => {
            if (event.target === event.currentTarget) setBioDialog(null);
          }}
        >
          <ScrollableArea
            className="home-bio-pop-card"
            label={bioDialog === "know" ? "Get to know me" : "Location"}
          >
            <header>
              <h2>{bioDialog === "know" ? "Get to know me" : "Location"}</h2>
              <Button label="Close" variant="ghost" size="sm" onClick={() => setBioDialog(null)} />
            </header>
            {bioDialog === "know" ? (
              <p>{profile.bio.trim() || "Nothing written yet."}</p>
            ) : (
              <p>{place || "No location yet."}</p>
            )}
          </ScrollableArea>
        </div>
      ) : null}
      <ContactNoteDialog isOpen={bioDialog === "contact"} onClose={() => setBioDialog(null)} />
      <AccessDialog
        isOpen={access != null}
        focusId={access?.focusId ?? null}
        startSharing={access?.share ?? false}
        onClose={() => setAccess(null)}
      />
      <RequestsDialog
        isOpen={requests !== null}
        tab={requests?.tab ?? "sent"}
        focusId={requests?.focusId ?? null}
        onTab={(tab) => setRequests((current) => ({ tab, focusId: current?.focusId ?? null }))}
        onClose={() => {
          setRequests(null);
          window.dispatchEvent(new Event(REQUESTS_CHANGED));
        }}
        onOpenNetwork={() => {
          setRequests(null);
          goPage("network");
        }}
      />
      <WelcomeTour
        firstName={profile.firstName}
        marks={profile}
        career={career}
        ready={careerReady}
        tourRequest={tourRequest}
        onBeforeTour={() => {
          setSearchOpen(false);
          setSettingsOpen(false);
          if (page !== "home") goPage("home");
        }}
        onSaved={(saved) => onProfileSaved({ ...profile, ...saved })}
        onAddJob={() => {
          setFocusJobId(null);
          // Career History is drawn only with the sidebar open; the new job needs it.
          showLeft();
          goPage("history");
          setAddRequest({ kind: "job", nonce: Date.now() });
        }}
        onGo={(destination) => {
          // Each action on the welcome card opens the place where it is filled in.
          if (destination.kind === "role") {
            openSearchRole(destination.id);
          } else if (destination.kind === "history") {
            setFocusJobId(null);
            showLeft();
            goPage("history");
          } else if (destination.kind === "network") {
            goPage("network");
          } else {
            setSettingsSection("publication");
            setSettingsOpen(true);
          }
        }}
      />
    </div>
  );
}

const CONTACT_STEP_LABELS = {
  details: "Details",
  job: "Job opportunity",
  time: "Meet",
} as const;

type ContactStep = keyof typeof CONTACT_STEP_LABELS;

const MEET_TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

function contactSteps(jobs: boolean): ContactStep[] {
  return jobs ? ["details", "job", "time"] : ["details"];
}

function upcomingMeetDays(): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (days.length < 5) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function meetDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function ContactNoteDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<ContactStep>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [jobs, setJobs] = useState(false);
  const [networks, setNetworks] = useState(false);
  const [jobName, setJobName] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobSalary, setJobSalary] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobPost, setJobPost] = useState("");
  const [meetDay, setMeetDay] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [firstError, setFirstError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const attempt = useRef(0);
  const steps = contactSteps(jobs);
  const meetDays = upcomingMeetDays();

  useEffect(() => {
    attempt.current += 1;
    if (isOpen) return;
    setStep("details");
    setFirstName("");
    setLastName("");
    setEmail("");
    setCompany("");
    setJobTitle("");
    setPhone("");
    setJobs(false);
    setNetworks(false);
    setJobName("");
    setJobRole("");
    setJobCompany("");
    setJobLocation("");
    setJobSalary("");
    setJobLink("");
    setJobPost("");
    setMeetDay("");
    setMeetTime("");
    setFirstError(null);
    setLastError(null);
    setEmailError(null);
    setSaving(false);
    setSaveError("");
  }, [isOpen]);

  function detailsReady(): boolean {
    const missingFirst = !firstName.trim();
    const missingLast = !lastName.trim();
    const missingEmail = !email.trim();
    setFirstError(missingFirst ? "Required" : null);
    setLastError(missingLast ? "Required" : null);
    setEmailError(missingEmail ? "Required" : null);
    if (missingFirst || missingLast || missingEmail) {
      setStep("details");
      return false;
    }
    return true;
  }

  async function submit() {
    if (!detailsReady() || saving) return;
    const generation = attempt.current;
    const meetWhen = [meetDay, meetTime].filter(Boolean).join(" ");
    const planned = planContactSubmission({
      firstName,
      lastName,
      email,
      company,
      jobTitle,
      phone,
      jobs,
      networks,
      jobName,
      jobRole,
      jobCompany,
      jobLocation,
      jobSalary,
      jobLink,
      jobPost,
      meetWhen,
    });
    if (!planned.ok) {
      setSaveError("Add a name before connecting.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(planned.value),
      });
      if (generation !== attempt.current) return;
      if (!response.ok) {
        setSaveError("Could not save that request.");
        return;
      }
      onClose();
    } catch {
      if (generation !== attempt.current) return;
      setSaveError("Could not save that request.");
    } finally {
      if (generation === attempt.current) setSaving(false);
    }
  }

  function chooseJobs(next: boolean) {
    setJobs(next);
    setStep(next ? "job" : "details");
  }

  function continueDetails() {
    if (!detailsReady()) return;
    if (!jobs) {
      void submit();
      return;
    }
    setStep("job");
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      width={620}
      maxHeight="min(40rem, calc(100dvh - 2rem))"
      purpose="form"
    >
      <Layout
        height="fill"
        padding={4}
        defaultHasDividers
        header={
          <>
            <DialogHeader title="Contact" onOpenChange={onClose} hasDivider={false} />
            {steps.length > 1 ? (
              <LayoutHeader hasDivider={false}>
                <Stepper
                  activeStep={Math.max(0, steps.indexOf(step))}
                  orientation="horizontal"
                  density="compact"
                  label="Contact progress"
                >
                  {steps.map((id, index) => (
                    <Step
                      key={id}
                      step={index}
                      label={CONTACT_STEP_LABELS[id]}
                      status={id === "details" && (firstError || lastError || emailError) ? "error" : undefined}
                    />
                  ))}
                </Stepper>
              </LayoutHeader>
            ) : null}
          </>
        }
        content={
          <LayoutContent label="Contact">
            {saveError ? (
              <Banner status="error" title={saveError} container="section" collapsible={false} role="alert" />
            ) : null}
            {step === "job" ? (
              <VStack gap={3}>
                <Text type="label">Job opportunity</Text>
                <Carousel className="home-contact-slides" aria-label="Job posting" hasSnap gap={0} hasEdgeFade={false}>
                  <div className="home-contact-slide">
                    <TextInput label="Name" isLabelHidden placeholder="Name" value={jobName} onChange={setJobName} />
                  </div>
                  <div className="home-contact-slide">
                    <TextInput label="Role" isLabelHidden placeholder="Role" value={jobRole} onChange={setJobRole} />
                  </div>
                  <div className="home-contact-slide">
                    <TextInput label="Company" isLabelHidden placeholder="Company" value={jobCompany} onChange={setJobCompany} />
                  </div>
                  <div className="home-contact-slide">
                    <TextInput label="Location" isLabelHidden placeholder="Location" value={jobLocation} onChange={setJobLocation} />
                  </div>
                  <div className="home-contact-slide">
                    <TextInput label="Salary range" isLabelHidden placeholder="Salary range" value={jobSalary} onChange={setJobSalary} />
                  </div>
                  <div className="home-contact-slide">
                    <TextInput label="Link" isLabelHidden placeholder="https://" value={jobLink} onChange={setJobLink} />
                  </div>
                  <div className="home-contact-slide">
                    <TextArea
                      label="Description"
                      isLabelHidden
                      placeholder="Describe the job opportunity"
                      value={jobPost}
                      onChange={setJobPost}
                    />
                  </div>
                </Carousel>
              </VStack>
            ) : step === "time" ? (
              <VStack gap={3}>
                <Text type="label">Pick a time</Text>
                <HStack gap={2} wrap="wrap">
                  {meetDays.map((date) => {
                    const key = meetDayKey(date);
                    return (
                      <Button
                        key={key}
                        label={date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        size="sm"
                        variant={meetDay === key ? "primary" : "secondary"}
                        onClick={() => setMeetDay(key)}
                      />
                    );
                  })}
                </HStack>
                <HStack gap={2} wrap="wrap">
                  {MEET_TIMES.map((time) => (
                    <Button
                      key={time}
                      label={time}
                      size="sm"
                      variant={meetTime === time ? "primary" : "secondary"}
                      onClick={() => setMeetTime(time)}
                    />
                  ))}
                </HStack>
              </VStack>
            ) : (
              <VStack gap={4}>
                <Text type="label">Your details</Text>
                <Grid columns={2} gap={3}>
                  <TextInput
                    label="First name"
                    isLabelHidden
                    placeholder="First name*"
                    value={firstName}
                    onChange={setFirstName}
                    status={firstError ? { type: "error", message: firstError } : undefined}
                  />
                  <TextInput
                    label="Last name"
                    isLabelHidden
                    placeholder="Last name*"
                    value={lastName}
                    onChange={setLastName}
                    status={lastError ? { type: "error", message: lastError } : undefined}
                  />
                  <TextInput
                    label="Email"
                    isLabelHidden
                    placeholder="Email*"
                    value={email}
                    onChange={setEmail}
                    status={emailError ? { type: "error", message: emailError } : undefined}
                  />
                  <TextInput
                    label="Company name"
                    isLabelHidden
                    placeholder="Company name"
                    value={company}
                    onChange={setCompany}
                  />
                  <TextInput label="Job title" isLabelHidden placeholder="Job title" value={jobTitle} onChange={setJobTitle} />
                  <TextInput label="Phone number" isLabelHidden placeholder="Phone number" value={phone} onChange={setPhone} />
                </Grid>
                <VStack gap={2}>
                  <Text type="label">What are you interested in?</Text>
                  <CheckboxInput label="Job opportunities" value={jobs} onChange={chooseJobs} />
                  <CheckboxInput label="Connecting networks" value={networks} onChange={setNetworks} />
                </VStack>
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            {step === "job" ? (
              <HStack gap={2} vAlign="center">
                <Button label="Back" variant="secondary" onClick={() => setStep("details")} />
                <Button label="Next" variant="primary" onClick={() => setStep("time")} />
              </HStack>
            ) : step === "time" ? (
              <HStack gap={2} vAlign="center">
                <Button label="Back" variant="secondary" onClick={() => setStep("job")} />
                <Button label={saving ? "Saving…" : "Let's connect"} variant="primary" isDisabled={saving} onClick={() => void submit()} />
              </HStack>
            ) : (
              <Button
                label={saving ? "Saving…" : jobs ? "Continue" : "Let's connect"}
                variant="primary"
                isDisabled={saving}
                onClick={continueDetails}
              />
            )}
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

function HomeCanvas({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [studyBoards, setStudyBoards] = useState<CanvasBoard[]>([]);
  const [studyRevision, setStudyRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/work-map")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          roles?: WorkMapRole[];
          studyBoards?: CanvasBoard[];
          studyRevision?: number;
        };
        if (cancelled) return;
        setRoles(body.roles ?? []);
        setStudyBoards(body.studyBoards ?? []);
        setStudyRevision(body.studyRevision ?? 0);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  const role = roles[0];
  return (
    <RoleCanvasEntry
      role={role}
      roles={roles}
      studyBoards={studyBoards}
      studyRevision={studyRevision}
      scope="all"
      minimized={false}
      slot={null}
      dockSlot={null}
      onMinimizedChange={(minimized) => {
        if (minimized) onClose();
      }}
      onShowRole={() => undefined}
      onClose={onClose}
    />
  );
}

function readPage(): HomePage {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (value === "history-reserve") return "historyReserve";
  if (value.startsWith("history/")) return "history";
  if (value === "tools" || value.startsWith("tools/")) return "tools";
  return value === "history" ||
    value === "resumes" ||
    value === "documents" ||
    value === "network" ||
    value === "opportunities"
    ? value
    : "home";
}

/** The open role in Career History's address, `#/history/<role id>`. */
function readRoleId(): string | null {
  const match = window.location.hash.replace(/^#\/?/, "").split("?")[0].match(/^history\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

function readDesktop(): boolean {
  return window.matchMedia(WORKBENCH).matches;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

/** The assistant panel and chat as last left; the older chat-column choice carries over once. */
function readAssistant(): AssistantState {
  try {
    const saved = window.localStorage.getItem(ASSISTANT_KEY);
    if (saved) return readAssistantState(JSON.parse(saved));
    return readAssistantState(null, window.localStorage.getItem(PANEL_OPEN_KEY) !== "0");
  } catch {
    return readAssistantState(null);
  }
}

function writeAssistant(state: AssistantState) {
  try {
    window.localStorage.setItem(ASSISTANT_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function bioSocials(profile: {
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}): Array<{ name: string; kind: "linkedin" | "github" | "site"; url: string | null }> {
  return [
    { name: "LinkedIn", kind: "linkedin", url: httpUrl(profile.linkedinUrl) },
    { name: "GitHub", kind: "github", url: httpUrl(profile.githubUrl) },
    { name: "Site", kind: "site", url: httpUrl(profile.portfolioUrl) },
  ];
}

function httpUrl(value: string): string | null {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}
