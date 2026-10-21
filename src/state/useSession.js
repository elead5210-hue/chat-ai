import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_INSTRUCTION,
  generateContinuationPrompt,
  generatePrompt,
  generatePromptSections,
} from "../prompt/generatePrompt.js";
import { generateFinalDocumentPrompt } from "../prompt/generateFinalDocumentPrompt.js";
import { validateResponse } from "../protocol/validateResponse.js";
import {
  applyContextUpdates,
  createSnapshot,
} from "../context/contextSnapshot.js";
import { buildContextPackage } from "../context/contextPackage.js";
import { computeContextFingerprint } from "../context/contextFingerprint.js";
import {
  appendMessage,
  appendUserMessage,
  CONVERSATION_PHASE_BOUNDARIES,
  completeConversation,
  advancePhase,
  createConversation,
  getConversationPhase,
  getConversationStatus,
  isConversationComplete,
  resetConversation,
  restoreConversation,
  WELCOME_MESSAGE,
} from "./conversationStore.js";
import {
  applyResponseToUiState,
  createUiState,
  resetUiState,
  setValue,
} from "./uiStateStore.js";
import { buildContinuationInput, buildPromptInput } from "./promptInput.js";
import {
  applyChecklistUpdates,
  createChecklist,
  createChecklistFromItems,
  hasChecklist,
  isChecklistComplete,
  resetChecklist,
} from "./checklistStore.js";
import {
  createSessionSnapshot,
  restoreSessionSnapshot,
} from "../storage/sessionSnapshot.js";

/**
 * Session hook. Keeps three separate stores and only combines them when the
 * prompt input is built:
 *   - conversation (messages)  -> ./conversationStore.js
 *   - context (Context Snapshot) -> ../context/contextSnapshot.js
 *   - UI state (form values)   -> ./uiStateStore.js
 *
 * Persistence: when a storage is given ({ load, save, clear }, for example the
 * one from ../storage/sessionDb.js), the saved session is restored on mount,
 * the state is saved after every change and the saved session is cleared on
 * reset. `isLoaded` is false until the restore has finished. Without a
 * storage the session simply lives in memory and `isLoaded` is true at once.
 */
