import { useCallback, useMemo, useRef, useState } from "react";
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
  completeConversation,
  createConversation,
  getConversationStatus,
  isConversationComplete,
  resetConversation,
} from "./conversationStore.js";
import {
  applyResponseToUiState,
  createUiState,
  resetUiState,
  setValue,
} from "./uiStateStore.js";
import { buildContinuationInput, buildPromptInput } from "./promptInput.js";

/**
 * Session hook. Keeps three separate stores and only combines them when the
 * prompt input is built:
 *   - conversation (messages)  -> ./conversationStore.js
 *   - context (Context Snapshot) -> ../context/contextSnapshot.js
 *   - UI state (form values)   -> ./uiStateStore.js
 */
export function useSession() {
  const [messages, setMessages] = useState(() => createConversation());
  const [context, setContext] = useState(() => createSnapshot());
  const [uiState, setUiState] = useState(() => createUiState());
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [lastResponse, setLastResponse] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  // The final Markdown document pasted in after the conversation is complete.
  const [documentMarkdown, setDocumentMarkdown] = useState("");
  const lastResponseRef = useRef(null);

  // The one place the three stores meet.
  const promptInput = useMemo(
    () => buildPromptInput({ instruction, messages, context, uiState }),
    [instruction, context, messages, uiState]
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
      // The AI signalled that the conversation is finished.
      if (response.conversation_complete === true) {
        setMessages((current) => completeConversation(current));
      }
      return true;
    },
    [isComplete]
  );

  const resetSession = useCallback(() => {
    setMessages(resetConversation());
    setContext(createSnapshot());
    setUiState(resetUiState());
    setInstruction(DEFAULT_INSTRUCTION);
    setLastResponse(null);
    lastResponseRef.current = null;
    setValidationErrors([]);
    setDocumentMarkdown("");
  }, []);

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