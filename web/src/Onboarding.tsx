import { useEffect, useRef, useState } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Stepper, Step } from "@astryxdesign/core/Stepper";
import { Heading, Text } from "@astryxdesign/core/Text";
import { RESUME_FILE_ACCEPT } from "@core/resume-preview";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  CLOUD_PROVIDERS,
  cloudDestination,
  cloudProviderFor,
  isHttpUrl,
  OPENAI_BASE_URL,
  type CloudProviderId,
  type ModelHosting,
} from "@core/model-connection";
import {
  LOCAL_SCAN_PORT_MAX,
  LOCAL_SCAN_PORT_MIN,
  preparePortRange,
  presentModelId,
  presentRangeHits,
  presentScanAddress,
  type LocalScanHit,
} from "@core/model-onboarding";
import {
  finishSignature,
  finishDraftStamp,
  recoverPendingFinish,
  releaseFinishDraft,
  reuseSavedHistory,
  type OnboardingFinishReceipt,
} from "@core/onboarding-finish";
import {
  onboardingCheckItems,
  profileAfterOnboarding,
  type OnboardingCheckItem,
  type OnboardingLinkAnswer,
  type OnboardingPlaceAnswer,
} from "@core/onboarding-review";
import {
  nextOnboardingStep,
  onboardingSteps,
  previousOnboardingStep,
  type OnboardingStepId,
} from "@core/onboarding-steps";
import {
  isAvatarType,
  joinPersonName,
  personNameParts,
  prepareProfile,
  PROFILE_AVATAR_MAX_BYTES,
  type ProfileFields,
} from "@core/profile";
import type { ExtractedProfile, ExtractedResume } from "@core/resume-extract";
import { ArrowRight, ChevronDown, Cloud, FileText, Laptop, PencilLine, Plus, TriangleAlert, X } from "lucide-react";
import {
  dropSetAside,
  historyFromHeld,
  NO_RESUME_FILE,
  resumesToQueue,
  rememberSetAside,
  rememberSkills,
  type HeldRole,
  type HeldSkill,
  type SetAsideRole,
} from "@core/resume-compare";
import { ResumePreview } from "./OnboardingCheck";
import { AllResumesVerify, ResumeCompare, type ResumeBundle } from "./OnboardingCompare";
import { ResumeReview } from "./ResumeReview";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingModelChoice,
  type OnboardingTimelineRow,
} from "./onboarding-session";
import {
  clearFinishReceipt,
  readFinishReceipt,
  writeFinishReceipt,
} from "./onboarding-finish-store";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

type OnboardingStep = OnboardingStepId;

export type OnboardingExit = { page: "home" } | { page: "history"; focusJobId?: string };

type QueuedResume = {
  file: File;
  digest: string;
};

const STEP_LABEL: Record<OnboardingStep, string> = {
  name: "Profile",
  model: "Model",
  file: "Resume",
  check: "Verify",
};