export function useSession(storage = null) {
  const [messages, setMessages] = useState(() => createConversation());
  const [context, setContext] = useState(() => createSnapshot());
  const [uiState, setUiState] = useState(() => createUiState());
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [lastResponse, setLastResponse] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  // The final Markdown document pasted in after the conversation is complete.
  const [documentMarkdown, setDocumentMarkdown] = useState("");
  const lastResponseRef = useRef(null);
  // Items to settle before the final document; defined by the AI when phase one completes.
  const [checklist, setChecklist] = useState(() => createChecklist());
  const checklistRef = useRef(checklist);
  // False until the saved session (if any) has been restored.
  const [isLoaded, setIsLoaded] = useState(() => !storage);

  // "boundaries" (phase one) until the AI signals phase_complete, then "context" (phase two).
  const phase = useMemo(() => getConversationPhase(messages), [messages]);

  // The one place the three stores meet.
  const promptInput = useMemo(
    () => buildPromptInput({ instruction, messages, context, uiState, phase, checklist }),
    [instruction, context, messages, uiState, phase, checklist]
  );

  const prompt = useMemo(() => generatePrompt(promptInput), [promptInput]);
  const promptSections = useMemo(() => generatePromptSections(promptInput), [promptInput]);
  const contextPackage = useMemo(() => buildContextPackage(context), [context]);
  // Identifies this exact snapshot; recomputed only when the context changes.
  const contextFingerprint = useMemo(() => computeContextFingerprint(context), [context]);
  const contextVersion = context.context_version;
  // "active" or "complete"; once complete, no further turns are accepted.
  const conversationStatus = useMemo(() => getConversationStatus(messages), [messages]);
  const isComplete = isConversationComplete(messages);
  const continuationPrompt = useMemo(
    () => generateContinuationPrompt(buildContinuationInput({ messages, context })),
    [context, messages]
  );
  // The last prompt of the session: asks the AI for the final Markdown document.
  const finalPrompt = useMemo(
    () => generateFinalDocumentPrompt({ context, messages }),
    [context, messages]
  );

  // Restore the saved session once, when the hook mounts.
  useEffect(() => {
    if (!storage) {
      setIsLoaded(true);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      let raw = null;
      try {
        raw = await storage.load();
      } catch {
        raw = null;
      }
      if (cancelled) return;

      if (raw) {
        const restored = restoreSessionSnapshot(raw);
        if (restored.ok) {
          const saved = restored.value;
          setMessages(restoreConversation(saved.messages));
          setContext(saved.context);
          setUiState(saved.uiState);
          setInstruction(saved.instruction ?? DEFAULT_INSTRUCTION);
          setLastResponse(saved.lastResponse);
          lastResponseRef.current = saved.lastResponse;
          checklistRef.current = saved.checklist;
          setChecklist(saved.checklist);
          setDocumentMarkdown(saved.documentMarkdown);
        }
      }

      setIsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [storage]);

  // Save the session after every change. A blank session is not saved, so a
  // reset leaves nothing behind once the saved session has been cleared.
  useEffect(() => {
    if (!storage || !isLoaded) return;

    const isPristine =
      messages.length === 1 &&
      messages[0]?.id === WELCOME_MESSAGE.id &&
      lastResponse === null &&
      documentMarkdown === "" &&
      checklist.length === 0 &&
      Object.keys(uiState).length === 0 &&
      instruction === DEFAULT_INSTRUCTION &&
      context.context_version === 1 &&
      context.summary === "";
    if (isPristine) return;

    const snapshot = createSessionSnapshot({
      messages,
      context,
      uiState,
      instruction,
      lastResponse,
      checklist,
      documentMarkdown,
    });
    Promise.resolve(storage.save(snapshot)).catch(() => {});
  }, [
    storage,
    isLoaded,
    messages,
    context,
    uiState,
    instruction,
    lastResponse,
    checklist,
    documentMarkdown,
  ]);

  const sendUserMessage = useCallback((text) => {
    setMessages((current) => appendUserMessage(current, text));
  }, []);

  /** Mark the conversation as finished so the chat terminates. */
  const finishConversation = useCallback(() => {
    setMessages((current) => completeConversation(current));
  }, []);

  /** Accept the Markdown document returned by the AI. Returns true on success. */
  const submitDocument = useCallback(
    (markdown) => {
      if (!isComplete) return false;
      if (typeof markdown !== "string" || markdown.trim() === "") return false;
      setDocumentMarkdown(markdown);
      return true;
    },
    [isComplete]
  );

  /** Discard the pasted document so another can be pasted. */
  const clearDocument = useCallback(() => {
    setDocumentMarkdown("");
  }, []);

  const updateUiState = useCallback((id, value) => {
    setUiState((current) => setValue(current, id, value));
  }, []);

  const updateInstruction = useCallback((text) => {
    setInstruction(typeof text === "string" ? text : "");
  }, []);

  const resetInstruction = useCallback(() => {
    setInstruction(DEFAULT_INSTRUCTION);
  }, []);

  /**
   * Validate pasted AI output. On success the response is applied to each of
   * the three stores separately: the message goes to the conversation, the
   * context_updates to the context, and the components/state_updates to the
   * UI state. Returns true on success.
   */
  const submitResponse = useCallback(
    (rawText) => {
      if (isComplete) return false;
      const result = validateResponse(rawText);

      if (!result.ok) {
        setValidationErrors(result.errors);
        return false;
      }

      const response = result.value;
      const previousComponents = lastResponseRef.current?.components ?? [];
      lastResponseRef.current = response;
      setValidationErrors([]);
      setLastResponse(response);
      // Conversation store: what was said.
      setMessages((current) =>
        appendMessage(current, response.message.role, response.message.content)
      );
      // Context store: what currently matters.
      setContext((current) => applyContextUpdates(current, response.context_updates));
      // UI state store: what the user has entered into generated forms.
      setUiState((current) => applyResponseToUiState(current, previousComponents, response));
      // The AI signalled that phase one (document boundaries) is finished.
      if (response.phase_complete === true) {
        setMessages((current) => advancePhase(current));
      }
      // Checklist store: defined when phase one completes, then updated by each response.
      let nextChecklist = checklistRef.current;
      if (
        response.phase_complete === true &&
        phase === CONVERSATION_PHASE_BOUNDARIES &&
        !hasChecklist(nextChecklist)
      ) {
        nextChecklist = createChecklistFromItems(response.checklist);
      }
      nextChecklist = applyChecklistUpdates(nextChecklist, response.checklist_updates);
      if (nextChecklist !== checklistRef.current) {
        checklistRef.current = nextChecklist;
        setChecklist(nextChecklist);
      }
      // The AI signalled that the conversation is finished, or every checklist
      // item is now satisfied so the final document step can run.
      if (response.conversation_complete === true || isChecklistComplete(nextChecklist)) {
        setMessages((current) => completeConversation(current));
      }
      return true;
    },
    [isComplete, phase]
  );

  const resetSession = useCallback(() => {
    setMessages(resetConversation());
    checklistRef.current = resetChecklist();
    setChecklist(checklistRef.current);
    setContext(createSnapshot());
    setUiState(resetUiState());
    setInstruction(DEFAULT_INSTRUCTION);
    setLastResponse(null);
    lastResponseRef.current = null;
    setValidationErrors([]);
    setDocumentMarkdown("");
    // Forget the saved session too, so a reload starts fresh.
    if (storage) Promise.resolve(storage.clear()).catch(() => {});
  }, [storage]);

  return {
    messages,
    context,
    uiState,
    instruction,
    lastResponse,
    validationErrors,
    prompt,
    promptSections,
    contextPackage,
    contextFingerprint,
    contextVersion,
    continuationPrompt,
    conversationStatus,
    isComplete,
    phase,
    checklist,
    isLoaded,
    finalPrompt,
    documentMarkdown,
    submitDocument,
    clearDocument,
    sendUserMessage,
    finishConversation,
    updateUiState,
    updateInstruction,
    resetInstruction,
    submitResponse,
    resetSession,
  };
}