export function Onboarding({
  initialProfile,
  onFinished,
}: {
  initialProfile: OnboardingProfileValue;
  onFinished: (me: Me, next: OnboardingExit) => void;
}) {
  const openedName = personNameParts(initialProfile);
  const [firstName, setFirstName] = useState(openedName.firstName);
  const [lastName, setLastName] = useState(openedName.lastName);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialProfile.avatarUrl);
  // A photo saved before (when setup is run again) is removed on finish.
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [headline, setHeadline] = useState(initialProfile.headline);
  const [place, setPlace] = useState<OnboardingPlaceAnswer>({
    street: initialProfile.address,
    city: initialProfile.city,
    state: initialProfile.state,
  });
  const [links, setLinks] = useState<OnboardingLinkAnswer>({
    linkedinUrl: initialProfile.linkedinUrl,
    githubUrl: initialProfile.githubUrl,
    portfolioUrl: initialProfile.portfolioUrl,
  });
  const [localProbe, setLocalProbe] = useState<"idle" | "scanning" | "ready">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<LocalScanHit[]>([]);
  const [endpointMode, setEndpointMode] = useState<"scanned" | "custom" | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [wantsModel, setWantsModel] = useState<boolean | null>(null);
  const [hosting, setHosting] = useState<ModelHosting | null>(null);
  const [cloudKey, setCloudKey] = useState("");
  // The cloud provider chosen in setup; its address is `baseUrl`.
  const [cloudProvider, setCloudProvider] = useState<CloudProviderId>("openai");
  // The provider's own model list, fetched once a key is entered.
  const [cloudModels, setCloudModels] = useState<
    { state: "loading" } | { state: "listed"; models: string[] } | { state: "failed"; error: string } | null
  >(null);
  const [selected, setSelected] = useState("");
  const [foundPick, setFoundPick] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [files, setFiles] = useState<QueuedResume[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [held, setHeld] = useState<HeldRole[]>([]);
  const [heldSkills, setHeldSkills] = useState<HeldSkill[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pass, setPass] = useState<"verify" | "compare" | "review">("verify");
  const [setAsides, setSetAsides] = useState<SetAsideRole[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [profileExtract, setProfileExtract] = useState<ExtractedProfile | null>(null);
  const [step, setStep] = useState<OnboardingStep>("name");
  const [items, setItems] = useState<OnboardingCheckItem[]>([]);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extracting, setExtracting] = useState(false);
  // A model is sent a short test before a resume, so one that is listed but
  // can't answer is caught on the Model step. Keyed by address, model, and key.
  // A local model is tested as soon as it is chosen; a cloud one on Continue.
  const [modelCheck, setModelCheck] = useState<{ key: string; state: "checking" | "ok" | "failed" } | null>(null);
  const modelCheckKeyRef = useRef("");
  // A draft was loaded or saved in this session, so emptying it must be saved too.
  const draftSavedRef = useRef(false);
  // The last read stopped on a model failure, so the Resume step offers a way on.
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [readDigests, setReadDigests] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<OnboardingTimelineRow[] | null>(null);
  const [declinedPairs, setDeclinedPairs] = useState<string[]>([]);
  const extractsRef = useRef<Map<string, ExtractedResume>>(new Map());
  const profileRef = useRef<ProfileFields>(initialProfile);
  const abortRef = useRef<AbortController | null>(null);
  const finishing = useRef(false);
  const concluded = useRef(false);
  const scanAbort = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(files);
  const addChain = useRef(Promise.resolve());
  filesRef.current = files;
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  function modelChoiceForDraft(): OnboardingModelChoice | null {
    if (wantsModel === null) return null;
    return {
      skipped: wantsModel === false,
      hosting,
      model: selected,
      baseUrl: endpointMode === "custom" ? localUrl.trim() : baseUrl,
      endpoint: endpointMode,
    };
  }

  function restoreModelChoice(choice: OnboardingModelChoice | null | undefined) {
    if (!choice) return;
    setWantsModel(choice.skipped ? false : true);
    setHosting(choice.hosting);
    setSelected(choice.model);
    setBaseUrl(choice.baseUrl);
    setEndpointMode(choice.endpoint);
    if (choice.endpoint === "custom") setLocalUrl(choice.baseUrl);
    if (choice.endpoint === "scanned" && choice.model) setFoundPick(`${choice.baseUrl} ${choice.model}`);
    if (choice.hosting === "cloud") setCloudProvider(cloudProviderFor(choice.baseUrl));
  }

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const node = previewDialogRef.current;
    if (!node) return;
    if (previewOpen) {
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) node.close();
  }, [previewOpen, previewIndex, files]);

  useEffect(() => {
    let cancel = false;
    void loadOnboardingDraft()
      .then((draft) => {
        if (cancel || !draft) return;
        draftSavedRef.current = true;
        extractsRef.current = new Map(draft.extracts.map((row) => [row.digest, row.data]));
        setFiles(
          draft.files.map((row) => ({
            file: new File([row.bytes], row.name, { type: row.type }),
            digest: row.digest,
          })),
        );
        setReadDigests(draft.readDigests);
        setHeld(draft.held);
        setHeldSkills(draft.heldSkills);
        setSetAsides(draft.asides);
        setCursor(draft.cursor);
        setPass(draft.pass);
        setItems(draft.items);
        setTimeline(draft.timeline ?? null);
        setDeclinedPairs(draft.declinedPairs ?? []);
        setProfileExtract(draft.profileExtract);
        setExtracted(draft.extracts.find((row) => row.digest === draft.files[draft.cursor]?.digest)?.data ?? null);
        restoreModelChoice(draft.modelChoice);
        if (draft.about) {
          setFirstName(draft.about.firstName);
          setLastName(draft.about.lastName);
          if (draft.about.headline !== undefined) setHeadline(draft.about.headline);
          setPlace(draft.about.place);
        }
        setStep(draft.step);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setDraftReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const receipt = readFinishReceipt();
    if (!receipt?.awaitingComplete) return;
    let cancel = false;
    void (async () => {
      const decision = await recoverPendingFinish(receipt, async () => {
        const draft = await loadOnboardingDraft();
        if (!draft) return null;
        return {
          history: historyFromHeld(draft.held, draft.heldSkills),
          fileDigests: draft.files.map((row) => row.digest),
          asideIds: draft.asides.map((aside) => aside.id),
        };
      });
      if (cancel) return;
      if (decision.action === "retry") {
        setRecoveryError(decision.error);
        return;
      }
      setRecoveryError(null);
      if (decision.action !== "complete") return;
      const completed = await requestOnboardingComplete();
      if (cancel) return;
      if (!completed.ok) {
        setError(completed.error);
        return;
      }
      await concludeFinish(receipt, completed.me);
    })();
    return () => {
      cancel = true;
    };
  }, [draftReady, recoveryAttempt]);

  useEffect(() => {
    // Jobs typed on Verify without a model are kept too, with or without a resume.
    // Once a draft exists, an emptied one is saved as well, so a removed last resume stays removed.
    const empty = files.length === 0 && held.length === 0 && !timeline?.length;
    if (!draftReady || (empty && !draftSavedRef.current)) return;
    draftSavedRef.current = true;
    let cancel = false;
    void (async () => {
      const stored = await Promise.all(
        files.map(async (row) => ({
          digest: row.digest,
          name: row.file.name,
          type: row.file.type,
          bytes: await row.file.arrayBuffer(),
        })),
      );
      if (cancel) return;
      try {
      await saveOnboardingDraft({
        files: stored,
        extracts: [...extractsRef.current.entries()].map(([digest, data]) => ({ digest, data })),
        readDigests,
        held,
        heldSkills,
        asides: setAsides,
        cursor,
        pass,
        step: step === "check" || step === "file" ? step : "file",
        items,
        timeline,
        declinedPairs,
        profileExtract,
        modelChoice: modelChoiceForDraft(),
        about: { firstName, lastName, headline, place },
      });
      } catch {
        /* the questions still continue in this page */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [draftReady, files, readDigests, held, heldSkills, setAsides, cursor, pass, step, items, timeline, declinedPairs, profileExtract, wantsModel, hosting, selected, baseUrl, endpointMode, localUrl, firstName, lastName, headline, place]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const modelRes = await fetch("/api/models");
        if (cancel || !modelRes.ok) return;
        const saved =
          ((await modelRes.json()) as { connections?: Array<{ model: string }> }).connections?.at(-1)?.model ??
          "";
        setSavedModel(saved);
      } catch {
        /* a saved model is optional */
      }
    })();
    return () => {
      cancel = true;
      abortRef.current?.abort();
      scanAbort.current?.abort();
    };
  }, []);

  async function scanRange(from: string, to: string) {
    const prepared = preparePortRange(from, to);
    if (!prepared.ok) {
      setScanError(
        prepared.error === "range-backwards"
          ? "The first port comes before the second."
          : "Use a port from 1 to 65535.",
      );
      return;
    }
    setScanError(null);
    scanAbort.current?.abort();
    const abort = new AbortController();
    scanAbort.current = abort;
    setLocalProbe("scanning");
    setScanned([]);
    setSelected("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    try {
      const res = await fetch(`/api/models/probe?from=${prepared.from}&to=${prepared.to}`, {
        signal: abort.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { hits?: LocalScanHit[]; error?: string };
      if (abort.signal.aborted) return;
      if (!res.ok) {
        setScanError(body.error ?? "Could not scan those ports.");
        setLocalProbe("ready");
        return;
      }
      setScanned(presentRangeHits(body.hits ?? []));
      setLocalProbe("ready");
    } catch {
      if (abort.signal.aborted) return;
      setScanError("Could not scan those ports.");
      setLocalProbe("ready");
    }
  }

  // Once a cloud key is entered, ask the provider which models it offers.
  useEffect(() => {
    const address = baseUrl.trim();
    if (step !== "model" || hosting !== "cloud" || !isHttpUrl(address) || !cloudKey.trim()) {
      setCloudModels(null);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      setCloudModels({ state: "loading" });
      try {
        const res = await fetch("/api/models/discover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUrl: address, apiKey: cloudKey.trim() }),
          signal: abort.signal,
        });
        const body = (await res.json().catch(() => ({}))) as { models?: string[]; error?: string };
        if (abort.signal.aborted) return;
        if (res.ok && body.models && body.models.length > 0) {
          setCloudModels({ state: "listed", models: body.models });
        } else {
          setCloudModels({ state: "failed", error: body.error ?? "The provider didn't list its models." });
        }
      } catch {
        if (!abort.signal.aborted) setCloudModels({ state: "failed", error: "Could not reach the provider." });
      }
    }, 600);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [step, hosting, baseUrl, cloudKey]);

  // Onboarding opens with the cursor in the first name, ready to type.
  useEffect(() => {
    if (step !== "name") return;
    document.querySelector<HTMLInputElement>('.onboarding-sheet input[autocomplete="given-name"]')?.focus();
  }, [step]);

  useEffect(() => {
    if (step === "model" && localProbe === "idle") {
      void scanRange(String(LOCAL_SCAN_PORT_MIN), String(LOCAL_SCAN_PORT_MAX));
    }
  }, [step, localProbe]);

  const steps = onboardingSteps();
  const afterModel = nextOnboardingStep(steps, "model");

  const foundModels = scanned.flatMap((hit) => hit.models.map((id) => ({ address: hit.baseUrl, id })));
  const foundKey = foundPick || (foundModels[0] ? `${foundModels[0].address} ${foundModels[0].id}` : "");
  const usingFound =
    wantsModel === true && hosting === "local" && endpointMode === "scanned" && `${baseUrl} ${selected}` === foundKey;

  // Choosing Local with a model found picks it; there's no separate "use" click.
  useEffect(() => {
    if (step !== "model" || hosting !== "local" || localProbe !== "ready" || advancedOpen) return;
    if (endpointMode !== null) return;
    const hit = foundModels.find((model) => `${model.address} ${model.id}` === foundKey);
    if (hit) chooseLocal(hit.address, hit.id);
  }, [step, hosting, localProbe, advancedOpen, endpointMode, foundKey]);

  function pickHosting(next: "local" | "cloud") {
    if (hosting === next) return;
    setWantsModel(true);
    setHosting(next);
    setSelected("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    setAdvancedOpen(false);
    setError(null);
    setCloudModels(null);
    if (next === "local") setCloudKey("");
    if (next === "cloud") {
      setCloudProvider("openai");
      setBaseUrl(OPENAI_BASE_URL);
    }
  }

  // Clicking the chosen option again closes its details and clears the choice.
  function toggleHosting(next: "local" | "cloud") {
    if (hosting !== next) {
      pickHosting(next);
      return;
    }
    modelCheckKeyRef.current = "";
    setModelCheck(null);
    setAdvancedOpen(false);
    setCloudModels(null);
    clearModel();
  }

  function pickCloudProvider(next: CloudProviderId) {
    setCloudProvider(next);
    setBaseUrl(CLOUD_PROVIDERS.find((provider) => provider.id === next)?.baseUrl ?? "");
    setSelected("");
    setCloudModels(null);
    setError(null);
  }

  function chooseLocal(address: string, id: string) {
    setWantsModel(true);
    setHosting("local");
    setEndpointMode("scanned");
    setSelected(id);
    setLocalUrl("");
    setCloudKey("");
    setBaseUrl(address);
    setError(null);
  }

  function clearModel() {
    setWantsModel(null);
    setHosting(null);
    setSelected("");
    setCloudKey("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    setError(null);
  }

  const modelReady =
    wantsModel === false ||
    (wantsModel === true &&
      hosting === "local" &&
      ((endpointMode === "scanned" && Boolean(selected) && isHttpUrl(baseUrl)) ||
        (endpointMode === "custom" && isHttpUrl(localUrl.trim()) && Boolean(selected.trim())))) ||
    (wantsModel === true &&
      hosting === "cloud" &&
      isHttpUrl(baseUrl.trim()) &&
      Boolean(selected.trim()) &&
      Boolean(cloudKey.trim()));

  // Test a chosen local model right away, so Continue doesn't wait on it.
  const localModelKey =
    step === "model" && hosting === "local" && endpointMode === "scanned" && modelReady ? modelCheckKey() : "";
  const localCheck = localModelKey && modelCheck?.key === localModelKey ? modelCheck.state : null;

  // Why Continue is off, said under the choices instead of leaving a grey button.
  function modelContinueHint(): string | null {
    if (modelCheck?.state === "checking") return null;
    // Before a choice, the subtext under the heading says what to do.
    if (wantsModel !== true || hosting === null) return null;
    if (modelReady) return null;
    if (hosting === "local") {
      // The Local card already says it is looking.
      if (localProbe !== "ready") return null;
      return endpointMode === "custom" ? "Enter the address and model name to continue." : "Choose a model, or use Advanced.";
    }
    if (!isHttpUrl(baseUrl.trim())) return "Enter the provider's address to continue.";
    if (!cloudKey.trim()) return "Add your key to continue.";
    return "Choose a model to continue.";
  }
  // A test still answering belongs to the choice it was sent for. Leaving Model, or
  // changing the choice, drops it so its answer can't move the steps along.
  useEffect(() => {
    const live = step === "model" ? modelCheckKey() : "";
    if (!modelCheckKeyRef.current || modelCheckKeyRef.current === live) return;
    modelCheckKeyRef.current = "";
    setModelCheck((current) => (current?.state === "checking" ? null : current));
  }, [step, baseUrl, selected, hosting, cloudKey]);

  useEffect(() => {
    if (!localModelKey || modelCheck?.key === localModelKey) return;
    setError(null);
    void testModel(false);
  }, [localModelKey]);

  function pickPhoto(next: File | null) {
    if (!next) {
      setPhoto(null);
      setPhotoPreview(null);
      setPhotoRemoved(Boolean(initialProfile.avatarUrl));
      return;
    }
    if (!isAvatarType(next.type)) {
      setError("Use a jpeg, png, webp, or gif photo.");
      return;
    }
    if (next.size > PROFILE_AVATAR_MAX_BYTES) {
      setError("That photo is too large (5 MB max).");
      return;
    }
    setError(null);
    setPhotoRemoved(false);
    setPhoto(next);
  }

  function addResumes(picked: File[]) {
    if (extracting || picked.length === 0) return;
    const batch = picked;
    const run = addChain.current.then(() => appendResumes(batch));
    addChain.current = run.then(
      () => undefined,
      () => undefined,
    );
  }

  async function appendResumes(batch: File[]) {
    if (extracting || batch.length === 0) return;
    const incoming = await Promise.all(batch.map(async (file) => ({ file, digest: await digestFile(file) })));
    const queued = resumesToQueue(
      filesRef.current.map((row) => row.digest),
      incoming.map((row) => row.digest),
    );
    const added = queued.indexes.flatMap((index) => {
      const row = incoming[index];
      return row ? [row] : [];
    });
    if (added.length > 0) {
      const next = [...filesRef.current, ...added];
      filesRef.current = next;
      setFiles(next);
    }
    setError(
      queued.skipped === 0 ? null : queued.skipped === 1 ? "That resume is already in the list." : "Those resumes are already in the list.",
    );
  }

  function removeResume(index: number) {
    if (extracting) return;
    if (held.length > 0 && index < cursor) return;
    setError(null);
    const digest = files[index]?.digest;
    const nextFiles = files.filter((_, row) => row !== index);
    if (digest) {
      extractsRef.current.delete(digest);
      setReadDigests((current) => current.filter((row) => row !== digest));
    }
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    const nextFirst = nextFiles[0];
    setProfileExtract(nextFirst ? (extractsRef.current.get(nextFirst.digest)?.profile ?? null) : null);
    setTimeline((current) =>
      current
        ?.filter((row) => row.fileIndex !== index)
        .map((row) => {
          if (row.fileIndex < index) return row;
          const fileIndex = row.fileIndex - 1;
          return { ...row, fileIndex, id: row.id.replace(/^file-\d+/, `file-${fileIndex}`) };
        }) ?? null,
    );
    setDeclinedPairs((current) =>
      current.flatMap((id) => {
        const match = /^file-(\d+)-/.exec(id);
        if (!match) return [id];
        const fileIndex = Number(match[1]);
        if (fileIndex === index) return [];
        return [fileIndex > index ? id.replace(/^file-\d+/, `file-${fileIndex - 1}`) : id];
      }),
    );
    if (previewIndex === index) {
      setPreviewOpen(false);
      setPreviewIndex(null);
    } else if (previewIndex != null && previewIndex > index) {
      setPreviewIndex(previewIndex - 1);
    }
  }

  function leaveCheck() {
    abortRef.current?.abort();
    setExtracting(false);
    setStep("file");
  }

  // Without a model nothing is read; Verify is where jobs and schools are typed in.
  function continueWithoutRead() {
    setError(null);
    setPass("verify");
    setStep("check");
  }

  function modelCheckKey() {
    return `${baseUrl} ${selected} ${hosting === "cloud" ? cloudKey : ""}`;
  }

  async function testModel(advance: boolean) {
    const key = modelCheckKey();
    modelCheckKeyRef.current = key;
    setModelCheck({ key, state: "checking" });
    const stale = () => modelCheckKeyRef.current !== key;
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          model: selected,
          apiKey: hosting === "cloud" ? cloudKey : "",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (stale()) return;
      if (res.ok) {
        setModelCheck({ key, state: "ok" });
        if (advance) setStep(afterModel);
        return;
      }
      setModelCheck({ key, state: "failed" });
      setError(body.error ?? "The model didn't answer. Try again, choose another model, or skip.");
    } catch {
      if (stale()) return;
      setModelCheck({ key, state: "failed" });
      setError("Could not reach Docier to test the model. Try again.");
    }
  }

  async function continueFromModel() {
    setError(null);
    if (wantsModel !== true) {
      setStep(afterModel);
      return;
    }
    const key = modelCheckKey();
    if (modelCheck?.key === key && modelCheck.state === "ok") {
      setStep(afterModel);
      return;
    }
    if (modelCheck?.key === key && modelCheck.state === "checking") return;
    await testModel(true);
  }

  function skipModel() {
    modelCheckKeyRef.current = "";
    setModelCheck(null);
    clearModel();
    setWantsModel(false);
    setStep(afterModel);
  }

  function stopReading() {
    abortRef.current?.abort();
    abortRef.current = null;
    setExtracting(false);
    setError("Stopped. The resume is still here; read it again, or continue without a model.");
    setReadFailed(true);
  }

  function continueWithoutModel() {
    clearModel();
    setWantsModel(false);
    setReadFailed(false);
    continueWithoutRead();
  }

  async function readAll() {
    if (extracting || wantsModel !== true || !selected || files.length === 0) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setExtracting(true);
    setError(null);
    setReadFailed(false);
    try {
      if (hosting === "cloud" || endpointMode === "custom" || selected !== savedModel) {
        const saved = await fetch("/api/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            hosting === "cloud"
              ? { hosting: "cloud", baseUrl: baseUrl.trim(), model: selected, apiKey: cloudKey }
              : { hosting: "local", baseUrl, model: selected, apiKey: "" },
          ),
          signal: abort.signal,
        });
        if (!saved.ok) {
          const body = (await saved.json()) as { error?: string };
          setError(body.error ?? "Could not use that model.");
          return;
        }
        setSavedModel(selected);
      }
      for (let index = 0; index < files.length; index += 1) {
        const row = files[index];
        if (extractsRef.current.has(row.digest)) continue;
        setCursor(index);
        const form = new FormData();
        form.append("file", row.file);
        const res = await fetch("/api/resumes/extract", { method: "POST", body: form, signal: abort.signal });
        const body = (await res.json()) as { error?: string; data?: ExtractedResume };
        if (abort.signal.aborted) return;
        if (!res.ok || !body.data) {
          setError(body.error ?? `Could not read ${row.file.name}.`);
          setReadFailed(true);
          return;
        }
        if (onboardingCheckItems(body.data).length === 0) {
          setError(`The model did not find roles or schools in ${row.file.name}.`);
          return;
        }
        extractsRef.current.set(row.digest, body.data);
        setReadDigests((current) => (current.includes(row.digest) ? current : [...current, row.digest]));
      }
      if (abort.signal.aborted) return;
      startQuestions();
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not read the resume.");
      setReadFailed(true);
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setExtracting(false);
      }
    }
  }

  function openAt(index: number) {
    const row = files[index];
    const data = row ? extractsRef.current.get(row.digest) : undefined;
    if (!row || !data) return;
    if (index === 0) setProfileExtract(data.profile);
    setExtracted(data);
    setItems(onboardingCheckItems(data));
    setCursor(index);
    setPass(index === 0 ? "verify" : "compare");
    setStep("check");
  }

  function openReadFiles() {
    setError(null);
    if (held.length === 0 && timeline && timeline.length > 0) {
      const first = files[0] ? extractsRef.current.get(files[0].digest) : undefined;
      if (first) setProfileExtract(first.profile);
      setPass("verify");
      setStep("check");
      return;
    }
    startQuestions();
  }

  function startQuestions() {
    if (held.length > 0) {
      const index = cursor > 0 ? Math.min(cursor, files.length - 1) : 1;
      if (index >= files.length) {
        void finishSession(held, heldSkills, true);
        return;
      }
      openAt(index);
      return;
    }
    const first = files[0] ? extractsRef.current.get(files[0].digest) : undefined;
    if (first) setProfileExtract(first.profile);
    // Read rows are built again from the resumes; jobs and schools typed by hand stay.
    setTimeline((current) => {
      const typed = current?.filter((row) => row.fileIndex === NO_RESUME_FILE) ?? [];
      return typed.length > 0 ? typed : null;
    });
    setDeclinedPairs([]);
    setItems([]);
    setPass("verify");
    setStep("check");
  }

  function acceptTimeline(nextHeld: HeldRole[], skills: HeldSkill[]) {
    setHeld(nextHeld);
    setHeldSkills(skills);
    void finishSession(nextHeld, skills, nextHeld.length > 0);
  }

  function acceptCompared(nextHeld: HeldRole[], acceptSkills: boolean) {
    const skills = rememberSkills(heldSkills, extracted?.skills ?? [], cursor, acceptSkills);
    advance(nextHeld, skills);
  }

  function advance(nextHeld: HeldRole[], skills: HeldSkill[]) {
    for (let index = cursor + 1; index < files.length; index += 1) {
      if (!extractsRef.current.has(files[index].digest)) continue;
      setHeld(nextHeld);
      setHeldSkills(skills);
      openAt(index);
      return;
    }
    setHeld(nextHeld);
    setHeldSkills(skills);
    setPass("review");
    setStep("check");
  }

  function removeHeld(id: string) {
    const role = held.find((row) => row.id === id);
    if (!role) return;
    setHeld((current) => current.filter((row) => row.id !== id));
    setSetAsides((current) => rememberSetAside(current, role.item));
  }

  async function requestOnboardingComplete(): Promise<{ ok: true; me: Me } | { ok: false; error: string }> {
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const body = (await res.json()) as Me & { error?: string };
      if (!res.ok) return { ok: false, error: body.error ?? "Could not finish onboarding." };
      return { ok: true, me: body };
    } catch {
      return { ok: false, error: "Could not finish onboarding." };
    }
  }

  async function concludeFinish(_receipt: OnboardingFinishReceipt, me: Me) {
    if (concluded.current) return;
    concluded.current = true;
    clearFinishReceipt();
    await releaseFinishDraft(() => clearOnboardingDraft());
    // Everything was checked on Verify; go straight into the app.
    onFinished(me, { page: "home" });
  }

  async function finishSession(roles: HeldRole[], skills: HeldSkill[], includeHistory: boolean) {
    if (finishing.current) return;
    const manual = wantsModel !== true;
    finishing.current = true;
    setBusy(true);
    setError(null);
    try {
      const draft = profileAfterOnboarding({
        current: profileRef.current,
        extracted: profileExtract,
        firstName,
        lastName,
        headline,
        place,
        links,
      });
      const prepared = prepareProfile(draft);
      if (!prepared.ok) {
        setError(
          prepared.error === "url-invalid"
            ? "Use an http(s) URL for LinkedIn, GitHub, or a site."
            : "A name is required.",
        );
        // The name is asked on Profile; show the step where it can be added.
        if (prepared.error !== "url-invalid") setStep("name");
        return;
      }
      profileRef.current = prepared.value;
      const savedProfile = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      const profileBody = (await savedProfile.json()) as { error?: string };
      if (!savedProfile.ok) {
        setError(profileBody.error ?? "Could not save your profile.");
        return;
      }
      if (!photo && photoRemoved) {
        const removed = await fetch("/api/profile/avatar", { method: "DELETE" });
        if (!removed.ok) {
          setError("Could not remove the photo.");
          return;
        }
      }
      if (photo) {
        const avatar = new FormData();
        avatar.append("avatar", photo);
        const uploadedPhoto = await fetch("/api/profile/avatar", { method: "POST", body: avatar });
        const photoBody = (await uploadedPhoto.json()) as { error?: string };
        if (!uploadedPhoto.ok) {
          setError(photoBody.error ?? "Could not save the photo.");
          return;
        }
      }
      const resumeIds: string[] = [];
      for (const row of files) {
        const form = new FormData();
        form.append("file", row.file);
        const uploaded = await fetch("/api/resumes", { method: "POST", body: form });
        if (!uploaded.ok) {
          setError("Could not store the resume.");
          return;
        }
        const stored = (await uploaded.json()) as { resume?: { id?: string } };
        if (!stored.resume?.id) {
          setError("Could not store the resume.");
          return;
        }
        resumeIds.push(stored.resume.id);
      }
      const asideResponse = await fetch("/api/resume-asides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asides: setAsides.map((aside) => ({
            kind: aside.item.source,
            title: aside.item.title,
            organization: aside.item.org,
            startDate: aside.item.startDate,
            endDate: aside.item.endDate,
          })),
        }),
      });
      if (!asideResponse.ok) {
        setError("Could not save the roles you set aside.");
        return;
      }
      const history = historyFromHeld(roles, skills);
      const signature = finishSignature(history);
      const reused = includeHistory ? reuseSavedHistory(readFinishReceipt(), signature) : null;
      let keptHistory: { jobs: number; schools: number; skills: number } | null = null;
      if (includeHistory) {
        if (history.experience.length > 0 || history.education.length > 0) {
          if (reused) {
            keptHistory = { jobs: reused.jobs, schools: reused.schools, skills: reused.skills };
          } else {
            const saved = await fetch("/api/history", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                experience: history.experience,
                education: history.education,
                skills: history.skills,
                // Typed by hand, a job or school was not read from a resume.
                resumeId: manual ? undefined : resumeIds[0],
                roleIds: history.experienceRoleIds,
                educationRoleIds: history.educationRoleIds,
                evidence: manual ? null : {
                  // A job or school typed by hand lists no resume, so none is attached to it.
                  experience: history.experienceEvidence.map((source) => ({
                    resumeIds: source.files.flatMap((index) => resumeIds[index] ?? []),
                    achievements: source.achievements.map((index) => resumeIds[index] ?? ""),
                  })),
                  education: history.educationEvidence.map((source) => ({
                    resumeIds: source.files.flatMap((index) => resumeIds[index] ?? []),
                  })),
                  skills: history.skillFiles.map((index) => (index >= 0 ? (resumeIds[index] ?? "") : "")),
                },
              }),
            });
            if (!saved.ok) {
              setError("Could not save jobs and schools.");
              return;
            }
            keptHistory = (await saved.json()) as { jobs: number; schools: number; skills: number };
          }
        }
      }
      const receipt: OnboardingFinishReceipt = {
        signature,
        historySaved: keptHistory != null,
        awaitingComplete: true,
        jobs: keptHistory?.jobs ?? 0,
        schools: keptHistory?.schools ?? 0,
        skills: keptHistory?.skills ?? 0,
        resumes: resumeIds.length,
        setAside: setAsides.length,
        draft: finishDraftStamp({
          fileDigests: files.map((row) => row.digest),
          asideIds: setAsides.map((aside) => aside.id),
        }),
      };
      writeFinishReceipt(receipt);
      const completed = await requestOnboardingComplete();
      if (!completed.ok) {
        setError(completed.error);
        return;
      }
      await concludeFinish(receipt, completed.me);
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }

  const filesRead = files.length > 0 && files.every((row) => readDigests.includes(row.digest));
  const notes = notesForStep();

  function notesForStep(): string[] {
    if (step === "file" && !extracting && wantsModel !== true && !filesRead) {
      return [
        "Without a model, the resume is stored but not read. You add your jobs and schools on the next step.",
        "It can be done later if now is not the right time.",
      ];
    }
    if (step === "file" && !extracting) {
      return [
        "One resume is enough. Add another if you have it. Every file is read before the questions start, and nothing is saved until the last continue.",
        "It can be done later if now is not the right time.",
      ];
    }
    if (step === "check" && wantsModel !== true) {
      return ["Nothing is saved until you continue. Jobs and schools can also be added later from Career History."];
    }
    if (step === "check") {
      const lines = [
        "We advise going through each one. A model can hallucinate, and the read can produce incorrect information or miss things.",
        "These details can be revised later as well.",
      ];
      if (pass === "compare") {
        lines.push("A role this file never mentions stays. A duty you skip stays off the role and on the file.");
      }
      return lines;
    }
    return [];
  }

  return (
    <div className="onboarding">
      <div className="onboarding-stage">
        <WashProgress step={step} steps={steps} />
        <div
          className="onboarding-sheet"
        >
        <section className="onboarding-card">
          {recoveryError ? (
            <>
              <Banner status="error" title={recoveryError} container="section" collapsible={false} role="alert" />
              <div className="onboarding-actions" data-end="true">
                <Button
                  className="onboarding-nav"
                  label="Try again"
                  variant="primary"
                  onClick={() => setRecoveryAttempt((attempt) => attempt + 1)}
                />
              </div>
            </>
          ) : null}
          {step === "name" ? (
            <ProfileStep
              firstName={firstName}
              lastName={lastName}
              headline={headline}
              photoPreview={photoPreview}
              place={place}
              error={error}
              onFirstName={setFirstName}
              onLastName={setLastName}
              onHeadline={setHeadline}
              onPhoto={pickPhoto}
              onPlace={setPlace}
              onContinue={() => {
                const checked = prepareProfile({ firstName, lastName, ...links });
                if (!checked.ok && checked.error === "url-invalid") {
                  setError("Use a full link that starts with http:// or https://.");
                  return;
                }
                setError(null);
                setStep("model");
              }}
            />
          ) : null}

          {step === "model" ? (
            <>
              <Heading level={1}>
                Should a model process <em>your resume?</em>
              </Heading>
              <Text type="body" display="block">
                A model reads your resume and lists your jobs and schools for you to check.
              </Text>
              <Text type="body" display="block">
                Choose where it runs, or skip.
              </Text>
              <div className="onboarding-choices onboarding-host" role="group" aria-label="Where the model runs">
                <button
                  type="button"
                  aria-pressed={hosting === "local"}
                  data-host="local"
                  data-selected={hosting === "local"}
                  className="onboarding-host-card"
                  onClick={() => toggleHosting("local")}
                >
                  <span className="onboarding-host-head">
                    <span className="onboarding-host-radio" aria-hidden="true" />
                    <span className="onboarding-host-icon" aria-hidden="true">
                      <Laptop size={18} strokeWidth={1.75} />
                    </span>
                    <strong>Local</strong>
                  </span>
                  <span className="onboarding-host-desc">Runs on this computer. Your resume never leaves it.</span>
                  <span
                    className="onboarding-host-status"
                    data-tone={
                      localCheck === "checking" || localProbe !== "ready"
                        ? "pending"
                        : localCheck === "failed"
                          ? "warn"
                          : localCheck === "ok" || foundModels.length > 0
                            ? "good"
                            : "quiet"
                    }
                  >
                    <span className="onboarding-host-status-dot" aria-hidden="true" />
                    {localCheck === "checking"
                      ? `Testing ${presentModelId(selected)}…`
                      : localCheck === "ok"
                        ? `Ready · ${presentModelId(selected)}`
                        : localCheck === "failed"
                          ? `${presentModelId(selected)} didn't answer`
                          : localProbe !== "ready"
                            ? "Looking on this computer…"
                            : foundModels.length === 0
                              ? "No model found yet"
                              : foundModels.length === 1
                                ? `Found ${presentModelId(foundModels[0].id)}`
                                : `Found ${foundModels.length} models`}
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={hosting === "cloud"}
                  data-host="cloud"
                  data-selected={hosting === "cloud"}
                  className="onboarding-host-card"
                  onClick={() => toggleHosting("cloud")}
                >
                  <span className="onboarding-host-head">
                    <span className="onboarding-host-radio" aria-hidden="true" />
                    <span className="onboarding-host-icon" aria-hidden="true">
                      <Cloud size={18} strokeWidth={1.75} />
                    </span>
                    <strong>Cloud</strong>
                  </span>
                  <span className="onboarding-host-desc">Runs at a provider you choose, with your own key.</span>
                  <span className="onboarding-host-status" data-tone="warn">
                    <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
                    The provider may read, keep, report, and train on what you send.
                  </span>
                </button>
              </div>
              {hosting === "local" ? (
              <section
                className="onboarding-found"
                data-state={localProbe === "scanning" || localProbe === "idle" ? "scanning" : foundModels.length > 0 ? "found" : "missing"}
                data-active={usingFound ? "true" : undefined}
              >
                <p className="onboarding-found-head">
                  <span className="onboarding-found-dot" aria-hidden="true" />
                  {localProbe !== "ready"
                    ? "Looking for a model on this computer…"
                    : foundModels.length > 0
                      ? "Found a model on this computer"
                      : "No model found on this computer"}
                </p>
                {advancedOpen ? (
                  <LocalModels
                    localProbe={localProbe}
                    scanned={scanned}
                    endpointMode={hosting === "local" ? endpointMode : null}
                    selected={selected}
                    localUrl={localUrl}
                    scanError={scanError}
                    onScan={(from, to) => {
                      setSelected("");
                      setEndpointMode(null);
                      setLocalUrl("");
                      setBaseUrl("");
                      setError(null);
                      void scanRange(from, to);
                    }}
                    onCustomUrl={(value) => {
                      setWantsModel(true);
                      setHosting("local");
                      setLocalUrl(value);
                      setEndpointMode("custom");
                      setBaseUrl(value.trim());
                    }}
                    onCustomModel={(value) => {
                      setWantsModel(true);
                      setHosting("local");
                      setSelected(value);
                      setEndpointMode("custom");
                    }}
                  />
                ) : null}
                {!advancedOpen && localProbe === "ready" && foundModels.length > 0 ? (
                  <Selector
                    label="Model"
                    width="100%"
                    value={foundKey}
                    isReadOnly={foundModels.length === 1}
                    onChange={(value) => {
                      setFoundPick(value);
                      const hit = foundModels.find((model) => `${model.address} ${model.id}` === value);
                      if (hit) chooseLocal(hit.address, hit.id);
                    }}
                    options={foundModels.map((hit) => ({
                      value: `${hit.address} ${hit.id}`,
                      label: `${presentModelId(hit.id)}${scanned.length > 1 ? ` · ${presentScanAddress(hit.address)}` : ""}`,
                    }))}
                  />
                ) : null}
                {!advancedOpen && localProbe === "ready" && foundModels.length === 0 ? (
                  <p className="onboarding-quiet">
                    Use Advanced to scan other ports or enter an address.
                  </p>
                ) : null}
                {localProbe === "ready" ? (
                  <div className="onboarding-found-actions">
                    <Button
                      label="Advanced"
                      variant="ghost"
                      aria-pressed={advancedOpen}
                      onClick={() => setAdvancedOpen((open) => !open)}
                    />
                  </div>
                ) : null}
              </section>
              ) : null}
              {hosting === "cloud" ? (
                <section className="onboarding-found onboarding-cloud">
                  <Selector
                    label="Provider"
                    width="100%"
                    value={cloudProvider}
                    onChange={(value) => pickCloudProvider(value as CloudProviderId)}
                    options={[
                      ...CLOUD_PROVIDERS.map((provider) => ({ value: provider.id, label: provider.label })),
                      { value: "custom", label: "Another provider" },
                    ]}
                  />
                  {cloudProvider === "custom" ? (
                    <TextInput
                      label="Address"
                      value={baseUrl}
                      autoComplete="off"
                      placeholder="https://…/v1"
                      width="100%"
                      onChange={(value) => {
                        setBaseUrl(value);
                        setSelected("");
                      }}
                    />
                  ) : null}
                  <TextInput
                    label="Key"
                    type="password"
                    value={cloudKey}
                    autoComplete="off"
                    width="100%"
                    onChange={setCloudKey}
                  />
                  {cloudModels?.state === "listed" ? (
                    <Selector
                      label="Model"
                      width="100%"
                      hasSearch={cloudModels.models.length > 8}
                      placeholder="Choose a model"
                      value={cloudModels.models.includes(selected) ? selected : undefined}
                      onChange={(value) => setSelected(String(value))}
                      options={cloudModels.models.map((id) => ({ value: id, label: id }))}
                    />
                  ) : (
                    <TextInput
                      label="Model"
                      value={selected}
                      autoComplete="off"
                      placeholder={cloudModels?.state === "loading" ? "Finding the provider's models…" : "model name"}
                      width="100%"
                      onChange={setSelected}
                    />
                  )}
                  {cloudModels?.state === "failed" ? (
                    <p className="onboarding-quiet">{cloudModels.error} Type the model name instead.</p>
                  ) : null}
                  {cloudDestination(baseUrl) ? (
                    <p className="onboarding-cloud-destination" role="note">
                      Your resume will be sent to <strong>{cloudDestination(baseUrl)}</strong>.
                    </p>
                  ) : null}
                </section>
              ) : null}
              {modelContinueHint() ? (
                <p className="onboarding-continue-hint" role="status">
                  {modelContinueHint()}
                </p>
              ) : null}
              <button type="button" className="onboarding-host-skip" onClick={skipModel}>
                <PencilLine size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>
                  <strong>Skip, I'll add jobs myself</strong>
                  <span>No model. Your resume is kept, and you add your jobs and schools on the Verify step.</span>
                </span>
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {modelCheck?.state === "checking" ? (
                <p className="onboarding-quiet" role="status">
                  Sending the model a short test. A large model can take a minute to load the first time.
                </p>
              ) : null}
              {error ? (
                <Banner status="error" title={error} container="section" collapsible={false} role="alert" />
              ) : null}
              <div className="onboarding-actions" data-split="true">
                <Button
                  className="onboarding-nav"
                  label="Back"
                  variant="ghost"
                  onClick={() => {
                    setError(null);
                    setStep("name");
                  }}
                />
                <div className="onboarding-action-pair">
                  <Button
                    className="onboarding-nav"
                    label={modelCheck?.state === "checking" ? "Checking the model…" : "Continue"}
                    variant="primary"
                    isDisabled={wantsModel !== true || !modelReady || modelCheck?.state === "checking"}
                    onClick={() => void continueFromModel()}
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === "file" ? (
            <>
              <div className="onboarding-file-head">
                <div className="onboarding-file-title">
                  <Heading level={1}>
                    {extracting ? (
                      <>
                        Reading <em>{files[cursor]?.file.name ?? "the resume"}.</em>
                      </>
                    ) : (
                      <>
                        Import your <em>resumes.</em>
                      </>
                    )}
                  </Heading>
                  {files.length > 0 ? (
                    <Button
                      className="onboarding-file-add"
                      label="Add resume"
                      icon={<Icon icon={Plus} />}
                      isDisabled={extracting}
                      onClick={() => fileInputRef.current?.click()}
                    />
                  ) : null}
                </div>
              </div>
              {extracting ? (
                <Text type="supporting" display="block">
                  {cursor + 1} of {files.length}. The questions start after every file is read.
                </Text>
              ) : null}
              {extracting ? <ReadProgress model={presentModelId(selected)} /> : null}
              {files.length === 0 ? (
                <label className="onboarding-file">
                  Drop resumes here, or click to choose
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={RESUME_FILE_ACCEPT}
                    onChange={(event) => {
                      const picked = event.target.files ? [...event.target.files] : [];
                      event.target.value = "";
                      addResumes(picked);
                    }}
                  />
                </label>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    accept={RESUME_FILE_ACCEPT}
                    onChange={(event) => {
                      const picked = event.target.files ? [...event.target.files] : [];
                      event.target.value = "";
                      addResumes(picked);
                    }}
                  />
                  <ul className="onboarding-file-list">
                    {files.map((row, index) => {
                      const read = readDigests.includes(row.digest);
                      const reading = extracting && index === cursor && !read;
                      return (
                        <li key={row.digest}>
                          <div
                            className="onboarding-file onboarding-file-picked"
                            data-reading={reading ? "true" : undefined}
                          >
                            <span className="onboarding-file-name" title={row.file.name}>
                              {row.file.name}
                            </span>
                            <span className="onboarding-file-actions">
                              {held.length > 0 && index < cursor ? (
                                <span className="onboarding-file-state">Checked</span>
                              ) : read ? (
                                <span className="onboarding-file-state">Read</span>
                              ) : reading ? (
                                <span className="onboarding-file-state">Reading</span>
                              ) : null}
                              {reading || (held.length > 0 && index < cursor) ? null : (
                                <button
                                  type="button"
                                  className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                                  onClick={() => removeResume(index)}
                                >
                                  Remove
                                </button>
                              )}
                              <button
                                type="button"
                                className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                                onClick={() => {
                                  setPreviewIndex(index);
                                  setPreviewOpen(true);
                                }}
                              >
                                Preview
                              </button>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
                  {previewIndex != null && files[previewIndex] ? (
                    <dialog
                      ref={previewDialogRef}
                      className="onboarding-review onboarding-file-dialog"
                      aria-labelledby="onboarding-file-preview-title"
                      onClose={() => setPreviewOpen(false)}
                    >
                      <div className="onboarding-review-head">
                        <p className="onboarding-kicker">Resume</p>
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-ghost"
                          onClick={() => setPreviewOpen(false)}
                        >
                          Close
                        </button>
                      </div>
                      <h2 id="onboarding-file-preview-title">
                        <em>{files[previewIndex].file.name}</em>
                      </h2>
                      <div className="onboarding-file-dialog-body">
                        {previewOpen ? <ResumePreview file={files[previewIndex].file} /> : null}
                      </div>
                    </dialog>
                  ) : null}
                  {error ? (
                    <Banner status="error" title={error} container="section" collapsible={false} role="alert" />
                  ) : null}
                  {readFailed && !extracting && wantsModel === true ? (
                    <div className="onboarding-read-failed" role="group" aria-label="What to do next">
                      <Button
                        label="Choose another model"
                        variant="ghost"
                        onClick={() => {
                          setError(null);
                          setReadFailed(false);
                          setModelCheck(null);
                          setStep("model");
                        }}
                      />
                      <Button
                        label={busy ? "Saving…" : "Continue without a model"}
                        variant="ghost"
                        isDisabled={busy}
                        onClick={continueWithoutModel}
                      />
                    </div>
                  ) : null}
                  <div className="onboarding-actions" data-split="true">
                    <Button
                      className="onboarding-nav"
                      label="Back"
                      variant="ghost"
                      isDisabled={held.length > 0 || extracting}
                      onClick={() => setStep(previousOnboardingStep(steps, "file"))}
                    />
                    <div className="onboarding-action-pair">
                      {extracting ? (
                        <Button className="onboarding-nav" label="Stop" variant="ghost" onClick={stopReading} />
                      ) : null}
                      {(wantsModel === true || (wantsModel !== false && filesRead)) && files.length > 0 ? (
                        <Button
                          className="onboarding-nav"
                          label={
                            !filesRead && readFailed
                              ? "Try again"
                              : !filesRead
                              ? files.length > 1
                                ? "Read the resumes"
                                : "Extract job data"
                              : held.length > 0
                                ? "Continue"
                                : "Check what we read"
                          }
                          variant="primary"
                          isDisabled={extracting || (!filesRead && (!selected || (hosting === "cloud" && !cloudKey.trim())))}
                          onClick={() => {
                            if (filesRead) openReadFiles();
                            else void readAll();
                          }}
                        />
                      ) : (
                        <Button
                          className="onboarding-nav"
                          label={busy ? "Saving…" : "Continue"}
                          variant="primary"
                          isDisabled={busy}
                          onClick={() => {
                            if (files.length > 0 && cursor >= files.length) {
                              void finishSession(held, heldSkills, true);
                              return;
                            }
                            continueWithoutRead();
                          }}
                        />
                      )}
                    </div>
                  </div>
            </>
          ) : null}

          {step === "check" && pass === "verify" ? (
            <AllResumesVerify
              manual={wantsModel !== true}
              submitted={
                // What Finish will save, including what a resume filled in where a field was left blank.
                <SubmittedSummary
                  firstName={firstName}
                  lastName={lastName}
                  headline={headline}
                  place={place}
                  saved={profileAfterOnboarding({
                    current: profileRef.current,
                    extracted: profileExtract,
                    firstName,
                    lastName,
                    headline,
                    place,
                    links,
                  })}
                  photo={photoPreview}
                  resumes={files.map((row) => row.file.name)}
                  busy={busy}
                  onFirstName={setFirstName}
                  onLastName={setLastName}
                  onHeadline={setHeadline}
                  onPlace={setPlace}
                  // Read resumes stay; without a model they can still be changed here.
                  onRemoveResume={wantsModel !== true ? removeResume : undefined}
                  onAddResumes={wantsModel !== true ? addResumes : undefined}
                />
              }
              bundles={wantsModel !== true ? [] : resumeBundles(files, extractsRef.current)}
              initialRows={timeline}
              initialDeclined={declinedPairs}
              editedItems={timeline ? [] : items}
              editedFileIndex={cursor}
              asides={setAsides}
              busy={busy}
              error={error}
              editSkills
              onBack={leaveCheck}
              onSetAside={(item) => setSetAsides((current) => rememberSetAside(current, item))}
              onForgetAside={(id) => setSetAsides((current) => dropSetAside(current, id))}
              onRows={(rows, declined) => {
                setTimeline(rows);
                setDeclinedPairs(declined);
              }}
              onDone={acceptTimeline}
            />
          ) : null}
          {step === "check" && pass === "compare" ? (
            <ResumeCompare
              key={files[cursor]?.digest ?? cursor}
              items={items}
              file={files[cursor]?.file ?? null}
              fileName={files[cursor]?.file.name ?? "Resume"}
              fileIndex={cursor}
              held={held}
              asides={setAsides}
              busy={busy}
              error={error}
              onBack={leaveCheck}
              onSetAside={(item) => setSetAsides((current) => rememberSetAside(current, item))}
              onForgetAside={(id) => setSetAsides((current) => dropSetAside(current, id))}
              onDone={acceptCompared}
            />
          ) : null}
          {step === "check" && pass === "review" ? (
            <ResumeReview
              held={held}
              fileNames={files.map((row) => row.file.name)}
              asides={setAsides}
              busy={busy}
              error={error}
              onRemove={removeHeld}
              onBack={() => setStep("file")}
              onContinue={() => void finishSession(held, heldSkills, true)}
            />
          ) : null}
        </section>
        {notes.length > 0 ? (
          <div className="onboarding-footnote">
            {notes.map((line) => (
              <Text key={line} type="supporting" display="block">{line}</Text>
            ))}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function resumeBundles(queued: QueuedResume[], extracts: Map<string, ExtractedResume>): ResumeBundle[] {
  return queued.flatMap((row, fileIndex) => {
    const data = extracts.get(row.digest);
    if (!data) return [];
    return [
      {
        file: row.file,
        fileIndex,
        name: row.file.name,
        skills: data.skills ?? [],
        items: onboardingCheckItems(data),
      },
    ];
  });
}

function WashProgress({ step, steps }: { step: OnboardingStep; steps: OnboardingStep[] }) {
  return (
    <div className="onboarding-stepper">
      <Stepper
        activeStep={Math.max(0, steps.indexOf(step))}
        orientation="horizontal"
        density="balanced"
        indicatorPosition="on-track"
        label="Onboarding progress"
        horizontalOptions={{ minimumStepWidth: 112, collapsedVariant: "withLabel" }}
      >
        {steps.map((id, index) => (
          <Step key={id} step={index} label={STEP_LABEL[id]} />
        ))}
      </Stepper>
    </div>
  );
}

function LocalModels({
  localProbe,
  scanned,
  endpointMode,
  selected,
  localUrl,
  scanError,
  onScan,
  onCustomUrl,
  onCustomModel,
}: {
  localProbe: "idle" | "scanning" | "ready";
  scanned: LocalScanHit[];
  endpointMode: "scanned" | "custom" | null;
  selected: string;
  localUrl: string;
  scanError: string | null;
  onScan: (from: string, to: string) => void;
  onCustomUrl: (value: string) => void;
  onCustomModel: (value: string) => void;
}) {
  const [portFrom, setPortFrom] = useState(String(LOCAL_SCAN_PORT_MIN));
  const [portTo, setPortTo] = useState(String(LOCAL_SCAN_PORT_MAX));
  const customUrl = localUrl.trim();
  return (
    <div className="onboarding-detect-body">
      <p className="onboarding-quiet">Scan checks ports on this machine.</p>
      <div className="onboarding-scan-row">
        <TextInput
          label="From"
          inputMode="numeric"
          value={portFrom}
          autoComplete="off"
          width="100%"
          onChange={setPortFrom}
        />
        <TextInput
          label="To"
          inputMode="numeric"
          value={portTo}
          autoComplete="off"
          width="100%"
          onChange={setPortTo}
        />
        <Button
          label={localProbe === "scanning" ? "Scanning…" : "Scan"}
          variant="primary"
          isDisabled={localProbe === "scanning"}
          onClick={() => onScan(portFrom, portTo)}
        />
      </div>
      {scanError ? (
        <Banner status="error" title={scanError} container="section" collapsible={false} role="alert" />
      ) : null}
      {localProbe === "ready" && scanned.length === 0 ? (
        <p className="onboarding-quiet">No models listed.</p>
      ) : null}
      <TextInput
        label="Address"
        value={localUrl}
        autoComplete="off"
        placeholder="http://127.0.0.1:8080/v1"
        width="100%"
        onChange={onCustomUrl}
      />
      <label className="onboarding-field">
        <span>Model</span>
        <input
          value={endpointMode === "custom" ? selected : ""}
          autoComplete="off"
          placeholder="model name"
          onChange={(event) => onCustomModel(event.target.value)}
        />
      </label>
      {customUrl && !isHttpUrl(customUrl) ? <p className="onboarding-quiet">Use an http(s) URL.</p> : null}
    </div>
  );
}

const READ_PHASES = [
  "Sending the resume",
  "The model is reading it",
  "Looking for roles",
  "Looking for schools",
];

function ReadProgress({ model }: { model: string }) {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      setPhase(Math.min(READ_PHASES.length - 1, Math.floor(seconds / 5)));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
  const label = phase === 1 && model ? `${model} is reading it` : READ_PHASES[phase];
  const width = Math.min(88, 14 + phase * 16);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="onboarding-read" role="status" aria-live="polite">
      <p className="onboarding-lead">{label}</p>
      <div className="onboarding-read-track" aria-hidden="true">
        <div className="onboarding-read-bar" style={{ ["--read" as string]: width / 100 }} />
      </div>
      <p className="onboarding-quiet">{clock} — still working. A resume can take a minute.</p>
    </div>
  );
}

/**
 * On Verify without a model: the profile and resumes entered so far, each in a
 * section that opens to show everything, with Edit inside. Both start open.
 */
function SubmittedSummary({
  firstName,
  lastName,
  headline,
  place,
  saved,
  photo,
  resumes,
  busy = false,
  onFirstName,
  onLastName,
  onHeadline,
  onPlace,
  onRemoveResume,
  onAddResumes,
}: {
  firstName: string;
  lastName: string;
  headline: string;
  place: OnboardingPlaceAnswer;
  /** The profile Finish will save: what was typed, and what a resume filled in where a field was blank. */
  saved: ProfileFields;
  photo: string | null;
  resumes: string[];
  /** Finish is saving: nothing here can change until it is done. */
  busy?: boolean;
  onFirstName: (value: string) => void;
  onLastName: (value: string) => void;
  onHeadline: (value: string) => void;
  onPlace: (place: OnboardingPlaceAnswer) => void;
  /** Left out once resumes are read; they are shown but not changed here. */
  onRemoveResume?: (index: number) => void;
  onAddResumes?: (files: File[]) => void;
}) {
  const [open, setOpen] = useState({ profile: true, resumes: true });
  const [editing, setEditing] = useState<"profile" | "resumes" | null>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const name = joinPersonName(firstName, lastName);
  const where = [saved.city.trim(), saved.state.trim()].filter(Boolean).join(", ");
  const detail = [saved.headline.trim(), where].filter(Boolean).join(" · ");
  const facts = [
    { label: "First name", value: firstName.trim() },
    { label: "Last name", value: lastName.trim() },
    { label: "City", value: saved.city.trim() },
    { label: "State", value: saved.state.trim() },
    { label: "Professional headline", value: saved.headline.trim() },
  ].filter((fact) => fact.value);
  const canEditResumes = Boolean(onRemoveResume && onAddResumes);
  // Editing starts from what is shown, so a value a resume filled in can be changed or cleared.
  function startProfileEdit() {
    if (!headline.trim() && saved.headline) onHeadline(saved.headline);
    if ((!place.city.trim() && saved.city) || (!place.state.trim() && saved.state)) {
      onPlace({ ...place, city: place.city.trim() || saved.city, state: place.state.trim() || saved.state });
    }
    setEditing("profile");
  }
  const toggle = (key: "profile" | "resumes") => {
    if (editing === key) return;
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <fieldset className="onboarding-submitted" disabled={busy}>
      <section className="onboarding-submitted-section" aria-label="Profile">
        <div className="onboarding-submitted-head">
          <button
            type="button"
            className="onboarding-submitted-row"
            aria-expanded={open.profile}
            aria-controls="onboarding-submitted-profile"
            onClick={() => toggle("profile")}
          >
            <Avatar src={photo ?? undefined} name={name} alt="" size="md" />
            <span className="onboarding-submitted-body">
              <strong>{name || "No name"}</strong>
              {detail && !open.profile ? <span>{detail}</span> : null}
            </span>
          </button>
          {open.profile ? (
            <Button
              label={editing === "profile" ? "Done" : "Edit"}
              variant="ghost"
              size="sm"
              isDisabled={editing === "profile" && !name}
              onClick={() => (editing === "profile" ? setEditing(null) : startProfileEdit())}
            />
          ) : null}
          <button
            type="button"
            className="onboarding-submitted-toggle"
            aria-label={open.profile ? "Hide profile" : "Show profile"}
            aria-expanded={open.profile}
            aria-controls="onboarding-submitted-profile"
            disabled={editing === "profile"}
            onClick={() => toggle("profile")}
          >
            <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {open.profile ? (
          <div id="onboarding-submitted-profile" className="onboarding-submitted-detail">
            {editing === "profile" ? (
              <div className="onboarding-submitted-edit">
                <div className="onboarding-field-row">
                  <TextInput label="First name" value={firstName} autoComplete="given-name" width="100%" onChange={onFirstName} />
                  <TextInput label="Last name" value={lastName} autoComplete="family-name" width="100%" onChange={onLastName} />
                </div>
                <div className="onboarding-field-row">
                  <TextInput
                    label="City"
                    value={place.city}
                    autoComplete="address-level2"
                    width="100%"
                    onChange={(city) => onPlace({ ...place, city })}
                  />
                  <TextInput
                    label="State"
                    value={place.state}
                    autoComplete="address-level1"
                    width="100%"
                    onChange={(state) => onPlace({ ...place, state })}
                  />
                </div>
                <TextInput
                  label="Professional headline"
                  value={headline}
                  autoComplete="organization-title"
                  placeholder="e.g. Senior Software Engineer"
                  width="100%"
                  onChange={onHeadline}
                />
                {name ? null : <p className="onboarding-why">Add your name to continue.</p>}
              </div>
            ) : (
              <dl className="onboarding-submitted-facts">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : null}
      </section>
      {resumes.length > 0 ? (
        <section className="onboarding-submitted-section" aria-label="Resumes">
          <div className="onboarding-submitted-head">
            <button
              type="button"
              className="onboarding-submitted-row"
              aria-expanded={open.resumes}
              aria-controls="onboarding-submitted-resumes"
              onClick={() => toggle("resumes")}
            >
              <span className="onboarding-submitted-icon" aria-hidden="true">
                <FileText size={18} strokeWidth={1.75} />
              </span>
              <span className="onboarding-submitted-body">
                <strong>{resumes.length === 1 ? "1 resume" : `${resumes.length} resumes`}</strong>
                {open.resumes ? null : <span>{resumes.join(", ")}</span>}
              </span>
            </button>
            {open.resumes && canEditResumes && editing === "resumes" ? (
              <Button label="Add resume" icon={<Icon icon={Plus} />} size="sm" onClick={() => resumeInput.current?.click()} />
            ) : null}
            {open.resumes && canEditResumes ? (
              <Button
                label={editing === "resumes" ? "Done" : "Edit"}
                variant="ghost"
                size="sm"
                onClick={() => setEditing(editing === "resumes" ? null : "resumes")}
              />
            ) : null}
            <button
              type="button"
              className="onboarding-submitted-toggle"
              aria-label={open.resumes ? "Hide resumes" : "Show resumes"}
              aria-expanded={open.resumes}
              aria-controls="onboarding-submitted-resumes"
              disabled={editing === "resumes"}
              onClick={() => toggle("resumes")}
            >
              <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {open.resumes ? (
            <div id="onboarding-submitted-resumes" className="onboarding-submitted-detail">
              <ul className="onboarding-submitted-files">
                {resumes.map((fileName, index) => (
                  <li key={`${fileName}-${index}`}>
                    <span title={fileName}>{fileName}</span>
                    {editing === "resumes" ? (
                      <Button label="Remove" variant="ghost" size="sm" onClick={() => onRemoveResume?.(index)} />
                    ) : null}
                  </li>
                ))}
              </ul>
              <input
                ref={resumeInput}
                type="file"
                multiple
                hidden
                accept={RESUME_FILE_ACCEPT}
                onChange={(event) => {
                  const picked = event.target.files ? [...event.target.files] : [];
                  event.target.value = "";
                  onAddResumes?.(picked);
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </fieldset>
  );
}

function ProfileStep({
  firstName,
  lastName,
  headline,
  photoPreview,
  place,
  error,
  onFirstName,
  onLastName,
  onHeadline,
  onPhoto,
  onPlace,
  onContinue,
}: {
  firstName: string;
  lastName: string;
  headline: string;
  photoPreview: string | null;
  place: OnboardingPlaceAnswer;
  error: string | null;
  onFirstName: (value: string) => void;
  onLastName: (value: string) => void;
  onHeadline: (value: string) => void;
  onPhoto: (file: File | null) => void;
  onPlace: (place: OnboardingPlaceAnswer) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <Heading level={1}>
        Let's start with <em>your profile.</em>
      </Heading>
      <Text type="body" display="block">Docier runs on this computer. Nothing here leaves it unless you publish.</Text>
      <div className="onboarding-badge">
        <div className="onboarding-badge-portrait">
          <div className="onboarding-photo">
            <Avatar
              src={photoPreview ?? undefined}
              name={joinPersonName(firstName, lastName)}
              alt="Profile photo"
              size="xl"
            />
            {photoPreview ? (
              <button
                type="button"
                className="onboarding-photo-remove"
                aria-label="Remove photo"
                title="Remove photo"
                onClick={() => onPhoto(null)}
              >
                <X size={14} strokeWidth={2.5} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <FileInput
            label="Photo"
            mode="input"
            accept="image/jpeg,image/png,image/webp,image/gif"
            value={null}
            width="100%"
            placeholder={photoPreview ? "Change photo" : "Choose a photo"}
            onChange={(file) => {
              if (file instanceof File) onPhoto(file);
            }}
          />
        </div>
        <div className="onboarding-badge-identity">
          <fieldset className="onboarding-group">
            <legend>About you · can be published</legend>
            <div className="onboarding-field-row">
              <TextInput
                label="First name"
                value={firstName}
                autoComplete="given-name"
                width="100%"
                onChange={onFirstName}
              />
              <TextInput
                label="Last name"
                value={lastName}
                autoComplete="family-name"
                width="100%"
                onChange={onLastName}
              />
            </div>
            <div className="onboarding-field-row">
              <TextInput
                label="City"
                value={place.city}
                autoComplete="address-level2"
                width="100%"
                onChange={(city) => onPlace({ ...place, city })}
              />
              <TextInput
                label="State"
                value={place.state}
                autoComplete="address-level1"
                width="100%"
                onChange={(state) => onPlace({ ...place, state })}
              />
            </div>
            <Text type="supporting">
              A published page shows your state. It shows the city only when you publish exact locations.
            </Text>
          </fieldset>
        </div>
        <div className="onboarding-badge-wide">
          <fieldset className="onboarding-group">
            <legend>Headline · can be published</legend>
            <TextInput
              label="Professional headline"
              value={headline}
              autoComplete="organization-title"
              placeholder="e.g. Senior Software Engineer"
              width="100%"
              onChange={onHeadline}
            />
          </fieldset>
        </div>
      </div>
      {error ? (
        <Banner status="error" title={error} container="section" collapsible={false} role="alert" />
      ) : null}
      <div className="onboarding-actions" data-end="true">
        <Button
          className="onboarding-nav"
          label="Continue"
          variant="primary"
          isDisabled={!joinPersonName(firstName, lastName)}
          onClick={onContinue}
        />
      </div>
      {joinPersonName(firstName, lastName) ? null : (
        <p className="onboarding-why">Add your name to continue.</p>
      )}
    </>
  );
}

async function digestFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}